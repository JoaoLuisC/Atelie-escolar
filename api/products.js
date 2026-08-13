const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../lib/supabase');
const { loadSoldCountByProduct } = require('../lib/sales-counts');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { ERROR_CODES, fail, methodNotAllowed, ok, preflight } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('products');

/**
 * API: Listar produtos disponíveis
 * GET /api/products
 */
module.exports = async function productsHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET', 'OPTIONS']);
  }

  // Regra E1: sem isto o endpoint fica sem contador em produção — o limiter
  // global do server.js só existe no Express de dev. Ver RATE_LIMITS.catalog.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.catalog);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado',
      });
    }

    // Achado M7: até aqui este endpoint público e anônimo baixava `orders` e
    // `order_items` INTEIRAS (sem `limit`, sem janela) a cada hit não-cacheado,
    // só para somar quantidade por produto. loadSoldCountByProduct agrega no
    // Postgres (RPC) e cai numa varredura com teto explícito se a migration
    // 20260813000001 ainda não estiver aplicada — ver lib/sales-counts.js.
    const [productsRows, categoriesRows, soldCountByProduct] = await Promise.all([
      listTableRows('products', {
        // download_url NÃO entra aqui: é o localizador do arquivo pago e este é
        // um endpoint público. Era selecionado e nem chegava a ser emitido no
        // map abaixo — vazamento gratuito pelo corpo da resposta.
        select:
          'id,slug,name,description,price,original_price,image_url,images,videos,category_id,active,featured,tags,product_type,is_kit,page_size,paper_type,kit_items,panel_sizes,created_at,updated_at',
        filters: [{ column: 'active', value: true }],
        orderBy: 'created_at',
        ascending: false,
      }),
      listTableRows('categories', {
        select: 'id,name',
        filters: [{ column: 'active', value: true }],
        orderBy: 'name',
        ascending: true,
      }),
      loadSoldCountByProduct(),
    ]);

    const categoryById = new Map(
      categoriesRows.map((category) => [String(category.id), category.name]),
    );

    const products = productsRows.map((row) => {
      const images = Array.isArray(row.images) ? row.images : [];
      return {
        id: String(row.id),
        slug: row.slug || String(row.id),
        name: row.name,
        description: row.description,
        price: Number(row.price || 0),
        originalPrice: row.original_price ?? null,
        image: row.image_url || images[0] || '',
        images,
        videos: Array.isArray(row.videos) ? row.videos : [],
        category: row.category_id ? categoryById.get(String(row.category_id)) || null : null,
        categoryId: row.category_id ? String(row.category_id) : null,
        tags: Array.isArray(row.tags) ? row.tags : [],
        productType: row.product_type || 'individual',
        isKit: row.is_kit === true,
        pageSize: row.page_size || '',
        paperType: row.paper_type || '',
        kitItems: Array.isArray(row.kit_items) ? row.kit_items : [],
        panelSizes: Array.isArray(row.panel_sizes) ? row.panel_sizes : [],
        soldCount: soldCountByProduct.get(String(row.id)) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    res.setHeader(
      'Cache-Control',
      'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    );
    return ok(res, {
      success: true,
      products,
      total: products.length,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao buscar produtos',
    });
  }
};
