// ════════════════════════════════════════════════════════════════════
// FACTORY DOS RECURSOS CRUD DO ADMIN — §3.1 do doc de otimização.
//
// ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────
// `api/admin/{products,categories,coupons,orders,users}.js` terminavam com o
// MESMO bloco de ~55 linhas, replicado caractere por caractere — inclusive o
// comentário `// Auditoria de escrita (regra I1) — best-effort.` e o mapa
// `actionByMethod`. Diferiam em exatamente três coisas: o `targetType` da
// auditoria, a chave do recurso na resposta e a mensagem do catch.
//
// E o problema não é contagem de linhas. É que existiam CINCO lugares onde a
// auditoria de escrita podia ser esquecida no próximo recurso admin, e nenhum
// teste pegava. A regra I1 dependia de alguém lembrar de copiar o bloco certo.
//
// ── O QUE ISTO FECHA DE GRAÇA ───────────────────────────────────────
// • Regra A1/A2 (itens P1.2 e §3.2): as operações devolvem `{ status, body }`
//   no sucesso e `{ error: { status, code, message } }` na falha, e o despacho
//   passa por `ok()`/`fail()`. Antes cada operação montava o corpo à mão e o
//   wrapper fazia `res.status(result.status).json(result.body)`, driblando o
//   `fail()` — 31 sites, dos quais os 6 de `products.js` nem `success: false`
//   traziam.
// • Regra A3 (item P2.1): `guardMethod` no lugar do par `OPTIONS`/405 manual.
// • O header `Allow` do 405 sai do PRÓPRIO mapa de operações, então ele não
//   tem como divergir do que o handler realmente aceita — cada arquivo
//   repetia a lista à mão, e bastava alguém acrescentar um método e esquecer.
// ════════════════════════════════════════════════════════════════════

const { ensureAdminSession, setAdminCorsHeaders } = require('./admin-session');
const { logAdminAction } = require('./admin-audit');
const { ERROR_CODES, fail, guardMethod, ok } = require('./http');
const { createLogger } = require('./logger');
const { getSupabaseConfig } = require('./supabase');

const ACTION_BY_METHOD = Object.freeze({
  POST: 'create',
  PUT: 'update',
  PATCH: 'patch',
  DELETE: 'delete',
});

/** Identificador do alvo da auditoria, com a mesma regra dos cinco handlers. */
function resolveTargetId(req, result) {
  if (req.method === 'DELETE') {
    return String(req.query?.id || req.body?.id || '').trim();
  }
  return req.body?.id ?? result?.body?.id ?? null;
}

/**
 * Monta o handler de um recurso CRUD administrativo.
 *
 * @param {object}   config
 * @param {string}   config.targetType     tipo do alvo na trilha de auditoria
 *                                         ('product', 'category', 'coupon'…)
 * @param {string}   config.errorMessage   mensagem do 500 do catch
 * @param {string}   config.loggerName     nome do logger (regra F1)
 * @param {string}   config.handlerName    nome da função exportada (regra A5):
 *                                         é ele que aparece no stack trace da
 *                                         Vercel, e `handler` genérico deixa
 *                                         cinco arquivos indistinguíveis
 * @param {Record<string, (req: object) => Promise<object>>} config.operations
 *        mapa MÉTODO → operação. Cada operação devolve
 *        `{ status, body }` no sucesso ou
 *        `{ error: { status, code, message } }` na falha. Nunca escreve em
 *        `res`: quem responde é a factory, por `ok()` ou `fail()`.
 */
function createAdminResourceHandler({
  targetType,
  errorMessage,
  loggerName,
  handlerName,
  operations,
}) {
  const log = createLogger(loggerName);
  const allowedMethods = Object.keys(operations);

  const handler = async function adminResourceHandler(req, res) {
    // Ordem fixa da regra A3: CORS → OPTIONS → método → autenticação → try.
    setAdminCorsHeaders(req, res);
    if (guardMethod(req, res, allowedMethods)) return;
    if (!ensureAdminSession(req, res)) return;

    try {
      if (!getSupabaseConfig()) {
        return fail(res, {
          status: 500,
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Supabase não configurado.',
        });
      }

      const result = await operations[req.method](req);

      if (result?.error) {
        return fail(res, result.error);
      }

      const status = Number.isInteger(result?.status) ? result.status : 200;

      // Auditoria de escrita (regra I1) — best-effort, e agora em UM lugar.
      if (req.method !== 'GET' && status >= 200 && status < 300) {
        await logAdminAction({
          req,
          action: ACTION_BY_METHOD[req.method] || String(req.method).toLowerCase(),
          targetType,
          targetId: resolveTargetId(req, result),
          after: req.method === 'DELETE' ? null : req.body || null,
        });
      }

      return ok(res, result?.body || {}, { status });
    } catch (error) {
      log.error('handler_failed', { reason: error?.message || String(error) });
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: errorMessage,
      });
    }
  };

  // `Object.defineProperty` e não uma função nomeada por recurso: o nome vem
  // da configuração, e é o que a regra A5 pede que apareça no stack trace.
  Object.defineProperty(handler, 'name', { value: handlerName, configurable: true });

  return handler;
}

module.exports = { createAdminResourceHandler };
