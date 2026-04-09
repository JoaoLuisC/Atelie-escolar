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
      select: 'id,name,description,price,image_url,category_id,product_type',
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

    return res.status(200).json({
      success: true,
      product: {
        id: String(product.id),
        name: product.name,
        description: product.description,
        price: product.price,
        image: product.image_url,
        category: category?.name || null,
        productType: product.product_type || 'individual',
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
