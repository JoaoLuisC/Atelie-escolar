const {
  serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows },
} = require('../lib/supabase');
const { getCustomerSessionFromRequest } = require('../lib/customer-session');
const { enforceRateLimit } = require('../lib/rate-limit');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const {
  decideRefundFlow,
  loadDownloadEvidence,
  validateRefundReason,
} = require('../lib/refund-policy');

// /api/refund-request — devolução pelo próprio cliente (Termos, seção 7).
//   GET  → as solicitações da conta + o fluxo que vale para cada pedido
//          aprovado (`simple` ou `support`), para o front mostrar o formulário
//          certo;
//   POST { orderId, reasonCategory?, reason?, phone? } → registra. O fluxo é
//          decidido AQUI (lib/refund-policy.js), com os downloads do pedido
//          gravados junto como prova. Nunca estorna nada sozinho.

const RATE_LIMIT = { bucket: 'refund-request', limit: 10, windowSeconds: 600 };
const ACTIVE_STATUSES = '(open,contacted,accepted)';

async function loadEligibility(uid) {
  const orders = await listTableRows('orders', {
    select: 'id,order_code,completed_at,created_at',
    filters: [
      { column: 'customer_id', value: uid },
      { column: 'payment_status', value: 'approved' },
    ],
  });
  const evidence = await loadDownloadEvidence(orders.map((order) => order.id));
  return orders.map((order) => {
    const proof = evidence[String(order.id)];
    const decision = decideRefundFlow({ order, evidence: proof });
    return {
      orderId: order.order_code,
      flow: decision.flow,
      flowReason: decision.reason,
      deadline: decision.deadline,
      firstDownloadAt: proof.firstAt,
      downloadCount: proof.count,
    };
  });
}

module.exports = async function refundRequestHandler(req, res) {
  if (guardMethod(req, res, ['GET', 'POST'])) return;
  const session = getCustomerSessionFromRequest(req);
  if (!session?.uid)
    return fail(res, {
      status: 401,
      code: ERROR_CODES.CUSTOMER_SESSION_INVALID,
      message: 'Entre na sua conta para solicitar a devolução.',
    });
  const gate = await enforceRateLimit(req, res, RATE_LIMIT);
  if (gate.blocked) return;
  if (req.method === 'GET') {
    try {
      const [requests, eligibility] = await Promise.all([
        listTableRows('refund_requests', {
          select:
            'id,order_id,reason,reason_category,flow,phone,status,admin_response,created_at,updated_at',
          filters: [{ column: 'customer_id', value: session.uid }],
          orderBy: 'created_at',
          ascending: false,
        }),
        loadEligibility(session.uid),
      ]);
      return ok(res, { requests, eligibility });
    } catch {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Não foi possível consultar suas solicitações.',
      });
    }
  }
  const orderId = String(req.body?.orderId || '').trim();
  const phone = String(req.body?.phone || '').trim();
  // Telefone é opcional; preenchido, só dígitos e a pontuação de um número.
  const phoneOk = !phone || /^[\d\s()+.-]{8,40}$/.test(phone);
  if (
    !orderId ||
    orderId.length > 100 ||
    String(req.body?.reason || '').length > 2000 ||
    !phoneOk
  ) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Confira os dados da solicitação.',
    });
  }
  try {
    const order = await getTableRow('orders', {
      select: 'id,payment_status,completed_at,created_at',
      filters: [
        { column: 'order_code', value: orderId },
        { column: 'customer_id', value: session.uid },
      ],
    });
    if (!order || order.payment_status !== 'approved')
      return fail(res, {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Pedido aprovado não encontrado nesta conta.',
      });
    const existing = await getTableRow('refund_requests', {
      select: 'id',
      filters: [
        { column: 'order_id', value: order.id },
        { column: 'status', operator: 'in', value: ACTIVE_STATUSES },
      ],
    });
    if (existing) return ok(res, { requestId: existing.id, alreadyRequested: true });

    const proof = (await loadDownloadEvidence([order.id]))[String(order.id)];
    const { flow } = decideRefundFlow({ order, evidence: proof });
    const reason = validateRefundReason(flow, req.body || {});
    if (!reason.ok) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: reason.message,
        details: { flow },
      });
    }

    const rows = await insertIntoTable('refund_requests', {
      order_id: order.id,
      customer_id: session.uid,
      reason: reason.reason,
      reason_category: reason.category,
      flow,
      phone,
      first_download_at: proof.firstAt,
      download_count: proof.count,
    });
    return ok(res, { requestId: rows?.[0]?.id || null, flow }, { status: 201 });
  } catch (error) {
    // 23505 = unique_violation do índice "uma solicitação aberta por pedido".
    // O supabaseRequest põe o código em `details.code`, não na mensagem.
    if (error?.details?.code === '23505' || String(error?.message || '').includes('23505')) {
      const duplicateOrder = await getTableRow('orders', {
        select: 'id',
        filters: [
          { column: 'order_code', value: orderId },
          { column: 'customer_id', value: session.uid },
        ],
      }).catch(() => null);
      const active = await getTableRow('refund_requests', {
        select: 'id',
        filters: [
          { column: 'order_id', value: duplicateOrder?.id },
          { column: 'status', operator: 'in', value: ACTIVE_STATUSES },
        ],
      }).catch(() => null);
      return ok(res, { requestId: active?.id || null, alreadyRequested: true });
    }
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível registrar a solicitação. Tente novamente.',
    });
  }
};
