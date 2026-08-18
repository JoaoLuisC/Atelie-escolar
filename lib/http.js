// ════════════════════════════════════════════════════════════════════
// ENVELOPE DE RESPOSTA DA API — porta única (regras A1, A2 e A4).
//
// ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────
// Os 44 handlers de `api/` foram escritos em momentos diferentes e cada um
// inventou seu contrato de erro. A medição de 13/08/2026 encontrou TRÊS
// formatos vivos ao mesmo tempo:
//
//   • `{ success: false, error: 'texto' }`            → 32 handlers
//   • `{ error: 'texto' }`                            →  9 handlers
//   • `{ success: false, error: { message, code } }`  → middleware/error.middleware.js
//
// O custo não ficou no backend: `src/utils/api.js` carregava um shim em
// `parseJson` que detectava `error` como objeto e o achatava para string,
// existindo apenas para o cliente sobreviver aos dois formatos.
//
// ── POR QUE `code` É O CONTRATO, E NÃO A MENSAGEM ───────────────────
// Sem código estável o cliente é forçado a ramificar por texto em português.
// Era literalmente o que acontecia em src/components/admin/utils/format.js:
//
//     String(error?.message || '').toLowerCase().includes('sessao admin')
//
// Trocar uma palavra da mensagem quebrava o re-login do admin em silêncio, sem
// nenhum teste que pegasse. `message` é para humano e pode ser reescrita a
// qualquer momento; `code` é para máquina e só muda com migração deliberada.
//
// ── SUCESSO É PLANO, ERRO É ANINHADO ────────────────────────────────
// Assimetria deliberada, decidida em 13/08/2026 (ver nota na regra A1 do
// CONTRIBUTING.md). O erro precisa de estrutura porque carrega DOIS campos com
// públicos diferentes (code para a máquina, message para a pessoa). O sucesso
// não precisa: aninhar o payload sob `data` custaria reescrever todo consumidor
// do frontend e ~100 asserções de teste no caminho do checkout, em troca de
// nada que o `success` já não resolva.
// ════════════════════════════════════════════════════════════════════

/**
 * Códigos de erro conhecidos. SCREAMING_SNAKE, estáveis, versionados junto com
 * o cliente que os consome.
 *
 * Não é uma lista fechada por acaso: `fail()` aceita qualquer string neste
 * formato para não travar um endpoint novo atrás de uma edição aqui. O valor
 * desta tabela é ser o lugar onde se procura antes de inventar um código —
 * dois nomes para a mesma condição é o começo da divergência que a regra A2
 * existe para evitar.
 */
const ERROR_CODES = Object.freeze({
  // ── Transporte / protocolo ──
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',

  // ── Autenticação e autorização ──
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  ADMIN_SESSION_INVALID: 'ADMIN_SESSION_INVALID',
  CUSTOMER_SESSION_INVALID: 'CUSTOMER_SESSION_INVALID',
  CREDENTIALS_INVALID: 'CREDENTIALS_INVALID',
  SECOND_FACTOR_REQUIRED: 'SECOND_FACTOR_REQUIRED',
  SECOND_FACTOR_INVALID: 'SECOND_FACTOR_INVALID',

  // ── Recursos ──
  NOT_FOUND: 'NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  CONFIRMATION_EXPIRED: 'CONFIRMATION_EXPIRED',

  // ── Cupom ──
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_EXHAUSTED: 'COUPON_EXHAUSTED',
  COUPON_MINIMUM_NOT_MET: 'COUPON_MINIMUM_NOT_MET',
  COUPON_NOT_ELIGIBLE: 'COUPON_NOT_ELIGIBLE',
  COUPON_INACTIVE: 'COUPON_INACTIVE',
  COUPON_NOT_YET_VALID: 'COUPON_NOT_YET_VALID',

  // ── Download ──
  DOWNLOAD_TOKEN_INVALID: 'DOWNLOAD_TOKEN_INVALID',
  DOWNLOAD_TOKEN_USED: 'DOWNLOAD_TOKEN_USED',
  DOWNLOAD_TOKEN_EXPIRED: 'DOWNLOAD_TOKEN_EXPIRED',
  DOWNLOAD_UNAVAILABLE: 'DOWNLOAD_UNAVAILABLE',

  // ── Pagamento ──
  PAYMENT_NOT_APPROVED: 'PAYMENT_NOT_APPROVED',
  PAYMENT_INTEGRITY_FAILED: 'PAYMENT_INTEGRITY_FAILED',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',

  // ── Infra ──
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

const { isLocalDevOrTest } = require('./env-secret');

const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Mensagem de fallback por faixa de status. Existe para que um `fail()` sem
 * mensagem nunca produza `"undefined"` na tela do cliente.
 */
const DEFAULT_MESSAGES = Object.freeze({
  400: 'Requisição inválida.',
  401: 'Não autorizado.',
  403: 'Acesso negado.',
  404: 'Recurso não encontrado.',
  405: 'Método não permitido.',
  409: 'Conflito com o estado atual do recurso.',
  410: 'Este link não é mais válido.',
  422: 'Não foi possível processar a requisição.',
  429: 'Muitas requisições. Aguarde um instante.',
  500: 'Erro interno do servidor.',
  502: 'Serviço temporariamente indisponível.',
  503: 'Serviço temporariamente indisponível.',
});

function defaultCodeFor(status) {
  if (status >= 500) return ERROR_CODES.INTERNAL_ERROR;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 401) return ERROR_CODES.UNAUTHORIZED;
  if (status === 405) return ERROR_CODES.METHOD_NOT_ALLOWED;
  return ERROR_CODES.VALIDATION_FAILED;
}

/**
 * Resposta de PREFLIGHT (regra A4).
 *
 * 204 e não 200: preflight não tem corpo a devolver, e a medição encontrou os
 * dois em uso (23 handlers com 204, 17 com 200). Padronizar num helper é o que
 * impede a divergência de voltar no próximo endpoint.
 */
function preflight(res) {
  return res.status(204).end();
}

/**
 * Resposta de SUCESSO. O payload vai plano ao lado do flag.
 *
 * @param {object} res
 * @param {object} [payload]  campos de domínio (products, order, coupon…)
 * @param {object} [options]
 * @param {number} [options.status=200]
 */
function ok(res, payload = {}, { status = 200 } = {}) {
  return res.status(status).json({ success: true, ...payload });
}

/**
 * Resposta de ERRO. Sempre `{ success: false, error: { code, message } }`.
 *
 * @param {object} res
 * @param {object} options
 * @param {number} options.status
 * @param {string} [options.code]     SCREAMING_SNAKE; derivado do status se ausente
 * @param {string} [options.message]  texto para humano; default por status
 * @param {object} [options.details]  contexto extra — SÓ fora de produção (ver abaixo)
 */
function fail(res, { status = 500, code, message, details } = {}) {
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  const rawCode = String(code || '').trim();
  const safeCode = CODE_PATTERN.test(rawCode) ? rawCode : defaultCodeFor(safeStatus);
  const safeMessage =
    String(message || '').trim() || DEFAULT_MESSAGES[safeStatus] || DEFAULT_MESSAGES[500];

  const error = { code: safeCode, message: safeMessage };

  // `details` carrega o caminho do campo que falhou na validação (ver
  // validation/). Em produção fica de fora: nomear campos internos e ecoar o
  // valor recebido é ajuda para quem sonda a API, não para o cliente — que já
  // recebeu a mensagem em português. Mesma política de
  // middleware/error.middleware.js, agora aplicada nos handlers também.
  if (details && process.env.NODE_ENV !== 'production') {
    error.details = details;
  }

  return res.status(safeStatus).json({ success: false, error });
}

/**
 * 405 com o header `Allow`, que é obrigatório na especificação e nenhum dos 44
 * handlers emitia. Sem ele o cliente não tem como descobrir o método correto
 * senão por tentativa.
 *
 * @param {object} res
 * @param {string[]} allowed  ex.: ['GET', 'OPTIONS']
 */
function methodNotAllowed(res, allowed = []) {
  const methods = Array.isArray(allowed) ? allowed.filter(Boolean) : [];
  if (methods.length && typeof res.setHeader === 'function') {
    try {
      res.setHeader('Allow', methods.join(', '));
    } catch {
      /* resposta já encerrada: o status abaixo ainda é o que importa */
    }
  }

  return fail(res, {
    status: 405,
    code: ERROR_CODES.METHOD_NOT_ALLOWED,
    message: 'Método não permitido.',
  });
}

/**
 * Guarda de método com preflight embutido — o topo do handler em uma linha,
 * na ordem que a regra A3 fixa (CORS → OPTIONS → método → …).
 *
 * @returns {boolean} `true` se a requisição já foi respondida e o handler deve
 *                    retornar imediatamente.
 *
 * @example
 *   if (guardMethod(req, res, ['GET'])) return;
 */
function guardMethod(req, res, allowed = []) {
  const methods = (Array.isArray(allowed) ? allowed : [allowed]).filter(Boolean).map(String);

  if (req.method === 'OPTIONS') {
    preflight(res);
    return true;
  }

  if (!methods.includes(String(req.method))) {
    methodNotAllowed(res, [...methods, 'OPTIONS']);
    return true;
  }

  return false;
}

// ════════════════════════════════════════════════════════════════════
// CORS — ADR 0006.
//
// Estas duas funções moravam em `lib/admin-session.js`, um módulo de SESSÃO.
// CORS não é sessão: é cabeçalho de resposta, e o lugar dos helpers de
// resposta é aqui. Mudaram de casa junto com a reescrita da regra A3, e a
// razão está no ADR: em produção o front e a API são same-origin na Vercel, e
// em desenvolvimento o `cors` do Express resolve — os únicos handlers que
// PRECISAM emitir CORS são os administrativos, por causa do
// `credentials: 'include'` do painel.
// ════════════════════════════════════════════════════════════════════

/**
 * Allowlist de origens confiáveis.
 *
 * Também é a base da defesa anti-CSRF de `isSameOriginRequest`
 * (`lib/admin-session.js`) — é a mesma pergunta ("esta origem é nossa?"), e
 * duas allowlists divergentes seriam a forma mais silenciosa de abrir o CSRF
 * que aquela função existe para fechar.
 */
function getAllowedOrigins() {
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const values = [appUrl];
  // Origens de dev do Vite só entram na allowlist em ambiente local/dev/test;
  // em produção elas não devem ser aceitas para CORS/CSRF.
  if (isLocalDevOrTest()) {
    values.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  return values.filter(Boolean);
}

/**
 * CORS dos endpoints ADMINISTRATIVOS, com credenciais.
 *
 * `Access-Control-Allow-Credentials: true` exige origem explícita — `*` é
 * recusado pelo navegador nesse modo —, e é por isso que o header só sai
 * quando a origem está na allowlist.
 */
function setAdminCorsHeaders(req, res) {
  const origin = req?.headers?.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Política de cache por CLASSE de endpoint (regra E4).
 *
 * As três políticas já existiam espalhadas e coerentes; o que faltava era
 * estarem nomeadas num lugar só, para endpoint novo escolher em vez de inventar.
 *
 * `catalog` é também o que substitui o cache em `Map` de processo que três
 * handlers admin mantinham (regra E2): numa função serverless o acerto daquele
 * Map era acidental, enquanto o CDN é compartilhado de verdade.
 */
const CACHE_POLICIES = Object.freeze({
  // Catálogo público: pode ser servido pelo CDN a qualquer visitante.
  catalog: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
  // Relatório administrativo: resposta por usuário, nunca em cache compartilhado.
  adminReport: 'private, max-age=3600',
  // Entrega de arquivo / token de uso único: nunca guardar em lugar nenhum.
  sensitive: 'no-store, max-age=0',
});

function setCachePolicy(res, policy) {
  const value = CACHE_POLICIES[policy];
  if (!value || typeof res.setHeader !== 'function') return;
  try {
    res.setHeader('Cache-Control', value);
  } catch {
    /* resposta já encerrada */
  }
}

module.exports = {
  ERROR_CODES,
  CACHE_POLICIES,
  preflight,
  ok,
  fail,
  methodNotAllowed,
  guardMethod,
  getAllowedOrigins,
  setAdminCorsHeaders,
  setCachePolicy,
};
