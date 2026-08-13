// ════════════════════════════════════════════════════════════════════
// REDE DE SEGURANÇA DO EXPRESS DE DESENVOLVIMENTO (regra B3).
//
// ── A DECISÃO ───────────────────────────────────────────────────────
// A regra B3 dizia: "ou o `AppError` vira o mecanismo real de erro, ou sai do
// repositório". A escolha foi a TERCEIRA opção, que só ficou visível depois de
// aplicar a regra A1 — reduzir o escopo dele ao que ele de fato faz, e
// escrever isso.
//
// Adotar `AppError` como o mecanismo de erro dos handlers foi descartado: os 44
// handlers de `api/` são funções serverless publicadas pela Vercel, onde este
// middleware NÃO roda. Um `throw new AppError(...)` num handler viraria um 500
// genérico em produção e um 400 bonito em desenvolvimento — a divergência
// dev/prod que já custou caro neste projeto (ver lib/rate-limit.js). Por isso
// os handlers respondem com `fail()` de lib/http.js, sempre, sem exceção.
//
// Remover também foi descartado: sem este par, um `throw` não tratado numa rota
// do Express de dev devolve a página HTML de stack trace do Express — HTML no
// lugar de JSON, que é exatamente o sintoma que api/notfound.js existe para
// evitar do outro lado.
//
// O que sobrou é o escopo honesto: uma rede que só existe no Express de
// desenvolvimento, para o que ESCAPA do try/catch do handler.
//
// ── O QUE MUDOU COM A REGRA A1 ──────────────────────────────────────
// Este arquivo era o TERCEIRO formato de resposta de erro do projeto — ele
// montava `{ success:false, error:{ message, code } }` à mão. Agora emite pelo
// mesmo `fail()` que os handlers, então dev e produção respondem idêntico. O
// código `REQUEST_ERROR` que ele inventava não existia no catálogo e sumiu.
// ════════════════════════════════════════════════════════════════════

const { AppError } = require('../utils/app-error');
const { ERROR_CODES, fail } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('error.middleware');

function notFoundHandler(req, _res, next) {
  next(
    new AppError(`Rota não encontrada: ${req.originalUrl}`, 404, {
      code: ERROR_CODES.NOT_FOUND,
    }),
  );
}

function errorHandler(error, _req, res, _next) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) {
    log.error('erro_nao_tratado', {
      reason: error?.message || String(error),
      stack: isProduction ? null : error?.stack,
    });
  }

  return fail(res, {
    status: statusCode,
    code: error.code,
    // Mensagem interna nunca vaza em produção: um `throw` que escapou pode
    // carregar nome de tabela/coluna do PostgREST. Fora de produção ela é o
    // valor inteiro deste middleware, então passa.
    message: statusCode >= 500 && isProduction ? 'Erro interno do servidor.' : error.message,
    // `fail()` já descarta `details` em produção — ver lib/http.js.
    details: error.details,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
