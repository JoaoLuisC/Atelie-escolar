const crypto = require('node:crypto');
const { parseCookies, safeCompare } = require('./admin-session');

const CUSTOMER_SESSION_COOKIE_NAME = 'customer_session';
const CUSTOMER_SESSION_TTL_SECONDS = 60 * 60 * 8;

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

function getCustomerSessionSecret() {
  const secret = String(process.env.CUSTOMER_SESSION_SECRET || '').trim();
  if (secret) return secret;

  const runtimeEnv = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (runtimeEnv === 'production') {
    throw new Error('CUSTOMER_SESSION_SECRET é obrigatório em produção.');
  }

  return 'dev-customer-session-secret-change-me';
}

function buildCookieHeader(value, maxAgeSeconds) {
  const parts = [
    `${CUSTOMER_SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function createCustomerSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'customer',
    uid: String(user?.uid || '').trim(),
    email: String(user?.email || '').trim(),
    name: String(user?.name || '').trim(),
    role: String(user?.role || '').trim().toLowerCase(),
    iat: now,
    exp: now + CUSTOMER_SESSION_TTL_SECONDS,
  };

  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getCustomerSessionSecret())
    .update(payloadEncoded)
    .digest('base64url');

  return `${payloadEncoded}.${signature}`;
}

function verifyCustomerSessionToken(token) {
  if (!token || !String(token).includes('.')) {
    return { valid: false };
  }

  const [payloadEncoded, signature] = String(token).split('.');
  const expectedSignature = crypto
    .createHmac('sha256', getCustomerSessionSecret())
    .update(payloadEncoded)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadEncoded));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.sub !== 'customer' || Number(payload?.exp) <= now) {
      return { valid: false };
    }

    return {
      valid: true,
      payload,
      user: {
        uid: String(payload.uid || '').trim(),
        email: String(payload.email || '').trim(),
        name: String(payload.name || '').trim(),
        role: String(payload.role || '').trim().toLowerCase(),
      },
    };
  } catch {
    return { valid: false };
  }
}

function setCustomerSessionCookie(res, user) {
  const token = createCustomerSessionToken(user);
  res.setHeader('Set-Cookie', buildCookieHeader(token, CUSTOMER_SESSION_TTL_SECONDS));
}

function clearCustomerSessionCookie(res) {
  res.setHeader('Set-Cookie', buildCookieHeader('', 0));
}

function getCustomerSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[CUSTOMER_SESSION_COOKIE_NAME] || '';
  const parsed = verifyCustomerSessionToken(token);
  if (!parsed.valid) {
    return null;
  }

  return parsed.user;
}

module.exports = {
  clearCustomerSessionCookie,
  getCustomerSessionFromRequest,
  setCustomerSessionCookie,
};
