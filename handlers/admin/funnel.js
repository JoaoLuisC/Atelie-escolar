const { ensureAdminSession } = require('../../lib/admin-session');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-funnel');
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

const FUNNEL_STEPS = [
  { key: 'view_catalog', label: 'Visitas ao catálogo' },
  { key: 'view_item', label: 'Visualizou produto' },
  { key: 'add_to_cart', label: 'Adicionou ao carrinho' },
  { key: 'begin_checkout', label: 'Iniciou checkout' },
  { key: 'purchase', label: 'Compra aprovada' },
];

// ── POR QUE NÃO HÁ MAIS CACHE EM MEMÓRIA AQUI (regra E2) ─────────────
// Havia um `Map` por janela de dias com TTL de 1h. O comentário que ficava
// aqui já registrava metade do problema — "em Vercel serverless, cada cold
// start zera o cache" — mas tratava isso como um tradeoff aceitável. Não é:
// a Vercel É o alvo de produção, então o cache praticamente nunca acertava,
// e quando acertava valia para uma instância só. O `X-Cache: HIT` que
// acompanhava afirmava uma garantia que o runtime não dá.
//
// Fica o mecanismo real: `Cache-Control: private, max-age=3600` (regra E4,
// CACHE_POLICIES.adminReport). Mesmo TTL, num lugar que vale — e a intenção
// original ("evitar N consultas pesadas em analytics_events + orders" a cada
// troca de range) passa a ser cumprida de fato pelo cache do navegador.
// `?nocache=1` continua furando, agora por construção, já que muda a URL.
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

function bucketBySessionAndEvent(events) {
  // Map<sessionId, Set<eventName>>
  const map = new Map();
  for (const event of events) {
    const session = String(event.session_id || '').trim();
    if (!session) continue;
    if (!map.has(session)) map.set(session, new Set());
    map.get(session).add(event.event_name);
  }
  return map;
}

function buildFunnel(sessionsByEvent, purchaseSessions) {
  const counts = {};
  for (const step of FUNNEL_STEPS) {
    counts[step.key] = 0;
  }
  for (const events of sessionsByEvent.values()) {
    for (const step of FUNNEL_STEPS) {
      if (step.key === 'purchase') continue;
      if (events.has(step.key)) counts[step.key] += 1;
    }
  }
  counts.purchase = purchaseSessions;

  const steps = FUNNEL_STEPS.map((step, index) => {
    const value = counts[step.key] || 0;
    const previous = index === 0 ? value : counts[FUNNEL_STEPS[index - 1].key] || 0;
    const conversionFromPrevious = previous > 0 ? value / previous : 0;
    return {
      key: step.key,
      label: step.label,
      count: value,
      conversionFromPrevious,
    };
  });
  return steps;
}

function buildAttribution(orders) {
  const bySource = new Map();
  let totalRevenue = 0;
  let totalApproved = 0;

  for (const order of orders) {
    if (order.payment_status !== 'approved') continue;
    const data = order.attribution_data || {};
    const source = String(data.utm_source || 'direct')
      .slice(0, 60)
      .toLowerCase();
    const medium = String(data.utm_medium || '')
      .slice(0, 60)
      .toLowerCase();
    const campaign = String(data.utm_campaign || '').slice(0, 80);
    const revenue = Number(order.total_amount || 0);
    totalRevenue += revenue;
    totalApproved += 1;

    if (!bySource.has(source)) {
      bySource.set(source, { source, orders: 0, revenue: 0, breakdown: new Map() });
    }
    const entry = bySource.get(source);
    entry.orders += 1;
    entry.revenue += revenue;

    const detailKey = `${medium || '—'}|${campaign || '—'}`;
    const detail = entry.breakdown.get(detailKey) || {
      medium: medium || '',
      campaign: campaign || '',
      orders: 0,
      revenue: 0,
    };
    detail.orders += 1;
    detail.revenue += revenue;
    entry.breakdown.set(detailKey, detail);
  }

  const items = [...bySource.values()]
    .map((entry) => ({
      source: entry.source,
      orders: entry.orders,
      revenue: entry.revenue,
      sharePct: totalRevenue > 0 ? (entry.revenue / totalRevenue) * 100 : 0,
      details: [...entry.breakdown.values()].sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return { items, totalRevenue, totalApproved };
}

function buildDailyPurchases(orders) {
  const map = new Map();
  for (const order of orders) {
    if (order.payment_status !== 'approved') continue;
    const dt = new Date(order.completed_at || order.created_at || 0);
    if (Number.isNaN(dt.getTime())) continue;
    const key = dt.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

module.exports = async function adminFunnelHandler(req, res) {
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

    const { days, sinceIso } = parseRange(req);

    const [events, orders] = await Promise.all([
      loadFunnelEvents(sinceIso),
      loadApprovedOrders(sinceIso),
    ]);

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
