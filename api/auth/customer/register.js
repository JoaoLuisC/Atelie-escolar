const { customerRegister } = require('../../../lib/customer-auth-handlers');
const { guardMethod } = require('../../../lib/http');
const { enforceRateLimit, RATE_LIMITS } = require('../../../lib/rate-limit');

module.exports = async function registerHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // Rate limit DEPOIS do 405 (requisição rejeitada por método não faz trabalho
  // nenhum, então cobrá-la custaria uma escrita no Postgres sem proteger nada)
  // e ANTES de qualquer trabalho caro — a ordem que a regra A3 fixa.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.customerRegister);
  if (gate.blocked) return;

  return customerRegister(req, res);
};
