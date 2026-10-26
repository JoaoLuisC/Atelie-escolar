// ════════════════════════════════════════════════════════════════════
// MÉTRICAS DO FUNIL — funções puras, sem I/O.
//
// Moraram dentro de handlers/admin/funnel.js até 26/10/2026, quando a aba
// "Estudo de vendas" (lib/sales-study.js) passou a precisar dos MESMOS números:
// duas cópias do cálculo seriam dois funis que, um dia, discordam. O handler do
// funil e o estudo importam daqui.
// ════════════════════════════════════════════════════════════════════

const FUNNEL_STEPS = [
  { key: 'view_catalog', label: 'Visitas ao catálogo' },
  { key: 'view_item', label: 'Visualizou produto' },
  { key: 'add_to_cart', label: 'Adicionou ao carrinho' },
  { key: 'begin_checkout', label: 'Iniciou checkout' },
  { key: 'purchase', label: 'Compra aprovada' },
];

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

module.exports = {
  FUNNEL_STEPS,
  bucketBySessionAndEvent,
  buildFunnel,
  buildAttribution,
  buildDailyPurchases,
};
