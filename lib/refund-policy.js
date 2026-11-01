// ════════════════════════════════════════════════════════════════════
// REGRA DE DEVOLUÇÃO — qual fluxo vale para um pedido (Termos, seção 7).
//
//   • até 7 dias da aprovação E nenhum download  → `simple` (desistência:
//     um clique, motivo opcional);
//   • já baixou qualquer item, ou passou de 7 dias → `support` (motivo
//     obrigatório: categoria + descrição; a loja tenta resolver antes de
//     reembolsar).
//
// Decidido SEMPRE aqui no servidor, a partir de `download_logs` e da data de
// aprovação — nunca do que o front diz. Nada é estornado automaticamente.
// O reembolso por defeito (CDC, arts. 18 e 20) existe nos dois fluxos.
// ════════════════════════════════════════════════════════════════════

const {
  serviceRoleHelpers: { listTableRows },
} = require('./supabase');

const WITHDRAWAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORT_CATEGORIES = Object.freeze([
  'nao_abre',
  'defeito',
  'diferente_do_anunciado',
  'outro',
]);
const ALL_CATEGORIES = Object.freeze(['desistencia', ...SUPPORT_CATEGORIES]);
const MIN_SUPPORT_DESCRIPTION = 20;

/**
 * Downloads registrados por pedido: { [orderId]: { count, firstAt, firstIp } }.
 * `download_logs` é gravado a cada entrega bem-sucedida (handlers/download.js).
 */
async function loadDownloadEvidence(orderIds) {
  const ids = [...new Set((orderIds || []).map(String).filter(Boolean))];
  const evidence = Object.fromEntries(
    ids.map((id) => [id, { count: 0, firstAt: null, firstIp: '' }]),
  );
  if (!ids.length) return evidence;
  const logs = await listTableRows('download_logs', {
    select: 'order_id,ip_address,downloaded_at',
    filters: [{ column: 'order_id', operator: 'in', value: `(${ids.join(',')})` }],
    orderBy: 'downloaded_at',
    ascending: true,
  });
  for (const log of logs || []) {
    const entry = evidence[String(log.order_id)];
    if (!entry) continue;
    entry.count += 1;
    if (!entry.firstAt) {
      entry.firstAt = log.downloaded_at || null;
      entry.firstIp = log.ip_address || '';
    }
  }
  return evidence;
}

/** Data em que o pedido foi aprovado (o prazo de 7 dias conta daqui). */
function approvedAt(order) {
  return order?.completed_at || order?.created_at || null;
}

/**
 * @returns {{ flow: 'simple'|'support', reason: 'ok'|'downloaded'|'expired', deadline: string|null }}
 */
function decideRefundFlow({ order, evidence, now = Date.now() }) {
  const start = new Date(approvedAt(order) || now).getTime();
  const deadline = Number.isFinite(start) ? new Date(start + WITHDRAWAL_DAYS * DAY_MS) : null;
  if (Number(evidence?.count || 0) > 0) {
    return { flow: 'support', reason: 'downloaded', deadline: deadline?.toISOString() || null };
  }
  if (deadline && now > deadline.getTime()) {
    return { flow: 'support', reason: 'expired', deadline: deadline.toISOString() };
  }
  return { flow: 'simple', reason: 'ok', deadline: deadline?.toISOString() || null };
}

/**
 * Valida o motivo conforme o fluxo. Simples: categoria opcional (padrão
 * `desistencia`). Suporte: categoria de suporte e descrição com o mínimo para
 * a loja entender o problema — critério, não obstáculo.
 */
function validateRefundReason(flow, { reasonCategory, reason }) {
  const category = String(reasonCategory || '').trim();
  const text = String(reason || '').trim();
  if (flow === 'simple') {
    if (category && !ALL_CATEGORIES.includes(category))
      return { ok: false, message: 'Motivo inválido.' };
    return { ok: true, category: category || 'desistencia', reason: text };
  }
  if (!SUPPORT_CATEGORIES.includes(category)) {
    return { ok: false, message: 'Escolha o que aconteceu com o arquivo.' };
  }
  if (text.length < MIN_SUPPORT_DESCRIPTION) {
    return {
      ok: false,
      message: `Conte em poucas palavras o que aconteceu (ao menos ${MIN_SUPPORT_DESCRIPTION} caracteres), para a loja conseguir resolver.`,
    };
  }
  return { ok: true, category, reason: text };
}

module.exports = {
  ALL_CATEGORIES,
  MIN_SUPPORT_DESCRIPTION,
  SUPPORT_CATEGORIES,
  WITHDRAWAL_DAYS,
  approvedAt,
  decideRefundFlow,
  loadDownloadEvidence,
  validateRefundReason,
};
