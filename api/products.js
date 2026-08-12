const { getSupabaseConfig, serviceRoleHelpers: { listTableRows } } = require('../lib/supabase');

/**
 * API: Listar produtos disponíveis
 * GET /api/products
 */
module.exports = async function productsHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const [productsRows, categoriesRows, approvedOrdersRows, orderItemsRows] = await Promise.all([
      listTableRows('products', {
        // download_url NÃO entra aqui: é o localizador do arquivo pago e este é
        // um endpoint público. Era selecionado e nem chegava a ser emitido no
        // map abaixo — vazamento gratuito pelo corpo da resposta.
        select: 'id,slug,name,description,price,original_price,image_url,images,videos,category_id,active,featured,tags,product_type,is_kit,page_size,paper_type,kit_items,panel_sizes,created_at,updated_at',
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
      listTableRows('orders', {
        select: 'id',
        filters: [{ column: 'payment_status', value: 'approved' }],
        orderBy: 'created_at',
        ascending: false,
      }),
      listTableRows('order_items', {
        select: 'order_id,product_id,quantity',
        orderBy: 'order_id',
        ascending: false,
      }),
    ]);

    const categoryById = new Map(categoriesRows.map((category) => [String(category.id), category.name]));
    const approvedOrderIds = new Set(approvedOrdersRows.map((row) => String(row.id)));
    const soldCountByProduct = new Map();

    for (const item of orderItemsRows) {
      const orderId = String(item.order_id || '');
      const productId = String(item.product_id || '');
      if (!orderId || !productId || !approvedOrderIds.has(orderId)) {
        continue;
      }

      const qty = Number(item.quantity || 0);
      soldCountByProduct.set(productId, (soldCountByProduct.get(productId) || 0) + (Number.isFinite(qty) ? qty : 0));
    }

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

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({
      success: true,
      products,
      total: products.length,
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
};
