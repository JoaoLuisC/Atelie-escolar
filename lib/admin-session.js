const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(input) {
  const normalized = String(input || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.WEBHOOK_SECRET ||
    process.env.DOWNLOAD_TOKEN_SECRET ||
    'dev-admin-session-secret-change-me'
  );
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

function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'admin',
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
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function setSessionCookie(res) {
  const token = createSessionToken();
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

function ensureAdminSession(req, res) {
  if (!hasValidAdminSession(req)) {
    res.status(401).json({ success: false, error: 'Sessao admin invalida ou expirada.' });
    return false;
  }

  return true;
}

function getAllowedOrigins() {
  const appUrl = String(process.env.APP_URL || '').trim();
  const values = [appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];
  return values.filter(Boolean);
}

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

module.exports = {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  ensureAdminSession,
  hasValidAdminSession,
  parseCookies,
  safeCompare,
  setAdminCorsHeaders,
  setSessionCookie,
};
