// ════════════════════════════════════════════════════════════════════
// LOGIN DE PROFESSOR(A) COM GOOGLE — POST /api/admin/login-google
//
// O front faz o OAuth do Google pelo Supabase (PKCE, o mesmo do cliente) e
// manda o `access_token` para cá. O token é conferido NO Supabase (nunca
// decodificado localmente), o papel vem de `profiles` pelo id do usuário e,
// se for professor(a), sai o mesmo cookie `admin_session` do login por senha.
//
// SÓ PROFESSOR(A), DE PROPÓSITO. Admin/master têm 2º fator (TOTP, e-mail, PIN)
// e o Google pularia essa etapa: um Gmail comprometido abriria o painel da
// plataforma. O professor não tem 2º fator hoje, então o Google não abre
// nada que a senha já não abrisse — e os dados vêm recortados pelo próprio
// `seller_id` (lib/seller-scope.js). Admin com Google exigiria o 2º fator
// depois do OAuth.
//
// Conta Google sem perfil de professor (cliente, ou conta recém-criada pelo
// próprio OAuth) recebe 401. A pessoa já provou ser a dona da conta Google,
// então a mensagem diz o motivo em vez de imitar "senha errada".
// ════════════════════════════════════════════════════════════════════

const { recordSecurityEvent, extractClientIp } = require('../../lib/security-logger');
const { setSessionCookie } = require('../../lib/admin-session');
const { getAnonClient, getProfileRoleByUserId } = require('../../services/supabase-auth');
const { enforceRateLimit, RATE_LIMITS } = require('../../lib/rate-limit');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const { createLogger } = require('../../lib/logger');
const { isStoreOwner } = require('../../lib/store-owner');

const log = createLogger('admin-login-google');

async function rejectLogin(req, res, { status, code, message, reason, role }) {
  await recordSecurityEvent({
    eventName: 'admin_login_failed',
    severity: 'warn',
    ip: extractClientIp(req),
    userAgent: req.headers['user-agent'],
    properties: { reason, method: 'google', ...(role ? { role } : {}) },
  });
  return fail(res, { status, code, message });
}

module.exports = async function adminLoginGoogleHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['POST'])) return;

  const gate = await enforceRateLimit(req, res, RATE_LIMITS.staffGoogleLogin);
  if (gate.blocked) return;

  const accessToken = String(req.body?.accessToken || '').trim();
  if (!accessToken) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Login com Google incompleto. Tente de novo.',
    });
  }

  const supabase = getAnonClient();
  if (!supabase) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Configuração do Supabase indisponível no servidor.',
    });
  }

  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    const user = data?.user;
    if (error || !user?.id) {
      return rejectLogin(req, res, {
        status: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Não foi possível confirmar sua conta Google. Tente de novo.',
        reason: 'invalid_google_token',
      });
    }

    const role = String((await getProfileRoleByUserId(user.id)) || '')
      .trim()
      .toLowerCase();

    if (role === 'admin' || role === 'master') {
      return rejectLogin(req, res, {
        status: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'Contas de administração entram com e-mail, senha e código de verificação.',
        reason: 'google_admin_blocked',
        role,
      });
    }

    if (role !== 'seller') {
      return rejectLogin(req, res, {
        status: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message:
          'Esta conta Google não está cadastrada como professor(a). Se você é cliente, use "Sou cliente".',
        reason: 'non_seller_role',
        role: role || 'none',
      });
    }

    const email = String(user.email || '').toLowerCase();
    const storeOwner = await isStoreOwner({ role, userId: user.id });
    setSessionCookie(res, { email, role, userId: user.id, storeOwner });
    return ok(res, { success: true, user: { role, email, storeOwner } });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao concluir o login com Google.',
    });
  }
};
