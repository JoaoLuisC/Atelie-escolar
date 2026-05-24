const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { getSupabaseConfig, supabaseRequest } = require('../lib/supabase');

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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    // RPC para a função criada na migration de retenção.
    // Não usa serviceRoleHelpers porque é POST a /rpc/<fn>, não tabela.
    const result = await supabaseRequest('rpc/cleanup_old_analytics_events', {
      method: 'POST',
      useServiceRole: true,
      body: JSON.stringify({}),
    });

    const deleted = Number(result) || 0;

    return res.status(200).json({
      success: true,
      deleted,
      message: deleted > 0
        ? `${deleted} eventos com mais de 180 dias foram removidos.`
        : 'Nenhum evento antigo encontrado.',
    });
  } catch (error) {
    console.error('[admin-cleanup-events]', error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao limpar eventos antigos. Verifique se a migration de retenção foi aplicada.',
    });
  }
};
