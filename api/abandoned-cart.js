const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('../lib/supabase');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 20;

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((item) => ({
    productId: String(item.productId || item.id || '').slice(0, 64),
    name: String(item.name || '').slice(0, 200),
    price: Number(item.price || 0),
    quantity: Math.max(1, Math.min(99, Number(item.quantity || 1))),
  })).filter((item) => item.productId);
}

function sanitizeAttribution(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'session_id']) {
    if (typeof input[key] === 'string' && input[key].trim()) {
      out[key] = input[key].slice(0, 200);
    }
  }
  return out;
}

/**
 * Salva (ou atualiza) o estado de um carrinho com e-mail capturado.
 *
 * Estratégia: upsert manual por (email, session_id). Quando o cliente
 * digita o e-mail e tem itens no carrinho, o frontend chama isso.
 * Um job futuro (Fase 3 / cron) varre `abandoned_carts` onde:
 *   recovered_at IS NULL
 *   AND reminder_sent_at IS NULL
 *   AND updated_at < now() - interval '1 hour'
 * e dispara o e-mail de recuperação.
 *
 * Não bloqueia o checkout: se falhar, o front simplesmente ignora.
 */
module.exports = async function abandonedCartHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(204).end();
    }

    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'E-mail inválido.' });
    }

    const items = sanitizeItems(body.items);
    if (items.length === 0) {
      return res.status(204).end();
    }

    const sessionId = String(body.sessionId || body.session_id || '').slice(0, 64);
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const attribution = sanitizeAttribution(body.attribution);

    // Upsert manual: tenta achar registro existente, atualiza; senão insere
    const existing = await getTableRow('abandoned_carts', {
      select: 'id',
      filters: [
        { column: 'email', value: email },
        ...(sessionId ? [{ column: 'session_id', value: sessionId }] : []),
      ],
    });

    if (existing) {
      await updateTable('abandoned_carts', { id: `eq.${existing.id}` }, {
        items,
        total_amount: totalAmount,
        attribution_data: attribution,
        // Reset reminder se carrinho foi atualizado — ciclo recomeça
        reminder_sent_at: null,
      });
    } else {
      await insertIntoTable('abandoned_carts', {
        email,
        session_id: sessionId || null,
        items,
        total_amount: totalAmount,
        attribution_data: attribution,
      });
    }

    return res.status(204).end();
  } catch (error) {
    // Falha silenciosa — tracking de carrinho não pode quebrar checkout
    console.warn('[abandoned-cart]', error.message);
    return res.status(204).end();
  }
};
