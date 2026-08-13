const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, listTableRows },
} = require('../lib/supabase');
const { sendEmail } = require('../lib/email-sender');
const { orderConfirmation } = require('../lib/email-templates');
const { ERROR_CODES, fail, methodNotAllowed, ok, preflight } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('send-confirmation-email');

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
  if (req.method === 'OPTIONS') return preflight(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

  try {
    const { orderId, customerName, customerEmail, isNewAccount } = req.body || {};

    if (!orderId || !customerEmail) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'orderId e customerEmail são obrigatórios',
      });
    }

    if (!getSupabaseConfig()) {
      return ok(res, { success: true, sent: false, reason: 'supabase_not_configured' });
    }

    const order = await getTableRow('orders', {
      select: 'id,order_code,total_amount,customer_email',
      filters: [{ column: 'order_code', value: orderId }],
    });

    // Não envia para pedido inexistente (evita e-mail "pagamento confirmado"
    // forjado). Best-effort: 200 sem falhar o checkout.
    if (!order || !order.customer_email) {
      return ok(res, { success: true, sent: false, reason: 'order_not_found' });
    }

    const orderItems = await listTableRows('order_items', {
      select: 'order_id,product_name,unit_price,quantity',
      filters: [{ column: 'order_id', value: order.id }],
      orderBy: 'id',
      ascending: true,
    });

    const { subject, html } = orderConfirmation({
      orderId,
      customerName,
      items: orderItems.map((i) => ({ name: i.product_name, price: i.unit_price })),
      totalAmount: order.total_amount || 0,
      isNewAccount: Boolean(isNewAccount),
    });

    // Destinatário SEMPRE o e-mail do pedido — nunca o do body — para que
    // conhecer um order_code não permita exfiltrar itens/total para um e-mail
    // arbitrário do atacante. (customerEmail do body é ignorado de propósito.)
    const result = await sendEmail({
      to: order.customer_email,
      subject,
      html,
      kind: 'order_confirmation',
      entityId: orderId,
    });

    return ok(res, {
      success: true,
      sent: result.sent,
      skipped: Boolean(result.skipped),
      reason: result.reason || null,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    // Não falha o checkout por causa do email; sem vazar detalhe interno ao client.
    return ok(res, { success: true, sent: false, reason: 'internal_error' });
  }
};
