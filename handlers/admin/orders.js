const { createAdminResourceHandler } = require('../../lib/admin-resource-handler');
const {
  serviceRoleHelpers: { listTableRows },
} = require('../../lib/supabase');
const { getSellerScope, scopeItemRows, scopeOrderRows } = require('../../lib/seller-scope');

function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });
}

async function listOrders(statusFilter, scope = null) {
  const [rawOrders, rawItems] = await Promise.all([
    listTableRows('orders', {
      select:
        'id,order_code,customer_name,customer_email,total_amount,coupon_code,discount_amount,status,payment_status,created_at,completed_at',
      orderBy: 'created_at',
      ascending: false,
    }),
    listTableRows('order_items', {
      select: 'order_id,product_id,product_name,unit_price,quantity',
      orderBy: 'order_id',
      ascending: false,
    }),
  ]);

  // Professora: só pedidos com material dela, com o valor da parte dela.
  const { orders: ordersRows, productIds } = await scopeOrderRows(rawOrders, scope);
  const itemRows = scopeItemRows(rawItems, productIds);

  const itemsByOrder = {};
  for (const row of itemRows) {
    const key = String(row.order_id);
    if (!itemsByOrder[key]) itemsByOrder[key] = [];
    itemsByOrder[key].push({
      id: String(row.product_id),
      productId: String(row.product_id),
      title: row.product_name,
      quantity: Number(row.quantity || 0),
      price: Number(row.unit_price || 0),
    });
  }

  let orders = ordersRows.map((row) => ({
    id: String(row.id),
    orderId: row.order_code,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    totalAmount: Number(row.total_amount || 0),
    couponCode: row.coupon_code || null,
    discountAmount: Number(row.discount_amount || 0),
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    items: itemsByOrder[String(row.id)] || [],
  }));

  if (statusFilter) {
    const normalized = statusFilter.toLowerCase();
    orders = orders.filter(
      (order) => String(order.paymentStatus || '').toLowerCase() === normalized,
    );
  }

  return sortByDateDesc(orders);
}

module.exports = createAdminResourceHandler({
  storeResource: true,
  targetType: 'order',
  errorMessage: 'Erro ao buscar pedidos do admin.',
  loggerName: 'admin-orders',
  handlerName: 'adminOrdersHandler',
  operations: {
    GET: async (req) => ({
      status: 200,
      body: {
        orders: await listOrders(String(req.query?.status || '').trim(), getSellerScope(req)),
      },
    }),
  },
});
