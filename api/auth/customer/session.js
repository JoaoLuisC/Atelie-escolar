const { customerSession } = require('../../../lib/customer-auth-handlers');
const { methodNotAllowed, preflight } = require('../../../lib/http');

module.exports = function sessionHandler(req, res) {
  if (req.method === 'OPTIONS') return preflight(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'OPTIONS']);
  return customerSession(req, res);
};
