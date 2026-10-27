// ════════════════════════════════════════════════════════════════════
// E-MAIL DE CONFIRMAÇÃO DO PEDIDO — porta única.
//
// Existia o template (`orderConfirmation`) e um endpoint público
// (`/api/send-confirmation-email`), mas NENHUM fluxo os chamava: a compradora
// pagava e não recebia confirmação nenhuma. Agora o envio
// acontece na PRIMEIRA aprovação do pedido, venha ela do webhook do Mercado
// Pago ou do polling de `verify-payment` (quando o webhook não chega) — e as
// duas portas chamam esta mesma função.
//
// IDEMPOTÊNCIA: `sendEmail` não reenvia o par (e-mail, 'order_confirmation',
// order_code) que já consta como enviado em `email_sent_log`. Se webhook e
// polling aprovarem quase juntos, só a transição atômica de um deles conta
// como "primeira aprovação"; e mesmo que os dois chamassem, o log segura o
// segundo envio.
//
// BEST-EFFORT: nunca lança. Falha de e-mail não pode desfazer nem atrasar a
// liberação de um pedido pago — o cliente já vê os downloads na tela.
// ════════════════════════════════════════════════════════════════════

const {
  serviceRoleHelpers: { listTableRows },
} = require('./supabase');
const { sendEmail } = require('./email-sender');
const { orderConfirmation } = require('./email-templates');
const { createLogger } = require('./logger');

const log = createLogger('order-confirmation');

async function loadItems(orderId) {
  return listTableRows('order_items', {
    select: 'order_id,product_name,unit_price,quantity',
    filters: [{ column: 'order_id', value: orderId }],
    orderBy: 'id',
    ascending: true,
  });
}

/**
 * Envia a confirmação de um pedido aprovado.
 *
 * @param {object}  params
 * @param {object}  params.order          linha de `orders` (id, order_code, customer_email,
 *                                        customer_name, total_amount)
 * @param {Array}   [params.items]        linhas de `order_items`; carregadas se ausentes
 * @param {boolean} [params.isNewAccount] a conta do comprador acabou de ser criada
 * @returns {Promise<{sent: boolean, skipped?: boolean, reason?: string}>}
 */
async function sendOrderConfirmation({ order, items, isNewAccount = false } = {}) {
  const email = String(order?.customer_email || '').trim();
  const orderCode = String(order?.order_code || '').trim();
  if (!email || !orderCode) return { sent: false, reason: 'missing_order_data' };

  try {
    const rows = Array.isArray(items) ? items : await loadItems(order.id);
    const { subject, html } = orderConfirmation({
      orderId: orderCode,
      customerName: order.customer_name,
      items: (rows || []).map((row) => ({ name: row.product_name, price: row.unit_price })),
      totalAmount: Number(order.total_amount || 0),
      isNewAccount: Boolean(isNewAccount),
    });

    // Destinatário SEMPRE o e-mail gravado no pedido.
    return await sendEmail({
      to: email,
      subject,
      html,
      kind: 'order_confirmation',
      entityId: orderCode,
    });
  } catch (error) {
    log.error('falha_ao_enviar_confirmacao', { reason: error?.message || String(error) });
    return { sent: false, reason: 'internal_error' };
  }
}

module.exports = { sendOrderConfirmation };
