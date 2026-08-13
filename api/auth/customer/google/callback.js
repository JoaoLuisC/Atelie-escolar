const { customerGoogleCallback } = require('../../../../lib/customer-auth-handlers');
const { methodNotAllowed, preflight } = require('../../../../lib/http');

module.exports = function callbackHandler(req, res) {
  if (req.method === 'OPTIONS') return preflight(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);
  return customerGoogleCallback(req, res);
};
