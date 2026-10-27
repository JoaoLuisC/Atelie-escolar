const { ensureStaffSession, getStaffSession } = require('../../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, updateTable },
} = require('../../lib/supabase');
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

// GET/PUT /api/teacher/account — aba "Minha conta" de quem tem sessão de
// staff (professor(a), dona da loja ou admin). Só o NOME é editável aqui:
// e-mail é a identidade do login (troca passa pelo Supabase Auth, com
// confirmação) e a senha se troca pelo link de redefinição.

const log = createLogger('teacher-account');
const MAX_NAME_LENGTH = 80;

function toAccount(profile, session) {
  return {
    email: profile?.email || session.email || '',
    displayName: profile?.display_name || '',
    role: session.role,
    storeOwner: session.storeOwner === true,
    provider: profile?.provider || 'email',
    createdAt: profile?.created_at || null,
  };
}

module.exports = async function teacherAccountHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['GET', 'PUT'])) return;
  if (!ensureStaffSession(req, res)) return;

  const session = getStaffSession(req);
  if (!session?.userId) {
    return fail(res, {
      status: 401,
      code: ERROR_CODES.ADMIN_SESSION_INVALID,
      message: 'Faça login novamente para ver sua conta.',
    });
  }
  if (!getSupabaseConfig()) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Supabase não configurado.',
    });
  }

  const select = 'id,email,display_name,provider,created_at';
  const byId = [{ column: 'id', value: session.userId }];

  try {
    if (req.method === 'GET') {
      const profile = await getTableRow('profiles', { select, filters: byId });
      return ok(res, { account: toAccount(profile, session) });
    }

    const displayName = String(req.body?.displayName ?? '')
      .replaceAll(/\s+/g, ' ')
      .trim();
    if (!displayName || displayName.length > MAX_NAME_LENGTH) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: `Informe um nome de até ${MAX_NAME_LENGTH} caracteres.`,
      });
    }

    const before = await getTableRow('profiles', { select, filters: byId });
    await updateTable(
      'profiles',
      { id: `eq.${session.userId}` },
      { display_name: displayName, updated_at: new Date().toISOString() },
    );
    await logAdminAction({
      req,
      action: 'update_own_account',
      targetType: 'profile',
      targetId: session.userId,
      before: { displayName: before?.display_name || '' },
      after: { displayName },
    });
    return ok(res, { account: toAccount({ ...before, display_name: displayName }, session) });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível carregar ou salvar sua conta.',
    });
  }
};
