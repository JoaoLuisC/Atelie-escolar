// ════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE ENTRADA NA BORDA — porta única (regras B1 e B2).
//
// ── POR QUE ESTA PASTA VOLTOU A EXISTIR ─────────────────────────────
// `zod` era dependência de PRODUÇÃO deste projeto com ZERO imports. A pasta
// `validation/` que hospedava os schemas tinha sido apagada, mas continuava
// citada em três configurações — o script `format` do package.json, o
// `NODE_FILES` do eslint.config.js e o `coverage.include` do vite.config.js,
// este último medindo cobertura de um diretório vazio.
//
// Pior que a referência morta: `handlers/create-payment.js` documentava, num
// comentário, que "os `max()` do zod em validation/payment.schemas.js NUNCA
// valeram neste caminho" — o schema antigo só era aplicado por um middleware
// do Express de desenvolvimento, que não é implantado. Ou seja, o projeto
// acreditava ter validação declarativa e tinha coerção manual espalhada.
//
// ── O QUE MUDOU EM RELAÇÃO AO SCHEMA ANTIGO ─────────────────────────
// Nada nos LIMITES. Os tetos aqui replicam exatamente os que os handlers já
// aplicavam à mão (MAX_NAME_LENGTH 120, e-mail 254 do RFC 5321, quantidade
// 1..99, 100 itens por carrinho). A regra B1 é sobre ONDE a validação
// acontece, não sobre endurecer o contrato — mudar as duas coisas de uma vez
// tornaria impossível saber qual delas quebrou um checkout legítimo.
//
// O que muda é o caminho: o schema roda ANTES da primeira linha de lógica, no
// handler que a Vercel realmente publica, e o handler passa a confiar no tipo
// (regra B2) em vez de reaplicar `Number(x || 0)` no meio do cálculo.
// ════════════════════════════════════════════════════════════════════

const { ERROR_CODES, fail } = require('../lib/http');

/**
 * Converte os issues do zod num array enxuto `{ path, message }`.
 *
 * Só é emitido fora de produção — `lib/http.js:fail` descarta `details` quando
 * NODE_ENV === 'production', porque nomear campos internos e ecoar o valor
 * recebido ajuda quem sonda a API, não o cliente (que já tem a mensagem).
 */
function toDetails(error) {
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  return issues.slice(0, 10).map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? ''),
    message: String(issue.message || ''),
  }));
}

/**
 * Primeira mensagem legível do erro, para virar o `message` da resposta.
 *
 * A primeira e não todas: a tela do checkout mostra UMA mensagem, e concatenar
 * cinco erros produz um parágrafo que ninguém lê. O conjunto completo continua
 * disponível em `details` fora de produção.
 */
function firstMessage(error, fallback) {
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  for (const issue of issues) {
    const message = String(issue?.message || '').trim();
    if (message) return message;
  }
  return fallback;
}

/**
 * Valida `input` contra `schema` e, em caso de falha, JÁ RESPONDE 400.
 *
 * Segue o mesmo idioma de `enforceRateLimit` (`if (gate.blocked) return;`), que
 * é o que permite manter a ordem fixa da regra A3 legível no topo do handler.
 *
 * @param {object} res
 * @param {import('zod').ZodType} schema
 * @param {unknown} input
 * @param {object}  [options]
 * @param {string}  [options.message]  sobrescreve a mensagem do zod
 * @param {string}  [options.code]     sobrescreve VALIDATION_FAILED
 * @param {number}  [options.status=400]
 * @returns {{ ok: true, data: any } | { ok: false }}
 *
 * @example
 *   const parsed = parseOrFail(res, createPaymentSchema, req.body);
 *   if (!parsed.ok) return;
 *   const { items, customer } = parsed.data;
 */
function parseOrFail(res, schema, input, options = {}) {
  const result = schema.safeParse(input);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  fail(res, {
    status: Number.isInteger(options.status) ? options.status : 400,
    code: options.code || ERROR_CODES.VALIDATION_FAILED,
    message: options.message || firstMessage(result.error, 'Requisição inválida.'),
    details: toDetails(result.error),
  });

  return { ok: false };
}

/**
 * Variante que NÃO responde — para quem precisa do resultado antes de decidir
 * o status (ex.: um 404 em vez de 400 quando o identificador é bem formado mas
 * não existe).
 */
function parse(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    message: firstMessage(result.error, 'Requisição inválida.'),
    details: toDetails(result.error),
  };
}

module.exports = {
  parse,
  parseOrFail,
};
