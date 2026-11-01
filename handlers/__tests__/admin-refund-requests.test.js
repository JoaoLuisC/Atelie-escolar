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

it('cada solicitação leva o fluxo, a categoria e a prova de download (IP do 1º download)', async () => {
  let operations;
  installModuleMock('../../lib/admin-resource-handler', {
    createAdminResourceHandler: (config) => {
      operations = config.operations;
      return () => {};
    },
  });
  const tables = {
    refund_requests: [
      {
        id: 'r1',
        order_id: 'p1',
        flow: 'support',
        reason_category: 'defeito',
        first_download_at: '2026-10-30T12:00:00.000Z',
        download_count: 2,
      },
      {
        id: 'r2',
        order_id: 'p2',
        flow: 'simple',
        reason_category: 'desistencia',
        download_count: 0,
      },
    ],
    orders: [{ id: 'p1' }, { id: 'p2' }],
    download_logs: [
      { order_id: 'p1', ip_address: '203.0.113.7', downloaded_at: '2026-10-30T12:00:00.000Z' },
      { order_id: 'p1', ip_address: '198.51.100.1', downloaded_at: '2026-10-31T12:00:00.000Z' },
    ],
  };
  installModuleMock('../../lib/supabase', {
    serviceRoleHelpers: { listTableRows: vi.fn(async (table) => tables[table] || []) },
  });
  installModuleMock('../../lib/seller-scope', {
    getSellerScope: () => null,
    scopeOrderRows: async (orders) => ({ orders }),
  });
  loadHandler('../admin/refund-requests');
  const { body } = await operations.GET({});
  expect(body.requests[0]).toMatchObject({
    flow: 'support',
    reason_category: 'defeito',
    download_count: 2,
    firstDownloadIp: '203.0.113.7',
  });
  expect(body.requests[1]).toMatchObject({ flow: 'simple', firstDownloadIp: '' });
});
