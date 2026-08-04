const { getSupabaseConfig, serviceRoleHelpers: { getTableRow } } = require('../lib/supabase');

// download_url NÃO entra aqui: este é um endpoint público sem auth. O link do
// arquivo só pode ser resolvido server-side em api/download.js, após validar o
// token de uso único. Expô-lo aqui contornaria todo o gate de pagamento.
const SELECT_FIELDS = 'id,slug,name,description,price,original_price,image_url,images,videos,category_id,product_type,tags,is_kit,page_size,paper_type,kit_items,panel_sizes,featured,active,faq,reviews,benefits';

function pickIdentifier(query) {
  const raw = String(query?.slug || query?.id || '').trim();
  if (!raw) return { type: null, value: null };
  // Bigint id puro → busca por id; senão é slug.
  if (/^\d+$/.test(raw)) {
    return { type: 'id', value: raw };
  }
  return { type: 'slug', value: raw };
}

module.exports = async function productDetailsHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, value } = pickIdentifier(req.query);

    if (!value) {
      return res.status(400).json({ error: 'slug ou id é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const product = await getTableRow('products', {
      select: SELECT_FIELDS,
      // Endpoint público: nunca expor produto inativo (mesmo filtro de api/products.js).
      filters: [{ column: type, value }, { column: 'active', value: true }],
    });

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    let category = null;
    if (product.category_id) {
      category = await getTableRow('categories', {
        select: 'name,slug',
        filters: [{ column: 'id', value: product.category_id }],
      });
    }

    const images = Array.isArray(product.images) ? product.images : [];
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({
      success: true,
      product: {
        id: String(product.id),
        slug: product.slug || String(product.id),
        name: product.name,
        description: product.description,
        price: Number(product.price || 0),
        originalPrice: product.original_price ?? null,
        image: product.image_url || images[0] || '',
        images,
        videos: Array.isArray(product.videos) ? product.videos : [],
        category: category?.name || null,
        categoryId: product.category_id ? String(product.category_id) : null,
        categorySlug: category?.slug || null,
        productType: product.product_type || 'individual',
        isKit: product.is_kit === true,
        featured: product.featured === true,
        active: product.active !== false,
        tags: Array.isArray(product.tags) ? product.tags : [],
        pageSize: product.page_size || '',
        paperType: product.paper_type || '',
        kitItems: Array.isArray(product.kit_items) ? product.kit_items : [],
        panelSizes: Array.isArray(product.panel_sizes) ? product.panel_sizes : [],
        faq: Array.isArray(product.faq) ? product.faq : [],
        reviews: Array.isArray(product.reviews) ? product.reviews : [],
        benefits: Array.isArray(product.benefits) ? product.benefits : [],
      },
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    return res.status(500).json({ error: 'Erro ao buscar detalhes do produto' });
  }
};
