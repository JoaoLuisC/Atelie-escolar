const { getSupabaseConfig, serviceRoleHelpers: { listTableRows } } = require('../lib/supabase');

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

    const email = String(req.query?.email || '').trim().toLowerCase();
    if (!email?.includes('@')) {
      return res.status(400).json({ error: 'email é obrigatório' });
    }

    const ordersRows = await listTableRows('orders', {
      select: 'id,order_code,total_amount,status,payment_status,created_at,customer_email',
      filters: [{ column: 'customer_email', operator: 'ilike', value: email }],
      orderBy: 'created_at',
      ascending: false,
    });

    if (!ordersRows.length) {
      return res.status(200).json({ success: true, orders: [] });
    }

    const orderIds = ordersRows.map((order) => String(order.id));
    const orderIdSet = new Set(orderIds);
    const itemsRows = await listTableRows('order_items', {
      select: 'order_id,product_id,product_name,unit_price,quantity',
      orderBy: 'order_id',
      ascending: false,
    });

    const tokensRows = await listTableRows('download_tokens', {
      select: 'order_id,product_id,product_name,token,used,expires_at',
      orderBy: 'created_at',
      ascending: false,
    });

    const filteredItemsRows = itemsRows.filter((row) => orderIdSet.has(String(row.order_id)));
    const filteredTokensRows = tokensRows.filter((row) => orderIdSet.has(String(row.order_id)));

    const groupedItems = groupBy(filteredItemsRows, 'order_id');
    const groupedTokens = groupBy(filteredTokensRows, 'order_id');

    const orders = ordersRows.map((order) => mapOrder(order, groupedItems, groupedTokens));
    return res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedidos do cliente' });
  }
};
