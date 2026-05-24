const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, updateTable },
} = require('../lib/supabase');
const { sendEmail } = require('../lib/email-sender');
const { unsubscribeSuccess } = require('../lib/email-templates');

/**
 * Unsubscribe (regra D2 — link de descadastro obrigatório).
 *
 * Aceita:
 * - GET ?token=...     → unsubscribe pelo link no email (1-click)
 * - POST ?token=...    → mesma coisa para clients que respeitam RFC 8058
 *                        (Gmail/Outlook fazem POST automático em "Cancelar inscrição")
 * - POST { email }     → fallback: usuário digita email na página /desinscrever
 *
 * Sempre responde 200 — não confirma nem nega existência do email
 * (privacidade básica).
 */
module.exports = async function unsubscribeHandler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const token = String(req.query?.token || req.body?.token || '').trim();
    const emailInput = String(req.body?.email || '').trim().toLowerCase();

    let subscriber = null;
    if (token) {
      subscriber = await getTableRow('email_subscribers', {
        select: 'id,email,unsubscribed_at',
        filters: [{ column: 'unsubscribe_token', value: token }],
      });
    } else if (emailInput) {
      subscriber = await getTableRow('email_subscribers', {
        select: 'id,email,unsubscribed_at',
        filters: [{ column: 'email', value: emailInput }],
      });
    }

    // Resposta neutra (não revela se o email existe)
    if (!subscriber) {
      return res.status(200).json({
        success: true,
        message: 'Se o email estava cadastrado, foi removido da lista.',
      });
    }

    if (!subscriber.unsubscribed_at) {
      await updateTable('email_subscribers', { id: `eq.${subscriber.id}` }, {
        unsubscribed_at: new Date().toISOString(),
      });

      // Envia confirmação visual do unsub (kind transacional, sem footer de marketing)
      const { subject, html } = unsubscribeSuccess();
      await sendEmail({
        to: subscriber.email,
        subject,
        html,
        kind: 'unsubscribe_success',
        entityId: String(subscriber.id),
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Inscrição cancelada. Você não receberá mais emails de marketing.',
    });
  } catch (error) {
    console.error('[unsubscribe]', error.message);
    return res.status(500).json({ success: false, error: 'Erro ao processar cancelamento.' });
  }
};
