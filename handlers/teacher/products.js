const { ensureRoleSession, getStaffSession } = require('../../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('../../lib/supabase');
const { parse } = require('../../validation');
const {
  productCreateSchema,
  productPatchSchema,
  uuidId,
} = require('../../validation/admin.schemas');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('teacher-products');

function invalid(message) {
  return { status: 400, code: ERROR_CODES.VALIDATION_FAILED, message };
}

async function categoryExists(categoryId) {
  if (!categoryId) return true;
  return Boolean(
    await getTableRow('categories', {
      select: 'id',
      filters: [{ column: 'id', value: categoryId }],
    }),
  );
}

module.exports = async function teacherProductsHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['POST', 'PATCH'])) return;
  if (!ensureRoleSession(req, res, ['seller'])) return;

  const sellerId = getStaffSession(req)?.userId;
  if (!sellerId) {
    return fail(res, {
      status: 401,
      code: ERROR_CODES.ADMIN_SESSION_INVALID,
      message: 'Faça login novamente para alterar seus produtos.',
    });
  }
  if (!getSupabaseConfig()) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Supabase não configurado.',
    });
  }

  try {
    if (req.method === 'POST') {
      const parsed = parse(productCreateSchema, req.body || {});
      if (!parsed.ok) return fail(res, invalid(parsed.message));
      const categoryId = req.body?.categoryId ? parse(uuidId, req.body.categoryId) : null;
      if (categoryId && !categoryId.ok) return fail(res, invalid('Categoria inválida.'));
      if (categoryId?.data && !(await categoryExists(categoryId.data))) {
        return fail(res, invalid('Categoria não encontrada.'));
      }

      const [product] = await insertIntoTable('products', {
        seller_id: sellerId,
        name: parsed.data.name,
        price: parsed.data.price,
        description: String(req.body?.description || '').trim(),
        download_url: String(req.body?.downloadUrl || '').trim(),
        category_id: categoryId?.data || null,
        active: true,
      });
      return ok(res, { id: String(product.id) }, { status: 201 });
    }

    const parsed = parse(productPatchSchema, req.body || {});
    if (!parsed.ok) return fail(res, invalid(parsed.message));
    const product = await getTableRow('products', {
      select: 'id',
      filters: [
        { column: 'id', value: parsed.data.id },
        { column: 'seller_id', value: sellerId },
      ],
    });
    if (!product) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.PRODUCT_NOT_FOUND,
        message: 'Produto não encontrado.',
      });
    }
    const payload = { updated_at: new Date().toISOString() };
    if (parsed.data.active !== undefined) payload.active = parsed.data.active;
    await updateTable(
      'products',
      { id: 'eq.' + parsed.data.id, seller_id: 'eq.' + sellerId },
      payload,
    );
    return ok(res, {});
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível salvar o produto.',
    });
  }
};
