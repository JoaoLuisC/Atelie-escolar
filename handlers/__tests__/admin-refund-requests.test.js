import { afterEach, expect, it, vi } from 'vitest';
import { installModuleMock, loadHandler, resetModuleRegistry } from './money-path-harness';

afterEach(() => resetModuleRegistry());

it('devolve à professora somente solicitações de pedidos dentro do seu escopo', async () => {
  let operations;
  installModuleMock('../../lib/admin-resource-handler', {
    createAdminResourceHandler: (config) => {
      operations = config.operations;
      return () => {};
    },
  });
  installModuleMock('../../lib/supabase', {
    serviceRoleHelpers: {
      listTableRows: vi.fn(async (table) =>
        table === 'refund_requests'
          ? [
              { id: 'r1', order_id: 'p1', phone: '111' },
              { id: 'r2', order_id: 'p2', phone: '222' },
            ]
          : [
              { id: 'p1', customer_email: 'primeira@example.com' },
              { id: 'p2', customer_email: 'outra@example.com' },
            ],
      ),
    },
  });
  installModuleMock('../../lib/seller-scope', {
    getSellerScope: () => ({ sellerId: 's1' }),
    scopeOrderRows: async (orders) => ({ orders: orders.filter((order) => order.id === 'p1') }),
  });
  loadHandler('../admin/refund-requests');
  const result = await operations.GET({});
  expect(result.body.requests).toHaveLength(1);
  expect(result.body.requests[0]).toMatchObject({ id: 'r1', phone: '111' });
});
