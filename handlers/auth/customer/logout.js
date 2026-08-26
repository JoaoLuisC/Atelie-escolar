const { customerLogout } = require('../../../lib/customer-auth-handlers');
const { isSameOriginRequest } = require('../../../lib/admin-session');
const { ERROR_CODES, fail, guardMethod } = require('../../../lib/http');

module.exports = function logoutHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // Defesa anti-CSRF: impede logout forçado por página maliciosa cross-site
  // (consistente com api/admin-logout.js).
  if (!isSameOriginRequest(req)) {
    return fail(res, {
      status: 403,
      code: ERROR_CODES.FORBIDDEN,
      message: 'Origem não permitida (possível CSRF).',
    });
  }

  return customerLogout(req, res);
};
