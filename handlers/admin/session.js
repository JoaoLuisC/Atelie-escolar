const { hasValidAdminSession } = require('../../lib/admin-session');
const { guardMethod, ok, setAdminCorsHeaders } = require('../../lib/http');

module.exports = async function adminSessionHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (guardMethod(req, res, ['GET'])) return;

  const authenticated = hasValidAdminSession(req);
  return ok(res, {
    success: true,
    authenticated,
  });
};
