const { getSupabaseConfig, listTableRows } = require('../lib/supabase');

/**
 * API: Listar produtos disponíveis
 * GET /api/products
 */
module.exports = async function productsHandler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const [productsRows, categoriesRows] = await Promise.all([
      listTableRows('products', {
        select: 'id,name,description,price,original_price,image_url,download_url,category_id,active,featured,tags,product_type,is_kit,page_size,paper_type,kit_items,panel_sizes,created_at,updated_at',
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
    ]);

    const categoryById = new Map(categoriesRows.map((category) => [String(category.id), category.name]));
    const products = productsRows.map((row) => ({
      id: String(row.id),
      name: row.name,
      description: row.description,
      price: Number(row.price || 0),
      originalPrice: row.original_price ?? null,
      image: row.image_url,
      images: [],
      category: row.category_id ? categoryById.get(String(row.category_id)) || null : null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      productType: row.product_type || 'individual',
      isKit: row.is_kit === true,
      pageSize: row.page_size || '',
      paperType: row.paper_type || '',
      kitItems: Array.isArray(row.kit_items) ? row.kit_items : [],
      panelSizes: Array.isArray(row.panel_sizes) ? row.panel_sizes : [],
    }));

    return res.status(200).json({
      success: true,
      products,
      total: products.length,
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ 
      error: 'Erro ao buscar produtos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
