const {
  serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows },
} = require('../lib/supabase');
const { getCustomerSessionFromRequest } = require('../lib/customer-session');
const { enforceRateLimit } = require('../lib/rate-limit');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');

const RATE_LIMIT = { bucket: 'refund-request', limit: 10, windowSeconds: 600 };

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
      const requests = await listTableRows('refund_requests', {
        select: 'id,order_id,reason,phone,status,admin_response,created_at,updated_at',
        filters: [{ column: 'customer_id', value: session.uid }],
        orderBy: 'created_at',
        ascending: false,
      });
      return ok(res, { requests });
    } catch {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Não foi possível consultar suas solicitações.',
      });
    }
  }
  const orderId = String(req.body?.orderId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  const phone = String(req.body?.phone || '').trim();
  // Telefone é opcional; preenchido, só dígitos e a pontuação de um número.
  const phoneOk = !phone || /^[\d\s()+.-]{8,40}$/.test(phone);
  if (!orderId || orderId.length > 100 || reason.length > 2000 || !phoneOk) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Confira os dados da solicitação.',
    });
  }
  try {
    const order = await getTableRow('orders', {
      select: 'id,payment_status',
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
        { column: 'status', operator: 'in', value: '(open,contacted,accepted)' },
      ],
    });
    if (existing) return ok(res, { requestId: existing.id, alreadyRequested: true });
    const rows = await insertIntoTable('refund_requests', {
      order_id: order.id,
      customer_id: session.uid,
      reason,
      phone,
    });
    return ok(res, { requestId: rows?.[0]?.id || null }, { status: 201 });
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
      const existing = await getTableRow('refund_requests', {
        select: 'id',
        filters: [
          { column: 'order_id', value: duplicateOrder?.id },
          { column: 'status', operator: 'in', value: '(open,contacted,accepted)' },
        ],
      }).catch(() => null);
      return ok(res, { requestId: existing?.id || null, alreadyRequested: true });
    }
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível registrar a solicitação. Tente novamente.',
    });
  }
};
