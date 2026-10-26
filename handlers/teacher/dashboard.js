const { ensureRoleSession, getStaffSession } = require('../../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../../lib/supabase');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('teacher-dashboard');

module.exports = async function teacherDashboardHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['GET'])) return;
  if (!ensureRoleSession(req, res, ['seller'])) return;

  const sellerId = getStaffSession(req)?.userId;
  if (!sellerId) {
    return fail(res, {
      status: 401,
      code: ERROR_CODES.ADMIN_SESSION_INVALID,
      message: 'Faça login novamente para acessar seus produtos.',
    });
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const [productRows, categoryRows] = await Promise.all([
      listTableRows('products', {
        select: 'id,name,description,price,category_id,active,created_at',
        filters: [{ column: 'seller_id', value: sellerId }],
        orderBy: 'created_at',
        ascending: false,
      }),
      listTableRows('categories', {
        select: 'id,name',
        orderBy: 'name',
        ascending: true,
      }),
    ]);

    const productIds = productRows.map((product) => String(product.id));
    const itemRows = productIds.length
      ? await listTableRows('order_items', {
          select: 'order_id,product_id,total_price,quantity',
          filters: [
            { column: 'product_id', operator: 'in', value: '(' + productIds.join(',') + ')' },
          ],
        })
      : [];
    const orderIds = [...new Set(itemRows.map((item) => String(item.order_id)))];
    const orders = orderIds.length
      ? await listTableRows('orders', {
          select: 'id,payment_status',
          filters: [{ column: 'id', operator: 'in', value: '(' + orderIds.join(',') + ')' }],
        })
      : [];
    const approvedOrderIds = new Set(
      orders
        .filter((order) => String(order.payment_status) === 'approved')
        .map((order) => String(order.id)),
    );
    const salesByProduct = new Map();
    for (const item of itemRows) {
      if (!approvedOrderIds.has(String(item.order_id))) continue;
      const productId = String(item.product_id);
      const current = salesByProduct.get(productId) || { sales: 0, revenue: 0 };
      current.sales += Number(item.quantity || 0);
      current.revenue += Number(item.total_price || 0);
      salesByProduct.set(productId, current);
    }

    const categoryById = new Map(
      categoryRows.map((category) => [String(category.id), category.name]),
    );
    const products = productRows.map((product) => {
      const stats = salesByProduct.get(String(product.id)) || { sales: 0, revenue: 0 };
      return {
        id: String(product.id),
        name: product.name,
        description: product.description || '',
        price: Number(product.price || 0),
        categoryId: product.category_id ? String(product.category_id) : null,
        category: product.category_id ? categoryById.get(String(product.category_id)) || '' : '',
        active: product.active !== false,
        createdAt: product.created_at,
        sales: stats.sales,
        revenue: Math.round(stats.revenue * 100) / 100,
      };
    });
    const summary = products.reduce(
      (total, product) => ({
        products: total.products + 1,
        activeProducts: total.activeProducts + (product.active ? 1 : 0),
        sales: total.sales + product.sales,
        revenue: total.revenue + product.revenue,
      }),
      { products: 0, activeProducts: 0, sales: 0, revenue: 0 },
    );

    return ok(res, {
      products,
      categories: categoryRows.map((category) => ({
        id: String(category.id),
        name: category.name,
      })),
      summary: { ...summary, revenue: Math.round(summary.revenue * 100) / 100 },
    });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível carregar o painel de professores.',
    });
  }
};
