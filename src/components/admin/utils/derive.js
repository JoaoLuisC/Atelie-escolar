import { classifyByCumulative } from '../../../utils/abc';
import { toDateSafe } from '../../../utils/date';

export function deriveApprovedOrders(orders) {
  return (orders || []).filter((order) => order.paymentStatus === 'approved');
}

export function deriveProductPerformance(products, approvedOrders) {
  const base = (products || []).map((product) => ({
    ...product,
    qty: 0,
    rev: 0,
    downloads: Number(product.downloads || 0),
  }));

  const index = Object.fromEntries(base.map((product) => [String(product.id), product]));
  for (const order of approvedOrders) {
    for (const item of order.items || []) {
      const id = String(item.id || item.productId || '');
      if (!id || !index[id]) continue;
      index[id].qty += Number(item.quantity || 0);
      index[id].rev += Number(item.price || 0) * Number(item.quantity || 0);
    }
  }

  return base.sort((a, b) => b.qty - a.qty);
}

export function deriveMonthlyComparison(approvedOrders) {
  const now = new Date();
  const months = [0, 1].map((offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const monthOrders = approvedOrders.filter((order) => {
      const dt = new Date(order.completedAt || order.createdAt || 0);
      return dt >= start && dt < end;
    });

    const gross = monthOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const qty = monthOrders.length;
    const avg = qty ? gross / qty : 0;

    return { label, gross, qty, avg };
  });

  return months.reverse();
}

export function deriveComparisonDelta(monthlyComparison) {
  if (monthlyComparison.length < 2) {
    return { pct: 0, trend: 'stable' };
  }

  const prev = monthlyComparison[0].gross;
  const current = monthlyComparison[1].gross;

  if (!prev && !current) return { pct: 0, trend: 'stable' };
  if (!prev && current) return { pct: 100, trend: 'up' };

  const pct = ((current - prev) / prev) * 100;
  if (pct > 0.01) return { pct, trend: 'up' };
  if (pct < -0.01) return { pct, trend: 'down' };
  return { pct, trend: 'stable' };
}

export function deriveRecentOrders(orders, limit = 8) {
  const ordered = [...(orders || [])].sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });
  return ordered.slice(0, limit);
}

export function deriveDailyRevenue(approvedOrders, days = 7) {
  const now = new Date();
  const labels = [];
  const values = [];
  const map = new Map();

  for (const order of approvedOrders) {
    const dt = toDateSafe(order.completedAt || order.createdAt);
    if (!dt) continue;
    const key = dt.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + Number(order.totalAmount || 0));
  }

  for (let i = days - 1; i >= 0; i -= 1) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    labels.push(dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    values.push(map.get(key) || 0);
  }

  const max = Math.max(1, ...values);
  return values.map((value, index) => ({
    label: labels[index],
    value,
    pct: Math.max(6, Math.round((value / max) * 100)),
  }));
}

export function deriveCategoryRevenue(products, approvedOrders, limit = 5) {
  const productCategory = {};
  for (const product of products || []) {
    productCategory[String(product.id)] = product.category || 'Sem categoria';
  }

  const buckets = {};
  for (const order of approvedOrders) {
    for (const item of order.items || []) {
      const id = String(item.id || item.productId || '');
      const category = productCategory[id] || 'Sem categoria';
      buckets[category] =
        (buckets[category] || 0) + Number(item.price || 0) * Number(item.quantity || 0);
    }
  }

  const list = Object.entries(buckets)
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  const max = Math.max(1, ...list.map((item) => item.value), 1);
  return list.map((item) => ({
    ...item,
    pct: Math.max(8, Math.round((item.value / max) * 100)),
  }));
}

export function deriveFaturamentoSeries(approvedOrders, monthsCount = 6) {
  const months = [];
  const now = new Date();

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
    const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
    const value = approvedOrders
      .filter((order) => {
        const date = toDateSafe(order.completedAt || order.createdAt);
        return date && date >= start && date < end;
      })
      .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

    months.push({
      label: dt.toLocaleDateString('pt-BR', { month: 'short' }),
      value,
    });
  }

  const max = Math.max(1, ...months.map((item) => item.value), 1);
  return months.map((item) => ({
    ...item,
    pct: Math.max(8, Math.round((item.value / max) * 100)),
  }));
}

export function deriveTicketMedio(monthlyComparison) {
  const [prev, current] =
    monthlyComparison.length >= 2
      ? monthlyComparison
      : [{ avg: 0, qty: 0 }, monthlyComparison[0] || { avg: 0, qty: 0 }];

  const currentAvg = Number(current?.avg || 0);
  const prevAvg = Number(prev?.avg || 0);

  let pct = 0;
  let trend = 'stable';
  if (!prevAvg && currentAvg) {
    pct = 100;
    trend = 'up';
  } else if (prevAvg) {
    pct = ((currentAvg - prevAvg) / prevAvg) * 100;
    if (pct > 0.5) trend = 'up';
    else if (pct < -0.5) trend = 'down';
  }

  return { value: currentAvg, prev: prevAvg, pct, trend, qty: Number(current?.qty || 0) };
}

export function deriveCustomerMix(users) {
  const list = Array.isArray(users) ? users : [];
  const buyers = list.filter((user) => Number(user.purchases || 0) > 0);
  const newCustomers = buyers.filter((user) => Number(user.purchases || 0) === 1).length;
  const recurring = buyers.filter((user) => Number(user.purchases || 0) >= 2).length;
  const total = buyers.length;
  const recurringPct = total ? Math.round((recurring / total) * 100) : 0;
  return {
    total,
    newCustomers,
    recurring,
    recurringPct,
    inactive: list.length - total,
  };
}

export function deriveAbcCurve(productPerformance) {
  const ranked = (productPerformance || [])
    .filter((product) => Number(product.rev || 0) > 0)
    .sort((a, b) => Number(b.rev || 0) - Number(a.rev || 0));

  const totalRevenue = ranked.reduce((sum, product) => sum + Number(product.rev || 0), 0);
  if (!totalRevenue) {
    return { totalRevenue: 0, items: [], summary: { A: 0, B: 0, C: 0 } };
  }

  let cumulative = 0;
  const items = ranked.map((product, index) => {
    const rev = Number(product.rev || 0);
    cumulative += rev;
    const cumulativePct = (cumulative / totalRevenue) * 100;
    const rank = index + 1;
    return {
      id: product.id,
      name: product.name,
      rev,
      qty: Number(product.qty || 0),
      sharePct: (rev / totalRevenue) * 100,
      cumulativePct,
      rank,
      curve: classifyByCumulative(cumulativePct, rank),
    };
  });

  const summary = items.reduce(
    (acc, item) => {
      acc[item.curve] = (acc[item.curve] || 0) + 1;
      return acc;
    },
    { A: 0, B: 0, C: 0 },
  );

  return { totalRevenue, items, summary };
}

export function deriveMonthSparkline(approvedOrders, days = 14) {
  const now = new Date();
  const map = new Map();
  for (const order of approvedOrders || []) {
    const dt = toDateSafe(order.completedAt || order.createdAt);
    if (!dt) continue;
    const key = dt.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + Number(order.totalAmount || 0));
  }

  const values = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    values.push(map.get(key) || 0);
  }
  return values;
}

export function parseHomeSectionsSetting(raw, categories) {
  const categoryById = new Map(
    (categories || []).map((category) => [String(category.id), category]),
  );
  const sections = Array.isArray(raw?.sections) ? raw.sections : [];

  const parsed = sections
    .map((section) => {
      const type = String(section?.type || '').trim();
      if (!['category', 'best_sellers', 'new_arrivals'].includes(type)) return null;

      const localId = `section-${Math.random().toString(36).slice(2, 10)}`;
      const limit = Number.isFinite(Number(section?.limit))
        ? Math.max(4, Math.min(20, Number(section.limit)))
        : 8;

      if (type === 'category') {
        const categoryId = String(section?.categoryId || '').trim();
        const category = categoryById.get(categoryId);
        if (!category) return null;
        return {
          localId,
          type,
          title: String(section?.title || category.name).trim() || category.name,
          categoryId,
          limit,
          enabled: section?.enabled !== false,
        };
      }

      const defaultTitle = type === 'best_sellers' ? 'Mais vendidos' : 'Novidades';
      return {
        localId,
        type,
        title: String(section?.title || defaultTitle).trim() || defaultTitle,
        limit,
        enabled: section?.enabled !== false,
      };
    })
    .filter(Boolean);

  if (parsed.length) return parsed;

  const defaults = (categories || [])
    .filter((category) => category.active !== false)
    .sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }),
    )
    .slice(0, 3)
    .map((category) => ({
      localId: `section-${Math.random().toString(36).slice(2, 10)}`,
      type: 'category',
      title: category.name,
      categoryId: String(category.id),
      limit: 8,
      enabled: true,
    }));

  return [
    ...defaults,
    {
      localId: `section-${Math.random().toString(36).slice(2, 10)}`,
      type: 'best_sellers',
      title: 'Mais vendidos',
      limit: 8,
      enabled: true,
    },
    {
      localId: `section-${Math.random().toString(36).slice(2, 10)}`,
      type: 'new_arrivals',
      title: 'Novidades',
      limit: 8,
      enabled: true,
    },
  ];
}

export function serializeHomeSections(sections, fallbackTitle) {
  return {
    sections: sections
      .filter((section) => section.enabled !== false)
      .map((section) => ({
        type: section.type,
        title: String(section.title || '').trim() || fallbackTitle(section.type),
        categoryId: section.type === 'category' ? String(section.categoryId || '') : undefined,
        limit: Math.max(4, Math.min(20, Number(section.limit || 8))),
        enabled: true,
      }))
      .filter((section) => section.type !== 'category' || section.categoryId),
  };
}

export function getSectionDefaultTitle(type) {
  if (type === 'best_sellers') return 'Mais vendidos';
  if (type === 'new_arrivals') return 'Novidades';
  return 'Categoria';
}
