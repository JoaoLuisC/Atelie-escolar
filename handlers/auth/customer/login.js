const { customerLogin } = require('../../../lib/customer-auth-handlers');
const { enforceRateLimit, RATE_LIMITS } = require('../../../lib/rate-limit');
const { guardMethod } = require('../../../lib/http');

// Login de CLIENTE por senha. Ver RATE_LIMITS.customerLogin para o desenho dos
// dois baldes (por conta e por conexão) e por que um teto por IP puro erraria
// nos dois sentidos.
//
// ESTE MÓDULO PRECISA ESTAR MONTADO PARA VALER DE ALGUMA COISA. A guarda mora
// aqui, não em lib/customer-auth-handlers — e já houve uma janela
// (660fe74..244226c) em que routes/auth.routes.js importava a lógica crua de
// lá e este arquivo virou código morto, deixando o login de cliente sem
// contador nenhum em produção. O teste de paridade compara identidade de
// módulo justamente para que isso falhe em vez de passar em silêncio.
module.exports = async function loginHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // Depois do 405 (uma requisição rejeitada por método não faz trabalho nenhum,
  // então cobrá-la custaria uma escrita no Postgres sem proteger nada) e ANTES
  // de qualquer chamada ao Supabase Auth, que é o recurso caro sob ataque.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.customerLogin);
  if (gate.blocked) return;

  return customerLogin(req, res);
};
