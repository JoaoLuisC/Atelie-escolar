const { ERROR_CODES, fail } = require('../lib/http');
// Fallback para caminhos /api/* que não têm função na Vercel. Sem isto, o
// catch-all do vercel.json devolveria o index.html (HTML, HTTP 200) para uma
// rota de API inexistente, mascarando erros de roteamento. Aqui devolvemos um
// 404 JSON, alinhado ao notFoundHandler do Express (paridade).
//
// O NOME DO ARQUIVO É PARTE DA CORREÇÃO — não renomeie de volta para
// `_notfound.js`. Sob zero-config (o vercel.json deixou de usar `builds` e
// passou a `buildCommand` + `functions`), a Vercel NÃO publica como função
// nenhum arquivo de api/ prefixado com underscore: o `_` é justamente a
// convenção para colocar helper ao lado dos handlers sem expô-lo. Com o
// underscore, o `dest` desta rota não resolvia, o roteamento caía na regra
// seguinte (`/(.*)` → `/index.html`) e TODA rota /api/* inexistente passava a
// responder 200 com o HTML do SPA — que é exatamente o sintoma que este
// arquivo existe para evitar, e o mais difícil de diagnosticar (o front recebe
// 200 e quebra no JSON.parse, sem nada no log dizendo "rota errada").
// Consequência aceita: `/api/notfound` vira um endpoint público de verdade.
// Ele só devolve 404 JSON, então não há o que proteger.

// Nome do handler = nome do arquivo em camelCase + `Handler` (regra A5): é ele
// que aparece no stack trace da Vercel, e `handler` genérico deixa oito
// arquivos com frames indistinguíveis.
module.exports = function notFoundHandler(req, res) {
  return fail(res, {
    status: 404,
    code: ERROR_CODES.NOT_FOUND,
    message: 'Recurso não encontrado.',
  });
};
