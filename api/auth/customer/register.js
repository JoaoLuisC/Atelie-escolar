const { customerRegister } = require('../../../lib/customer-auth-handlers');
const { methodNotAllowed, preflight } = require('../../../lib/http');

module.exports = function registerHandler(req, res) {
  if (req.method === 'OPTIONS') return preflight(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);
  return customerRegister(req, res);
};
