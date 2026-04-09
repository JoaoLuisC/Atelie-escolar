const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { deleteFromTable, getSupabaseConfig, getTableRow, listTableRows, updateTable } = require('../lib/supabase');

function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });
}

async function listOrders(statusFilter) {
  const [ordersRows, itemRows] = await Promise.all([
    listTableRows('orders', {
      select: 'id,order_code,customer_name,customer_email,total_amount,status,payment_status,created_at,completed_at',
      orderBy: 'created_at',
      ascending: false,
    }),
    listTableRows('order_items', {
      select: 'order_id,product_id,product_name,unit_price,quantity',
      orderBy: 'order_id',
      ascending: false,
    }),
  ]);

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
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    items: itemsByOrder[String(row.id)] || [],
  }));

  if (statusFilter) {
    const normalized = statusFilter.toLowerCase();
    orders = orders.filter((order) => String(order.paymentStatus || '').toLowerCase() === normalized);
  }

  return sortByDateDesc(orders);
}

async function updateOrder(body) {
  const id = String(body.id || '').trim();
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }

  const existing = await getTableRow('orders', {
    select: 'id,status,payment_status,completed_at',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) {
    return { status: 404, body: { success: false, error: 'Pedido não encontrado.' } };
  }

  const payload = {};
  if (body.status !== undefined) payload.status = String(body.status || '').trim();
  if (body.paymentStatus !== undefined) payload.payment_status = String(body.paymentStatus || '').trim();
  if (body.customerName !== undefined) payload.customer_name = String(body.customerName || '').trim();
  if (body.customerEmail !== undefined) payload.customer_email = String(body.customerEmail || '').trim().toLowerCase();
  if (body.totalAmount !== undefined) payload.total_amount = Number(body.totalAmount || 0);

  if (
    payload.status === 'completed'
    || payload.payment_status === 'approved'
  ) {
    payload.completed_at = existing.completed_at || new Date().toISOString();
  }

  if (Object.keys(payload).length === 0) {
    return { status: 400, body: { success: false, error: 'Nenhum campo válido para atualização.' } };
  }

  await updateTable('orders', { id: `eq.${id}` }, payload);
  return { status: 200, body: { success: true } };
}

async function deleteOrder(id) {
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }

  const existing = await getTableRow('orders', {
    select: 'id',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) {
    return { status: 404, body: { success: false, error: 'Pedido não encontrado.' } };
  }

  await deleteFromTable('orders', { id: `eq.${id}` });
  return { status: 200, body: { success: true } };
}

module.exports = async function adminOrdersHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const handlers = {
      GET: async () => {
        const statusFilter = String(req.query?.status || '').trim();
        const orders = await listOrders(statusFilter);
        return { status: 200, body: { success: true, orders } };
      },
      PUT: async () => updateOrder(req.body || {}),
      DELETE: async () => deleteOrder(String(req.query?.id || req.body?.id || '').trim()),
    };

    const handler = handlers[req.method];
    if (!handler) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const result = await handler();
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Admin orders error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar pedidos do admin.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
