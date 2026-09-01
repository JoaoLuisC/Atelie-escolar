// ════════════════════════════════════════════════════════════════════
// A ÚNICA Serverless Function do projeto.
//
// POR QUE UMA SÓ
// O plano Hobby publica no máximo 12 funções por deployment e o projeto tem
// 44 handlers — o primeiro deploy real morreu exatamente nesse teto. Os
// handlers moraram para `handlers/` (fora de `api/`, senão a Vercel os
// publicaria como função de novo) e este arquivo serve todos eles através do
// mesmo app Express que o `server.js` usa em desenvolvimento. Ver
// `lib/express-app.js` para o que isso preserva do ADR 0002.
//
// POR QUE `__path`
// Uma rota do `vercel.json` com `dest` REESCREVE o caminho: uma requisição a
// `/api/products` chega aqui com `req.url === '/api/index'`, e o Express não
// teria como saber qual endpoint era. Por isso o `vercel.json` manda o
// caminho original no parâmetro `__path` (`dest: "/api/index?__path=$1"`) e
// aqui ele é remontado antes de o app ver a requisição. A query original é
// preservada: a Vercel a concatena ao destino, e só o `__path` é removido.
// ════════════════════════════════════════════════════════════════════

const { createApiApp } = require('../lib/express-app');
const { errorHandler } = require('../middleware/error.middleware');

const RUNTIME_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'production')
  .trim()
  .toLowerCase();

// Fora do handler de propósito: em serverless o módulo é avaliado uma vez por
// instância e reaproveitado entre invocações. Montar o app por requisição
// pagaria o custo de `require` das 44 rotas em todo request.
const app = createApiApp({ runtimeEnv: RUNTIME_ENV });
app.use(errorHandler);

function restoreOriginalPath(req) {
  const bruto = String(req.url || '/');
  const corte = bruto.indexOf('?');
  const query = corte === -1 ? '' : bruto.slice(corte + 1);

  const params = new URLSearchParams(query);
  const valores = params.getAll('__path');

  // Sem `__path`: ou a requisição chegou pelo caminho real (invocação direta
  // da função, teste local), ou a rota do vercel.json mudou. Nos dois casos o
  // certo é não mexer — o app decide, e um 404 do notFoundHandler é uma
  // resposta honesta.
  if (valores.length === 0) return;

  // MAIS DE UM `__path`: um veio da borda e o outro do cliente.
  //
  // A Vercel concatena a query ORIGINAL à query do `dest`, e a ordem dessa
  // concatenação não é contrato publicado. Ou seja, num pedido a
  // `/api/validate-coupon?__path=download` chegam aqui os dois valores, e
  // `get()` devolve o primeiro — que pode ser o do cliente. O efeito medido
  // em api/__tests__/serverless-entry.test.js: a URL roteada pela borda e o
  // handler executado deixam de ser a mesma coisa.
  //
  // Não é escalada de privilégio — cada handler impõe a própria guarda, e
  // `/api/products?__path=admin/orders` continua esbarrando em
  // `ensureAdminSession`. O que se perde é a correspondência entre log de
  // acesso e código executado, que é justamente o que alguém vai querer na
  // hora de investigar um incidente no caminho do dinheiro.
  //
  // Escolher um dos dois valores seria apostar em qual lado a Vercel
  // concatena. Aqui a requisição simplesmente não é roteada: a URL fica
  // `/api/index`, cai no notFoundHandler e recebe 404 no envelope da regra
  // A1. Nenhum chamador legítimo manda `__path` — ele é transporte da borda.
  if (valores.length > 1) return;

  const original = valores[0];

  params.delete('__path');
  const resto = params.toString();
  const caminho = original.startsWith('/') ? original : `/${original}`;

  req.url = `/api${caminho === '/' ? '' : caminho}${resto ? `?${resto}` : ''}`;
}

module.exports = (req, res) => {
  restoreOriginalPath(req);
  return app(req, res);
};
