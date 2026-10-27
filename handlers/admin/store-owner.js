const { ensureAdminSession } = require('../../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
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
const { SETTING_KEY, getStoreOwnerId } = require('../../lib/store-owner');

// GET/PUT /api/admin/store-owner — qual professora administra a loja
// (lib/store-owner.js). Só admin: é ele quem entrega o painel da loja.

const log = createLogger('admin-store-owner');

module.exports = async function adminStoreOwnerHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['GET', 'PUT'])) return;
  if (!ensureAdminSession(req, res)) return;

  if (!getSupabaseConfig()) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Supabase não configurado.',
    });
  }

  try {
    if (req.method === 'GET') {
      return ok(res, { sellerId: await getStoreOwnerId() });
    }

    const sellerId = parse(uuidId, req.body?.sellerId);
    if (!sellerId.ok) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Selecione um professor válido.',
      });
    }
    const seller = await getTableRow('profiles', {
      select: 'id,role',
      filters: [{ column: 'id', value: sellerId.data }],
    });
    if (!seller || String(seller.role || '').toLowerCase() !== 'seller') {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'A dona da loja precisa ter perfil de professor(a).',
      });
    }

    const before = await getStoreOwnerId();
    const payload = { setting_key: SETTING_KEY, setting_value: { sellerId: sellerId.data } };
    const existing = await getTableRow('settings', {
      select: 'setting_key',
      filters: [{ column: 'setting_key', value: SETTING_KEY }],
    });
    if (existing) {
      await updateTable('settings', { setting_key: `eq.${SETTING_KEY}` }, payload);
    } else {
      await insertIntoTable('settings', payload);
    }

    await logAdminAction({
      req,
      action: 'set_store_owner',
      targetType: 'settings',
      targetId: SETTING_KEY,
      before: { sellerId: before },
      after: { sellerId: sellerId.data },
    });
    return ok(res, { sellerId: sellerId.data });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível salvar a dona da loja.',
    });
  }
};
