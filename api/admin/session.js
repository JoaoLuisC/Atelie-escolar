const { hasValidAdminSession } = require('../../lib/admin-session');
const { methodNotAllowed, ok, preflight, setAdminCorsHeaders } = require('../../lib/http');

module.exports = async function adminSessionHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET', 'OPTIONS']);
  }

  const authenticated = hasValidAdminSession(req);
  return ok(res, {
    success: true,
    authenticated,
  });
};
