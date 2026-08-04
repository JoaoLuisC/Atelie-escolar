const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../lib/supabase');

/**
 * GET /api/admin-cohort?months=12
 *
 * Matriz de retenção por coorte mensal:
 *   linha = mês da primeira compra do cliente (cohort_month)
 *   coluna = índice de meses depois da primeira compra (0, 1, 2, ...)
 *   célula = % dos clientes daquela cohort ativos naquele mês relativo
 *
 * Por que existe (regra D5 / Fase 4):
 *   sem coorte, taxa de recompra agregada esconde sazonalidade — a do
 *   ano letivo do nosso público importa muito (volta às aulas = pico).
 *
 * Cache 1h.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;
let cached = null;

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsBetween(start, end) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + (end.getUTCMonth() - start.getUTCMonth());
}

function getCached() {
  if (!cached || cached.expiresAt <= Date.now()) {
    cached = null;
    return null;
  }
  return cached.data;
}

function setCachedData(data) {
  cached = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

module.exports = async function adminCohortHandler(req, res) {
  setAdminCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!ensureAdminSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const months = Math.max(1, Math.min(36, Number.parseInt(req.query?.months || '12', 10) || 12));
    const nocache = req.query?.nocache === '1';

    if (!nocache) {
      const hit = getCached();
      if (hit && hit.months === months) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.status(200).json(hit);
      }
    }

    // Janela por MÊS DE CALENDÁRIO (alinha com monthsBetween, que itera meses
    // reais). Aproximar mês=30 dias encurtava a janela e subcontava as coortes
    // mais antigas. +1 mês de folga para cobrir a coorte de borda.
    const nowDate = new Date();
    const since = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - (months + 1), 1));

    const orders = await listTableRows('orders', {
      select: 'customer_email,completed_at,total_amount',
      filters: [
        { column: 'payment_status', value: 'approved' },
        { column: 'completed_at', operator: 'gte', value: since.toISOString() },
      ],
      orderBy: 'completed_at',
      ascending: true,
      limit: 20000,
    });

    if (orders.length === 0) {
      const empty = {
        success: true,
        months,
        cohorts: [],
        totalCustomers: 0,
        generatedAt: new Date().toISOString(),
      };
      setCachedData({ ...empty, months });
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(empty);
    }

    // Para cada cliente: primeiro mês + set de meses ativos
    const customerData = new Map();
    for (const order of orders) {
      const email = String(order.customer_email || '').toLowerCase();
      if (!email) continue;
      const dt = new Date(order.completed_at);
      if (Number.isNaN(dt.getTime())) continue;
      const key = monthKey(dt);

      const entry = customerData.get(email) || { firstMonth: key, firstDate: dt, activeMonths: new Set() };
      if (dt < entry.firstDate) {
        entry.firstDate = dt;
        entry.firstMonth = key;
      }
      entry.activeMonths.add(key);
      customerData.set(email, entry);
    }

    // Agrupa clientes por cohort_month
    const cohortMembers = new Map();
    for (const [email, data] of customerData) {
      if (!cohortMembers.has(data.firstMonth)) {
        cohortMembers.set(data.firstMonth, []);
      }
      cohortMembers.get(data.firstMonth).push({ email, ...data });
    }

    // Cohort months ordenados
    const cohortMonths = [...cohortMembers.keys()].sort();

    // Build matriz
    const now = new Date();
    const cohorts = cohortMonths.map((cohortKey) => {
      const [year, month] = cohortKey.split('-').map(Number);
      const cohortDate = new Date(Date.UTC(year, month - 1, 1));
      const monthsSinceCohort = monthsBetween(cohortDate, now);
      const members = cohortMembers.get(cohortKey);
      const cohortSize = members.length;

      // Para cada offset 0..min(months, monthsSinceCohort), conta quantos clientes ativos
      const maxOffset = Math.min(months - 1, monthsSinceCohort);
      const retention = [];
      for (let offset = 0; offset <= maxOffset; offset += 1) {
        const targetDate = new Date(Date.UTC(year, month - 1 + offset, 1));
        const targetKey = monthKey(targetDate);
        const activeCount = members.filter((m) => m.activeMonths.has(targetKey)).length;
        retention.push({
          offset,
          monthKey: targetKey,
          activeCount,
          retentionPct: cohortSize > 0 ? (activeCount / cohortSize) * 100 : 0,
        });
      }

      return {
        cohortMonth: cohortKey,
        cohortSize,
        retention,
      };
    });

    const payload = {
      success: true,
      months,
      cohorts,
      totalCustomers: customerData.size,
      generatedAt: new Date().toISOString(),
    };

    setCachedData(payload);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[admin-cohort]', error.message);
    return res.status(500).json({ success: false, error: 'Erro ao gerar matriz de coorte.' });
  }
};
