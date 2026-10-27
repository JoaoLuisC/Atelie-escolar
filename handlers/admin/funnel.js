const { ensureStoreSession } = require('../../lib/admin-session');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-funnel');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../../lib/supabase');
const { getSellerScope, scopeOrderRows } = require('../../lib/seller-scope');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const {
  bucketBySessionAndEvent,
  buildFunnel,
  buildAttribution,
  buildDailyPurchases,
} = require('../../lib/funnel-metrics');

// ── POR QUE NÃO HÁ MAIS CACHE EM MEMÓRIA AQUI (regra E2) ─────────────
// Havia um `Map` por janela de dias com TTL de 1h. O comentário que ficava
// aqui já registrava metade do problema — "em Vercel serverless, cada cold
// start zera o cache" — mas tratava isso como um tradeoff aceitável. Não é:
// a Vercel É o alvo de produção, então o cache praticamente nunca acertava,
// e quando acertava valia para uma instância só. O `X-Cache: HIT` que
// acompanhava afirmava uma garantia que o runtime não dá.
//
// Fica o mecanismo real: `Cache-Control` (regra E4, CACHE_POLICIES.adminReport).
// Desde a validação de 2026-10-01 a política é `no-store`: com `max-age=3600`
// o painel seguia mostrando o relatório velho depois de uma escrita e até
// depois do logout (ADM-01). Cada abertura da aba recalcula.
function parseRange(req) {
  const days = Math.max(1, Math.min(180, Number.parseInt(req.query?.days || '30', 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { days, sinceIso: since.toISOString() };
}

async function loadFunnelEvents(sinceIso) {
  return listTableRows('analytics_events', {
    select: 'event_name,session_id,created_at',
    filters: [{ column: 'created_at', operator: 'gte', value: sinceIso }],
    orderBy: 'created_at',
    ascending: true,
    limit: 50000,
  });
}

async function loadApprovedOrders(sinceIso) {
  return listTableRows('orders', {
    select: 'id,order_code,payment_status,total_amount,attribution_data,created_at,completed_at',
    filters: [{ column: 'created_at', operator: 'gte', value: sinceIso }],
    orderBy: 'created_at',
    ascending: false,
    limit: 5000,
  });
}

module.exports = async function adminFunnelHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (guardMethod(req, res, ['GET'])) return;

  if (!ensureStoreSession(req, res)) {
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

    const { days, sinceIso } = parseRange(req);

    const [events, rawOrders] = await Promise.all([
      loadFunnelEvents(sinceIso),
      loadApprovedOrders(sinceIso),
    ]);
    // Professora: compras e receita só dos materiais dela. As visitas
    // (sessões do site) continuam sendo as da loja.
    const { orders } = await scopeOrderRows(rawOrders, getSellerScope(req));

    const sessionsByEvent = bucketBySessionAndEvent(events);
    const purchaseSessions = orders.filter((order) => order.payment_status === 'approved').length;

    const funnel = buildFunnel(sessionsByEvent, purchaseSessions);
    const attribution = buildAttribution(orders);
    const daily = buildDailyPurchases(orders);

    const payload = {
      success: true,
      windowDays: days,
      since: sinceIso,
      funnel,
      attribution,
      dailyPurchases: daily,
      totals: {
        sessions: sessionsByEvent.size,
        events: events.length,
        approvedOrders: attribution.totalApproved,
        revenue: attribution.totalRevenue,
      },
      generatedAt: new Date().toISOString(),
    };

    setCachePolicy(res, 'adminReport');
    return ok(res, payload);
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao carregar dados do funil.',
    });
  }
};
