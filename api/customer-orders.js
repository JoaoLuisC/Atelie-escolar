const { getSupabaseConfig, serviceRoleHelpers: { listTableRows } } = require('../lib/supabase');
const { getCustomerSessionFromRequest } = require('../lib/customer-session');

function mapOrder(order, itemsByOrder, tokensByOrder) {
  const orderIdKey = String(order.id);
  return {
    orderId: order.order_code,
    internalOrderId: order.id,
    status: order.status,
    paymentStatus: order.payment_status,
    totalAmount: Number(order.total_amount || 0),
    createdAt: order.created_at,
    items: (itemsByOrder[orderIdKey] || []).map((item) => ({
      id: item.product_id,
      title: item.product_name,
      quantity: item.quantity,
      price: item.unit_price,
    })),
    downloadTokens: (tokensByOrder[orderIdKey] || []).map((token) => ({
      productId: token.product_id,
      productName: token.product_name,
      token: token.token,
      expiresAt: token.expires_at,
      used: token.used === true,
    })),
  };
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const id = String(row[key]);
    if (!acc[id]) {
      acc[id] = [];
    }
    acc[id].push(row);
    return acc;
  }, {});
}

module.exports = async function customerOrdersHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    // AuthZ: o solicitante SÓ vê os próprios pedidos. O e-mail vem da sessão de
    // cliente (cookie HttpOnly), NUNCA de um parâmetro arbitrário — do contrário
    // qualquer um listaria pedidos e tokens de download de qualquer cliente (IDOR).
    const session = getCustomerSessionFromRequest(req);
    const email = String(session?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }

    // eq, NUNCA ilike: no PostgREST o valor de `ilike` entra direto no padrão LIKE,
    // e `_`/`%` são metacaracteres. Como `_` é caractere legal e corriqueiro em
    // e-mail, `ana_lima@x.com` casava `ana.lima@x.com` e este endpoint entregava
    // os pedidos — e os download_tokens — de terceiros (IDOR silencioso, sem
    // atacante). O histórico com e-mail em maiúsculas foi normalizado pela
    // migration 20260812000000_security_hardening_wave1.sql, e todo insert novo
    // já grava lowercase (api/create-payment.js).
    const ordersRows = await listTableRows('orders', {
      select: 'id,order_code,total_amount,status,payment_status,created_at,customer_email',
      filters: [{ column: 'customer_email', operator: 'eq', value: email }],
      orderBy: 'created_at',
      ascending: false,
    });

    if (!ordersRows.length) {
      return res.status(200).json({ success: true, orders: [] });
    }

    // Filtra por order_id NA QUERY (in.(...)), em vez de baixar as tabelas
    // inteiras e filtrar em memória (evita carregar itens/tokens de terceiros).
    const orderIds = ordersRows.map((order) => String(order.id));
    const orderIdFilter = `(${orderIds.join(',')})`;

    const itemsRows = await listTableRows('order_items', {
      select: 'order_id,product_id,product_name,unit_price,quantity',
      filters: [{ column: 'order_id', operator: 'in', value: orderIdFilter }],
      orderBy: 'order_id',
      ascending: false,
    });

    const tokensRows = await listTableRows('download_tokens', {
      select: 'order_id,product_id,product_name,token,used,expires_at',
      filters: [{ column: 'order_id', operator: 'in', value: orderIdFilter }],
      orderBy: 'created_at',
      ascending: false,
    });

    const groupedItems = groupBy(itemsRows, 'order_id');
    const groupedTokens = groupBy(tokensRows, 'order_id');

    const orders = ordersRows.map((order) => mapOrder(order, groupedItems, groupedTokens));
    return res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedidos do cliente' });
  }
};
