const { ensureAdminSession, setAdminCorsHeaders } = require('../../lib/admin-session');
const { logAdminAction } = require('../../lib/admin-audit');
const { recordSecurityEvent, extractClientIp } = require('../../lib/security-logger');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { ERROR_CODES, fail, methodNotAllowed, ok, preflight } = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-settings');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('../../lib/supabase');
// Primitivos de 2º fator anexados ao handler de login (ver nota no fim de
// api/admin-login.js sobre a dívida de extrair um lib/admin-2fa.js).
const {
  isSecondFactorRequired,
  extractSecondFactorMethods,
  verifySecondFactorCode,
} = require('./login');

const ALLOWED_KEYS = new Set(['homeSections', 'adminConfig']);

const MIN_FALLBACK_PIN_LENGTH = 6;
const MAX_FALLBACK_PIN_LENGTH = 64;
const MIN_TOTP_SECRET_LENGTH = 16;

// Balde do gate de reautenticação. Declarado AQUI, e não em RATE_LIMITS
// (lib/rate-limit.js), porque só este handler o usa e enforceRateLimit aceita a
// configuração inline — evita editar um módulo compartilhado por causa de um
// caso de uso local. Espelha adminLoginSecondFactor: 5 tentativas / 10 min.
// Conta TODA passagem pelo gate, não só as que falham — é a mesma escolha
// deliberada de RATE_LIMITS.adminLogin (o atacante não escolhe quais tentativas
// contam), e 5 salvamentos do 2FA a cada 10 minutos é folga de sobra para o
// único admin do sistema.
const REAUTH_RATE_LIMIT = Object.freeze({
  bucket: 'admin-settings-2fa',
  limit: 5,
  windowSeconds: 10 * 60,
  message: 'Muitas tentativas de confirmação. Aguarde 10 minutos e tente novamente.',
});

// ════════════════════════════════════════════════════════════════════
// Whitelist explícita do adminConfig (achado M3)
//
// O merge antigo era `{ ...incoming }`: TUDO que chegasse no corpo era
// persistido. Como este handler exige apenas "ser admin", qualquer sessão
// administrativa (ou um CSRF/XSS que a carregasse) podia mandar
// `{"requireSecondFactor": false}` e desligar o 2º fator de TODOS, ou gravar um
// `totpSecret`/`fallbackPin` sob controle do atacante — escalada de privilégio
// dentro do próprio admin, sem tocar em profiles.role.
//
// Agora só existem os campos abaixo, cada um com tipo próprio. Campo
// desconhecido é DESCARTADO (não 400): o painel devolve no PUT o mesmo objeto
// que recebeu no GET, então rejeitar sobra legada travaria o botão "Salvar" —
// descartar limpa a sujeira no primeiro save e fica registrado na auditoria.
//
// `secret: true` alimenta ao mesmo tempo três comportamentos que ANTES viviam em
// listas separadas e podiam divergir: redação no GET, redação na auditoria e
// preservação "pegajosa" do valor já gravado. Campo sensível novo entra numa
// linha só e já nasce coberto nos três.
//
// `security: true` marca o campo como parte do MECANISMO de autenticação: mexer
// nele exige reautenticação (ver changedSecurityFields). `default` é o valor
// que vale quando o campo está AUSENTE — sem ele, "ausente" e "false" seriam
// coisas diferentes na comparação e omitir um campo viraria uma forma de mudar
// a política sem ser detectado.
// ════════════════════════════════════════════════════════════════════
const ADMIN_CONFIG_FIELDS = Object.freeze({
  // Três nomes para a mesma ideia por herança do código; api/admin-login.js
  // considera 2FA exigido se QUALQUER um for verdadeiro.
  requireSecondFactor: { type: 'boolean', security: true, default: false },
  require2FA: { type: 'boolean', security: true, default: false },
  twoFactorEnabled: { type: 'boolean', security: true, default: false },
  // Default TRUE: extractSecondFactorMethods usa `!== false`, então ausente
  // significa "fallback por PIN LIBERADO". Repetir esse default aqui mantém as
  // duas leituras da mesma config em acordo.
  allowPinFallback: { type: 'boolean', security: true, default: true },
  totpSecret: { type: 'totpSecret', secret: true, security: true, default: '' },
  fallbackPin: { type: 'pin', secret: true, security: true, default: '' },
});

const SECRET_FIELDS = Object.freeze(
  Object.keys(ADMIN_CONFIG_FIELDS).filter((field) => ADMIN_CONFIG_FIELDS[field].secret),
);

const SECURITY_FIELDS = Object.freeze(
  Object.keys(ADMIN_CONFIG_FIELDS).filter((field) => ADMIN_CONFIG_FIELDS[field].security),
);

// Flags transitórias que o GET adiciona para o painel saber se há segredo
// configurado. Nunca são persistidas (o painel as devolve no PUT).
const TRANSIENT_FIELDS = Object.freeze(['has2FA', 'hasPin']);

// Rede de segurança para chaves LEGADAS/desconhecidas na linha já gravada.
// A whitelist protege o que ENTRA, mas o `before` do audit log e o GET partem
// do objeto CRU do banco, que pode carregar sobra de versões antigas
// (`totpSecretBackup`, `recoveryCodes`, `smtpPassword`…). Sem isto, um segredo
// que a whitelist nunca aceitaria vazaria justamente pelos dois canais que
// existem para NÃO vazar segredo. Só se aplica a chave FORA da whitelist —
// `allowPinFallback` contém "pin" e não é segredo nenhum.
//
// A comparação é por TOKEN (camelCase/snake_case quebrados antes), não por
// substring: `/pin/` casaria com "shipping" e `/seed/` com "feedback". Falso
// positivo aqui é barato (a chave legada só some do GET/audit; ela é descartada
// pela whitelist na próxima gravação de qualquer forma), falso NEGATIVO é um
// segredo em texto puro numa tabela de auditoria.
const LEGACY_SENSITIVE_TOKENS = new Set([
  'secret',
  'secrets',
  'senha',
  'senhas',
  'password',
  'passwd',
  'pass',
  'pin',
  'pins',
  'token',
  'tokens',
  'key',
  'keys',
  'apikey',
  'hash',
  'salt',
  'recovery',
  'seed',
  'otp',
  'totp',
  'credential',
  'credentials',
]);

function isField(field) {
  // Object.hasOwn e não `ADMIN_CONFIG_FIELDS[field]`: com o acesso cru,
  // `constructor`/`toString`/`valueOf` vêm do prototype e passariam pelo teste
  // de existência, levando o coercer a estourar (500) em vez de o campo ser
  // descartado como qualquer outro desconhecido.
  return Object.hasOwn(ADMIN_CONFIG_FIELDS, field);
}

function isLegacySensitiveKey(key) {
  if (isField(key) || TRANSIENT_FIELDS.includes(key)) return false;
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .some((token) => LEGACY_SENSITIVE_TOKENS.has(token.toLowerCase()));
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return { value };
  // Tolerância deliberada a 'true'/'false': configs antigas foram gravadas sem
  // validação de tipo e o painel devolve no PUT o que leu no GET. Coagimos para
  // booleano real antes de persistir, em vez de travar o save do admin.
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return { value: true };
  if (normalized === 'false') return { value: false };
  return { error: 'valor deve ser verdadeiro ou falso' };
}

function coerceTotpSecret(value) {
  // Base32 (RFC 4648) é o formato que os apps autenticadores exportam e o
  // único que decodeBase32 (api/admin-login.js) entende. Validar aqui evita
  // gravar um segredo que só falharia na hora do login.
  const normalized = String(value ?? '')
    .toUpperCase()
    .replaceAll(/[\s-]+/g, '');
  if (!normalized) return { value: '' };
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    return { error: 'o TOTP secret deve estar em Base32 (letras A-Z e dígitos 2-7)' };
  }
  if (normalized.length < MIN_TOTP_SECRET_LENGTH) {
    return { error: `o TOTP secret deve ter ao menos ${MIN_TOTP_SECRET_LENGTH} caracteres` };
  }
  return { value: normalized };
}

function coercePin(value) {
  const pin = String(value ?? '').trim();
  if (!pin) return { value: '' };
  if (pin.length < MIN_FALLBACK_PIN_LENGTH) {
    return { error: `o PIN de fallback deve ter ao menos ${MIN_FALLBACK_PIN_LENGTH} caracteres` };
  }
  if (pin.length > MAX_FALLBACK_PIN_LENGTH) {
    return { error: `o PIN de fallback deve ter no máximo ${MAX_FALLBACK_PIN_LENGTH} caracteres` };
  }
  if (/^(\d)\1+$/.test(pin) || pin === '123456' || pin === '000000') {
    return {
      error: 'o PIN de fallback é fraco demais (evite dígitos repetidos ou sequências óbvias)',
    };
  }
  return { value: pin };
}

const COERCERS = Object.freeze({
  boolean: coerceBoolean,
  totpSecret: coerceTotpSecret,
  pin: coercePin,
});

/**
 * Aplica a whitelist + validação de tipo e funde com a config já persistida.
 *
 * Segredo que chega vazio/ausente PRESERVA o valor guardado: o GET redige
 * totpSecret/fallbackPin, então o painel nunca os recebe de volta e um "Salvar"
 * comum não pode apagar o 2FA por acidente.
 *
 * @returns {{error: string}|{value: object, ignored: string[]}}
 */
function sanitizeAdminConfig(incoming, existing) {
  const source =
    incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  const current = existing && typeof existing === 'object' ? existing : {};
  const result = {};
  const ignored = [];

  for (const [field, rawValue] of Object.entries(source)) {
    if (TRANSIENT_FIELDS.includes(field)) continue;

    if (!isField(field)) {
      ignored.push(field);
      continue;
    }
    const spec = ADMIN_CONFIG_FIELDS[field];

    // null/undefined = "não enviado". Para um segredo isso preserva o valor
    // atual (laço abaixo); para uma flag isso a faz voltar ao default, o que
    // PODE enfraquecer a política — por isso a detecção compara valores
    // EFETIVOS (com default aplicado) e não "o campo veio no corpo?".
    if (rawValue === null || rawValue === undefined) continue;

    const coerced = COERCERS[spec.type](rawValue);
    if (coerced.error) {
      return { error: `Campo "${field}" inválido: ${coerced.error}.` };
    }
    if (spec.secret && coerced.value === '') continue; // vazio = "manter o atual"

    result[field] = coerced.value;
  }

  // Segredos não enviados permanecem como estão.
  for (const field of SECRET_FIELDS) {
    if (result[field] !== undefined) continue;
    const stored = String(current[field] ?? '').trim();
    if (stored) result[field] = stored;
  }

  return { value: result, ignored };
}

/**
 * Nunca gravar segredos em texto puro na trilha de auditoria.
 *
 * Aplica-se ao `before` e ao `after`. O `after` já passou pela whitelist, mas o
 * `before` vem CRU do banco: por isso, além dos SECRET_FIELDS declarados,
 * qualquer chave legada com cara de segredo também é redigida.
 */
function redactForAudit(key, value) {
  if (key !== 'adminConfig' || !value || typeof value !== 'object') return value;

  const redacted = { ...value };
  for (const field of SECRET_FIELDS) {
    if (String(redacted[field] ?? '').trim()) {
      redacted[field] = '[REDACTED]';
    } else {
      delete redacted[field];
    }
  }
  for (const field of Object.keys(redacted)) {
    if (isLegacySensitiveKey(field)) redacted[field] = '[REDACTED]';
  }
  return redacted;
}

/** Versão do GET: sem segredos, com flags de "está configurado". */
function toPublicAdminConfig(value) {
  const safeConfig = { ...value };
  for (const field of SECRET_FIELDS) {
    delete safeConfig[field];
  }
  // Mesma rede do audit: chave legada com cara de segredo não sai pelo GET.
  // Some por inteiro (em vez de virar '[REDACTED]') porque o painel devolve no
  // PUT o que leu no GET, e gravar a string literal '[REDACTED]' por cima de um
  // segredo real seria pior que não devolvê-la.
  for (const field of Object.keys(safeConfig)) {
    if (isLegacySensitiveKey(field)) delete safeConfig[field];
  }
  return {
    ...safeConfig,
    has2FA: Boolean(String(value?.totpSecret ?? '').trim()),
    hasPin: Boolean(String(value?.fallbackPin ?? '').trim()),
  };
}

/**
 * Valor EFETIVO de um campo de segurança, para comparar os dois lados da
 * escrita sob a mesma régua.
 *
 * FLAG: passa pelo coercer e cai no `default` quando ausente/ilegível.
 * Normalizar é o que evita falso positivo — configs antigas guardam
 * `requireSecondFactor: "true"` (string, gravada antes de existir validação de
 * tipo) e o painel devolve booleano de verdade; sem isto, todo "Salvar" comum
 * passaria a pedir código.
 *
 * SEGREDO: comparação literal (só trim), de propósito. A pergunta que interessa
 * é "os bytes gravados vão mudar?" — normalizar aqui poderia declarar iguais um
 * segredo antigo e um novo que apenas se parecem, e é o segredo GRAVADO que
 * autentica no login.
 */
function effectiveSecurityValue(config, field) {
  const spec = ADMIN_CONFIG_FIELDS[field];
  const raw = config?.[field];
  if (spec.secret) return String(raw ?? '').trim();
  const coerced = COERCERS[spec.type](raw);
  return coerced.error ? spec.default : coerced.value;
}

/**
 * A escrita mexe no MECANISMO de autenticação do admin?
 *
 * REGRESSÃO CORRIGIDA (R5). A versão anterior chamava-se isSecurityWeakening e
 * só olhava para segredo JÁ GRAVADO (`if (stored && ...)`). Com isso, PLANTAR um
 * segundo fator INÉDITO escapava do gate: numa config com requireSecondFactor
 * ligado e fallbackPin cadastrado, mas totpSecret vazio, quem tivesse a sessão
 * admin gravava um totpSecret próprio SEM reautenticar e ganhava um segundo
 * fator permanente na conta. A ausência de valor anterior não torna a operação
 * inofensiva — é exatamente assim que se instala uma porta dos fundos.
 *
 * Agora a pergunta é outra: o valor efetivo de QUALQUER campo de segurança
 * mudou? Isso cobre de uma vez definir, plantar pela primeira vez, trocar,
 * remover, ligar e desligar — sem depender de haver valor prévio.
 *
 * E o argumento do "endurecimento não pode exigir código que ainda não existe"?
 * Ele continua valendo, mas mora no CHAMADOR, não aqui: o gate só é aplicado
 * quando já existe 2FA exigido E com método funcionando (`enforcedNow`). Na
 * configuração inicial — 2FA desligado, nenhum segredo — nada disto roda e o
 * admin cadastra o primeiro fator livremente. Depois que o 2FA está de pé, o
 * admin legítimo SEMPRE consegue produzir um código, então exigi-lo para
 * acrescentar um fator novo não tranca ninguém para fora; apenas impede que uma
 * sessão roubada acrescente um fator que o dono não escolheu.
 *
 * Devolve os NOMES dos campos alterados (lista vazia = nada sensível mudou):
 * a mesma chamada decide se o gate dispara e alimenta o evento de segurança
 * com o que foi tocado, sem nunca carregar os valores.
 */
function changedSecurityFields(before, after) {
  return SECURITY_FIELDS.filter(
    (field) => effectiveSecurityValue(before, field) !== effectiveSecurityValue(after, field),
  );
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

async function readSetting(key) {
  const row = await getTableRow('settings', {
    select: 'setting_key,setting_value',
    filters: [{ column: 'setting_key', value: key }],
  });

  if (!row) {
    return null;
  }

  return safeJsonParse(row.setting_value, null);
}

async function writeSetting(key, value) {
  const payload = {
    setting_key: key,
    setting_value: value ?? null,
  };

  const existing = await getTableRow('settings', {
    select: 'setting_key',
    filters: [{ column: 'setting_key', value: key }],
  });

  if (existing) {
    await updateTable('settings', { setting_key: `eq.${key}` }, payload);
    return;
  }

  await insertIntoTable('settings', payload);
}

/**
 * Prepara o valor de adminConfig a ser gravado, incluindo o gate de
 * reautenticação. Devolve `{ response }` quando a requisição deve terminar com
 * aquele status, ou `{ handled: true }` quando a resposta JÁ foi escrita em
 * `res` (caminho do 429 do rate limit).
 */
async function prepareAdminConfigWrite(req, res, incoming) {
  const existingConfig = (await readSetting('adminConfig')) || {};
  const sanitized = sanitizeAdminConfig(incoming, existingConfig);
  if (sanitized.error) {
    return { response: { status: 400, body: { success: false, error: sanitized.error } } };
  }

  // Só faz sentido exigir o 2º fator para mudar o 2º fator quando existe um
  // método funcionando — senão o admin ficaria trancado fora da própria
  // configuração (e o login já responde 500 nesse estado inconsistente).
  const enforcedNow =
    isSecondFactorRequired(existingConfig) && extractSecondFactorMethods(existingConfig).length > 0;

  const changedFields = enforcedNow ? changedSecurityFields(existingConfig, sanitized.value) : [];

  if (changedFields.length > 0) {
    // Balde PRÓPRIO para o gate. Sem ele, o gate seria um oráculo de força
    // bruta sem limite: o fallbackPin tem mínimo de 6 caracteres e o TOTP são 6
    // dígitos, então uma sessão roubada poderia simplesmente varrer o espaço
    // chamando este PUT em laço. api/admin-login.js já isola o 2º fator num
    // balde separado pelo mesmo motivo (P1-3); este é o mesmo controle na outra
    // porta que aceita o mesmo código. Fail-open é herdado de lib/rate-limit.js
    // e emite evento de segurança lá dentro.
    const gate = await enforceRateLimit(req, res, REAUTH_RATE_LIMIT);
    if (gate.blocked) return { handled: true }; // o 429 já foi escrito

    // Reautenticação com o fator VIGENTE. Sem isso, "estar logado" bastava para
    // desativar o 2FA de todo mundo — a sessão admin é um cookie HMAC de 8h que
    // hoje não pode ser revogado (achado A4), então ela sozinha é prova fraca
    // demais para autorizar mexer no próprio mecanismo de autenticação.
    //
    // O código NÃO é consumido como uso único aqui (ao contrário do login): a
    // verificação é prova de posse recente, não emissão de sessão, e queimar o
    // contador quebraria o fluxo comum de "logar e ajustar o 2FA em seguida",
    // que usa o mesmo código TOTP dentro da mesma janela de 30s.
    if (!verifySecondFactorCode(existingConfig, req.body?.confirmationCode)) {
      await recordSecurityEvent({
        eventName: 'admin_2fa_settings_reauth_failed',
        severity: 'error',
        ip: extractClientIp(req),
        userAgent: req.headers['user-agent'],
        properties: {
          provided: Boolean(String(req.body?.confirmationCode || '').trim()),
          // NOMES dos campos que a requisição tentava mexer — nunca os valores.
          // É o que separa "admin errou o código ao trocar o PIN" de "alguém
          // tentou plantar um totpSecret", que é o cenário do achado R5 e o
          // sinal que o respondente precisa ver primeiro.
          fields: changedFields,
        },
      });
      return {
        response: {
          status: 403,
          body: {
            success: false,
            code: 'second_factor_required',
            error:
              'Alterações no segundo fator exigem o código TOTP (ou PIN) atual em "confirmationCode".',
          },
        },
      };
    }
  }

  return { value: sanitized.value, ignored: sanitized.ignored };
}

module.exports = async function adminSettingsHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const key = String(req.query?.key || req.body?.key || '').trim();
    if (!ALLOWED_KEYS.has(key)) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Chave de configuração inválida.',
      });
    }

    if (req.method === 'GET') {
      const value = await readSetting(key);
      // adminConfig guarda segredos (totpSecret, fallbackPin). NUNCA os
      // devolvemos no GET — o painel só precisa saber se estão configurados.
      if (key === 'adminConfig' && value && typeof value === 'object') {
        return ok(res, { success: true, key, value: toPublicAdminConfig(value) });
      }
      return ok(res, { success: true, key, value });
    }

    if (req.method === 'PUT') {
      let valueToWrite = req.body?.value ?? null;
      let ignoredFields = [];

      if (key === 'adminConfig') {
        const prepared = await prepareAdminConfigWrite(req, res, valueToWrite);
        // `handled` = a resposta já saiu de dentro do gate (429). Escrever de
        // novo em `res` aqui só produziria um ERR_HTTP_HEADERS_SENT.
        if (prepared.handled) return;
        if (prepared.response) {
          return res.status(prepared.response.status).json(prepared.response.body);
        }
        valueToWrite = prepared.value;
        ignoredFields = prepared.ignored;
      }

      const before = await readSetting(key);
      await writeSetting(key, valueToWrite);
      await logAdminAction({
        req,
        action: 'update',
        targetType: 'setting',
        targetId: key,
        before: before != null ? { value: redactForAudit(key, before) } : null,
        after: {
          value: redactForAudit(key, valueToWrite),
          // Deixa rastro de que o corpo trazia campos fora da whitelist — é o
          // sinal que diferencia "painel desatualizado" de tentativa de injeção.
          ...(ignoredFields.length ? { ignoredFields } : {}),
        },
      });
      return ok(res, { success: true, key, ...(ignoredFields.length ? { ignoredFields } : {}) });
    }

    return methodNotAllowed(res, ['OPTIONS']);
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao processar configurações do admin.',
    });
  }
};
