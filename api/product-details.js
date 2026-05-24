const { getSupabaseConfig, getTableRow } = require('../lib/supabase');

module.exports = async function productDetailsHandler(req, res) {
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
    const id = req.query?.id;

    if (!id) {
      return res.status(400).json({ error: 'id é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const product = await getTableRow('products', {
      select: 'id,name,description,price,original_price,image_url,images,videos,download_url,category_id,product_type,tags,is_kit,page_size,paper_type,kit_items,panel_sizes,featured',
      filters: [{ column: 'id', value: id }],
    });

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    let category = null;
    if (product.category_id) {
      category = await getTableRow('categories', {
        select: 'name',
        filters: [{ column: 'id', value: product.category_id }],
      });
    }

    const images = Array.isArray(product.images) ? product.images : [];
    return res.status(200).json({
      success: true,
      product: {
        id: String(product.id),
        name: product.name,
        description: product.description,
        price: Number(product.price || 0),
        originalPrice: product.original_price ?? null,
        image: product.image_url || images[0] || '',
        images,
        videos: Array.isArray(product.videos) ? product.videos : [],
        downloadUrl: product.download_url || '',
        category: category?.name || null,
        categoryId: product.category_id ? String(product.category_id) : null,
        productType: product.product_type || 'individual',
        isKit: product.is_kit === true,
        featured: product.featured === true,
        tags: Array.isArray(product.tags) ? product.tags : [],
        pageSize: product.page_size || '',
        paperType: product.paper_type || '',
        kitItems: Array.isArray(product.kit_items) ? product.kit_items : [],
        panelSizes: Array.isArray(product.panel_sizes) ? product.panel_sizes : [],
      },
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    return res.status(500).json({
      error: 'Erro ao buscar detalhes do produto',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
