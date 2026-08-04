const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, listTableRows },
} = require('../lib/supabase');

/**
 * Cross-sell de produtos relacionados.
 *
 * Estratégia em camadas:
 * 1. Co-ocorrência real em pedidos aprovados (quem comprou X levou Y)
 *    — só vale quando há histórico suficiente
 * 2. Fallback: mesma categoria, excluindo o produto atual, ordenados por
 *    featured + mais recentes
 *
 * Sem isso, a Curva ABC da Fase 4 ainda não tem dados. Esse endpoint
 * vai melhorando sozinho conforme o histórico cresce.
 */

const MAX_RESULTS = 4;

async function loadProduct(productId) {
  return getTableRow('products', {
    select: 'id,slug,name,category_id',
    filters: [{ column: 'id', value: productId }],
  });
}

async function loadCoOccurrence(productId, limit = MAX_RESULTS) {
  // Busca todos os order_items que dividem pedido aprovado com o productId.
  // Para evitar SQL complexo no PostgREST, fazemos em duas queries.
  const ordersWithProduct = await listTableRows('order_items', {
    select: 'order_id',
    filters: [{ column: 'product_id', value: productId }],
    limit: 1000,
  });

  const orderIds = [...new Set(ordersWithProduct.map((row) => String(row.order_id)).filter(Boolean))];
  if (orderIds.length === 0) return [];

  // Filtra para apenas pedidos aprovados
  const approvedOrders = await listTableRows('orders', {
    select: 'id',
    filters: [{ column: 'payment_status', value: 'approved' }],
    limit: 5000,
  });
  const approvedSet = new Set(approvedOrders.map((row) => String(row.id)));
  const validOrderIds = orderIds.filter((id) => approvedSet.has(id));
  if (validOrderIds.length === 0) return [];

  // Pega items dos pedidos validados, excluindo o produto pivô
  const coItems = await listTableRows('order_items', {
    select: 'order_id,product_id,quantity',
    filters: [{ column: 'order_id', operator: 'in', value: `(${validOrderIds.join(',')})` }],
    limit: 5000,
  });

  const scoreByProduct = new Map();
  for (const item of coItems) {
    const pid = String(item.product_id || '');
    if (!pid || pid === String(productId)) continue;
    scoreByProduct.set(pid, (scoreByProduct.get(pid) || 0) + Number(item.quantity || 1));
  }

  return [...scoreByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pid]) => pid);
}

async function loadCategoryFallback(product, excludeIds, limit) {
  if (!product.category_id) return [];
  const rows = await listTableRows('products', {
    select: 'id,slug,name,price,image_url,images,featured',
    filters: [
      { column: 'category_id', value: product.category_id },
      { column: 'active', value: true },
    ],
    orderBy: 'created_at',
    ascending: false,
    limit: 24,
  });
  return rows
    .filter((row) => !excludeIds.has(String(row.id)))
    .sort((a, b) => Number(b.featured === true) - Number(a.featured === true))
    .slice(0, limit);
}

async function loadProductsByIds(ids) {
  if (ids.length === 0) return [];
  const rows = await listTableRows('products', {
    select: 'id,slug,name,price,image_url,images,featured,active',
    filters: [{ column: 'id', operator: 'in', value: `(${ids.join(',')})` }],
  });
  return rows.filter((row) => row.active !== false);
}

function shapeProduct(row) {
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    id: String(row.id),
    slug: row.slug || String(row.id),
    name: row.name,
    price: Number(row.price || 0),
    image: row.image_url || images[0] || '',
    featured: row.featured === true,
  };
}

module.exports = async function crossSellHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const productId = String(req.query?.productId || req.query?.id || '').trim();
    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId é obrigatório.' });
    }

    const product = await loadProduct(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
    }

    // Camada 1: co-ocorrência real
    const coIds = await loadCoOccurrence(productId, MAX_RESULTS);
    let products = coIds.length ? await loadProductsByIds(coIds) : [];

    // Camada 2: completar com mesma categoria se faltou
    if (products.length < MAX_RESULTS) {
      const excludeIds = new Set([String(productId), ...products.map((p) => String(p.id))]);
      const fallback = await loadCategoryFallback(product, excludeIds, MAX_RESULTS - products.length);
      products = [...products, ...fallback];
    }

    // Cache curto: dados mudam quando há novas compras aprovadas
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600');

    return res.status(200).json({
      success: true,
      strategy: coIds.length ? 'co_occurrence' : 'same_category',
      products: products.slice(0, MAX_RESULTS).map(shapeProduct),
    });
  } catch (error) {
    console.error('[cross-sell]', error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar produtos relacionados.',
    });
  }
};
