const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { getSupabaseConfig } = require('../lib/supabase');
const { buildSegmentationReport } = require('../lib/customer-segmentation');

// Cache simples — segmentação é cara (varre todos os subscribers).
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
let cached = null;

module.exports = async function adminSegmentsHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (!ensureAdminSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const nocache = req.query?.nocache === '1';
    if (!nocache && cached && cached.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached.data);
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

    cached = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[admin-segments]', error.message);
    return res.status(500).json({ success: false, error: 'Erro ao gerar segmentação.' });
  }
};
