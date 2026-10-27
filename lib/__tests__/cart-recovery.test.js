import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/cart-recovery.js — na aprovação do pedido, o carrinho daquele e-mail
// vira "recuperado" e o cron para de mandar o lembrete de carrinho abandonado.

const requireCjs = createRequire(import.meta.url);

function mockModule(request, exports) {
  const filename = requireCjs.resolve(request);
  requireCjs.cache[filename] = { id: filename, filename, loaded: true, exports };
}

let updateTable;

function load() {
  delete requireCjs.cache[requireCjs.resolve('../cart-recovery.js')];
  return requireCjs('../cart-recovery.js');
}

beforeEach(() => {
  updateTable = vi.fn(async () => []);
  mockModule('../supabase.js', { serviceRoleHelpers: { updateTable } });
});

afterEach(() => {
  for (const request of ['../supabase.js', '../cart-recovery.js']) {
    delete requireCjs.cache[requireCjs.resolve(request)];
  }
});

describe('markCartsRecovered', () => {
  it('marca só os carrinhos em aberto do e-mail, normalizado', async () => {
    const result = await load().markCartsRecovered('  Cliente@Exemplo.com ');

    expect(result).toEqual({ marked: true });
    expect(updateTable).toHaveBeenCalledWith(
      'abandoned_carts',
      { email: 'eq.cliente@exemplo.com', recovered_at: 'is.null' },
      { recovered_at: expect.any(String) },
    );
  });

  it('sem e-mail não toca no banco', async () => {
    expect(await load().markCartsRecovered('')).toEqual({
      marked: false,
      reason: 'missing_email',
    });
    expect(updateTable).not.toHaveBeenCalled();
  });

  it('falha do banco não lança (best-effort)', async () => {
    updateTable.mockRejectedValueOnce(new Error('timeout'));
    await expect(load().markCartsRecovered('a@b.com')).resolves.toEqual({
      marked: false,
      reason: 'update_failed',
    });
  });
});
