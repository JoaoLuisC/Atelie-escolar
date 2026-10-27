import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  installModuleMock,
  installPartialMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// /api/teacher/products — área simples do professor(a). Cada escrita entra no
// audit log (regra I1) e o endpoint tem teto próprio: um POST põe um produto
// direto na loja.

const SELLER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PRODUCT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let logAdminAction;
let enforceRateLimit;
let insertIntoTable;
let updateTable;
let getTableRow;
let handler;

beforeEach(() => {
  resetModuleRegistry();
  logAdminAction = vi.fn(async () => {});
  enforceRateLimit = vi.fn(async () => ({ blocked: false }));
  insertIntoTable = vi.fn(async () => [{ id: PRODUCT_ID }]);
  updateTable = vi.fn(async () => [{}]);
  getTableRow = vi.fn(async () => ({ id: PRODUCT_ID }));

  installModuleMock('../../lib/admin-session', {
    ensureRoleSession: vi.fn(() => true),
    getStaffSession: () => ({ userId: SELLER_ID, role: 'seller' }),
  });
  installModuleMock('../../lib/admin-audit', { logAdminAction });
  installPartialMock('../../lib/rate-limit', { enforceRateLimit });
  installPartialMock('../../lib/supabase', {
    getSupabaseConfig: () => ({ url: 'https://stub' }),
    serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
  });
  handler = loadHandler('../teacher/products.js');
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

async function call(method, body) {
  const res = createMockRes();
  await handler({ method, headers: {}, body }, res);
  return res;
}

describe('teacher/products', () => {
  it('criar produto grava com o seller_id da sessão e entra no audit log', async () => {
    const res = await call('POST', {
      name: 'Painel de leitura',
      price: 12.9,
      downloadUrl: 'product_files/painel.pdf',
    });

    expect(res.statusCode).toBe(201);
    expect(insertIntoTable).toHaveBeenCalledWith(
      'products',
      expect.objectContaining({ seller_id: SELLER_ID }),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', targetType: 'product', targetId: PRODUCT_ID }),
    );
  });

  it('pausar produto próprio entra no audit log', async () => {
    const res = await call('PATCH', { id: PRODUCT_ID, active: false });

    expect(res.statusCode).toBe(200);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'patch', targetId: PRODUCT_ID }),
    );
  });

  it('acima do teto não grava nem audita', async () => {
    enforceRateLimit.mockImplementationOnce(async (_req, res) => {
      res.status(429).json({ success: false });
      return { blocked: true };
    });

    const res = await call('POST', { name: 'X', price: 1 });

    expect(res.statusCode).toBe(429);
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ bucket: 'teacher-products' }),
    );
    expect(insertIntoTable).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
