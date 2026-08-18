const { createAdminResourceHandler } = require('../../lib/admin-resource-handler');
const {
  serviceRoleHelpers: { deleteFromTable, getTableRow, listTableRows, updateTable },
} = require('../../lib/supabase');
const { ERROR_CODES } = require('../../lib/http');
const { parse } = require('../../validation');
const { orderUpdateSchema, uuidId } = require('../../validation/admin.schemas');

/** Erro de validação no formato que a factory despacha por `fail()`. */
function invalid(message) {
  return { error: { status: 400, code: ERROR_CODES.VALIDATION_FAILED, message } };
}

function orderNotFound() {
  return {
    error: {
      status: 404,
      code: ERROR_CODES.ORDER_NOT_FOUND,
      message: 'Pedido não encontrado.',
    },
  };
}

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
      select:
        'id,order_code,customer_name,customer_email,total_amount,status,payment_status,created_at,completed_at',
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
    orders = orders.filter(
      (order) => String(order.paymentStatus || '').toLowerCase() === normalized,
    );
  }

  return sortByDateDesc(orders);
}

async function updateOrder(body) {
  const parsed = parse(orderUpdateSchema, body);
  if (!parsed.ok) return invalid(parsed.message);

  const { id, ...fields } = parsed.data;

  const existing = await getTableRow('orders', {
    select: 'id,status,payment_status,completed_at',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) return orderNotFound();

  // O schema já garantiu tipo e presença de ao menos um campo; aqui só se
  // traduz nome de campo da API para coluna (regra B2: depois do schema, o
  // handler confia no tipo em vez de reaplicar `Number(x || 0)`).
  const payload = {};
  if (fields.status !== undefined) payload.status = fields.status;
  if (fields.paymentStatus !== undefined) payload.payment_status = fields.paymentStatus;
  if (fields.customerName !== undefined) payload.customer_name = fields.customerName;
  if (fields.customerEmail !== undefined) payload.customer_email = fields.customerEmail;
  if (fields.totalAmount !== undefined) payload.total_amount = fields.totalAmount;

  if (payload.status === 'completed' || payload.payment_status === 'approved') {
    payload.completed_at = existing.completed_at || new Date().toISOString();
  }

  await updateTable('orders', { id: `eq.${id}` }, payload);
  return { status: 200, body: {} };
}

async function deleteOrder(rawId) {
  const parsed = parse(uuidId, rawId);
  if (!parsed.ok) return invalid('id é obrigatório.');

  const id = parsed.data;
  const existing = await getTableRow('orders', {
    select: 'id',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) return orderNotFound();

  await deleteFromTable('orders', { id: `eq.${id}` });
  return { status: 200, body: {} };
}

module.exports = createAdminResourceHandler({
  targetType: 'order',
  errorMessage: 'Erro ao buscar pedidos do admin.',
  loggerName: 'admin-orders',
  handlerName: 'adminOrdersHandler',
  operations: {
    GET: async (req) => ({
      status: 200,
      body: { orders: await listOrders(String(req.query?.status || '').trim()) },
    }),
    PUT: (req) => updateOrder(req.body || {}),
    DELETE: (req) => deleteOrder(String(req.query?.id || req.body?.id || '').trim()),
  },
});
