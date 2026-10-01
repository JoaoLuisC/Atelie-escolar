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

function categoryConflict() {
  return { error: { status: 409, code: ERROR_CODES.CONFLICT, message: 'Categoria já existe.' } };
}

/** Violação de unicidade do Postgres (23505), vinda pelo PostgREST como 409. */
function isUniqueViolation(error) {
  return (
    error?.statusCode === 409 ||
    error?.details?.code === '23505' ||
    /duplicate key value/i.test(String(error?.message || ''))
  );
}

async function updateCategory(body) {
  const parsedId = parse(uuidId, body.id);
  if (!parsedId.ok) return invalid('id é obrigatório.');
  const id = parsedId.data;

  const existing = await getTableRow('categories', {
    select: SELECT_FIELDS,
    filters: [{ column: 'id', value: id }],
  });

  // CROSS-12: as categorias-fantasma (nome = UUID, criadas pela rota de
  // produtos antes da correção do ADM-22) não podiam nem ser DESATIVADAS — o
  // wizard reenvia o nome, e a validação recusava o nome que o próprio
  // servidor tinha criado. Nome igual ao gravado não é edição de nome: não
  // passa pela validação de nome. Renomear continua validado normalmente.
  const sameName =
    existing && typeof body.name === 'string' && body.name.trim() === String(existing.name);
  const parsed = parse(categoryUpdateSchema, sameName ? { ...body, name: undefined } : body);
  if (!parsed.ok) return invalid(parsed.message);

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

  const row = toCategoryRow(parsed.data, existing);

  // ADM-26: renomear para o nome de OUTRA categoria batia no índice único de
  // `slug` e virava 500 "Erro ao processar categorias". O POST já respondia
  // 409; o PUT agora confere antes e, se a corrida passar da conferência,
  // traduz a violação de unicidade no mesmo 409.
  if (row.slug !== existing.slug) {
    const clash = await getTableRow('categories', {
      select: 'id',
      filters: [{ column: 'slug', value: row.slug }],
    });
    if (clash && String(clash.id) !== String(id)) return categoryConflict();
  }

  try {
    await updateTable('categories', { id: `eq.${id}` }, row);
  } catch (error) {
    if (isUniqueViolation(error)) return categoryConflict();
    throw error;
  }
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
