const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../lib/supabase');

/**
 * GET /api/admin-kpis?window=12  (window em meses)
 *
 * KPIs de saúde do negócio. Pensado para alimentar os cards de topo
 * do DashboardTab + complementar a Curva ABC com indicadores:
 *
 *  - revenueMTD          → receita do mês corrente
 *  - revenuePrev         → mês anterior
 *  - ticketMedio         → ticket médio do período
 *  - totalOrders         → pedidos aprovados no período
 *  - ltvAvg              → receita por cliente único (LTV cru, sem subtrair margem)
 *  - repurchaseRate      → % de clientes com ≥ 2 pedidos
 *  - cac                 → custo de aquisição (Fase 5 — depende de gasto de ads)
 *                          retorna null enquanto não houver tabela de gasto integrada
 *  - ltvCacRatio         → ltv / cac (regra: alvo ≥ 3)
 *
 * Cache 1h.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

module.exports = async function adminKpisHandler(req, res) {
  setAdminCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!ensureAdminSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const windowMonths = Math.max(1, Math.min(36, Number.parseInt(req.query?.window || '12', 10) || 12));
    const nocache = req.query?.nocache === '1';
    const key = `kpis|${windowMonths}`;

    if (!nocache) {
      const hit = getCached(key);
      if (hit) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.status(200).json(hit);
      }
    }

    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - windowMonths, 1));

    const orders = await listTableRows('orders', {
      select: 'customer_email,total_amount,completed_at',
      filters: [
        { column: 'payment_status', value: 'approved' },
        { column: 'completed_at', operator: 'gte', value: windowStart.toISOString() },
      ],
      limit: 20000,
    });

    let revenueMTD = 0;
    let revenuePrev = 0;
    let revenueWindow = 0;
    let ordersWindow = 0;
    const customersWindow = new Map();

    for (const order of orders) {
      const total = Number(order.total_amount || 0);
      const dt = new Date(order.completed_at);
      if (Number.isNaN(dt.getTime())) continue;

      revenueWindow += total;
      ordersWindow += 1;

      if (dt >= monthStart) revenueMTD += total;
      else if (dt >= prevMonthStart && dt < monthStart) revenuePrev += total;

      const email = String(order.customer_email || '').toLowerCase();
      if (!email) continue;
      const entry = customersWindow.get(email) || { revenue: 0, count: 0 };
      entry.revenue += total;
      entry.count += 1;
      customersWindow.set(email, entry);
    }

    const uniqueCustomers = customersWindow.size;
    const recurringCustomers = [...customersWindow.values()].filter((c) => c.count >= 2).length;

    const ticketMedio = ordersWindow > 0 ? revenueWindow / ordersWindow : 0;
    const ltvAvg = uniqueCustomers > 0 ? revenueWindow / uniqueCustomers : 0;
    const repurchaseRate = uniqueCustomers > 0 ? (recurringCustomers / uniqueCustomers) * 100 : 0;

    // CAC: depende de integração com gasto de ads (Fase 5). Sem isso, null.
    // Quando Fase 5 estiver no ar, ler de tabela `ad_spend` ou env CAC_OVERRIDE.
    const cac = null;
    const ltvCacRatio = cac ? ltvAvg / cac : null;

    const monthDeltaPct = revenuePrev > 0
      ? ((revenueMTD - revenuePrev) / revenuePrev) * 100
      : revenueMTD > 0 ? 100 : 0;

    const payload = {
      success: true,
      windowMonths,
      generatedAt: new Date().toISOString(),
      kpis: {
        revenueMTD,
        revenuePrev,
        monthDeltaPct,
        revenueWindow,
        ordersWindow,
        uniqueCustomers,
        recurringCustomers,
        ticketMedio,
        ltvAvg,
        repurchaseRate,
        cac,
        ltvCacRatio,
        ltvCacRatioTarget: 3,
      },
    };

    setCached(key, payload);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[admin-kpis]', error.message);
    return res.status(500).json({ success: false, error: 'Erro ao calcular KPIs.' });
  }
};
