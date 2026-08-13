const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, listTableRows },
} = require('../lib/supabase');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { ERROR_CODES, fail, methodNotAllowed, ok, preflight } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('cross-sell');

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

// Teto de pedidos considerados na co-ocorrência. Serve a dois propósitos:
// (1) achado M7 — este endpoint é público e anônimo, e a varredura de pedidos
//     aprovados não pode crescer com o histórico;
// (2) o filtro `order_id=in.(…)` vira querystring de um GET. 150 UUIDs já são
//     ~5,5 KB de URL; com os 1000 do teto anterior seriam ~37 KB, acima do que
//     o PostgREST/proxy aceita — a query simplesmente falharia quando o
//     produto ficasse popular. 150 pedidos recentes é amostra de sobra para
//     ranquear 4 sugestões.
const MAX_CO_OCCURRENCE_ORDERS = 150;

// `products.id` e `orders.id` são `uuid` (supabase/schema.sql:48,76). Mesmo
// motivo do api/create-payment.js (achado B1): nada é interpolado num filtro
// PostgREST antes de casar com este formato. Vale inclusive para os ids que
// vieram do próprio banco — validar de novo custa nada e tira a query da
// dependência de "confiar na origem do valor".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function onlyUuids(values) {
  return values.filter((value) => UUID_RE.test(value));
}

async function loadProduct(productId) {
  return getTableRow('products', {
    select: 'id,slug,name,category_id',
    filters: [{ column: 'id', value: productId }],
  });
}

async function loadCoOccurrence(productId, limit = MAX_RESULTS) {
  // Busca os pedidos MAIS RECENTES que contêm o productId. `order by created_at
  // desc` + limite deixa a amostra ancorada no presente em vez de numa fatia
  // arbitrária que o Postgres devolveria sem ordenação.
  const ordersWithProduct = await listTableRows('order_items', {
    select: 'order_id',
    filters: [{ column: 'product_id', value: productId }],
    orderBy: 'created_at',
    ascending: false,
    limit: MAX_CO_OCCURRENCE_ORDERS,
  });

  const orderIds = onlyUuids([
    ...new Set(ordersWithProduct.map((row) => String(row.order_id || '')).filter(Boolean)),
  ]);
  if (orderIds.length === 0) return [];

  // Filtra para apenas pedidos aprovados. Antes esta query baixava TODOS os
  // pedidos aprovados da base (limit 5000) para depois cruzar em memória —
  // varredura proporcional ao histórico inteiro por hit anônimo. Como os ids
  // que interessam já estão em mãos, o recorte cabe no próprio filtro.
  const approvedOrders = await listTableRows('orders', {
    select: 'id',
    filters: [
      { column: 'id', operator: 'in', value: `(${orderIds.join(',')})` },
      { column: 'payment_status', value: 'approved' },
    ],
    limit: orderIds.length,
  });
  const approvedSet = new Set(approvedOrders.map((row) => String(row.id)));
  const validOrderIds = orderIds.filter((id) => approvedSet.has(id));
  if (validOrderIds.length === 0) return [];

  // Pega items dos pedidos validados, excluindo o produto pivô
  const coItems = await listTableRows('order_items', {
    select: 'order_id,product_id,quantity',
    filters: [{ column: 'order_id', operator: 'in', value: `(${validOrderIds.join(',')})` }],
    // Cada pedido tem poucos itens; 20 por pedido é folga larga sobre o real.
    limit: validOrderIds.length * 20,
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
  const safeIds = onlyUuids(ids);
  if (safeIds.length === 0) return [];
  const rows = await listTableRows('products', {
    select: 'id,slug,name,price,image_url,images,featured,active',
    filters: [{ column: 'id', operator: 'in', value: `(${safeIds.join(',')})` }],
    limit: safeIds.length,
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
    return preflight(res);
  }
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET', 'OPTIONS']);
  }

  // Regra E1 — ver RATE_LIMITS.catalog.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.catalog);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const productId = String(req.query?.productId || req.query?.id || '').trim();
    // Achado B1: o id vem da querystring, ou seja, é entrada do usuário, e é
    // usado como filtro em três queries. Sem este teste, um valor não-UUID
    // chega ao PostgREST e volta como erro 400 de cast — que este handler
    // converteria num 500 genérico, escondendo um pedido malformado atrás de
    // "erro do servidor". Com ele, o formato é decidido aqui.
    if (!UUID_RE.test(productId)) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'productId é obrigatório.',
      });
    }

    const product = await loadProduct(productId);
    if (!product) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Produto não encontrado.',
      });
    }

    // Camada 1: co-ocorrência real
    const coIds = await loadCoOccurrence(productId, MAX_RESULTS);
    let products = coIds.length ? await loadProductsByIds(coIds) : [];

    // Camada 2: completar com mesma categoria se faltou
    if (products.length < MAX_RESULTS) {
      const excludeIds = new Set([String(productId), ...products.map((p) => String(p.id))]);
      const fallback = await loadCategoryFallback(
        product,
        excludeIds,
        MAX_RESULTS - products.length,
      );
      products = [...products, ...fallback];
    }

    // Cache curto: dados mudam quando há novas compras aprovadas
    res.setHeader(
      'Cache-Control',
      'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    );

    return ok(res, {
      success: true,
      strategy: coIds.length ? 'co_occurrence' : 'same_category',
      products: products.slice(0, MAX_RESULTS).map(shapeProduct),
    });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao buscar produtos relacionados.',
    });
  }
};
