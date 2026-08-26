const { ensureAdminSession } = require('../../lib/admin-session');
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

const log = createLogger('admin-dashboard');

// ════════════════════════════════════════════════════════════════════
// TETO EXPLÍCITO E TRUNCAMENTO VISÍVEL — §2.1 do doc de otimização.
//
// ── O QUE ESTAVA ERRADO, E POR QUE É A PIOR CLASSE DE BUG DAQUI ─────
// As sete chamadas abaixo não passavam `limit`. `listTableRows` só emite
// `limit` se o chamador o passar, então quem decidia o corte era o
// `db-max-rows` do PostgREST — e o corte acontece SEM ERRO. O faturamento
// apareceria menor do que é, e nada no sistema avisaria. Um número de dinheiro
// errado que não levanta exceção é o pior tipo de defeito que este projeto
// pode ter.
//
// Agora todo teto é explícito e, quando encostado, vira sinal em DOIS lugares:
// `log.warn('possivel_truncamento')` para a operação, e o campo `truncated` na
// resposta, para a tela. Só o log seria insuficiente — a dona da loja não lê
// log da Vercel, e é ela quem olha o número.
//
// ── O QUE NÃO FOI FEITO, E POR QUÊ ──────────────────────────────────
// A janela de data prevista no item NÃO entrou. Ela mudaria, em silêncio,
// números que a tela exibe hoje como ALL-TIME: `revenueTotal` do resumo,
// `deriveProductPerformance`/`deriveAbcCurve` (receita por produto desde
// sempre) e a contagem de downloads por produto. Trocar truncamento silencioso
// por janela silenciosa é o MESMO defeito com outro nome.
//
// O caminho certo continua sendo a agregação server-side: só lá dá para
// devolver "total desde sempre" e "últimos 90 dias" como campos distintos, em
// vez de derivar os dois do mesmo array truncado. Registrado como pendência.
// ════════════════════════════════════════════════════════════════════

// Tetos dimensionados para caber com folga na loja de hoje e ainda assim ter
// um teto: `orders` e `order_items` crescem com cada venda, `download_logs`
// com cada download — é a que mais cresce.
const LIMITS = Object.freeze({
  products: 2000,
  categories: 500,
  profiles: 20000,
  orders: 20000,
  order_items: 50000,
  download_logs: 50000,
  settings: 200,
});

/**
 * `listTableRows` com teto explícito e detecção de truncamento.
 *
 * `rows.length === limit` não PROVA truncamento (a tabela pode ter exatamente
 * aquele número de linhas), mas é o único sinal disponível sem uma segunda
 * consulta de contagem — e um falso positivo aqui custa um aviso, enquanto um
 * falso negativo custa um número de dinheiro errado na tela.
 */
async function listCapped(table, options, truncated) {
  const limit = LIMITS[table];
  const rows = await listTableRows(table, { ...options, limit });

  if (rows.length === limit) {
    log.warn('possivel_truncamento', { table, limit });
    truncated.push(table);
  }

  return rows;
}

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
  return String(value || '')
    .trim()
    .toLowerCase();
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

  const revenueMonth = approvedMonth.reduce(
    (sum, order) => sum + Number(order.totalAmount || 0),
    0,
  );
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

async function loadDashboard(truncated) {
  const [
    productsRows,
    categoriesRows,
    profilesRows,
    ordersRows,
    orderItemsRows,
    downloadLogsRows,
    settingsRows,
  ] = await Promise.all([
    listCapped(
      'products',
      {
        select:
          'id,slug,name,description,price,image_url,download_url,category_id,active,featured,created_at,updated_at',
        orderBy: 'created_at',
        ascending: false,
      },
      truncated,
    ),
    listCapped(
      'categories',
      {
        select: 'id,name,slug,color,active,featured,badge_label,sort_order,created_at',
        orderBy: 'name',
        ascending: true,
      },
      truncated,
    ),
    listCapped(
      'profiles',
      {
        select: 'id,email,display_name,role,provider,created_at,updated_at',
        orderBy: 'created_at',
        ascending: false,
      },
      truncated,
    ),
    listCapped(
      'orders',
      {
        select:
          'id,order_code,customer_name,customer_email,total_amount,status,payment_status,created_at,completed_at',
        orderBy: 'created_at',
        ascending: false,
      },
      truncated,
    ),
    listCapped(
      'order_items',
      {
        select: 'order_id,product_id,product_name,unit_price,quantity',
        orderBy: 'order_id',
        ascending: false,
      },
      truncated,
    ),
    listCapped(
      'download_logs',
      {
        select: 'order_id,product_id',
        orderBy: 'downloaded_at',
        ascending: false,
      },
      truncated,
    ),
    listCapped(
      'settings',
      {
        select: 'setting_key,setting_value',
      },
      truncated,
    ),
  ]);

  const categoryById = new Map(
    categoriesRows.map((category) => [String(category.id), category.name]),
  );
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
    categoryId: row.category_id ? String(row.category_id) : null,
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

  if (guardMethod(req, res, ['GET'])) return;

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const truncated = [];
    const payload = await loadDashboard(truncated);
    const summary = buildSummary(payload);

    // Regra E4: relatório administrativo é resposta por usuário, nunca em
    // cache compartilhado.
    setCachePolicy(res, 'adminReport');

    return ok(res, {
      ...payload,
      summary,
      // Vazio no caso normal. Não-vazio significa que ALGUMA tabela encostou no
      // teto e os números desta resposta podem estar menores do que a verdade —
      // é o que transforma o corte silencioso em informação para quem lê a tela.
      truncated,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao carregar dados do admin dashboard.',
    });
  }
};

// Exposto para o teste conferir que TODA consulta leva teto, e qual — sem
// duplicar os números numa segunda lista que divergiria na primeira mudança.
module.exports.LIMITS = LIMITS;
