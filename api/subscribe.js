const crypto = require('node:crypto');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('../lib/supabase');
const { sendEmail } = require('../lib/email-sender');
const { optInConfirmation } = require('../lib/email-templates');
const { sanitizeAttribution } = require('../lib/attribution-sanitize');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * POST /api/subscribe
 * Body: { email, source?, attribution? }
 *
 * Double opt-in (regra D1): cria registro com confirmed=false e
 * envia email de confirmação. Confirmação real acontece em
 * /api/confirm-subscription.
 *
 * Idempotente:
 * - Email já confirmado → 200 com `alreadyConfirmed=true` (sem reenvio)
 * - Email não confirmado → reenvia confirmação se passou mais de 1h
 * - Email anteriormente unsubscribed → reativa, exige confirmar de novo
 */
module.exports = async function subscribeHandler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Informe um e-mail válido.' });
    }

    const source = String(body.source || 'unknown').slice(0, 32);
    const attribution = sanitizeAttribution(body.attribution);

    const existing = await getTableRow('email_subscribers', {
      select: 'id,confirmed,confirmation_token,unsubscribed_at,confirmation_sent_at',
      filters: [{ column: 'email', value: email }],
    });

    let confirmationToken;
    let subscriberId;

    if (existing) {
      if (existing.confirmed && !existing.unsubscribed_at) {
        return res.status(200).json({
          success: true,
          alreadyConfirmed: true,
          message: 'Você já está inscrito.',
        });
      }

      // Reenvia confirmação se: nunca confirmou e passou >1h, OU foi unsub e quer voltar.
      // Reusa token de confirmação se ainda válido (<24h) para evitar quebrar email anterior.
      const sentAgoMs = Date.now() - new Date(existing.confirmation_sent_at || 0).getTime();
      const reuseToken = sentAgoMs < 60 * 60 * 1000 && existing.confirmation_token;

      confirmationToken = reuseToken ? existing.confirmation_token : newToken();
      subscriberId = existing.id;

      await updateTable('email_subscribers', { id: `eq.${existing.id}` }, {
        confirmation_token: confirmationToken,
        confirmation_sent_at: new Date().toISOString(),
        unsubscribed_at: null,
        source,
        attribution_data: attribution,
      });
    } else {
      confirmationToken = newToken();
      const unsubscribeToken = newToken();
      const [created] = await insertIntoTable('email_subscribers', {
        email,
        confirmed: false,
        confirmation_token: confirmationToken,
        unsubscribe_token: unsubscribeToken,
        source,
        attribution_data: attribution,
      });
      subscriberId = created.id;
    }

    const { subject, html } = optInConfirmation({ confirmationToken });
    await sendEmail({
      to: email,
      subject,
      html,
      kind: 'opt_in_confirmation',
      entityId: String(subscriberId),
    });

    return res.status(200).json({
      success: true,
      message: 'Confirmação enviada para seu email. Verifique a caixa de entrada.',
    });
  } catch (error) {
    console.error('[subscribe]', error.message);
    return res.status(500).json({ success: false, error: 'Erro ao processar inscrição.' });
  }
};
