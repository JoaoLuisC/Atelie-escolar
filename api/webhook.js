const crypto = require('node:crypto');
const { getPaymentInfo, validateWebhookSignature } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows, updateTable } } = require('../lib/supabase');
const { ensureCustomerAccountFromCheckout } = require('../lib/customer-account-provisioning');
const { recordEvent } = require('../lib/analytics-events');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');

async function loadOrder(orderId) {
  return getTableRow('orders', {
    select: 'id,order_code,customer_name,customer_email,status,payment_status,total_amount,created_at,completed_at',
    filters: [{ column: 'order_code', value: orderId }],
  });
}

async function loadOrderItems(orderInternalId) {
  return listTableRows('order_items', {
    select: 'order_id,product_id,product_name,unit_price,quantity',
    filters: [{ column: 'order_id', value: orderInternalId }],
    orderBy: 'id',
    ascending: true,
  });
}

async function loadExistingTokens(orderInternalId) {
  return listTableRows('download_tokens', {
    select: 'order_id,product_id,product_name,token',
    filters: [{ column: 'order_id', value: orderInternalId }],
    orderBy: 'created_at',
    ascending: true,
  });
}

async function createDownloadTokens(order, items) {
  if (items.length) {
    const now = Date.now();
    const payload = items.map((item) => ({
      token: crypto.randomBytes(32).toString('hex'),
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      used: false,
      expires_at: new Date(now + 72 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    }));

    try {
      // INSERT em lote (uma única statement, atômica) em vez de N INSERTs.
      await insertIntoTable('download_tokens', payload);
    } catch (err) {
      // 409 / 23505 = corrida: outro webhook (ou o polling do verify-payment) já
      // criou os tokens deste pedido. Como este handler só chega aqui quando NÃO
      // havia nenhum token, e o lote é tudo-ou-nada, o processo vencedor cobre
      // todos os itens — tratamos a colisão como sucesso e recarregamos abaixo.
      if (err?.statusCode !== 409 && err?.details?.code !== '23505') {
        throw err;
      }
    }
  }

  // Recarrega o conjunto canônico: cobre a corrida em que outro processo inseriu
  // os tokens "vencedores" — devolvemos sempre os tokens efetivamente persistidos.
  const rows = await loadExistingTokens(order.id);
  return rows.map((token) => ({
    productId: String(token.product_id),
    productName: token.product_name,
    token: token.token,
  }));
}

module.exports = async function webhookHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const isValid = validateWebhookSignature(req);
    if (!isValid) {
      await recordSecurityEvent({
        eventName: 'webhook_invalid_signature',
        severity: 'warn',
        ip: extractClientIp(req),
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
        properties: {
          has_signature_header: Boolean(req.headers['x-signature']),
          payment_id: String(req.body?.data?.id || ''),
        },
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;
    if (type !== 'payment') {
      return res.status(200).json({ message: 'Event type not handled' });
    }

    const paymentId = data.id;
    const payment = await getPaymentInfo(paymentId);
    const orderId = payment.external_reference;

    if (!orderId) {
      return res.status(400).json({ error: 'Invalid payment data' });
    }

    const order = await loadOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (payment.status === 'approved') {
      // Transição idempotente e ATÔMICA: só a primeira notificação que muda o
      // pedido de !approved → approved "vence". Reentregas/webhooks concorrentes
      // veem 0 linhas afetadas e apenas devolvem os tokens já existentes, sem
      // sobrescrever completed_at nem re-emitir eventos.
      const transitioned = await updateTable('orders',
        { id: `eq.${order.id}`, payment_status: 'neq.approved' },
        {
          payment_status: 'approved',
          payment_id: payment.id,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      const isFirstApproval = Array.isArray(transitioned) && transitioned.length > 0;

      const orderItems = await loadOrderItems(order.id);
      const existingTokens = await loadExistingTokens(order.id);
      const downloadTokens = existingTokens.length
        ? existingTokens.map((token) => ({
            productId: String(token.product_id),
            productName: token.product_name,
            token: token.token,
          }))
        : await createDownloadTokens(order, orderItems);

      if (isFirstApproval) {
        try {
          await ensureCustomerAccountFromCheckout({
            email: order.customer_email,
            name: order.customer_name,
          });
        } catch (provisionErr) {
          console.error('[webhook] Falha ao provisionar conta de cliente:', provisionErr.message);
        }

        await recordEvent({
          eventName: 'payment_approved',
          customerEmail: order.customer_email,
          orderId: order.id,
          properties: {
            order_code: order.order_code,
            value: Number(order.total_amount || 0),
            currency: 'BRL',
            payment_id: payment.id,
            payment_method: payment.payment_method_id || null,
          },
          source: 'webhook',
        });
      }

      return res.status(200).json({
        message: 'Webhook processed successfully',
        downloadTokens,
      });
    }

    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await updateTable('orders', { id: `eq.${order.id}` }, {
        payment_status: payment.status,
        payment_id: payment.id,
        status: 'failed',
      });

      await recordEvent({
        eventName: payment.status === 'cancelled' ? 'payment_cancelled' : 'payment_rejected',
        customerEmail: order.customer_email,
        orderId: order.id,
        properties: {
          order_code: order.order_code,
          value: Number(order.total_amount || 0),
          currency: 'BRL',
          payment_id: payment.id,
          status_detail: payment.status_detail || null,
        },
        source: 'webhook',
      });
    }

    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
