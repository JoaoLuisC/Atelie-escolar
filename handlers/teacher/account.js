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
const { enforceRateLimit, resolveIdentifier } = require('../../lib/rate-limit');
const { recordSecurityEvent, extractClientIp } = require('../../lib/security-logger');
const { changeEmail, changePassword } = require('../../lib/staff-account');

// /api/teacher/account — aba "Minha conta" de quem tem sessão de staff
// (professor(a), dona da loja ou admin):
//   GET                                  dados da conta
//   PUT  { displayName }                 troca o nome
//   POST { action: 'change-password', currentPassword, newPassword }
//   POST { action: 'change-email', currentPassword, newEmail }
// As trocas de senha e e-mail pedem a senha atual (lib/staff-account.js).

const log = createLogger('teacher-account');
const MAX_NAME_LENGTH = 80;

// A senha atual é conferida aqui: o mesmo teto do login do painel, por conta
// e por IP, para o endpoint não virar um adivinhador de senha.
const REAUTH_RATE_LIMIT = Object.freeze({
  bucket: 'staff-account-reauth',
  limit: 5,
  windowSeconds: 10 * 60,
  message: 'Muitas tentativas. Aguarde 10 minutos e tente novamente.',
});

async function handleSensitiveChange(req, res, session) {
  const action = String(req.body?.action || '');
  if (!['change-password', 'change-email'].includes(action)) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Ação inválida.',
    });
  }
  const gate = await enforceRateLimit(req, res, {
    ...REAUTH_RATE_LIMIT,
    identifier: `${resolveIdentifier(req)}|${session.userId}`,
  });
  if (gate.blocked) return undefined;

  try {
    let body = {};
    if (action === 'change-password') {
      await changePassword(session.userId, req.body || {});
    } else {
      const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
      body = await changeEmail(session.userId, req.body || {}, {
        redirectTo: appUrl ? `${appUrl}/admin` : undefined,
      });
    }
    await recordSecurityEvent({
      eventName:
        action === 'change-password' ? 'staff_password_changed' : 'staff_email_change_requested',
      severity: 'info',
      ip: extractClientIp(req),
      userAgent: req.headers?.['user-agent'],
      properties: { user_id: session.userId },
    });
    await logAdminAction({
      req,
      action: action.replace('-', '_'),
      targetType: 'profile',
      targetId: session.userId,
      after: action === 'change-email' ? { pendingEmail: body.pendingEmail } : null,
    });
    return ok(res, body);
  } catch (error) {
    if (error?.status && error.status < 500) {
      if (error.reauthFailed) {
        await recordSecurityEvent({
          eventName: 'staff_reauth_failed',
          severity: 'warn',
          ip: extractClientIp(req),
          userAgent: req.headers?.['user-agent'],
          properties: { user_id: session.userId, action },
        });
      }
      return fail(res, {
        status: error.status,
        code:
          { 404: ERROR_CODES.NOT_FOUND, 409: ERROR_CODES.CONFLICT }[error.status] ||
          ERROR_CODES.VALIDATION_FAILED,
        message: error.message,
      });
    }
    throw error;
  }
}

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
  if (guardMethod(req, res, ['GET', 'PUT', 'POST'])) return;
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

    if (req.method === 'POST') return await handleSensitiveChange(req, res, session);

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
