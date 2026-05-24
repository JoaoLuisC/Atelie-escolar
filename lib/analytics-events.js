const { getSupabaseConfig, serviceRoleHelpers: { insertIntoTable } } = require('./supabase');

const CLIENT_ALLOWED_EVENTS = new Set([
  'view_item',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'view_catalog',
  'begin_checkout',
  'client_error',
]);

const SERVER_ALLOWED_EVENTS = new Set([
  'checkout_initiated',
  'payment_approved',
  'payment_rejected',
  'payment_cancelled',
  'webhook_received',
]);

const PII_KEYS = new Set(['email', 'customer_email', 'cpf', 'phone', 'password']);

function isClientEventAllowed(eventName) {
  return CLIENT_ALLOWED_EVENTS.has(eventName);
}

function isServerEventAllowed(eventName) {
  return SERVER_ALLOWED_EVENTS.has(eventName);
}

function sanitizeProperties(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (PII_KEYS.has(key)) continue;
    if (typeof value === 'function') continue;
    if (typeof value === 'object') {
      try {
        out[key] = JSON.parse(JSON.stringify(value));
      } catch {
        /* skip non-serializable */
      }
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, 500);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeSessionId(value) {
  return String(value || '').slice(0, 64);
}

async function recordEvent({ eventName, sessionId = '', customerEmail = null, orderId = null, productId = null, properties = {}, source = 'web' }) {
  if (!getSupabaseConfig()) return null;
  try {
    const payload = {
      event_name: eventName,
      session_id: sanitizeSessionId(sessionId),
      customer_email: customerEmail || null,
      order_id: orderId || null,
      product_id: productId || null,
      properties: sanitizeProperties(properties),
      source: String(source || 'web').slice(0, 32),
    };
    await insertIntoTable('analytics_events', payload);
    return true;
  } catch (error) {
    console.warn('[analytics] falha ao gravar evento:', eventName, error.message);
    return false;
  }
}

module.exports = {
  CLIENT_ALLOWED_EVENTS,
  SERVER_ALLOWED_EVENTS,
  isClientEventAllowed,
  isServerEventAllowed,
  recordEvent,
  sanitizeProperties,
};
