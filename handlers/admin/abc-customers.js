const { ensureStoreSession } = require('../../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../../lib/supabase');
const { buildAbcCurve } = require('../../lib/abc-classification');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-abc-customers');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');

/**
 * GET /api/admin-abc-customers?period=month|quarter|year
 *
 * Curva ABC de clientes por receita. Agrupa pedidos aprovados por
 * `customer_email`. Acrescenta classificação de relacionamento:
 *   - vip          → 5+ pedidos OU está no topo 20% de receita
 *   - recorrente   → 2-4 pedidos
 *   - eventual     → 1 pedido
 *
 * Sem cache: dado de cliente, sempre recalculado (ADM-01).
 */

// ── POR QUE NÃO HÁ MAIS CACHE EM MEMÓRIA AQUI (regra E2) ─────────────
// Havia um `Map` de módulo com TTL de 1h. Numa função serverless isso não é
// cache: cada invocação pode cair numa instância nova, o acerto é acidental e
// vale só para aquela instância — e o `X-Cache: HIT` que acompanhava afirmava
// uma garantia que o runtime não dá.
//
// Fica o mecanismo real: `Cache-Control` (regra E4, CACHE_POLICIES.adminReport).
// Desde a validação de 2026-10-01 a política é `no-store`: com `max-age=3600`
// o painel seguia mostrando o relatório velho depois de uma escrita e até
// depois do logout (ADM-01). Cada abertura da aba recalcula.

const PERIOD_DAYS = {
  month: 30,
  quarter: 90,
  year: 365,
  all: 3650,
};

function parseQuery(req) {
  const period = String(req.query?.period || 'quarter').toLowerCase();
  const days = PERIOD_DAYS[period] || PERIOD_DAYS.quarter;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return { period, days, sinceIso };
}

function classifyRelationship(orders, curve) {
  if (orders >= 5 || curve === 'A') return 'vip';
  if (orders >= 2) return 'recorrente';
  return 'eventual';
}

/**
 * Mascara o email para o admin sem expor o local-part completo:
 * "cliente@dominio.com" → "cli***@dominio.com"
 * Mantém auditabilidade sem ser PII completa em export CSV.
 */
function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return email;
  if (local.length <= 3) return `${local[0] || ''}***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

/**
 * Mascara o nome do cliente como iniciais: "Ana Lima" → "A. L.".
 *
 * A tela prometia "e-mails mascarados" e "não personalização nominal", mas
 * exibia nome e sobrenome completos (ADM-07). O nome entra no mesmo regime do
 * e-mail: só sai em claro com `includePII=1`.
 */
function maskName(name) {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`);
  return initials.join(' ');
}

module.exports = async function adminAbcCustomersHandler(req, res) {
  setAdminCorsHeaders(req, res);
  if (guardMethod(req, res, ['GET'])) return;
  if (!ensureStoreSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const query = parseQuery(req);
    const includePII = req.query?.includePII === '1'; // só para export interno

    const orders = await listTableRows('orders', {
      select: 'customer_email,customer_name,total_amount,completed_at',
      filters: [
        { column: 'payment_status', value: 'approved' },
        { column: 'completed_at', operator: 'gte', value: query.sinceIso },
      ],
      limit: 10000,
    });

    // Agrega por email
    const byEmail = new Map();
    for (const order of orders) {
      const email = String(order.customer_email || '')
        .trim()
        .toLowerCase();
      if (!email) continue;
      const entry = byEmail.get(email) || {
        id: email,
        name: order.customer_name || '',
        revenue: 0,
        orderCount: 0,
        firstOrderAt: order.completed_at,
        lastOrderAt: order.completed_at,
      };
      entry.revenue += Number(order.total_amount || 0);
      entry.orderCount += 1;
      if (order.completed_at && order.completed_at < entry.firstOrderAt)
        entry.firstOrderAt = order.completed_at;
      if (order.completed_at && order.completed_at > entry.lastOrderAt)
        entry.lastOrderAt = order.completed_at;
      if (!entry.name && order.customer_name) entry.name = order.customer_name;
      byEmail.set(email, entry);
    }

    const customerEntries = [...byEmail.values()].map((entry) => ({
      ...entry,
      avgTicket: entry.orderCount > 0 ? entry.revenue / entry.orderCount : 0,
    }));

    const curve = buildAbcCurve(customerEntries);

    const items = curve.items.map((item) => {
      const relationship = classifyRelationship(item.orderCount, item.curve);
      return {
        ...item,
        name: includePII ? item.name : maskName(item.name),
        email: includePII ? item.id : maskEmail(item.id),
        relationship,
        // Não expor o email completo no payload default
        id: includePII ? item.id : maskEmail(item.id),
      };
    });

    const relationshipSummary = items.reduce(
      (acc, item) => {
        acc[item.relationship] = (acc[item.relationship] || 0) + 1;
        return acc;
      },
      { vip: 0, recorrente: 0, eventual: 0 },
    );

    const payload = {
      success: true,
      period: query.period,
      since: query.sinceIso,
      totalRevenue: curve.totalRevenue,
      items,
      summary: curve.summary,
      relationshipSummary,
      generatedAt: new Date().toISOString(),
    };

    setCachePolicy(res, 'adminReport');
    return ok(res, payload);
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao gerar Curva ABC de clientes.',
    });
  }
};
