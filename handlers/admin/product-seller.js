const { ensureAdminSession } = require('../../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, updateTable },
} = require('../../lib/supabase');
const { parse } = require('../../validation');
const { uuidId } = require('../../validation/admin.schemas');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const { createLogger } = require('../../lib/logger');
const { logAdminAction } = require('../../lib/admin-audit');

const log = createLogger('admin-product-seller');

module.exports = async function adminProductSellerHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['PUT'])) return;
  if (!ensureAdminSession(req, res)) return;

  const productId = parse(uuidId, req.body?.productId);
  const sellerId = parse(uuidId, req.body?.sellerId);
  if (!productId.ok || !sellerId.ok) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Produto e professor válidos são obrigatórios.',
    });
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }
    const [product, seller] = await Promise.all([
      getTableRow('products', { select: 'id', filters: [{ column: 'id', value: productId.data }] }),
      getTableRow('profiles', {
        select: 'id,role',
        filters: [{ column: 'id', value: sellerId.data }],
      }),
    ]);
    if (!product) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.PRODUCT_NOT_FOUND,
        message: 'Produto não encontrado.',
      });
    }
    if (!seller || String(seller.role || '').toLowerCase() !== 'seller') {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Selecione um usuário com perfil de professor.',
      });
    }
    await updateTable(
      'products',
      { id: 'eq.' + productId.data },
      { seller_id: sellerId.data, updated_at: new Date().toISOString() },
    );
    await logAdminAction({
      req,
      action: 'assign_seller',
      targetType: 'product',
      targetId: productId.data,
      after: { sellerId: sellerId.data },
    });
    return ok(res, {});
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível atribuir o produto ao professor.',
    });
  }
};
