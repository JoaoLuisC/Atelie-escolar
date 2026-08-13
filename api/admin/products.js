const { ensureAdminSession, setAdminCorsHeaders } = require('../../lib/admin-session');
const { logAdminAction } = require('../../lib/admin-audit');
const { ERROR_CODES, fail, methodNotAllowed, preflight } = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-products');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { deleteFromTable, getTableRow, insertIntoTable, listTableRows, updateTable },
} = require('../../lib/supabase');

function normalizeSlug(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '') || 'sem-categoria'
  );
}

function resolveArray(input, fallback) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(fallback)) return fallback;
  return [];
}

async function resolveCategoryId(categoryValue) {
  const rawCategory = String(categoryValue || '').trim();
  if (!rawCategory) {
    return null;
  }

  if (/^\d+$/.test(rawCategory)) {
    const existingById = await getTableRow('categories', {
      select: 'id',
      filters: [{ column: 'id', value: Number(rawCategory) }],
    });

    if (existingById) {
      return existingById.id;
    }
  }

  const slug = normalizeSlug(rawCategory);
  const existingBySlug = await getTableRow('categories', {
    select: 'id',
    filters: [{ column: 'slug', value: slug }],
  });

  if (existingBySlug) {
    return existingBySlug.id;
  }

  const [created] = await insertIntoTable('categories', {
    name: rawCategory,
    slug,
    color: '#9B5DE5',
    active: true,
    featured: false,
    badge_label: '',
    sort_order: 0,
  });

  return created.id;
}

function toProductPayload(body = {}, existing = {}) {
  const hasOriginalPrice = body.originalPrice !== undefined;
  const originalPrice = hasOriginalPrice
    ? Number(body.originalPrice || 0)
    : (existing.original_price ?? null);
  const active = typeof body.active === 'boolean' ? body.active : existing.active !== false;
  const featured = typeof body.featured === 'boolean' ? body.featured : existing.featured === true;
  const tags = resolveArray(body.tags, existing.tags);
  const isKit = typeof body.isKit === 'boolean' ? body.isKit : existing.is_kit === true;
  const kitItems = resolveArray(body.kitItems, existing.kit_items);
  const panelSizes = resolveArray(body.panelSizes, existing.panel_sizes);

  // Campos de conversão (Fase 2): editáveis pela aba Conversão do ProductWizard.
  const faq = resolveArray(body.faq, existing.faq)
    .map((entry) => ({
      question: String(entry?.question || '').trim(),
      answer: String(entry?.answer || '').trim(),
    }))
    .filter((entry) => entry.question && entry.answer);
  const reviews = resolveArray(body.reviews, existing.reviews)
    .map((entry) => ({
      author: String(entry?.author || '').trim(),
      role: String(entry?.role || '').trim(),
      location: String(entry?.location || '').trim(),
      text: String(entry?.text || '').trim(),
      rating: entry?.rating == null || entry?.rating === '' ? null : Number(entry.rating),
    }))
    .filter((entry) => entry.author && entry.text);
  const benefits = resolveArray(body.benefits, existing.benefits)
    .map((entry) =>
      typeof entry === 'string'
        ? { icon: '', label: entry.trim() }
        : { icon: String(entry?.icon || '').trim(), label: String(entry?.label || '').trim() },
    )
    .filter((entry) => entry.label);

  const incomingImages = resolveArray(body.images, existing.images)
    .map((url) => String(url || '').trim())
    .filter(Boolean);
  const incomingVideos = resolveArray(body.videos, existing.videos)
    .map((url) => String(url || '').trim())
    .filter(Boolean);

  // image_url (campo legado/principal) = primeira da galeria OU o campo `image` direto
  const primaryImage = String(
    body.image ?? body.imageUrl ?? incomingImages[0] ?? existing.image_url ?? '',
  ).trim();

  return {
    name: String(body.name ?? existing.name ?? '').trim(),
    description: String(body.description ?? existing.description ?? ''),
    price: Number(body.price ?? existing.price ?? 0),
    original_price: originalPrice,
    image_url: primaryImage,
    images: incomingImages,
    videos: incomingVideos,
    download_url: String(body.downloadUrl ?? existing.download_url ?? ''),
    category_id: body.category_id ?? existing.category_id ?? null,
    active,
    featured,
    tags,
    product_type: String(body.productType ?? existing.product_type ?? 'individual'),
    is_kit: isKit,
    page_size: String(body.pageSize ?? existing.page_size ?? ''),
    paper_type: String(body.paperType ?? existing.paper_type ?? ''),
    kit_items: kitItems,
    panel_sizes: panelSizes,
    faq,
    reviews,
    benefits,
  };
}

async function listProducts() {
  const [productsRows, categoriesRows] = await Promise.all([
    listTableRows('products', {
      select:
        'id,slug,name,description,price,original_price,image_url,images,videos,download_url,category_id,active,featured,tags,product_type,is_kit,page_size,paper_type,kit_items,panel_sizes,faq,reviews,benefits,created_at,updated_at',
      orderBy: 'created_at',
      ascending: false,
    }),
    listTableRows('categories', {
      select: 'id,name',
      orderBy: 'name',
      ascending: true,
    }),
  ]);

  const categoryById = new Map(
    categoriesRows.map((category) => [String(category.id), category.name]),
  );
  return productsRows.map((row) => {
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
      downloadUrl: row.download_url || '',
      category: row.category_id ? categoryById.get(String(row.category_id)) || null : null,
      categoryId: row.category_id ? String(row.category_id) : null,
      active: row.active !== false,
      featured: row.featured === true,
      tags: Array.isArray(row.tags) ? row.tags : [],
      productType: row.product_type || 'individual',
      isKit: row.is_kit === true,
      pageSize: row.page_size || '',
      paperType: row.paper_type || '',
      kitItems: Array.isArray(row.kit_items) ? row.kit_items : [],
      panelSizes: Array.isArray(row.panel_sizes) ? row.panel_sizes : [],
      faq: Array.isArray(row.faq) ? row.faq : [],
      reviews: Array.isArray(row.reviews) ? row.reviews : [],
      benefits: Array.isArray(row.benefits) ? row.benefits : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

async function createProduct(body) {
  if (!body.name || Number(body.price) <= 0) {
    return { status: 400, body: { error: 'name e price válidos são obrigatórios' } };
  }

  const categoryId = await resolveCategoryId(body.categoryId ?? body.category);
  const payload = toProductPayload({ ...body, category_id: categoryId });
  const [created] = await insertIntoTable('products', payload);
  return { status: 201, body: { success: true, id: String(created.id) } };
}

async function updateProduct(body) {
  const id = String(body.id || '').trim();
  if (!id) {
    return { status: 400, body: { error: 'id é obrigatório' } };
  }

  const existing = await getTableRow('products', {
    select:
      'id,name,description,price,original_price,image_url,images,videos,download_url,category_id,active,featured,tags,product_type,is_kit,page_size,paper_type,kit_items,panel_sizes,faq,reviews,benefits',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) {
    return { status: 404, body: { error: 'Produto não encontrado' } };
  }

  const hasCategoryInput = body.category !== undefined || body.categoryId !== undefined;
  const categoryId = hasCategoryInput
    ? await resolveCategoryId(body.categoryId ?? body.category)
    : existing.category_id;
  const payload = toProductPayload({ ...body, category_id: categoryId }, existing);
  await updateTable('products', { id: `eq.${id}` }, payload);
  return { status: 200, body: { success: true } };
}

async function patchProduct(body) {
  const id = String(body.id || '').trim();
  if (!id) {
    return { status: 400, body: { error: 'id é obrigatório' } };
  }

  const payload = { updated_at: new Date().toISOString() };
  if (typeof body.active === 'boolean') payload.active = body.active;
  if (typeof body.featured === 'boolean') payload.featured = body.featured;

  if (Object.keys(payload).length === 1) {
    return { status: 400, body: { error: 'Nenhum campo suportado para atualização parcial.' } };
  }

  await updateTable('products', { id: `eq.${id}` }, payload);
  return { status: 200, body: { success: true } };
}

async function deleteProduct(id) {
  if (!id) {
    return { status: 400, body: { error: 'id é obrigatório' } };
  }

  await deleteFromTable('products', { id: `eq.${id}` });
  return { status: 200, body: { success: true } };
}

module.exports = async function adminProductsHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado',
      });
    }

    const handlers = {
      GET: async () => ({ status: 200, body: { success: true, products: await listProducts() } }),
      POST: async () => createProduct(req.body || {}),
      PUT: async () => updateProduct(req.body || {}),
      PATCH: async () => patchProduct(req.body || {}),
      DELETE: async () => deleteProduct(String(req.query?.id || req.body?.id || '').trim()),
    };

    const handler = handlers[req.method];
    if (!handler) {
      return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
    }

    const result = await handler();

    // Auditoria de escrita (regra I1) — best-effort.
    if (result.status >= 200 && result.status < 300 && req.method !== 'GET') {
      const actionByMethod = { POST: 'create', PUT: 'update', PATCH: 'patch', DELETE: 'delete' };
      await logAdminAction({
        req,
        action: actionByMethod[req.method] || String(req.method).toLowerCase(),
        targetType: 'product',
        targetId:
          req.method === 'DELETE'
            ? String(req.query?.id || req.body?.id || '').trim()
            : (req.body?.id ?? result.body?.id ?? null),
        after: req.method === 'DELETE' ? null : req.body || null,
      });
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao processar produtos do admin',
    });
  }
};
