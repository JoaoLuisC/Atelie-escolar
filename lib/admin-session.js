const crypto = require('node:crypto');
const { resolveSecret, shouldUseSecureCookie } = require('./env-secret');
const { ERROR_CODES, fail, getAllowedOrigins } = require('./http');

const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMIN_ROLES = new Set(['admin', 'master']);
const STAFF_ROLES = new Set(['admin', 'master', 'seller']);

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

function getSessionSecret() {
  return resolveSecret('ADMIN_SESSION_SECRET', 'dev-admin-session-secret-change-me');
}

function parseCookies(req) {
  const raw = req?.headers?.cookie || '';
  const cookies = {};

  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join('='));
  }

  return cookies;
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

function createSessionToken(identity = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'admin',
    // Identidade individual do admin autenticado (login por e-mail/senha
    // via Supabase). Sem isso o audit log atribuía tudo a um 'admin'
    // genérico, quebrando o não-repúdio.
    email:
      String(identity?.email || '')
        .trim()
        .toLowerCase() || null,
    role:
      String(identity?.role || '')
        .trim()
        .toLowerCase() || null,
    userId:
      String(identity?.userId || '')
        .trim()
        .toLowerCase() || null,
    // Professor(a) dona da loja (white label): abre o painel da loja. Decidido
    // no login (lib/store-owner.js) e assinado junto — trocar a dona no painel
    // vale a partir do próximo login, como qualquer outra mudança de papel.
    storeOwner: identity?.storeOwner === true,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadEncoded)
    .digest('base64url');

  return `${payloadEncoded}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !String(token).includes('.')) {
    return { valid: false };
  }

  const [payloadEncoded, signature] = String(token).split('.');
  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadEncoded)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadEncoded));
    const now = Math.floor(Date.now() / 1000);

    if (payload?.sub !== 'admin' || Number(payload?.exp) <= now) {
      return { valid: false };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

function buildCookieHeader(value, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    // Strict (antes Lax): o painel admin é same-site (SPA no mesmo origin),
    // então Strict não atrapalha e barra o envio do cookie em requisições
    // cross-site — defesa primária de CSRF.
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (shouldUseSecureCookie()) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function setSessionCookie(res, identity = {}) {
  const token = createSessionToken(identity);
  res.setHeader('Set-Cookie', buildCookieHeader(token, SESSION_TTL_SECONDS));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', buildCookieHeader('', 0));
}

function hasValidAdminSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME] || '';
  return verifySessionToken(token).valid;
}

function getStaffSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME] || '';
  const parsed = verifySessionToken(token);
  if (!parsed.valid) return null;

  const role =
    String(parsed.payload?.role || '')
      .trim()
      .toLowerCase() || 'admin';
  return {
    email:
      String(parsed.payload?.email || '')
        .trim()
        .toLowerCase() || 'admin',
    role,
    userId: String(parsed.payload?.userId || '').trim() || null,
    storeOwner: parsed.payload?.storeOwner === true,
  };
}

/**
 * Quem pode usar o painel da LOJA (produtos, pedidos, cupons, vendas, página):
 * admin/master e a professora dona da loja. Usuários, Segurança e a gestão de
 * professores continuam só de admin (`ensureAdminSession`).
 */
function canManageStore(session) {
  if (!session) return false;
  return ADMIN_ROLES.has(session.role) || (session.role === 'seller' && session.storeOwner);
}

/**
 * Identidade do admin da sessão atual (e-mail individual, quando presente
 * no token). Usado pelo audit log para não-repúdio. Volta 'admin' se o
 * token for antigo (sem identidade) — retrocompatível.
 */
function getAdminIdentity(req) {
  return getStaffSession(req)?.email || null;
}

/**
 * Verifica se a requisição vem de uma origem confiável (mesma origem do
 * app). Defesa anti-CSRF em profundidade: mesmo com SameSite=Strict,
 * exigimos que Origin (ou Referer) bata com a allowlist em métodos de
 * escrita. Browsers sempre enviam Origin ou Referer em POST/PUT/DELETE.
 */
function isSameOriginRequest(req) {
  const allowed = getAllowedOrigins();

  const origin = String(req?.headers?.origin || '').trim();
  if (origin) {
    return allowed.includes(origin.replace(/\/+$/, ''));
  }

  const referer = String(req?.headers?.referer || req?.headers?.referrer || '').trim();
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  // Sem Origin nem Referer: bloqueia mutação (fail-closed).
  return false;
}

/**
 * Portão dos 18 endpoints administrativos.
 *
 * ── POR QUE ESTAS DUAS RESPOSTAS PASSAM POR `fail()` (regra A2) ──────
 * Elas eram o único lugar do repositório que nunca migrou, e a consequência
 * era um bug em produção, não uma inconsistência de estilo: sem `code`, o
 * cliente caía no fallback por TEXTO de `isSessionError`, que procurava
 * `'sessao admin'` SEM ACENTO dentro de `'Sessão admin inválida ou expirada.'`
 *
 *     'Sessão admin inválida ou expirada.'.toLowerCase().includes('sessao admin')
 *     // → false
 *
 * `onAuthExpired()` nunca disparava e a dona da loja via um erro genérico em
 * vez de voltar para o login. `ADMIN_SESSION_INVALID` já existia no catálogo
 * de `lib/http.js` E no espelho de `src/constants/error-codes.js` desde
 * 13/08/2026 — o `if` que a regra A2 foi escrita para criar estava morto desde
 * que foi escrito.
 */
function ensureRoleSession(req, res, allowedRoles = ADMIN_ROLES) {
  const allowed = allowedRoles instanceof Set ? allowedRoles : new Set(allowedRoles);
  return ensureSession(req, res, (session) => allowed.has(session.role));
}

function ensureSession(req, res, isAllowed) {
  const session = getStaffSession(req);
  if (!session) {
    fail(res, {
      status: 401,
      code: ERROR_CODES.ADMIN_SESSION_INVALID,
      message: 'Sessão admin inválida ou expirada.',
    });
    return false;
  }

  if (!isAllowed(session)) {
    fail(res, {
      status: 403,
      code: ERROR_CODES.FORBIDDEN,
      message: 'Seu perfil não tem permissão para acessar este recurso.',
    });
    return false;
  }

  if (
    STATE_CHANGING_METHODS.has(String(req?.method || '').toUpperCase()) &&
    !isSameOriginRequest(req)
  ) {
    fail(res, {
      status: 403,
      code: ERROR_CODES.FORBIDDEN,
      message: 'Origem não permitida (possível CSRF).',
    });
    return false;
  }

  return true;
}

function ensureAdminSession(req, res) {
  return ensureRoleSession(req, res, ADMIN_ROLES);
}

function ensureStaffSession(req, res) {
  return ensureRoleSession(req, res, STAFF_ROLES);
}

function ensureStoreSession(req, res) {
  return ensureSession(req, res, canManageStore);
}

module.exports = {
  SESSION_COOKIE_NAME,
  ADMIN_ROLES,
  STAFF_ROLES,
  canManageStore,
  clearSessionCookie,
  ensureAdminSession,
  ensureRoleSession,
  ensureStaffSession,
  ensureStoreSession,
  getAdminIdentity,
  getStaffSession,
  hasValidAdminSession,
  isSameOriginRequest,
  parseCookies,
  safeCompare,
  setSessionCookie,
};
