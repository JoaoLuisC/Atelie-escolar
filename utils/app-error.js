// ════════════════════════════════════════════════════════════════════
// Erro com status HTTP, para o middleware de erro do Express (regra B3).
//
// ── ESCOPO, E POR QUE ELE É TÃO ESTREITO ────────────────────────────
// Esta classe existe para um caso só: carregar `statusCode` de um ponto do
// Express até `middleware/error.middleware.js`, que é a rede que impede um
// `throw` não tratado de virar página HTML de stack trace. Hoje o único emissor
// é o `notFoundHandler`.
//
// NÃO use nos handlers. O mesmo app Express serve dev e produção (ADR 0002),
// mas o contrato do handler é responder com `fail()` de `lib/http.js` — o
// envelope e o `code` estável (regras A1/A2) —, nunca lançar e torcer para a
// rede de segurança acertar o status.
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
