import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockRes,
  installModuleMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness';

let session;
let getTableRow;
let insertIntoTable;
let handler;

beforeEach(() => {
  resetModuleRegistry();
  session = { uid: 'cliente-1' };
  getTableRow = vi.fn(async (table, options) => {
    if (table === 'refund_requests') return null;
    const fields = Object.fromEntries(options.filters.map(({ column, value }) => [column, value]));
    return fields.customer_id === 'cliente-1' && fields.order_code === 'ORD-1'
      ? { id: 'pedido-1', payment_status: 'approved' }
      : null;
  });
  insertIntoTable = vi.fn(async () => [{ id: 'solicitacao-1' }]);
  installModuleMock('../../lib/supabase', { serviceRoleHelpers: { getTableRow, insertIntoTable } });
  installModuleMock('../../lib/customer-session', { getCustomerSessionFromRequest: () => session });
  installModuleMock('../../lib/rate-limit', { enforceRateLimit: async () => ({ blocked: false }) });
  handler = loadHandler('../refund-request');
});
afterEach(() => resetModuleRegistry());

describe('solicitação de devolução', () => {
  it('recusa acesso sem sessão', async () => {
    session = null;
    const res = createMockRes();
    await handler({ method: 'POST', body: { orderId: 'ORD-1' } }, res);
    expect(res.statusCode).toBe(401);
    expect(insertIntoTable).not.toHaveBeenCalled();
  });

  it('registra pedido próprio sem exigir motivo nem telefone', async () => {
    const res = createMockRes();
    await handler({ method: 'POST', body: { orderId: 'ORD-1' } }, res);
    expect(res.statusCode).toBe(201);
    expect(insertIntoTable).toHaveBeenCalledWith('refund_requests', {
      order_id: 'pedido-1',
      customer_id: 'cliente-1',
      reason: '',
      phone: '',
    });
    expect(getTableRow.mock.calls[0][1].filters).toContainEqual({
      column: 'customer_id',
      value: 'cliente-1',
    });
  });

  it('não permite solicitar devolução de pedido de outra conta', async () => {
    const res = createMockRes();
    await handler({ method: 'POST', body: { orderId: 'ORD-OUTRO' } }, res);
    expect(res.statusCode).toBe(404);
    expect(insertIntoTable).not.toHaveBeenCalled();
  });

  it('corrida: a segunda solicitação simultânea vira "já solicitado", não 500', async () => {
    // O índice único barra a duplicata; o supabaseRequest põe o 23505 em details.code.
    insertIntoTable.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key'), { details: { code: '23505' } }),
    );
    const res = createMockRes();
    await handler({ method: 'POST', body: { orderId: 'ORD-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ alreadyRequested: true });
  });

  it('telefone preenchido precisa ter cara de telefone', async () => {
    for (const phone of ['<script>abc</script>', '123', 'liga pra mim']) {
      const res = createMockRes();
      await handler({ method: 'POST', body: { orderId: 'ORD-1', phone } }, res);
      expect(res.statusCode).toBe(400);
    }
    const res = createMockRes();
    await handler({ method: 'POST', body: { orderId: 'ORD-1', phone: '(11) 98765-4321' } }, res);
    expect(res.statusCode).toBe(201);
    expect(insertIntoTable).toHaveBeenCalledTimes(1);
  });
});
