const { ensureAdminSession } = require('../../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../../lib/supabase');
const { buildAbcCurve } = require('../../lib/abc-classification');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-abc-products');
const {
  ERROR_CODES,
  fail,
  methodNotAllowed,
  ok,
  preflight,
  setCachePolicy,
  setAdminCorsHeaders,
} = require('../../lib/http');

/**
 * GET /api/admin-abc-products?period=month|quarter|year&categoryId=X
 *
 * Curva ABC de produtos por receita, baseada em order_items de pedidos
 * aprovados. Cache em memória de 1h por chave `period|categoryId`
 * (regra F5 — dashboards cacheados server-side).
 */

// ── POR QUE NÃO HÁ MAIS CACHE EM MEMÓRIA AQUI (regra E2) ─────────────
// Havia um `Map` de módulo com TTL de 1h. Numa função serverless isso não é
// cache: cada invocação pode cair numa instância nova, o acerto é acidental e
// vale só para aquela instância — e o `X-Cache: HIT` que acompanhava afirmava
// uma garantia que o runtime não dá.
//
// Fica o mecanismo real: `Cache-Control: private, max-age=3600` (regra E4,
// CACHE_POLICIES.adminReport). Mesmo TTL, num lugar que vale. `?nocache=1`
// continua furando, agora por construção, já que muda a URL.

const PERIOD_DAYS = {
  month: 30,
  quarter: 90,
  year: 365,
};

function parseQuery(req) {
  const period = String(req.query?.period || 'month').toLowerCase();
  const days = PERIOD_DAYS[period] || PERIOD_DAYS.month;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const categoryId = String(req.query?.categoryId || '').trim() || null;
  return { period, days, sinceIso, categoryId };
}

async function loadApprovedOrderIds(sinceIso) {
  const rows = await listTableRows('orders', {
    select: 'id,total_amount,completed_at,created_at',
    filters: [
      { column: 'payment_status', value: 'approved' },
      { column: 'completed_at', operator: 'gte', value: sinceIso },
    ],
    limit: 10000,
  });
  return rows.map((row) => String(row.id));
}

async function loadOrderItems(orderIds) {
  if (orderIds.length === 0) return [];
  return listTableRows('order_items', {
    select: 'order_id,product_id,product_name,unit_price,quantity,total_price',
    filters: [{ column: 'order_id', operator: 'in', value: `(${orderIds.join(',')})` }],
    limit: 50000,
  });
}

async function loadProducts(productIds, categoryFilter) {
  if (productIds.length === 0) return [];
  const filters = [{ column: 'id', operator: 'in', value: `(${productIds.join(',')})` }];
  if (categoryFilter) {
    filters.push({ column: 'category_id', value: categoryFilter });
  }
  return listTableRows('products', {
    select: 'id,name,category_id,active',
    filters,
    limit: 10000,
  });
}

async function loadCategoryMap() {
  const cats = await listTableRows('categories', {
    select: 'id,name,slug',
    limit: 500,
  });
  return new Map(cats.map((c) => [String(c.id), c]));
}

module.exports = async function adminAbcProductsHandler(req, res) {
  setAdminCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return preflight(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'OPTIONS']);
  if (!ensureAdminSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const query = parseQuery(req);

    const orderIds = await loadApprovedOrderIds(query.sinceIso);
    if (orderIds.length === 0) {
      const empty = {
        success: true,
        period: query.period,
        since: query.sinceIso,
        totalRevenue: 0,
        items: [],
        summary: { A: 0, B: 0, C: 0 },
        generatedAt: new Date().toISOString(),
      };
      setCachePolicy(res, 'adminReport');
      return ok(res, empty);
    }

    const [items, categoryMap] = await Promise.all([loadOrderItems(orderIds), loadCategoryMap()]);

    // Agrega por product_id
    const byProduct = new Map();
    for (const item of items) {
      const pid = String(item.product_id || '');
      if (!pid) continue;
      const revenue = Number(
        item.total_price || Number(item.unit_price || 0) * Number(item.quantity || 0),
      );
      const entry = byProduct.get(pid) || {
        id: pid,
        name: item.product_name || `Produto ${pid}`,
        revenue: 0,
        qty: 0,
      };
      entry.revenue += revenue;
      entry.qty += Number(item.quantity || 0);
      byProduct.set(pid, entry);
    }

    // Aplica filtro de categoria se necessário + enriquece com category
    const productIds = [...byProduct.keys()];
    const productsMeta = await loadProducts(productIds, query.categoryId);
    const allowedIds = new Set(productsMeta.map((p) => String(p.id)));
    const productCategoryMap = new Map(productsMeta.map((p) => [String(p.id), p.category_id]));

    const filteredEntries = query.categoryId
      ? [...byProduct.entries()].filter(([pid]) => allowedIds.has(pid))
      : [...byProduct.entries()];

    const enrichedItems = filteredEntries.map(([pid, entry]) => {
      const categoryId = productCategoryMap.get(pid);
      const category = categoryId ? categoryMap.get(String(categoryId)) : null;
      return {
        id: pid,
        name: entry.name,
        revenue: entry.revenue,
        qty: entry.qty,
        categoryId: categoryId ? String(categoryId) : null,
        categoryName: category?.name || null,
        categorySlug: category?.slug || null,
      };
    });

    const curve = buildAbcCurve(enrichedItems);

    const payload = {
      success: true,
      period: query.period,
      since: query.sinceIso,
      categoryId: query.categoryId,
      totalRevenue: curve.totalRevenue,
      items: curve.items,
      summary: curve.summary,
      generatedAt: new Date().toISOString(),
    };

    setCachePolicy(res, 'adminReport');
    return ok(res, payload);
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao gerar Curva ABC de produtos.',
    });
  }
};
