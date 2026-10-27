const crypto = require('node:crypto');
const {
  getSupabaseConfig,
  supabaseRequest,
  serviceRoleHelpers: { getTableRow },
} = require('../../lib/supabase');
const { recordSecurityEvent, extractClientIp } = require('../../lib/security-logger');
const { safeCompare, setSessionCookie } = require('../../lib/admin-session');
const { resolveSecret } = require('../../lib/env-secret');
const {
  getAnonClient,
  getProfileRoleByEmail,
  getProfileRoleByUserId,
} = require('../../services/supabase-auth');
const { enforceRateLimit, resolveIdentifier, RATE_LIMITS } = require('../../lib/rate-limit');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
// TOTP, PIN e o repouso cifrado dos dois. Saiu daqui em 01/09/2026: era a
// divida ja anotada no proprio arquivo (HOTP/base32 duplicados com
// handlers/admin/settings.js), e virou obrigatoria quando totpSecret passou a
// ser cifrado — settings.js precisa das MESMAS primitivas para gravar.
const {
  matchTotpCounter,
  isSecondFactorRequired,
  extractSecondFactorMethods,
  generateEmailCode,
  verifySecondFactorCode,
  verifyPin,
} = require('../../lib/admin-2fa');
const { sendEmail } = require('../../lib/email-sender');
const { adminLoginCode } = require('../../lib/email-templates');
const { isStoreOwner } = require('../../lib/store-owner');

// TTL do desafio de 2º fator. Era 300s; caiu para 120s porque o desafio é um
// portador de "a senha já foi conferida" e o único uso legítimo dele é o
// intervalo entre ver a tela do código e digitá-lo. Encurtar a janela só é
// indolor porque o handler REEMITE um desafio novo quando o antigo expira
// (ver handleSecondFactor) — o painel nunca fica preso.
const FACTOR_CHALLENGE_TTL_SECONDS = 120;

// ─── Código por e-mail ───────────────────────────────────────────────
// O código NÃO é guardado em lugar nenhum: vai SELADO dentro do próprio
// desafio, como HMAC(nonce + código) com o segredo de sessão. Só quem recebeu o
// e-mail sabe o código, e o selo só confere com o desafio daquela tentativa —
// sem tabela nova, sem migration, e o uso único vem de graça pela marca do
// desafio (consumeSingleUse) que o login já grava.
//
// TTL de 10 min (e não os 120s do desafio comum) porque e-mail demora: dois
// minutos entre "enviar" e "digitar" reprovaria quem espera a caixa atualizar.
// Força bruta segue barrada pelo balde adminLoginSecondFactor (5 / 10 min) —
// 5 chutes num espaço de 1.000.000 —, e cada reenvio também conta nele.
const EMAIL_CHALLENGE_TTL_SECONDS = 10 * 60;
const EMAIL_CODE_MINUTES = EMAIL_CHALLENGE_TTL_SECONDS / 60;

// ─── Marcação de uso único (anti-replay) ─────────────────────────────
// ONDE GUARDAR O "JÁ USADO": reaproveitamos public.rate_limit_hit() — o mesmo
// contador atômico criado para o P1-3 (20260813000000_rate_limit.sql). Chamar
// com p_limit = 1 transforma o contador em "primeiro que chega vence": o INSERT
// ... ON CONFLICT DO UPDATE devolve count=1 para o primeiro consumidor e >=2
// para qualquer repetição, tudo numa única instrução (sem read-modify-write,
// sem corrida entre duas lambdas concorrentes).
//
// POR QUE NÃO EM settings.adminConfig: aquela linha é lida no login e reescrita
// pelo painel com merge (handlers/admin/settings.js). Gravar ali um contador que
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
/** Selo do código por e-mail: amarrado ao nonce do desafio, nunca o código cru. */
function sealEmailCode(nonce, code) {
  return crypto
    .createHmac('sha256', getChallengeSecret())
    .update(`admin-2fa-email:${nonce}:${code}`)
    .digest('base64url');
}

/** `jo***@gmail.com` — para a tela dizer para onde foi, sem expor o endereço. */
function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!user || !domain) return '';
  return `${user.slice(0, 2)}***@${domain}`;
}

function createChallengeToken(email, req, { emailCode = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = {
    sub: 'admin-2fa',
    email,
    ip: fingerprint(extractClientIp(req)),
    nonce,
    iat: now,
    exp: now + (emailCode ? EMAIL_CHALLENGE_TTL_SECONDS : FACTOR_CHALLENGE_TTL_SECONDS),
    ...(emailCode ? { eotp: sealEmailCode(nonce, emailCode) } : {}),
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

  // Pedido explícito de código por e-mail ("Enviar código por e-mail" na tela).
  // Com desafio válido ele cai no balde do 2º fator (5 / 10 min), então os
  // reenvios também são limitados.
  const wantsEmailCode = methods.includes('email') && req.body?.sendEmailCode === true;

  // Sem desafio válido (1ª etapa, desafio expirado, adulterado ou de outro IP):
  // reemitir é seguro porque a senha acabou de ser conferida NESTA requisição.
  // É também o que mantém o TTL curto e o uso único indolores: o painel recebe
  // um desafio novo em vez de travar na tela do código.
  if (!challenge.valid || wantsEmailCode) {
    // Sem app autenticador, o e-mail sai já na 1ª etapa — senão a admin teria
    // de pedir o código num segundo clique para chegar ao único fator do dia a
    // dia. Com o app cadastrado, o e-mail só sai quando ela pedir.
    const sendNow = wantsEmailCode || (methods.includes('email') && !methods.includes('totp'));
    let emailCode = null;
    let emailSent = false;

    if (sendNow) {
      emailCode = generateEmailCode();
      const message = adminLoginCode({ code: emailCode, minutes: EMAIL_CODE_MINUTES });
      const result = await sendEmail({
        to: email,
        subject: message.subject,
        html: message.html,
        kind: 'admin_login_code',
        // Único por envio: o sendEmail é idempotente por (e-mail, kind, entityId).
        entityId: crypto.randomBytes(8).toString('hex'),
      }).catch((error) => ({ sent: false, reason: error?.message || 'send_failed' }));

      emailSent = result?.sent === true;
      if (!emailSent) {
        // Código que não chegou não pode ficar selado: o desafio sai sem ele e
        // a tela oferece os outros métodos (que sempre existem — ver
        // extractSecondFactorMethods).
        emailCode = null;
        await recordSecurityEvent({
          eventName: 'admin_2fa_email_failed',
          severity: 'warn',
          ip: extractClientIp(req),
          userAgent: req.headers['user-agent'],
          properties: { email_hash: emailKey, reason: String(result?.reason || '').slice(0, 60) },
        });
      }
    }

    ok(res, {
      success: false,
      requiresSecondFactor: true,
      methods,
      challengeToken: createChallengeToken(email, req, { emailCode }),
      ...(sendNow ? { emailSent, emailHint: emailSent ? maskEmail(email) : '' } : {}),
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
  // `verifyPin` e nao `safeCompare`: o PIN agora e guardado como hash scrypt
  // com sal, e a funcao aceita tambem o formato antigo em claro — sem isso o
  // deploy trancaria a dona para fora ate o primeiro "Salvar" no painel.
  const pinValid = methods.includes('pin') && verifyPin(adminConfig?.fallbackPin, code);
  // Código por e-mail: confere contra o selo do PRÓPRIO desafio. Sem selo
  // (desafio emitido sem envio), não há código por e-mail a aceitar.
  const sealedEmailCode = String(challenge.payload?.eotp || '');
  const emailValid =
    methods.includes('email') &&
    Boolean(sealedEmailCode) &&
    /^\d{6}$/.test(code) &&
    safeCompare(sealEmailCode(challenge.payload.nonce, code), sealedEmailCode);

  if (totpCounter === null && !pinValid && !emailValid) {
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
  // Nenhuma resposta admin vai para o cache do navegador (ADM-01/ADM-41).
  setCachePolicy(res, 'adminReport');

  if (guardMethod(req, res, ['POST'])) return;

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

  // Pelo id da conta primeiro: depois de uma troca de e-mail (aba "Minha
  // conta"), buscar só pelo e-mail podia não achar o perfil e trancar a
  // pessoa fora do painel. O e-mail fica de reserva para perfis antigos.
  const role =
    (await getProfileRoleByUserId(authData.user.id)) ||
    (await getProfileRoleByEmail(authData.user.email || email));
  const normalizedRole = String(role || '')
    .trim()
    .toLowerCase();

  if (!['admin', 'master', 'seller'].includes(normalizedRole)) {
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
  if (['admin', 'master'].includes(normalizedRole) && isSecondFactorRequired(adminConfig)) {
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

  const storeOwner = await isStoreOwner({ role: normalizedRole, userId: authData.user.id });
  // Grava a identidade individual no cookie de sessão (não-repúdio no audit).
  setSessionCookie(res, {
    email: authData.user.email || email,
    role: normalizedRole,
    userId: authData.user.id,
    storeOwner,
  });
  return ok(res, { success: true, user: { role: normalizedRole || 'admin', email, storeOwner } });
};

// Primitivos de 2º fator reaproveitados por handlers/admin/settings.js (reautenticação
// para alterar 2FA). Anexados ao handler porque a Vercel exige que o export
// default do arquivo em api/ seja a própria função — propriedades extras são
// ignoradas pelo runtime e não viram rota.
module.exports.isSecondFactorRequired = isSecondFactorRequired;
module.exports.extractSecondFactorMethods = extractSecondFactorMethods;
module.exports.verifySecondFactorCode = verifySecondFactorCode;
