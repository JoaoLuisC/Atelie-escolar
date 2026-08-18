const { customerLogin } = require('../../../lib/customer-auth-handlers');
const { enforceRateLimit, RATE_LIMITS } = require('../../../lib/rate-limit');
const { guardMethod } = require('../../../lib/http');

// Login de CLIENTE por senha, sem nenhum contador em produção até aqui: o
// limiter de 5/10min citado em docs/SECURITY.md vive em routes/auth.routes.js,
// que só roda no Express de desenvolvimento. Na Vercel cada função é isolada e
// aquele arquivo nem é implantado — ou seja, a única porta de senha do cliente
// aceitava tentativas ilimitadas enquanto /api/admin-login já estava contido.
// Ver RATE_LIMITS.customerLogin para o desenho dos dois baldes (por conta e por
// conexão) e por que um teto por IP puro erraria nos dois sentidos.
module.exports = async function loginHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // Depois do 405 (uma requisição rejeitada por método não faz trabalho nenhum,
  // então cobrá-la custaria uma escrita no Postgres sem proteger nada) e ANTES
  // de qualquer chamada ao Supabase Auth, que é o recurso caro sob ataque.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.customerLogin);
  if (gate.blocked) return;

  return customerLogin(req, res);
};
