const { ensureAdminSession } = require('../../lib/admin-session');
const { logAdminAction } = require('../../lib/admin-audit');
const { getSupabaseConfig, supabaseRequest } = require('../../lib/supabase');
const { ERROR_CODES, fail, guardMethod, ok, setAdminCorsHeaders } = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-cleanup-events');

/**
 * Fallback manual para limpar `analytics_events` > 180 dias.
 *
 * Cenário primário: `pg_cron` agendado pela migration roda mensalmente
 * (Supabase Pro). Quando o projeto está no Free ou queremos forçar uma
 * limpeza fora do cron, este endpoint chama a função SQL via RPC.
 *
 * Também pode ser chamado por job externo (Vercel Cron, GitHub Actions):
 *   curl -X POST $APP_URL/api/admin-cleanup-events \
 *     -H "Cookie: admin_session=..."
 */
module.exports = async function adminCleanupEventsHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (guardMethod(req, res, ['POST'])) return;

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    // RPC para a função criada na migration de retenção.
    // Não usa serviceRoleHelpers porque é POST a /rpc/<fn>, não tabela.
    const result = await supabaseRequest('rpc/cleanup_old_analytics_events', {
      method: 'POST',
      useServiceRole: true,
      body: JSON.stringify({}),
    });

    const deleted = Number(result) || 0;

    // Auditoria de escrita (regra I1). A purga apaga linha de
    // `analytics_events` de forma irreversível e ficava FORA do audit log:
    // o painel registrava quem editou um cupom, mas não quem mandou apagar
    // meses de evento. Fica depois do RPC de propósito — só registra o que
    // de fato aconteceu, e `deleted: 0` também é informação (a purga rodou
    // e não havia o que apagar).
    await logAdminAction({
      req,
      action: 'delete',
      targetType: 'analytics_events',
      after: { deleted },
    });

    return ok(res, {
      success: true,
      deleted,
      message:
        deleted > 0
          ? `${deleted} eventos com mais de 180 dias foram removidos.`
          : 'Nenhum evento antigo encontrado.',
    });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao limpar eventos antigos. Verifique se a migration de retenção foi aplicada.',
    });
  }
};
