const {
  serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows },
} = require('../lib/supabase');
const { getCustomerSessionFromRequest } = require('../lib/customer-session');
const { enforceRateLimit } = require('../lib/rate-limit');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');
const { parse } = require('../validation');
const { refundRequestSchema } = require('../validation/customer.schemas');
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

const log = createLogger('refund-request');
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

function activeRequestFor(orderId) {
  return getTableRow('refund_requests', {
    select: 'id,flow',
    filters: [
      { column: 'order_id', value: orderId },
      { column: 'status', operator: 'in', value: ACTIVE_STATUSES },
    ],
  });
}

module.exports = async function refundRequestHandler(req, res) {
  // Ordem da regra A3: método → rate limit → autenticação → schema → try.
  if (guardMethod(req, res, ['GET', 'POST'])) return;
  const gate = await enforceRateLimit(req, res, RATE_LIMIT);
  if (gate.blocked) return;
  const session = getCustomerSessionFromRequest(req);
  if (!session?.uid) {
    return fail(res, {
      status: 401,
      code: ERROR_CODES.CUSTOMER_SESSION_INVALID,
      message: 'Entre na sua conta para solicitar a devolução.',
    });
  }

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
    } catch (error) {
      log.error('listagem_falhou', { reason: error?.message || String(error) });
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Não foi possível consultar suas solicitações.',
      });
    }
  }

  const parsed = parse(refundRequestSchema, req.body || {});
  if (!parsed.ok) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: parsed.message || 'Confira os dados da solicitação.',
    });
  }
  const { orderId, phone } = parsed.data;

  // Fora do try: a recuperação da corrida (23505) precisa do pedido já lido —
  // reler com filtro vazio devolveria a solicitação de OUTRO cliente.
  let order = null;
  try {
    order = await getTableRow('orders', {
      select: 'id,payment_status,completed_at,created_at',
      filters: [
        { column: 'order_code', value: orderId },
        { column: 'customer_id', value: session.uid },
      ],
    });
    if (!order || order.payment_status !== 'approved') {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Pedido aprovado não encontrado nesta conta.',
      });
    }
    const existing = await activeRequestFor(order.id);
    if (existing) {
      return ok(res, { requestId: existing.id, flow: existing.flow, alreadyRequested: true });
    }

    const proof = (await loadDownloadEvidence([order.id]))[String(order.id)];
    const { flow } = decideRefundFlow({ order, evidence: proof });
    const reason = validateRefundReason(flow, parsed.data);
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
    if (
      order?.id &&
      (error?.details?.code === '23505' || String(error?.message || '').includes('23505'))
    ) {
      const active = await activeRequestFor(order.id).catch(() => null);
      return ok(res, {
        requestId: active?.id || null,
        flow: active?.flow || null,
        alreadyRequested: true,
      });
    }
    log.error('registro_falhou', {
      reason: error?.message || String(error),
      status: error?.statusCode || error?.status,
    });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível registrar a solicitação. Tente novamente.',
    });
  }
};
