const {
  clearSessionCookie,
  isSameOriginRequest,
  setAdminCorsHeaders,
} = require('../../lib/admin-session');
const { ERROR_CODES, fail, methodNotAllowed, ok, preflight } = require('../../lib/http');

module.exports = async function adminLogoutHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST', 'OPTIONS']);
  }

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
