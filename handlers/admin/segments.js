const { ensureAdminSession } = require('../../lib/admin-session');
const { getSupabaseConfig } = require('../../lib/supabase');
const { buildSegmentationReport } = require('../../lib/customer-segmentation');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-segments');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');

// ── POR QUE NÃO HÁ MAIS CACHE EM MEMÓRIA AQUI (regra E2) ─────────────
// Havia um `let cached` de módulo com TTL de 30 min. Numa função serverless
// isso não é cache: cada invocação pode cair numa instância nova, então o
// acerto é acidental e vale só para aquela instância — e o `X-Cache: HIT` que
// acompanhava afirmava uma garantia que o runtime não dá.
//
// O cache que sobra é o do `Cache-Control` (regra E4), pela política
// CACHE_POLICIES.adminReport — hoje `no-store`. A segmentação é cara, mas uma
// hora de cache no navegador mantinha o relatório visível depois do logout
// (ADM-01), e o painel mostrava "Cache de 30 min" para uma política de 1 h.

module.exports = async function adminSegmentsHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (guardMethod(req, res, ['GET'])) return;

  if (!ensureAdminSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const report = await buildSegmentationReport();
    const subscribers = report.subscribers || [];

    const payload = {
      success: true,
      totalSubscribers: subscribers.length,
      confirmedCount: subscribers.filter((s) => s.confirmed && !s.unsubscribed_at).length,
      unsubscribedCount: subscribers.filter((s) => s.unsubscribed_at).length,
      pendingConfirmation: subscribers.filter((s) => !s.confirmed && !s.unsubscribed_at).length,
      byTag: report.byTag,
      // Não devolvemos a lista bruta de emails — relatório agregado.
      // Para exportar (CSV), criar endpoint dedicado com confirmação.
      generatedAt: new Date().toISOString(),
    };

    setCachePolicy(res, 'adminReport');
    return ok(res, payload);
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao gerar segmentação.',
    });
  }
};
