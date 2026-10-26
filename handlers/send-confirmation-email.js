const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow },
} = require('../lib/supabase');
const { sendOrderConfirmation } = require('../lib/order-confirmation');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');

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
  if (guardMethod(req, res, ['POST'])) return;

  // Rate limit DEPOIS do 405 (requisição rejeitada por método não faz trabalho
  // nenhum, então cobrá-la custaria uma escrita no Postgres sem proteger nada)
  // e ANTES de qualquer trabalho caro — a ordem que a regra A3 fixa.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.sendConfirmationEmail);
  if (gate.blocked) return;

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
      select: 'id,order_code,total_amount,customer_email,customer_name',
      filters: [{ column: 'order_code', value: orderId }],
    });

    // Não envia para pedido inexistente (evita e-mail "pagamento confirmado"
    // forjado). Best-effort: 200 sem falhar o checkout.
    if (!order || !order.customer_email) {
      return ok(res, { success: true, sent: false, reason: 'order_not_found' });
    }

    // Mesma porta do webhook e do verify-payment (lib/order-confirmation.js).
    // Destinatário SEMPRE o e-mail do pedido — nunca o do body — para que
    // conhecer um order_code não permita exfiltrar itens/total para um e-mail
    // arbitrário do atacante. (customerEmail do body é ignorado de propósito.)
    const result = await sendOrderConfirmation({
      order: { ...order, customer_name: order.customer_name || customerName },
      isNewAccount: Boolean(isNewAccount),
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
