const crypto = require('node:crypto');
const {
  getSupabaseConfig,
  supabaseRequest,
  serviceRoleHelpers: { getTableRow },
} = require('../../lib/supabase');
const { recordSecurityEvent, extractClientIp } = require('../../lib/security-logger');
const { safeCompare, setSessionCookie } = require('../../lib/admin-session');
const { resolveSecret } = require('../../lib/env-secret');
const { getAnonClient, getProfileRoleByEmail } = require('../../services/supabase-auth');
const { enforceRateLimit, resolveIdentifier, RATE_LIMITS } = require('../../lib/rate-limit');
const {
  ERROR_CODES,
  fail,
  methodNotAllowed,
  ok,
  preflight,
  setAdminCorsHeaders,
} = require('../../lib/http');

// TTL do desafio de 2º fator. Era 300s; caiu para 120s porque o desafio é um
// portador de "a senha já foi conferida" e o único uso legítimo dele é o
// intervalo entre ver a tela do código e digitá-lo. Encurtar a janela só é
// indolor porque o handler REEMITE um desafio novo quando o antigo expira
// (ver handleSecondFactor) — o painel nunca fica preso.
const FACTOR_CHALLENGE_TTL_SECONDS = 120;

const TOTP_STEP_SECONDS = 30;
// window=1 → aceita o código anterior e o próximo (±30s) para tolerar relógio
// dessincronizado no celular. É o que torna um código válido por ~90s e, sem
// marcação de uso, replayável nessa janela — daí o consumo único abaixo.
const TOTP_DRIFT_WINDOW = 1;

// ─── Marcação de uso único (anti-replay) ─────────────────────────────
// ONDE GUARDAR O "JÁ USADO": reaproveitamos public.rate_limit_hit() — o mesmo
// contador atômico criado para o P1-3 (20260813000000_rate_limit.sql). Chamar
// com p_limit = 1 transforma o contador em "primeiro que chega vence": o INSERT
// ... ON CONFLICT DO UPDATE devolve count=1 para o primeiro consumidor e >=2
// para qualquer repetição, tudo numa única instrução (sem read-modify-write,
// sem corrida entre duas lambdas concorrentes).
//
// POR QUE NÃO EM settings.adminConfig: aquela linha é lida no login e reescrita
// pelo painel com merge (api/admin-settings.js). Gravar ali um contador que
// muda a cada login (a) corre com o "Salvar" do painel e poderia sobrescrever
// totpSecret/fallbackPin, (b) polui o diff do audit log a cada acesso e (c)
// obrigaria o handler de login a ter permissão de ESCRITA na config que ele
// mesmo lê para decidir se exige 2FA — exatamente a superfície que a Correção 3
// está fechando. rate_limit_hit já é service-role-only, tem RLS sem policies e
// é purgada de hora em hora (24h de retenção), então nada disso vira histórico
// de acessos permanente (LGPD).
//
// LIMITE CONHECIDO: rate_limit_hit usa JANELA FIXA. A marca vale até o fim da
// janela corrente, não "3600s a partir do consumo". Com janela de 1h e códigos
// que vivem <=90s (TOTP) / 120s (desafio), a marca some antes da hora do
// segredo em ~2,5% dos casos — e mesmo aí o atacante precisaria ter senha +
// código vivo no mesmo instante. Trocar isso por precisão exata exigiria tabela
// própria com expiração por linha; não vale a migration extra neste porte.
const SINGLE_USE_WINDOW_SECONDS = 60 * 60;
const SINGLE_USE_RPC_PATH = 'rpc/rate_limit_hit';
const SINGLE_USE_TIMEOUT_MS = 2500;

function getChallengeSecret() {
  return resolveSecret('ADMIN_SESSION_SECRET', 'dev-admin-session-secret-change-me');
}

/** Impressão digital curta e não reversível — nunca gravar e-mail/IP crus. */
function fingerprint(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 16);
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(input) {
  const normalized = String(input || '')
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Consome uma marca de uso único e diz se ela ERA inédita.
 *
 * @returns {Promise<{fresh: boolean, degraded: boolean}>} `fresh=false` só
 *   quando o Postgres confirmou que a marca já existia. Falha de infra devolve
 *   `fresh=true, degraded=true` (fail-open) pelo MESMO motivo documentado em
 *   lib/rate-limit.js: negar aqui trancaria o admin legítimo para fora durante
 *   um incidente de banco, e a senha + o 2º fator continuam sendo exigidos.
 *   Todo fail-open emite evento de segurança para não ser silencioso.
 */
async function consumeSingleUse(bucket, identifier, context = {}) {
  const degrade = async (reason) => {
    await recordSecurityEvent({
      eventName: 'admin_2fa_replay_guard_degraded',
      severity: 'error',
      ip: context.ip || null,
      properties: { bucket, reason },
    });
    return { fresh: true, degraded: true };
  };

  if (!getSupabaseConfig()) {
    return degrade('supabase_not_configured');
  }

  try {
    const payload = await supabaseRequest(SINGLE_USE_RPC_PATH, {
      method: 'POST',
      useServiceRole: true,
      signal: AbortSignal.timeout(SINGLE_USE_TIMEOUT_MS),
      body: JSON.stringify({
        p_bucket: bucket,
        p_identifier: String(identifier || '').slice(0, 200),
        p_limit: 1,
        p_window_seconds: SINGLE_USE_WINDOW_SECONDS,
      }),
    });

    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row || typeof row.allowed !== 'boolean') {
      return degrade('unexpected_rpc_shape');
    }

    return { fresh: row.allowed === true, degraded: false };
  } catch (error) {
    return degrade(`rpc_failed:${String(error?.statusCode || error?.message || '').slice(0, 60)}`);
  }
}

/**
 * Desafio de 2º fator: prova assinada de que a senha daquele e-mail foi aceita
 * há menos de FACTOR_CHALLENGE_TTL_SECONDS, vinda daquele IP.
 *
 * O `nonce` existia antes mas nunca era persistido nem conferido — ou seja, o
 * desafio era reutilizável à vontade dentro da validade. Agora ele é a CHAVE da
 * marca de uso único gravada no login bem-sucedido, e o `ip` amarra o desafio à
 * tentativa que o gerou (um token capturado não serve noutra origem).
 */
function createChallengeToken(email, req) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'admin-2fa',
    email,
    ip: fingerprint(extractClientIp(req)),
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + FACTOR_CHALLENGE_TTL_SECONDS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getChallengeSecret())
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

function verifyChallengeToken(token, expectedEmail, req) {
  const raw = String(token || '');
  if (!raw.includes('.')) {
    return { valid: false };
  }

  const [encodedPayload, signature] = raw.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', getChallengeSecret())
    .update(encodedPayload)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.sub !== 'admin-2fa' || Number(payload?.exp) <= now) {
      return { valid: false };
    }

    if (!safeCompare(String(payload?.email || ''), String(expectedEmail || ''))) {
      return { valid: false };
    }

    // Sem nonce (formato antigo) o desafio não tem como ser marcado como usado.
    // Tratar como inválido força a reemissão no formato novo em vez de abrir
    // uma exceção permanente ao anti-replay.
    if (!/^[0-9a-f]{16,}$/.test(String(payload?.nonce || ''))) {
      return { valid: false };
    }

    if (!safeCompare(String(payload?.ip || ''), fingerprint(extractClientIp(req)))) {
      return { valid: false };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const sanitized = String(input || '')
    .toUpperCase()
    .replaceAll(/[^A-Z2-7]/g, '');
  if (!sanitized) return null;

  let bits = '';
  for (const char of sanitized) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

function generateTotpCode(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = (hmac.at(-1) || 0) & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Devolve o CONTADOR TOTP que casou com o código, ou null.
 *
 * Antes isto era um booleano (`isValidTotpCode`). Precisamos do contador porque
 * ele é a identidade do código dentro da janela — é o que permite marcar
 * "este código já foi usado" sem guardar o código em lugar nenhum.
 */
function matchTotpCounter(
  secret,
  code,
  stepSeconds = TOTP_STEP_SECONDS,
  window = TOTP_DRIFT_WINDOW,
) {
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return null;
  }

  const secretBuffer = decodeBase32(secret);
  if (!secretBuffer) {
    return null;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let drift = -window; drift <= window; drift += 1) {
    const counter = currentCounter + drift;
    if (safeCompare(normalizedCode, generateTotpCode(secretBuffer, counter))) {
      return counter;
    }
  }

  return null;
}

function isSecondFactorRequired(adminConfig) {
  return Boolean(
    adminConfig?.requireSecondFactor || adminConfig?.require2FA || adminConfig?.twoFactorEnabled,
  );
}

function extractSecondFactorMethods(adminConfig) {
  const methods = [];
  if (String(adminConfig?.totpSecret || '').trim()) {
    methods.push('totp');
  }

  const allowPinFallback = adminConfig?.allowPinFallback !== false;
  if (allowPinFallback && String(adminConfig?.fallbackPin || '').trim()) {
    methods.push('pin');
  }

  return methods;
}

/**
 * Confere um código de 2º fator contra a config vigente, SEM efeito colateral
 * (não consome marcas de uso único). Usado por api/admin-settings.js para exigir
 * reautenticação antes de alterar campos sensíveis de segurança.
 *
 * DÍVIDA ASSUMIDA: TOTP/base32 deveriam morar em lib/admin-2fa.js — a revisão já
 * aponta a extração de helpers duplicados como próximo passo. Enquanto isso,
 * exportar daqui é preferível a copiar a implementação de HOTP para um segundo
 * arquivo, onde ela envelheceria em separado.
 */
function verifySecondFactorCode(adminConfig, code) {
  const methods = extractSecondFactorMethods(adminConfig);
  if (methods.length === 0) return false;

  const normalized = String(code || '').trim();
  if (!normalized) return false;

  if (methods.includes('totp') && matchTotpCounter(adminConfig?.totpSecret, normalized) !== null) {
    return true;
  }

  return (
    methods.includes('pin') &&
    safeCompare(normalized, String(adminConfig?.fallbackPin || '').trim())
  );
}

async function readAdminConfig() {
  const row = await getTableRow('settings', {
    select: 'setting_value',
    filters: [{ column: 'setting_key', value: 'adminConfig' }],
  });

  if (!row) {
    return {};
  }

  if (row.setting_value && typeof row.setting_value === 'object') {
    return row.setting_value;
  }

  try {
    return JSON.parse(String(row.setting_value || '{}'));
  } catch {
    return {};
  }
}

/**
 * Etapa do 2º fator. Devolve true quando o login pode prosseguir; quando
 * devolve false, a resposta JÁ foi escrita.
 */
async function handleSecondFactor(req, res, { adminConfig, email, emailKey, challenge }) {
  const methods = extractSecondFactorMethods(adminConfig);
  if (methods.length === 0) {
    fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: '2FA ativado sem método configurado no adminConfig.',
    });
    return false;
  }

  // Sem desafio válido (1ª etapa, desafio expirado, adulterado ou de outro IP):
  // reemitir é seguro porque a senha acabou de ser conferida NESTA requisição.
  // É também o que mantém o TTL curto e o uso único indolores: o painel recebe
  // um desafio novo em vez de travar na tela do código.
  if (!challenge.valid) {
    ok(res, {
      success: false,
      requiresSecondFactor: true,
      methods,
      challengeToken: createChallengeToken(email, req),
    });
    return false;
  }

  const code = String(req.body?.factorCode || '').trim();
  if (!code) {
    fail(res, {
      status: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Código de verificação obrigatório.',
    });
    return false;
  }

  const ip = extractClientIp(req);
  const totpCounter = methods.includes('totp')
    ? matchTotpCounter(adminConfig?.totpSecret, code)
    : null;
  const pinValid =
    methods.includes('pin') && safeCompare(code, String(adminConfig?.fallbackPin || '').trim());

  if (totpCounter === null && !pinValid) {
    await recordSecurityEvent({
      eventName: 'admin_2fa_failed',
      severity: 'warn',
      ip,
      userAgent: req.headers['user-agent'],
      properties: { email_hash: emailKey, methods },
    });
    fail(res, {
      status: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Código de verificação inválido.',
    });
    return false;
  }

  // TOTP: o mesmo código vale por até ~90s (janela de drift). Marcar o contador
  // como consumido impede que um código observado (ombro, phishing em tempo
  // real, log de proxy) seja reapresentado dentro dessa sobra.
  if (totpCounter !== null) {
    const totpUse = await consumeSingleUse('admin-2fa-totp', `${emailKey}:${totpCounter}`, { ip });
    if (!totpUse.fresh) {
      await recordSecurityEvent({
        eventName: 'admin_2fa_code_replayed',
        severity: 'error',
        ip,
        userAgent: req.headers['user-agent'],
        properties: { email_hash: emailKey, counter: totpCounter },
      });
      fail(res, {
        status: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Código já utilizado. Aguarde o próximo código do autenticador.',
      });
      return false;
    }
  }

  // Desafio: consumido só APÓS o código ser aceito. Consumir antes faria um erro
  // de digitação queimar o desafio; consumir aqui garante o que importa — um
  // desafio emite no máximo UMA sessão. As tentativas com código errado ficam
  // limitadas pelo balde adminLoginSecondFactor (5 / 10 min) e pelo TTL de 120s.
  const challengeUse = await consumeSingleUse('admin-2fa-challenge', challenge.payload.nonce, {
    ip,
  });
  if (!challengeUse.fresh) {
    await recordSecurityEvent({
      eventName: 'admin_2fa_challenge_replayed',
      severity: 'error',
      ip,
      userAgent: req.headers['user-agent'],
      properties: { email_hash: emailKey },
    });
    fail(res, {
      status: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Desafio de 2FA já utilizado. Faça login novamente.',
    });
    return false;
  }

  return true;
}

module.exports = async function adminLoginHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST', 'OPTIONS']);
  }

  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || '');
  const challengeToken = String(req.body?.challengeToken || '').trim();

  if (!email || !password) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'E-mail e senha são obrigatórios.',
    });
  }

  const emailKey = fingerprint(email);

  // ── Rate limit (P1-3) ─────────────────────────────────────────────
  // Dois baldes DISTINTOS porque são dois segredos distintos sendo adivinhados.
  // A fase é decidida pelo desafio: um challengeToken assinado, no prazo, do
  // mesmo IP e para o mesmo e-mail só existe se a senha já tiver sido aceita há
  // menos de 2 min. Token ausente/forjado cai no balde da SENHA — não há como
  // fugir do limite de senha inventando um desafio.
  //
  // O limiter de dev (routes/api-compat.routes.js) usa skipSuccessfulRequests;
  // aqui o sucesso também conta, como lib/rate-limit.js documenta (o contador do
  // Postgres não tem estorno). O efeito colateral — um login completo custa 1
  // hit em cada balde, não 2 no mesmo — é justamente o que a separação por fase
  // resolve: 5 tentativas de senha E 5 de código a cada 10 min.
  const challenge = challengeToken
    ? verifyChallengeToken(challengeToken, email, req)
    : { valid: false };

  const gate = challenge.valid
    ? await enforceRateLimit(req, res, {
        ...RATE_LIMITS.adminLoginSecondFactor,
        // IP + e-mail: o balde do 2º fator não pode ser esvaziado trocando de
        // conta, nem um admin pode trancar o outro.
        identifier: `${resolveIdentifier(req)}|${emailKey}`,
      })
    : await enforceRateLimit(req, res, RATE_LIMITS.adminLogin);

  if (gate.blocked) {
    return;
  }

  const supabase = getAnonClient();
  if (!supabase) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Configuração do Supabase indisponível no servidor.',
    });
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData?.user?.id) {
    await recordSecurityEvent({
      eventName: 'admin_login_failed',
      severity: 'warn',
      ip: extractClientIp(req),
      userAgent: req.headers['user-agent'],
      properties: { reason: 'invalid_credentials', email_hash: emailKey },
    });
    return fail(res, {
      status: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Credenciais inválidas.',
    });
  }

  const role = await getProfileRoleByEmail(authData.user.email || email);
  const normalizedRole = String(role || '')
    .trim()
    .toLowerCase();

  if (!['admin', 'master'].includes(normalizedRole)) {
    await recordSecurityEvent({
      eventName: 'admin_login_failed',
      severity: 'warn',
      ip: extractClientIp(req),
      userAgent: req.headers['user-agent'],
      properties: {
        reason: 'non_admin_role',
        role: normalizedRole || 'none',
        email_hash: emailKey,
      },
    });
    // Resposta HTTP idêntica ao caso de credencial inválida (mesmo status e
    // mensagem) para não vazar que a senha está correta em conta não-admin.
    // O motivo distinto ('non_admin_role') fica apenas no log de segurança.
    return fail(res, {
      status: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Credenciais inválidas.',
    });
  }

  const adminConfig = await readAdminConfig();
  if (isSecondFactorRequired(adminConfig)) {
    const passed = await handleSecondFactor(req, res, {
      adminConfig,
      email,
      emailKey,
      challenge,
    });
    if (!passed) {
      return;
    }
  }

  // Grava a identidade individual no cookie de sessão (não-repúdio no audit).
  setSessionCookie(res, { email: authData.user.email || email, role: normalizedRole });
  return ok(res, { success: true, user: { role: normalizedRole || 'admin', email } });
};

// Primitivos de 2º fator reaproveitados por api/admin-settings.js (reautenticação
// para alterar 2FA). Anexados ao handler porque a Vercel exige que o export
// default do arquivo em api/ seja a própria função — propriedades extras são
// ignoradas pelo runtime e não viram rota.
module.exports.isSecondFactorRequired = isSecondFactorRequired;
module.exports.extractSecondFactorMethods = extractSecondFactorMethods;
module.exports.verifySecondFactorCode = verifySecondFactorCode;
