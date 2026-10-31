const { createAdminResourceHandler } = require('../../lib/admin-resource-handler');
const {
  serviceRoleHelpers: { getTableRow, listTableRows, updateTable },
} = require('../../lib/supabase');
const { getSellerScope, scopeOrderRows } = require('../../lib/seller-scope');

module.exports = createAdminResourceHandler({
  storeResource: true,
  targetType: 'refund_request',
  errorMessage: 'Erro ao buscar solicitações de devolução.',
  loggerName: 'admin-refund-requests',
  handlerName: 'adminRefundRequestsHandler',
  operations: {
    GET: async (req) => {
      const requests = await listTableRows('refund_requests', {
        select: 'id,order_id,reason,phone,status,admin_response,created_at,updated_at',
        orderBy: 'created_at',
        ascending: false,
      });
      if (!requests.length) return { status: 200, body: { requests: [] } };
      const ids = [...new Set(requests.map((item) => String(item.order_id)))];
      const orders = await listTableRows('orders', {
        select: 'id,order_code,customer_name,customer_email',
        filters: [{ column: 'id', operator: 'in', value: `(${ids.join(',')})` }],
      });
      const scoped = await scopeOrderRows(orders, getSellerScope(req));
      const byId = new Map(scoped.orders.map((order) => [String(order.id), order]));
      return {
        status: 200,
        body: {
          requests: requests
            .filter((item) => byId.has(String(item.order_id)))
            .map((item) => ({ ...item, order: byId.get(String(item.order_id)) })),
        },
      };
    },
    PUT: async (req) => {
      const id = String(req.body?.id || '').trim();
      const status = String(req.body?.status || '').trim();
      const response = String(req.body?.response || '').trim();
      if (
        !/^[0-9a-f-]{36}$/i.test(id) ||
        !['open', 'contacted', 'accepted', 'declined', 'resolved'].includes(status) ||
        response.length > 4000
      ) {
        return {
          error: {
            status: 400,
            code: 'VALIDATION_FAILED',
            message: 'Confira o status e a resposta.',
          },
        };
      }
      const request = await getTableRow('refund_requests', {
        select: 'id,order_id',
        filters: [{ column: 'id', value: id }],
      });
      if (!request)
        return {
          error: { status: 404, code: 'NOT_FOUND', message: 'Solicitação não encontrada.' },
        };
      const order = await getTableRow('orders', {
        select: 'id,order_code,customer_name,customer_email',
        filters: [{ column: 'id', value: request.order_id }],
      });
      const scoped = await scopeOrderRows(order ? [order] : [], getSellerScope(req));
      if (!scoped.orders.length)
        return { error: { status: 403, code: 'FORBIDDEN', message: 'Sem acesso a este pedido.' } };
      await updateTable(
        'refund_requests',
        { id: `eq.${id}` },
        {
          status,
          admin_response: response,
          updated_at: new Date().toISOString(),
        },
      );
      return { status: 200, body: {} };
    },
  },
});
