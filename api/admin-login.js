const crypto = require('node:crypto');
const { getTableRow } = require('../lib/supabase');
const { safeCompare, setAdminCorsHeaders, setSessionCookie } = require('../lib/admin-session');

const FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;

function getChallengeSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.WEBHOOK_SECRET ||
    process.env.DOWNLOAD_TOKEN_SECRET ||
    'dev-admin-session-secret-change-me'
  );
}

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

function createChallengeToken(username) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'admin-2fa',
    username,
    nonce: crypto.randomBytes(12).toString('hex'),
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

function verifyChallengeToken(token, expectedUsername) {
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

    if (!safeCompare(String(payload?.username || ''), String(expectedUsername || ''))) {
      return { valid: false };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const sanitized = String(input || '').toUpperCase().replaceAll(/[^A-Z2-7]/g, '');
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
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

function isValidTotpCode(secret, code, stepSeconds = 30, window = 1) {
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const secretBuffer = decodeBase32(secret);
  if (!secretBuffer) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let drift = -window; drift <= window; drift += 1) {
    const expectedCode = generateTotpCode(secretBuffer, currentCounter + drift);
    if (safeCompare(normalizedCode, expectedCode)) {
      return true;
    }
  }

  return false;
}

function isSecondFactorRequired(adminConfig) {
  return Boolean(
    adminConfig?.requireSecondFactor
    || adminConfig?.require2FA
    || adminConfig?.twoFactorEnabled
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

async function readAdminConfig() {
  const row = await getTableRow('settings', {
    select: 'setting_value',
    filters: [{ column: 'setting_key', value: 'adminConfig' }],
  });

  if (!row) {
    return {};
  }

  try {
    return JSON.parse(String(row.setting_value || '{}'));
  } catch {
    return {};
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
module.exports = async function adminLoginHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const factorCode = String(req.body?.factorCode || '').trim();
  const challengeToken = String(req.body?.challengeToken || '').trim();

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Usuario e senha sao obrigatorios.' });
  }

  const expectedUser = String(process.env.ADMIN_USERNAME || '').trim();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || '');

  if (!expectedUser || !expectedPassword) {
    return res.status(500).json({
      success: false,
      error: 'Credenciais de admin nao configuradas no servidor.',
    });
  }

  const validUser = safeCompare(username, expectedUser);
  const validPassword = safeCompare(password, expectedPassword);

  if (!validUser || !validPassword) {
    return res.status(401).json({ success: false, error: 'Credenciais invalidas.' });
  }

  const adminConfig = await readAdminConfig();
  if (isSecondFactorRequired(adminConfig)) {
    const methods = extractSecondFactorMethods(adminConfig);
    if (methods.length === 0) {
      return res.status(500).json({
        success: false,
        error: '2FA ativado sem metodo configurado no adminConfig.',
      });
    }

    if (!challengeToken) {
      return res.status(200).json({
        success: false,
        requiresSecondFactor: true,
        methods,
        challengeToken: createChallengeToken(username),
      });
    }

    const challenge = verifyChallengeToken(challengeToken, username);
    if (!challenge.valid) {
      return res.status(401).json({
        success: false,
        error: 'Desafio de 2FA invalido ou expirado.',
      });
    }

    const code = String(factorCode || '').trim();
    if (!code) {
      return res.status(401).json({
        success: false,
        error: 'Codigo de verificacao obrigatorio.',
      });
    }

    const totpValid = methods.includes('totp')
      && isValidTotpCode(adminConfig?.totpSecret, code);
    const pinValid = methods.includes('pin')
      && safeCompare(code, String(adminConfig?.fallbackPin || '').trim());

    if (!totpValid && !pinValid) {
      return res.status(401).json({
        success: false,
        error: 'Codigo de verificacao invalido.',
      });
    }
  }

  setSessionCookie(res);
  return res.status(200).json({ success: true, user: { role: 'admin' } });
};
