import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  installModuleMock,
  installPartialMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// /api/me-profile — o nome do cliente. Só com sessão, e o nome só vale se o
// perfil foi de fato atualizado no banco.

let session;
let updateTable;
let setCustomerSessionCookie;
let handler;

beforeEach(() => {
  resetModuleRegistry();
  session = { uid: 'uid-ana', email: 'ana@ex.com', name: 'Ana' };
  updateTable = vi.fn(async () => [{ id: 'uid-ana' }]);
  setCustomerSessionCookie = vi.fn();
  installModuleMock('../../lib/customer-session', {
    getCustomerSessionFromRequest: () => session,
    setCustomerSessionCookie,
  });
  installPartialMock('../../lib/rate-limit', {
    enforceRateLimit: async () => ({ blocked: false }),
  });
  installPartialMock('../../lib/supabase', {
    getSupabaseConfig: () => ({ url: 'https://stub' }),
    serviceRoleHelpers: { getTableRow: vi.fn(async () => null), updateTable },
  });
  handler = loadHandler('../me-profile.js');
});

afterEach(() => resetModuleRegistry());

async function put(body) {
  const res = createMockRes();
  await handler({ method: 'PUT', headers: {}, body }, res);
  return res;
}

describe('me-profile', () => {
  it('sem sessão é 401', async () => {
    session = null;
    const res = await put({ name: 'Ana Lima' });
    expect(res.statusCode).toBe(401);
    expect(updateTable).not.toHaveBeenCalled();
  });

  it('salva o nome no perfil da própria conta', async () => {
    const res = await put({ name: '  Ana   Lima ' });
    expect(res.statusCode).toBe(200);
    expect(updateTable).toHaveBeenCalledWith(
      'profiles',
      { id: 'eq.uid-ana' },
      expect.objectContaining({ display_name: 'Ana Lima' }),
    );
    expect(res.body.user.name).toBe('Ana Lima');
  });

  it('nome curto ou longo demais é 400', async () => {
    expect((await put({ name: 'A' })).statusCode).toBe(400);
    expect((await put({ name: 'x'.repeat(121) })).statusCode).toBe(400);
  });

  it('perfil inexistente: 404 e o cookie não leva o nome', async () => {
    updateTable.mockResolvedValueOnce([]);
    const res = await put({ name: 'Ana Lima' });
    expect(res.statusCode).toBe(404);
    expect(setCustomerSessionCookie).not.toHaveBeenCalled();
  });
});
