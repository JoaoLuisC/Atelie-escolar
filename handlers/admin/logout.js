const { clearSessionCookie, isSameOriginRequest } = require('../../lib/admin-session');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');

module.exports = async function adminLogoutHandler(req, res) {
  setAdminCorsHeaders(req, res);
  // Nenhuma resposta admin vai para o cache do navegador (ADM-01/ADM-41).
  setCachePolicy(res, 'adminReport');

  if (guardMethod(req, res, ['POST'])) return;

  // Defesa anti-CSRF: impede logout forçado por página maliciosa cross-site.
  if (!isSameOriginRequest(req)) {
    return fail(res, {
      status: 403,
      code: ERROR_CODES.FORBIDDEN,
      message: 'Origem nao permitida (possivel CSRF).',
    });
  }

  clearSessionCookie(res);
  return ok(res, { success: true });
};
