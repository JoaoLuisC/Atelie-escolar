// Sanitização canônica de dados de atribuição (UTMs, referrer, sessão) persistidos
// em `attribution_data` de pedidos, carrinhos abandonados e inscrições de e-mail.
//
// Fonte ÚNICA da verdade: o cliente (src/utils/attribution.js -> buildAttributionPayload)
// emite estes 9 campos. Antes, cada handler mantinha sua própria whitelist e três
// campos (referrer, landing_path, first_touch_at) eram silenciosamente descartados em
// abandoned_carts e email_subscribers, divergindo de orders (ver review Área 8, DRY-01).

const ATTRIBUTION_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'referrer',
  'landing_path',
  'first_touch_at',
  'session_id',
];

function sanitizeAttribution(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const field of ATTRIBUTION_FIELDS) {
    const value = input[field];
    if (typeof value === 'string' && value.trim()) {
      out[field] = value.slice(0, 200);
    }
  }
  return out;
}

module.exports = { ATTRIBUTION_FIELDS, sanitizeAttribution };
