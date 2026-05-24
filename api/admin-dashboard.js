const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { getSupabaseConfig, serviceRoleHelpers: { listTableRows } } = require('../lib/supabase');

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSummary(payload) {
  const orders = payload.orders || [];
  const products = payload.products || [];
  const users = payload.users || [];
  const approved = orders.filter((order) => order.paymentStatus === 'approved');
  const pending = orders.filter((order) => order.paymentStatus === 'pending');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const approvedMonth = approved.filter((order) => {
    const dt = new Date(order.completedAt || order.createdAt || 0);
    return dt >= monthStart;
  });

  const revenueMonth = approvedMonth.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const revenueTotal = approved.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  return {
    totalOrders: orders.length,
    approvedOrders: approved.length,
    pendingOrders: pending.length,
    totalProducts: products.length,
    activeProducts: products.filter((product) => product.active !== false).length,
    totalUsers: users.length,
    revenueMonth,
    revenueTotal,
  };
}

// eslint-disable-next-line sonarjs/cognitive-complexity
async function loadDashboard() {
  const [productsRows, categoriesRows, profilesRows, ordersRows, orderItemsRows, downloadLogsRows, settingsRows] = await Promise.all([
    listTableRows('products', {
      select: 'id,slug,name,description,price,image_url,download_url,category_id,active,featured,created_at,updated_at',
      orderBy: 'created_at',
      ascending: false,
    }),
    listTableRows('categories', {
      select: 'id,name,slug,color,active,featured,badge_label,sort_order,created_at',
      orderBy: 'name',
      ascending: true,
    }),
    listTableRows('profiles', {
      select: 'id,email,display_name,role,provider,created_at,updated_at',
      orderBy: 'created_at',
      ascending: false,
    }),
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
    listTableRows('download_logs', {
      select: 'order_id,product_id',
      orderBy: 'downloaded_at',
      ascending: false,
    }),
    listTableRows('settings', {
      select: 'setting_key,setting_value',
    }),
  ]);

  const categoryById = new Map(categoriesRows.map((category) => [String(category.id), category.name]));
  const downloadCountByProduct = {};
  for (const row of downloadLogsRows) {
    const productId = String(row.product_id || '').trim();
    if (!productId) continue;
    downloadCountByProduct[productId] = (downloadCountByProduct[productId] || 0) + 1;
  }

  const products = productsRows.map((row) => ({
    id: String(row.id),
    name: row.name,
    description: row.description,
    price: Number(row.price || 0),
    image: row.image_url,
    downloadUrl: row.download_url,
    category: row.category_id ? categoryById.get(String(row.category_id)) || null : null,
    active: row.active !== false,
    featured: row.featured === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    downloads: downloadCountByProduct[String(row.id)] || 0,
  }));

  const categories = categoriesRows.map((row) => ({
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    color: row.color || '#9B5DE5',
    order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    active: row.active !== false,
    featured: row.featured === true,
    badgeLabel: row.badge_label || '',
    createdAt: row.created_at,
  }));

  const itemsByOrder = new Map();
  for (const row of orderItemsRows) {
    const key = String(row.order_id);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push({
      id: String(row.product_id),
      productId: String(row.product_id),
      title: row.product_name,
      quantity: Number(row.quantity || 0),
      price: Number(row.unit_price || 0),
    });
  }

  const orders = ordersRows.map((row) => ({
    id: String(row.id),
    orderId: row.order_code,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    totalAmount: Number(row.total_amount || 0),
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    items: itemsByOrder.get(String(row.id)) || [],
  }));

  const approvedByEmail = {};
  for (const order of orders) {
    if (order.paymentStatus !== 'approved') continue;
    const email = normalizeEmail(order.customerEmail);
    if (!email) continue;
    if (!approvedByEmail[email]) {
      approvedByEmail[email] = { purchases: 0, totalSpent: 0, lastPurchase: null };
    }
    approvedByEmail[email].purchases += 1;
    approvedByEmail[email].totalSpent += Number(order.totalAmount || 0);
    const dt = new Date(order.completedAt || order.createdAt || 0);
    if (!approvedByEmail[email].lastPurchase || dt > approvedByEmail[email].lastPurchase) {
      approvedByEmail[email].lastPurchase = dt;
    }
  }

  const users = profilesRows
    .map((row) => {
      const email = normalizeEmail(row.email);
      const stats = approvedByEmail[email] || { purchases: 0, totalSpent: 0, lastPurchase: null };
      return {
        id: String(row.id),
        email: row.email,
        name: row.display_name || '',
        role: row.role || 'customer',
        provider: row.provider || 'email',
        purchases: stats.purchases,
        totalSpent: stats.totalSpent,
        lastPurchase: stats.lastPurchase,
        createdAt: row.created_at,
      };
    })
    .filter((user) => !['admin', 'master'].includes(String(user.role || '').toLowerCase()));

  const settings = {};
  for (const row of settingsRows) {
    settings[row.setting_key] = safeJsonParse(row.setting_value, null);
  }

  return { products, categories, users, orders, settings };
}

module.exports = async function adminDashboardHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const payload = await loadDashboard();
    const summary = buildSummary(payload);

    return res.status(200).json({
      success: true,
      ...payload,
      summary,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao carregar dados do admin dashboard.',
    });
  }
};
