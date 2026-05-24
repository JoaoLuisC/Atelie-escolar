const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: {
    deleteFromTable,
    getTableRow,
    insertIntoTable,
    listTableRows,
    updateTable,
  },
} = require('../lib/supabase');

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '') || 'sem-categoria';
}

function toCategoryPayload(body = {}, existing = {}) {
  const name = String(body.name || existing.name || '').trim();
  const color = String(body.color || existing.color || '#9B5DE5').trim();
  const hasActive = Object.hasOwn(body, 'active');
  const hasFeatured = Object.hasOwn(body, 'featured');
  const existingIsActive = existing.active !== false;
  const existingIsFeatured = existing.featured === true;

  return {
    name,
    slug: normalizeSlug(name),
    color,
    active: hasActive ? Boolean(body.active) : existingIsActive,
    featured: hasFeatured ? Boolean(body.featured) : existingIsFeatured,
    badge_label: String(existing.badge_label ?? '').trim(),
    sort_order: Number.isFinite(Number(existing.sort_order)) ? Number(existing.sort_order) : 0,
  };
}

async function listCategories() {
  const rows = await listTableRows('categories', {
    select: 'id,name,slug,color,active,featured,badge_label,sort_order,created_at',
    orderBy: 'name',
    ascending: true,
  });

  return rows.map((row, index) => ({
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    color: row.color || '#9B5DE5',
    active: row.active !== false,
    featured: row.featured === true,
    badgeLabel: row.badge_label || '',
    order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
    createdAt: row.created_at,
  }));
}

async function createCategory(body) {
  const payload = toCategoryPayload(body);
  if (!payload.name) {
    return { status: 400, body: { success: false, error: 'Nome da categoria é obrigatório.' } };
  }

  const existing = await getTableRow('categories', {
    select: 'id,name,slug,color,active,featured,badge_label,sort_order',
    filters: [{ column: 'slug', value: payload.slug }],
  });

  if (existing) {
    return { status: 409, body: { success: false, error: 'Categoria já existe.' } };
  }

  const [created] = await insertIntoTable('categories', payload);
  return { status: 201, body: { success: true, id: String(created.id) } };
}

async function updateCategory(body) {
  const id = String(body.id || '').trim();
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }

  const existing = await getTableRow('categories', {
    select: 'id,name,slug,color,active,featured,badge_label,sort_order',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) {
    return { status: 404, body: { success: false, error: 'Categoria não encontrada.' } };
  }

  const payload = toCategoryPayload(body, existing);
  if (!payload.name) {
    return { status: 400, body: { success: false, error: 'Nome da categoria é obrigatório.' } };
  }

  await updateTable('categories', { id: `eq.${id}` }, payload);
  return { status: 200, body: { success: true } };
}

async function deleteCategory(id) {
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }

  await deleteFromTable('categories', { id: `eq.${id}` });
  return { status: 200, body: { success: true } };
}

module.exports = async function adminCategoriesHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const handlers = {
      GET: async () => ({ status: 200, body: { success: true, categories: await listCategories() } }),
      POST: async () => createCategory(req.body || {}),
      PUT: async () => updateCategory(req.body || {}),
      DELETE: async () => deleteCategory(String(req.query?.id || req.body?.id || '').trim()),
    };

    const handler = handlers[req.method];
    if (!handler) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const result = await handler();
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Admin categories error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar categorias do admin.',
    });
  }
};
