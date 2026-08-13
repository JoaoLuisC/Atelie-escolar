// ════════════════════════════════════════════════════════════════════
// Erro com status HTTP, para o Express de DESENVOLVIMENTO (regra B3).
//
// ── ESCOPO, E POR QUE ELE É TÃO ESTREITO ────────────────────────────
// Esta classe existe para um caso só: carregar `statusCode` de um ponto do
// Express até `middleware/error.middleware.js`, que é a rede que impede um
// `throw` não tratado de virar página HTML de stack trace. Hoje o único emissor
// é o `notFoundHandler`.
//
// NÃO use em `api/*.js`. Aqueles módulos são publicados pela Vercel como
// funções isoladas, onde o middleware do Express não roda: um `throw new
// AppError(..., 400)` ali produziria 400 em desenvolvimento e 500 genérico em
// produção. Handler responde com `fail()` de `lib/http.js`, sempre.
//
// A regra B3 existia porque este arquivo estava instalado e não usado, o que é
// pior que ausente — quem lia o código acreditava numa política central de erro
// que não existia. A correção não foi espalhar o uso, foi delimitar e escrever.
// ════════════════════════════════════════════════════════════════════

class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {object} [options]
   * @param {string} [options.code]     SCREAMING_SNAKE do catálogo em lib/http.js
   * @param {object} [options.details]  contexto; só emitido fora de produção
   */
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = options.details;
    this.code = options.code;
  }
}

module.exports = {
  AppError,
};
