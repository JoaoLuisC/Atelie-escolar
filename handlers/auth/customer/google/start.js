const { customerGoogleStart } = require('../../../../lib/customer-auth-handlers');
const { guardMethod } = require('../../../../lib/http');
const { enforceRateLimit, RATE_LIMITS } = require('../../../../lib/rate-limit');

module.exports = async function startHandler(req, res) {
  if (guardMethod(req, res, ['GET'])) return;

  // Rate limit DEPOIS do 405 (requisição rejeitada por método não faz trabalho
  // nenhum, então cobrá-la custaria uma escrita no Postgres sem proteger nada)
  // e ANTES de qualquer trabalho caro — a ordem que a regra A3 fixa.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.customerGoogleStart);
  if (gate.blocked) return;

  return customerGoogleStart(req, res);
};
