import { afterEach, describe, expect, it, vi } from 'vitest';
import { installModuleMock, loadHandler, resetModuleRegistry } from './money-path-harness';

afterEach(() => resetModuleRegistry());

const REQUEST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/**
 * Monta o PUT com a factory capturada: `scopeAllows` decide se o pedido está
 * no recorte da professora; `updateImpl` substitui o UPDATE (é como o teste
 * provoca a colisão do índice único).
 */
function arrangePut({ requestRow, orderRow, scopeAllows = true, updateImpl } = {}) {
  let captured;
  installModuleMock('../../lib/admin-resource-handler', {
    createAdminResourceHandler: (config) => {
      captured = config;
      return () => {};
    },
  });
  const updateTable = vi.fn(updateImpl || (async () => [{ id: REQUEST_ID }]));
  installModuleMock('../../lib/supabase', {
    serviceRoleHelpers: {
      listTableRows: vi.fn(async () => []),
      getTableRow: vi.fn(async (table) => {
        if (table === 'refund_requests') return requestRow ?? null;
        if (table === 'orders') return orderRow ?? null;
        return null;
      }),
      updateTable,
    },
  });
  installModuleMock('../../lib/seller-scope', {
    getSellerScope: () => ({ sellerId: 's1' }),
    scopeOrderRows: async (orders) => ({ orders: scopeAllows ? orders : [] }),
  });
  loadHandler('../admin/refund-requests');
  return { config: captured, operations: captured.operations, updateTable };
}

const PENDING = { id: REQUEST_ID, order_id: 'p1' };
const ORDER = { id: 'p1', order_code: 'ORD-1', customer_email: 'cliente@example.com' };

describe('PUT · atualizar solicitação', () => {
  it('200 e grava status, resposta e updated_at quando o pedido é da professora', async () => {
    const { operations, updateTable } = arrangePut({ requestRow: PENDING, orderRow: ORDER });
    const result = await operations.PUT({
      body: { id: REQUEST_ID, status: 'accepted', response: '  Reembolso feito.  ' },
    });
    expect(result).toEqual({ status: 200, body: {} });
    expect(updateTable).toHaveBeenCalledWith(
      'refund_requests',
      { id: `eq.${REQUEST_ID}` },
      expect.objectContaining({ status: 'accepted', admin_response: 'Reembolso feito.' }),
    );
  });

  it('403 quando o pedido está fora do recorte da professora — e nada é gravado', async () => {
    const { operations, updateTable } = arrangePut({
      requestRow: PENDING,
      orderRow: ORDER,
      scopeAllows: false,
    });
    const result = await operations.PUT({ body: { id: REQUEST_ID, status: 'accepted' } });
    expect(result.error).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(updateTable).not.toHaveBeenCalled();
  });

  it('404 para solicitação inexistente', async () => {
    const { operations } = arrangePut({ requestRow: null });
    const result = await operations.PUT({ body: { id: REQUEST_ID, status: 'accepted' } });
    expect(result.error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('400 para status fora do CHECK, id que não é uuid e resposta acima de 4000', async () => {
    const { operations, updateTable } = arrangePut({ requestRow: PENDING, orderRow: ORDER });
    for (const body of [
      { id: REQUEST_ID, status: 'pago' },
      { id: 'nao-e-uuid', status: 'accepted' },
      { id: REQUEST_ID, status: 'accepted', response: 'a'.repeat(4001) },
    ]) {
      const result = await operations.PUT({ body });
      expect(result.error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(typeof result.error.message).toBe('string');
    }
    expect(updateTable).not.toHaveBeenCalled();
  });

  it('409 CONFLICT ao reabrir quando o pedido já tem outra solicitação ativa', async () => {
    // O índice refund_requests_one_open_per_order recusa a segunda linha fora de
    // declined/resolved; o PostgREST devolve 23505 no corpo, que lib/supabase.js
    // preserva em error.details.
    const { operations } = arrangePut({
      requestRow: PENDING,
      orderRow: ORDER,
      updateImpl: async () => {
        const error = new Error(
          'duplicate key value violates unique constraint "refund_requests_one_open_per_order"',
        );
        error.statusCode = 409;
        error.details = { code: '23505' };
        throw error;
      },
    });
    const result = await operations.PUT({ body: { id: REQUEST_ID, status: 'open' } });
    expect(result.error).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(result.error.message).toMatch(/outra solicitação/);
  });

  it('outro erro do banco sobe para o catch da factory (500)', async () => {
    const { operations } = arrangePut({
      requestRow: PENDING,
      orderRow: ORDER,
      updateImpl: async () => {
        throw new Error('connection reset');
      },
    });
    await expect(operations.PUT({ body: { id: REQUEST_ID, status: 'open' } })).rejects.toThrow(
      /connection reset/,
    );
  });

  it('a mensagem do 500 é por método: salvar não vira "erro ao buscar"', () => {
    const { config } = arrangePut();
    expect(config.errorMessage.GET).toMatch(/buscar/);
    expect(config.errorMessage.PUT).toMatch(/salvar/);
  });
});

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
