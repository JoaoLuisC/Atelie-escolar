const { createLogger } = require('./logger');

const log = createLogger('analytics-events');

const {
  getSupabaseConfig,
  serviceRoleHelpers: { insertIntoTable },
} = require('./supabase');

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

const MAX_PROP_DEPTH = 4;
const MAX_PROP_KEYS = 50;

// Considera PII qualquer chave que contenha um dos termos sensíveis (cobre
// variantes como userEmail, customerCpf, phoneNumber etc.), em QUALQUER nível.
function isPiiKey(key) {
  const k = String(key).toLowerCase();
  if (PII_KEYS.has(k)) return true;
  return ['email', 'cpf', 'phone', 'telefone', 'password', 'senha'].some((term) =>
    k.includes(term),
  );
}

function sanitizeValue(value, depth) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'function') return undefined;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (depth >= MAX_PROP_DEPTH) return undefined;
    return value
      .slice(0, MAX_PROP_KEYS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((v) => v !== undefined);
  }
  if (typeof value === 'object') {
    if (depth >= MAX_PROP_DEPTH) return undefined;
    return sanitizeObject(value, depth + 1);
  }
  return undefined;
}

function sanitizeObject(input, depth) {
  const out = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= MAX_PROP_KEYS) break;
    if (isPiiKey(key)) continue; // remove PII em qualquer nível
    const sanitized = sanitizeValue(value, depth);
    if (sanitized !== undefined) {
      out[key] = sanitized;
      count += 1;
    }
  }
  return out;
}

function sanitizeProperties(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return sanitizeObject(input, 0);
}

function sanitizeSessionId(value) {
  return String(value || '').slice(0, 64);
}

// ════════════════════════════════════════════════════════════════════
// O PARÂMETRO `customerEmail` FOI REMOVIDO — não reintroduza.
//
// A tabela tem uma coluna `customer_email`, e dois handlers a preenchiam
// (create-payment e webhook). NINGUÉM a lia: o único leitor de
// `analytics_events` é handlers/admin/funnel.js, que seleciona
// `event_name, session_id, created_at`. Era PII retida sem consumidor —
// exatamente o que o princípio da minimização proíbe.
//
// Pior, ela sobrevivia à exclusão de conta: `orders.customer_email` é
// anonimizado no fluxo do art. 18, e a cópia aqui ficava até a purga de 180
// dias levá-la. O e-mail de quem pediu para ser esquecido continuava
// gravado, num lugar que ninguém lembrava de olhar.
//
// O vínculo evento↔pessoa continua existindo por `orderId`, que aponta para
// `orders` — a tabela que É anonimizada. Nada de análise se perde; some só
// a segunda cópia, que era a que não tinha dono.
// ════════════════════════════════════════════════════════════════════
async function recordEvent({
  eventName,
  sessionId = '',
  orderId = null,
  productId = null,
  properties = {},
  source = 'web',
}) {
  if (!getSupabaseConfig()) return null;
  try {
    const payload = {
      event_name: eventName,
      session_id: sanitizeSessionId(sessionId),
      order_id: orderId || null,
      product_id: productId || null,
      properties: sanitizeProperties(properties),
      source: String(source || 'web').slice(0, 32),
    };
    await insertIntoTable('analytics_events', payload);
    return true;
  } catch (error) {
    log.warn('falha_ao_gravar_evento', { eventName, reason: error.message });
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
