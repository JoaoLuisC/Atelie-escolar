import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockRes,
  installModuleMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness';

// /api/refund-request — regra de devolução por download (Termos, seção 7).
// O fluxo é decidido no servidor: até 7 dias e sem download → `simple`
// (motivo opcional); já baixou ou passou de 7 dias → `support` (categoria +
// descrição obrigatórias). A prova do download vai gravada na solicitação.

const DAY = 24 * 60 * 60 * 1000;
let session;
let order;
let downloadLogs;
let usedTokens;
let getTableRow;
let insertIntoTable;
let listTableRows;
let handler;

beforeEach(() => {
  resetModuleRegistry();
  session = { uid: 'cliente-1' };
  order = {
    id: 'pedido-1',
    order_code: 'ORD-1',
    payment_status: 'approved',
    completed_at: new Date(Date.now() - 2 * DAY).toISOString(),
  };
  downloadLogs = [];
  usedTokens = [];
  getTableRow = vi.fn(async (table, options) => {
    if (table === 'refund_requests') return null;
    const fields = Object.fromEntries(options.filters.map(({ column, value }) => [column, value]));
    return fields.customer_id === 'cliente-1' && fields.order_code === 'ORD-1' ? order : null;
  });
  listTableRows = vi.fn(async (table) => {
    if (table === 'download_logs') return downloadLogs;
    if (table === 'download_tokens') return usedTokens;
    if (table === 'orders') return [order];
    return [];
  });
  insertIntoTable = vi.fn(async () => [{ id: 'solicitacao-1' }]);
  installModuleMock('../../lib/supabase', {
    serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows },
  });
  installModuleMock('../../lib/customer-session', { getCustomerSessionFromRequest: () => session });
  installModuleMock('../../lib/rate-limit', { enforceRateLimit: async () => ({ blocked: false }) });
  handler = loadHandler('../refund-request');
});
afterEach(() => resetModuleRegistry());

async function post(body) {
  const res = createMockRes();
  await handler({ method: 'POST', body: { orderId: 'ORD-1', ...body } }, res);
  return res;
}

const DOWNLOADED = [
  { order_id: 'pedido-1', ip_address: '203.0.113.7', downloaded_at: '2026-10-30T12:00:00.000Z' },
  { order_id: 'pedido-1', ip_address: '203.0.113.7', downloaded_at: '2026-10-31T09:00:00.000Z' },
];

describe('solicitação de devolução · acesso', () => {
  it('recusa acesso sem sessão', async () => {
    session = null;
    const res = await post({});
    expect(res.statusCode).toBe(401);
    expect(insertIntoTable).not.toHaveBeenCalled();
  });

  it('não permite solicitar devolução de pedido de outra conta', async () => {
    const res = await post({ orderId: 'ORD-OUTRO' });
    expect(res.statusCode).toBe(404);
    expect(insertIntoTable).not.toHaveBeenCalled();
  });
});

describe('solicitação de devolução · regra por download', () => {
  it('sem download, dentro de 7 dias: desistência simples, sem motivo nem telefone', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(201);
    expect(res.body.flow).toBe('simple');
    expect(insertIntoTable).toHaveBeenCalledWith(
      'refund_requests',
      expect.objectContaining({
        order_id: 'pedido-1',
        customer_id: 'cliente-1',
        flow: 'simple',
        reason_category: 'desistencia',
        reason: '',
        phone: '',
        download_count: 0,
        first_download_at: null,
      }),
    );
  });

  it('já baixou: vira suporte e exige categoria e descrição', async () => {
    downloadLogs = DOWNLOADED;
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ reasonCategory: 'defeito', reason: 'curto' })).statusCode).toBe(400);
    expect((await post({ reasonCategory: 'desistencia', reason: 'x'.repeat(30) })).statusCode).toBe(
      400,
    );
    expect(insertIntoTable).not.toHaveBeenCalled();

    const res = await post({
      reasonCategory: 'nao_abre',
      reason: 'O PDF abre em branco no celular e no computador.',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.flow).toBe('support');
    expect(insertIntoTable).toHaveBeenCalledWith(
      'refund_requests',
      expect.objectContaining({
        flow: 'support',
        reason_category: 'nao_abre',
        download_count: 2,
        first_download_at: '2026-10-30T12:00:00.000Z',
      }),
    );
  });

  it('mais de 7 dias sem download: também é suporte', async () => {
    order.completed_at = new Date(Date.now() - 8 * DAY).toISOString();
    expect((await post({})).statusCode).toBe(400);
    const res = await post({
      reasonCategory: 'diferente_do_anunciado',
      reason: 'Veio outro tema.'.padEnd(25, '.'),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.flow).toBe('support');
  });

  it('token usado conta como download mesmo sem linha em download_logs (fonte canônica)', async () => {
    usedTokens = [{ order_id: 'pedido-1', used_at: '2026-10-30T12:00:00.000Z' }];
    expect((await post({})).statusCode).toBe(400);
    const res = await post({
      reasonCategory: 'defeito',
      reason: 'O arquivo veio sem as páginas 3 a 5.',
    });
    expect(res.statusCode).toBe(201);
    expect(insertIntoTable).toHaveBeenCalledWith(
      'refund_requests',
      expect.objectContaining({
        flow: 'support',
        download_count: 1,
        first_download_at: '2026-10-30T12:00:00.000Z',
      }),
    );
  });

  it('o front não escolhe o fluxo: mandar flow=simple depois de baixar não adianta', async () => {
    downloadLogs = DOWNLOADED;
    const res = await post({ flow: 'simple', reasonCategory: 'desistencia' });
    expect(res.statusCode).toBe(400);
    expect(insertIntoTable).not.toHaveBeenCalled();
  });

  it('GET devolve o fluxo esperado de cada pedido aprovado', async () => {
    downloadLogs = DOWNLOADED;
    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.body.eligibility).toEqual([
      expect.objectContaining({
        orderId: 'ORD-1',
        flow: 'support',
        flowReason: 'downloaded',
        downloadCount: 2,
        firstDownloadAt: '2026-10-30T12:00:00.000Z',
      }),
    ]);
  });
});

describe('solicitação de devolução · robustez', () => {
  it('corrida: a segunda solicitação simultânea vira "já solicitado", não 500', async () => {
    // O índice único barra a duplicata; o supabaseRequest põe o 23505 em details.code.
    insertIntoTable.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key'), { details: { code: '23505' } }),
    );
    const res = await post({});
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ alreadyRequested: true });
  });

  it('telefone preenchido precisa ter cara de telefone', async () => {
    for (const phone of ['<script>abc</script>', '123', 'liga pra mim']) {
      expect((await post({ phone })).statusCode).toBe(400);
    }
    expect((await post({ phone: '(11) 98765-4321' })).statusCode).toBe(201);
    expect(insertIntoTable).toHaveBeenCalledTimes(1);
  });
});
