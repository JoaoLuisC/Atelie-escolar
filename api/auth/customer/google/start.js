const { customerGoogleStart } = require('../../../../lib/customer-auth-handlers');
const { methodNotAllowed, preflight } = require('../../../../lib/http');

module.exports = function startHandler(req, res) {
  if (req.method === 'OPTIONS') return preflight(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'OPTIONS']);
  return customerGoogleStart(req, res);
};
