const { ensureStoreSession } = require('../../lib/admin-session');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-kpis');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../../lib/supabase');
const { getSellerScope, scopeOrderRows } = require('../../lib/seller-scope');

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
 * Sem cache: recalculado a cada abertura (ADM-01).
 */

// ── POR QUE NÃO HÁ MAIS UM `Map` DE CACHE AQUI (regra E2) ────────────
// Este arquivo mantinha `const cache = new Map()` com TTL de 1 hora. Numa
// função serverless isso não é cache: cada invocação pode cair numa instância
// nova, então o acerto é acidental e, quando acontece, vale só para aquela
// instância. Pior, o handler respondia `X-Cache: HIT` — um header afirmando
// algo que o runtime não garante, que atrapalha exatamente quem for investigar
// por que o relatório está lento.
//
// O que sobra é o mecanismo que sempre foi o real: `Cache-Control`, pela
// política CACHE_POLICIES.adminReport — hoje `no-store` (validação de
// 2026-10-01, ADM-01): uma hora de cache no navegador servia KPI velho depois
// de uma escrita e depois do logout.

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

module.exports = async function adminKpisHandler(req, res) {
  setAdminCorsHeaders(req, res);
  if (guardMethod(req, res, ['GET'])) return;
  if (!ensureStoreSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const windowMonths = Math.max(
      1,
      Math.min(36, Number.parseInt(req.query?.window || '12', 10) || 12),
    );

    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - windowMonths, 1),
    );

    // Professora: só pedidos com material dela, no valor da parte dela.
    const { orders } = await scopeOrderRows(
      await listTableRows('orders', {
        select: 'id,customer_email,total_amount,completed_at',
        filters: [
          { column: 'payment_status', value: 'approved' },
          { column: 'completed_at', operator: 'gte', value: windowStart.toISOString() },
        ],
        limit: 20000,
      }),
      getSellerScope(req),
    );

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

    const monthDeltaPct =
      revenuePrev > 0 ? ((revenueMTD - revenuePrev) / revenuePrev) * 100 : revenueMTD > 0 ? 100 : 0;

    // Valores em reais com 2 casas: a soma de floats devolvia 55.65999999999999
    // na API (ADM-17). A tela já formatava certo; o CSV/integração não.
    const reais = (value) => Math.round(Number(value || 0) * 100) / 100;

    const payload = {
      success: true,
      windowMonths,
      generatedAt: new Date().toISOString(),
      kpis: {
        revenueMTD: reais(revenueMTD),
        revenuePrev: reais(revenuePrev),
        monthDeltaPct,
        revenueWindow: reais(revenueWindow),
        ordersWindow,
        uniqueCustomers,
        recurringCustomers,
        ticketMedio: reais(ticketMedio),
        ltvAvg: reais(ltvAvg),
        repurchaseRate,
        cac,
        ltvCacRatio,
        ltvCacRatioTarget: 3,
      },
    };

    setCachePolicy(res, 'adminReport');
    return ok(res, payload);
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao calcular KPIs.',
    });
  }
};
