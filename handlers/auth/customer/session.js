const { customerSession } = require('../../../lib/customer-auth-handlers');
const { guardMethod } = require('../../../lib/http');

module.exports = function sessionHandler(req, res) {
  if (guardMethod(req, res, ['GET'])) return;
  return customerSession(req, res);
};
