const { getSupabaseConfig, serviceRoleHelpers: { insertIntoTable } } = require('./supabase');

const ALLOWED_SEVERITIES = new Set(['info', 'warn', 'error']);

function clip(value, limit) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, limit) || null;
}

async function postExternalAlert(payload) {
  const url = String(process.env.SECURITY_ALERT_WEBHOOK_URL || '').trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Fire-and-forget; não bloqueamos o handler mesmo se o coletor cair.
    });
  } catch (err) {
    console.warn('[security-logger] alerta externo falhou:', err.message);
  }
}

/**
 * Registra um evento de segurança em três destinos:
 *   1. stdout (sempre) — Vercel/Supabase Logs capturam.
 *   2. Tabela public.security_events (se Supabase disponível).
 *   3. SECURITY_ALERT_WEBHOOK_URL (se configurado) — Slack/Discord/Sentry.
 *
 * Não joga: erros em (2)/(3) caem em console.warn para não derrubar o
 * handler que disparou o evento.
 *
 * @param {object} event
 * @param {string} event.eventName    nome curto, e.g. 'webhook_invalid_signature'
 * @param {'info'|'warn'|'error'} [event.severity='warn']
 * @param {string} [event.ip]
 * @param {string} [event.userAgent]
 * @param {string} [event.requestId]
 * @param {object} [event.properties] payload livre (será serializado, sem PII)
 */
async function recordSecurityEvent({
  eventName,
  severity = 'warn',
  ip = null,
  userAgent = null,
  requestId = null,
  properties = {},
} = {}) {
  if (!eventName || typeof eventName !== 'string') return;
  const safeSeverity = ALLOWED_SEVERITIES.has(severity) ? severity : 'warn';

  const record = {
    event: eventName,
    severity: safeSeverity,
    ip: clip(ip, 64),
    user_agent: clip(userAgent, 500),
    request_id: clip(requestId, 128),
    properties: properties && typeof properties === 'object' ? properties : {},
    timestamp: new Date().toISOString(),
  };

  // 1. Log estruturado JSON na saída padrão.
  console.warn(JSON.stringify({ level: safeSeverity, ...record }));

  // 2. Persistência no Postgres (best-effort).
  if (getSupabaseConfig()) {
    try {
      await insertIntoTable('security_events', {
        event_name: record.event,
        severity: record.severity,
        ip: record.ip,
        user_agent: record.user_agent,
        request_id: record.request_id,
        properties: record.properties,
      });
    } catch (err) {
      console.warn('[security-logger] insert falhou:', err.message);
    }
  }

  // 3. Alerta externo (best-effort, fire-and-forget).
  await postExternalAlert(record);
}

/**
 * Extrai o IP do cliente respeitando trust proxy.
 * Use sempre que precisar do IP em handlers — abstrai req.ip vs X-Forwarded-For.
 */
function extractClientIp(req) {
  if (!req) return null;
  // 1. Express com `trust proxy` já resolve req.ip do proxy confiável.
  if (req.ip) return req.ip;

  const headers = req.headers || {};

  // 2. Headers ANCORADOS pela borda (Vercel), que o cliente não controla.
  //    No runtime serverless não existe req.ip; usar o 1º valor de
  //    X-Forwarded-For seria spoofável (o cliente prepende o que quiser).
  const anchored = String(headers['x-real-ip'] || headers['x-vercel-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (anchored) return anchored;

  // 3. Fallback: X-Forwarded-For é controlável pelo cliente. Usa o ÚLTIMO
  //    valor (adicionado pelo proxy mais próximo) em vez do primeiro.
  const forwardedChain = String(headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwardedChain.length) return forwardedChain[forwardedChain.length - 1];

  return req.socket?.remoteAddress || req.connection?.remoteAddress || null;
}

module.exports = {
  recordSecurityEvent,
  extractClientIp,
};
