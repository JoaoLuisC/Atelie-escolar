const crypto = require('node:crypto');
const mercadopago = require('mercadopago');
const { initializeMercadoPago } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows, updateTable } } = require('../lib/supabase');
const { ensureCustomerAccountFromCheckout } = require('../lib/customer-account-provisioning');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');

async function fetchPaymentByOrderId(orderId) {
  const mpClient = initializeMercadoPago();
  const paymentApi = new mercadopago.Payment(mpClient);

  const searchResult = await paymentApi.search({
    options: { external_reference: orderId, sort: 'date_created', criteria: 'desc', limit: 5 },
  });

  return (searchResult.results || []).find(
    (payment) => payment.status === 'approved' && payment.external_reference === orderId
  ) || null;
}

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

async function loadDownloadTokens(orderInternalId) {
  return listTableRows('download_tokens', {
    select: 'order_id,product_id,product_name,token,used,expires_at',
    filters: [{ column: 'order_id', value: orderInternalId }],
    orderBy: 'created_at',
    ascending: true,
  });
}

async function createTokensForOrder(order, items, paymentId) {
  const downloadTokens = [];

  for (const item of items) {
    const token = crypto.randomBytes(32).toString('hex');
    await insertIntoTable('download_tokens', {
      token,
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      used: false,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    downloadTokens.push({
      productId: String(item.product_id),
      productName: item.product_name,
      token,
    });
  }

  await updateTable('orders', { id: `eq.${order.id}` }, {
    payment_status: 'approved',
    status: 'completed',
    payment_id: paymentId,
    completed_at: new Date().toISOString(),
  });

  try {
    await ensureCustomerAccountFromCheckout({
      email: order.customer_email,
      name: order.customer_name,
    });
  } catch (provisionErr) {
    console.error('[verify-payment] Falha ao provisionar conta de cliente:', provisionErr.message);
  }

  return downloadTokens;
}

function mapTokenRows(rows) {
  return rows.map((token) => ({
    productId: String(token.product_id),
    productName: token.product_name,
    token: token.token,
  }));
}

function mapOrderItems(rows) {
  return rows.map((item) => ({
    id: String(item.product_id),
    title: item.product_name,
    quantity: item.quantity,
    price: item.unit_price,
  }));
}

async function refreshApprovedOrderData(order, orderId) {
  if (order.payment_status === 'approved' || order.status === 'completed') {
    return order;
  }

  try {
    const approvedPayment = await fetchPaymentByOrderId(orderId);
    if (!approvedPayment) {
      return order;
    }

    const orderItems = await loadOrderItems(order.id);
    const existingTokens = await loadDownloadTokens(order.id);
    const downloadTokens = existingTokens.length
      ? mapTokenRows(existingTokens)
      : await createTokensForOrder(order, orderItems, approvedPayment.id);

    return {
      ...order,
      payment_status: 'approved',
      status: 'completed',
      payment_id: approvedPayment.id,
      completed_at: new Date().toISOString(),
      downloadTokens,
    };
  } catch (mpErr) {
    console.error('[verify-payment] Erro ao consultar MercadoPago:', mpErr.message);
    return order;
  }
}

module.exports = async function verifyPaymentHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const orderId = String(req.query?.orderId || '').trim();
    const email = String(req.query?.email || '').trim().toLowerCase();

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'email é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const order = await loadOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Defesa contra enumeração: order_code + email têm que bater (timing-safe).
    const expectedEmail = String(order.customer_email || '').trim().toLowerCase();
    const expectedBuf = Buffer.from(expectedEmail);
    const providedBuf = Buffer.from(email);
    const emailMatches = expectedBuf.length === providedBuf.length
      && crypto.timingSafeEqual(expectedBuf, providedBuf);
    if (!emailMatches) {
      await recordSecurityEvent({
        eventName: 'verify_payment_email_mismatch',
        severity: 'warn',
        ip: extractClientIp(req),
        userAgent: req.headers['user-agent'],
        properties: {
          order_code_prefix: orderId.slice(0, 12),
          provided_email_hash: crypto.createHash('sha256').update(email).digest('hex').slice(0, 16),
        },
      });
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const orderData = await refreshApprovedOrderData(order, orderId);
    const downloadTokens = orderData.downloadTokens || mapTokenRows(await loadDownloadTokens(order.id));

    const items = await loadOrderItems(order.id);

    return res.status(200).json({
      success: true,
      order: {
        orderId: orderData.order_code,
        status: orderData.status,
        paymentStatus: orderData.payment_status,
        totalAmount: orderData.total_amount,
        downloadTokens,
        createdAt: orderData.created_at,
        items: mapOrderItems(items),
      },
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({ error: 'Erro ao verificar pagamento' });
  }
};
