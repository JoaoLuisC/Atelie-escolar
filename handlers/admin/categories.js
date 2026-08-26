const { createAdminResourceHandler } = require('../../lib/admin-resource-handler');
const { ERROR_CODES } = require('../../lib/http');
const {
  serviceRoleHelpers: { deleteFromTable, getTableRow, insertIntoTable, listTableRows, updateTable },
} = require('../../lib/supabase');
const { parse } = require('../../validation');
const {
  categoryCreateSchema,
  categoryUpdateSchema,
  normalizeSlug,
  uuidId,
} = require('../../validation/admin.schemas');

const SELECT_FIELDS = 'id,name,slug,color,active,featured,badge_label,sort_order,created_at';

/** Erro de validação no formato que a factory despacha por `fail()`. */
function invalid(message) {
  return { error: { status: 400, code: ERROR_CODES.VALIDATION_FAILED, message } };
}

/**
 * Monta a linha a persistir a partir do payload já validado.
 *
 * O schema garante o formato; aqui só se decide o que é herdado da linha
 * existente num PUT parcial — que é regra de negócio, não validação.
 */
function toCategoryRow(data, existing = {}) {
  const name = data.name ?? existing.name ?? '';

  return {
    name,
    slug: normalizeSlug(name),
    color: data.color ?? existing.color ?? '#9B5DE5',
    active: data.active ?? existing.active !== false,
    featured: data.featured ?? existing.featured === true,
    badge_label: String(existing.badge_label ?? '').trim(),
    sort_order: Number.isFinite(Number(existing.sort_order)) ? Number(existing.sort_order) : 0,
  };
}

async function listCategories() {
  const rows = await listTableRows('categories', {
    select: SELECT_FIELDS,
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
  const parsed = parse(categoryCreateSchema, body);
  if (!parsed.ok) return invalid(parsed.message);

  const payload = toCategoryRow(parsed.data);

  const existing = await getTableRow('categories', {
    select: 'id',
    filters: [{ column: 'slug', value: payload.slug }],
  });

  if (existing) {
    return { error: { status: 409, code: ERROR_CODES.CONFLICT, message: 'Categoria já existe.' } };
  }

  const [created] = await insertIntoTable('categories', payload);
  return { status: 201, body: { id: String(created.id) } };
}

async function updateCategory(body) {
  const parsed = parse(categoryUpdateSchema, body);
  if (!parsed.ok) return invalid(parsed.message);

  const { id } = parsed.data;

  const existing = await getTableRow('categories', {
    select: SELECT_FIELDS,
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) {
    return {
      error: {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Categoria não encontrada.',
      },
    };
  }

  // O nome é obrigatório no PUT do mesmo jeito que era antes: o schema o
  // aceita ausente para permitir edição parcial de cor/flags, e é a linha
  // existente que preenche a lacuna.
  if (!parsed.data.name && !existing.name) {
    return invalid('Nome da categoria é obrigatório.');
  }

  await updateTable('categories', { id: `eq.${id}` }, toCategoryRow(parsed.data, existing));
  return { status: 200, body: {} };
}

async function deleteCategory(rawId) {
  const parsed = parse(uuidId, rawId);
  if (!parsed.ok) return invalid('id é obrigatório.');

  await deleteFromTable('categories', { id: `eq.${parsed.data}` });
  return { status: 200, body: {} };
}

module.exports = createAdminResourceHandler({
  targetType: 'category',
  errorMessage: 'Erro ao processar categorias do admin.',
  loggerName: 'admin-categories',
  handlerName: 'adminCategoriesHandler',
  operations: {
    GET: async () => ({ status: 200, body: { categories: await listCategories() } }),
    POST: (req) => createCategory(req.body || {}),
    PUT: (req) => updateCategory(req.body || {}),
    DELETE: (req) => deleteCategory(String(req.query?.id || req.body?.id || '').trim()),
  },
});
