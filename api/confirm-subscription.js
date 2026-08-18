const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');

const log = createLogger('confirm-subscription');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, updateTable },
} = require('../lib/supabase');

/**
 * GET /api/confirm-subscription?token=...
 *
 * Conclui o double opt-in. Token único, single-use no sentido de que
 * uma vez confirmado, o registro fica `confirmed=true` (idempotente —
 * clicar de novo só retorna sucesso).
 *
 * Responde sempre 200 com `{ confirmed, alreadyConfirmed?, error? }`
 * — o frontend (página `/confirmar-inscricao`) decide a UI. Mantém o
 * fluxo simples: nada de redirect 302 que confunde tracking.
 */
module.exports = async function confirmSubscriptionHandler(req, res) {
  if (guardMethod(req, res, ['GET'])) return;

  // Rate limit DEPOIS do 405 (requisição rejeitada por método não faz trabalho
  // nenhum, então cobrá-la custaria uma escrita no Postgres sem proteger nada)
  // e ANTES de qualquer trabalho caro — a ordem que a regra A3 fixa.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.confirmSubscription);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Supabase não configurado.',
      });
    }

    const token = String(req.query?.token || '').trim();
    if (!token) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Token ausente.',
      });
    }

    const subscriber = await getTableRow('email_subscribers', {
      select: 'id,email,confirmed,confirmed_at,unsubscribed_at,confirmation_sent_at',
      filters: [{ column: 'confirmation_token', value: token }],
    });

    // ── POR QUE ESTES CASOS DEIXARAM DE SER 200 ───────────────────────
    // Este handler devolvia 200 com `{ confirmed: false, error: 'texto' }` para
    // token inválido, inscrição cancelada e link expirado. Três problemas:
    // o corpo era um QUARTO formato de resposta no projeto (nem `success`, nem
    // `error` objeto); um 200 dizendo "não deu certo" mente para qualquer
    // monitoramento que olhe status; e sem `code` a página só podia ramificar
    // pelo texto em português.
    //
    // O motivo escrito no topo do arquivo para não usar redirect continua
    // valendo e não é afetado: seguimos devolvendo JSON, sem 302. O que muda é
    // o status refletir o resultado.
    if (!subscriber) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Token inválido ou expirado.',
      });
    }

    // Já confirmado e ativo → idempotente.
    if (subscriber.confirmed && !subscriber.unsubscribed_at) {
      return ok(res, {
        confirmed: true,
        alreadyConfirmed: true,
        email: subscriber.email,
      });
    }

    // Registro descadastrado NÃO é reativado por um link de confirmação antigo:
    // reinscrição exige um novo /subscribe (que gera token novo e limpa o unsub).
    if (subscriber.unsubscribed_at) {
      return fail(res, {
        status: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Inscrição cancelada. Inscreva-se novamente para reativar.',
      });
    }

    // Expiração real do token de confirmação (double opt-in exige posse recente).
    const CONFIRMATION_TTL_MS = 72 * 60 * 60 * 1000; // 72h
    const sentAt = new Date(subscriber.confirmation_sent_at || 0).getTime();
    if (!sentAt || Date.now() - sentAt > CONFIRMATION_TTL_MS) {
      // 410 Gone: o recurso existiu e não existe mais. Distingue "esse token
      // nunca valeu" (404) de "valeu e passou do prazo" (410), que é a
      // diferença entre "confira o link" e "peça um novo".
      return fail(res, {
        status: 410,
        code: ERROR_CODES.CONFIRMATION_EXPIRED,
        message: 'Link de confirmação expirado. Solicite um novo.',
      });
    }

    // Confirma e invalida o token (uso único real).
    await updateTable(
      'email_subscribers',
      { id: `eq.${subscriber.id}` },
      {
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        unsubscribed_at: null,
        confirmation_token: null,
      },
    );

    return ok(res, {
      confirmed: true,
      email: subscriber.email,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao confirmar inscrição.',
    });
  }
};
