const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, listTableRows },
} = require('../lib/supabase');
const { sendEmail } = require('../lib/email-sender');
const { orderConfirmation } = require('../lib/email-templates');

/**
 * POST /api/send-confirmation-email
 * Body: { orderId, customerName, customerEmail, isNewAccount }
 *
 * Disparado pelo cliente após o checkout (best-effort) ou pelo webhook
 * do Mercado Pago. Idempotência garantida via `email_sent_log` no
 * `sendEmail` (kind=order_confirmation, entityId=orderId).
 *
 * Mantido como endpoint para preservar a integração existente — antes
 * tinha template inline; agora delega para `lib/email-templates.js`.
 */
module.exports = async function sendConfirmationEmailHandler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, customerName, customerEmail, isNewAccount } = req.body || {};

    if (!orderId || !customerEmail) {
      return res.status(400).json({ error: 'orderId e customerEmail são obrigatórios' });
    }

    if (!getSupabaseConfig()) {
      return res.status(200).json({ success: true, sent: false, reason: 'supabase_not_configured' });
    }

    const order = await getTableRow('orders', {
      select: 'id,order_code,total_amount,customer_email',
      filters: [{ column: 'order_code', value: orderId }],
    });

    const orderItems = order
      ? await listTableRows('order_items', {
          select: 'order_id,product_name,unit_price,quantity',
          filters: [{ column: 'order_id', value: order.id }],
          orderBy: 'id',
          ascending: true,
        })
      : [];

    const { subject, html } = orderConfirmation({
      orderId,
      customerName,
      items: orderItems.map((i) => ({ name: i.product_name, price: i.unit_price })),
      totalAmount: order?.total_amount || 0,
      isNewAccount: Boolean(isNewAccount),
    });

    const result = await sendEmail({
      to: customerEmail,
      subject,
      html,
      kind: 'order_confirmation',
      entityId: orderId,
    });

    return res.status(200).json({
      success: true,
      sent: result.sent,
      skipped: Boolean(result.skipped),
      reason: result.reason || null,
    });
  } catch (error) {
    console.error('[send-confirmation-email] Erro:', error.message);
    // Não falha o checkout por causa do email
    return res.status(200).json({ success: true, sent: false, error: error.message });
  }
};
