const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, updateTable },
} = require('../lib/supabase');

/**
 * GET /api/confirm-subscription?token=...
 *
 * Conclui o double opt-in. Token único, single-use no sentido de que
 * uma vez confirmado, o registro fica `confirmed=true` (idempotente —
 * clicar de novo só retorna sucesso).
 *
 * Responde sempre 200 com `{ confirmed, alreadyConfirmed?, error? }`
 * — o frontend (página `/confirmar-inscricao`) decide a UI. Mantém o
 * fluxo simples: nada de redirect 302 que confunde tracking.
 */
module.exports = async function confirmSubscriptionHandler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ confirmed: false, error: 'Method not allowed' });

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ confirmed: false, error: 'Supabase não configurado.' });
    }

    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.status(400).json({ confirmed: false, error: 'Token ausente.' });
    }

    const subscriber = await getTableRow('email_subscribers', {
      select: 'id,email,confirmed,confirmed_at,unsubscribed_at',
      filters: [{ column: 'confirmation_token', value: token }],
    });

    if (!subscriber) {
      return res.status(200).json({ confirmed: false, error: 'Token inválido ou expirado.' });
    }

    if (subscriber.confirmed && !subscriber.unsubscribed_at) {
      return res.status(200).json({
        confirmed: true,
        alreadyConfirmed: true,
        email: subscriber.email,
      });
    }

    await updateTable('email_subscribers', { id: `eq.${subscriber.id}` }, {
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      unsubscribed_at: null,
    });

    return res.status(200).json({
      confirmed: true,
      email: subscriber.email,
    });
  } catch (error) {
    console.error('[confirm-subscription]', error.message);
    return res.status(500).json({ confirmed: false, error: 'Erro ao confirmar inscrição.' });
  }
};
