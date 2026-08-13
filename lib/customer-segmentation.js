const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('./supabase');

/**
 * Classificação de clientes em tags para email marketing.
 *
 * Princípio (REGRAS §1, §2):
 * - Segmentação > personalização nominal
 * - Histórico de compra prediz receita; engajamento prediz engajamento
 *
 * Tags:
 * - cliente_ativo      → comprou nos últimos 90 dias
 * - cliente_recorrente → 2+ pedidos aprovados
 * - cliente_vip        → 5+ pedidos OU LTV > VIP_THRESHOLD (default R$ 300)
 * - inativo_30d        → último pedido entre 30-89 dias
 * - inativo_90d        → último pedido entre 90-179 dias (alvo de reativação)
 * - inativo_180d       → 180+ dias sem compra (NÃO enviar marketing, regra D7)
 * - categoria:<slug>   → uma tag por categoria já comprada
 */

const VIP_THRESHOLD = Number(process.env.VIP_LTV_THRESHOLD || 300);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(timestamp) {
  if (!timestamp) return Infinity;
  return Math.floor((Date.now() - new Date(timestamp).getTime()) / DAY_MS);
}

/**
 * Carrega pedidos aprovados + itens + produtos para um email específico.
 * Versão otimizada para uso em loops de cron (carrega só o que importa).
 */
async function loadCustomerHistory(email) {
  if (!getSupabaseConfig()) return { orders: [], itemsByOrder: new Map(), products: new Map() };

  const normalizedEmail = String(email || '').toLowerCase();

  const orders = await listTableRows('orders', {
    select: 'id,total_amount,payment_status,created_at,completed_at',
    filters: [
      { column: 'customer_email', value: normalizedEmail },
      { column: 'payment_status', value: 'approved' },
    ],
    orderBy: 'completed_at',
    ascending: false,
    limit: 500,
  });

  if (orders.length === 0) return { orders: [], itemsByOrder: new Map(), products: new Map() };

  const orderIds = orders.map((o) => String(o.id));
  const items = await listTableRows('order_items', {
    select: 'order_id,product_id,product_name,quantity,unit_price',
    filters: [{ column: 'order_id', operator: 'in', value: `(${orderIds.join(',')})` }],
    limit: 5000,
  });

  const productIds = [...new Set(items.map((i) => String(i.product_id)).filter(Boolean))];
  const products = productIds.length
    ? await listTableRows('products', {
        select: 'id,slug,category_id,name',
        filters: [{ column: 'id', operator: 'in', value: `(${productIds.join(',')})` }],
      })
    : [];

  const itemsByOrder = new Map();
  for (const item of items) {
    const key = String(item.order_id);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push(item);
  }
  const productMap = new Map(products.map((p) => [String(p.id), p]));

  return { orders, itemsByOrder, products: productMap };
}

/**
 * Computa tags para um cliente baseado no histórico.
 * Recebe `categories` opcional (Map id→slug) para evitar query extra.
 */
function computeCustomerTags(history, categoryMap) {
  const tags = new Set();
  const orderCount = history.orders.length;
  if (orderCount === 0) return [];

  // LTV
  const ltv = history.orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  // Recência
  const lastOrder = history.orders[0]; // já ordenado desc
  const daysFromLast = daysSince(lastOrder.completed_at || lastOrder.created_at);

  if (daysFromLast <= 90) tags.add('cliente_ativo');
  if (daysFromLast > 30 && daysFromLast < 90) tags.add('inativo_30d');
  if (daysFromLast >= 90 && daysFromLast < 180) tags.add('inativo_90d');
  if (daysFromLast >= 180) tags.add('inativo_180d');

  // Frequência
  if (orderCount >= 2) tags.add('cliente_recorrente');
  if (orderCount >= 5 || ltv > VIP_THRESHOLD) tags.add('cliente_vip');

  // Categorias compradas
  if (categoryMap) {
    for (const items of history.itemsByOrder.values()) {
      for (const item of items) {
        const product = history.products.get(String(item.product_id));
        if (!product?.category_id) continue;
        const slug = categoryMap.get(String(product.category_id));
        if (slug) tags.add(`categoria:${slug}`);
      }
    }
  }

  return [...tags];
}

/**
 * Versão "tudo de uma vez" para o admin: retorna lista de subscribers
 * com tags atualizadas e contagem por tag.
 */
async function buildSegmentationReport() {
  if (!getSupabaseConfig()) {
    return { subscribers: [], byTag: {} };
  }

  const [subscribers, categories] = await Promise.all([
    listTableRows('email_subscribers', {
      select: 'id,email,confirmed,unsubscribed_at,tags,tags_updated_at,created_at',
      orderBy: 'created_at',
      ascending: false,
      limit: 5000,
    }),
    listTableRows('categories', {
      select: 'id,slug',
      filters: [{ column: 'active', value: true }],
    }),
  ]);

  const categoryMap = new Map(categories.map((c) => [String(c.id), c.slug]));

  const enriched = await Promise.all(
    subscribers.map(async (sub) => {
      if (!sub.confirmed || sub.unsubscribed_at) {
        return { ...sub, tags: [], computed: false };
      }
      const history = await loadCustomerHistory(sub.email);
      const tags = computeCustomerTags(history, categoryMap);
      return { ...sub, tags, computed: true };
    }),
  );

  const byTag = {};
  for (const sub of enriched) {
    if (sub.unsubscribed_at) continue;
    for (const tag of sub.tags || []) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }

  return { subscribers: enriched, byTag };
}

module.exports = {
  VIP_THRESHOLD,
  buildSegmentationReport,
  computeCustomerTags,
  daysSince,
  loadCustomerHistory,
};
