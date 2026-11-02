import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/coupons.js · validateCouponCustomerLimit — o limite POR CLIENTE na
// prévia (handlers/validate-coupon.js). A reserva de verdade é a RPC atômica
// `increment_coupon_usage`; aqui é a triagem que dá a mensagem certa antes.

const requireCjs = createRequire(import.meta.url);
const { ERROR_CODES } = requireCjs('../http.js');

let usage;
let getTableRow;

beforeEach(() => {
  usage = null;
  getTableRow = vi.fn(async (table) => (table === 'coupon_customer_usage' ? usage : null));
  const filename = requireCjs.resolve('../supabase.js');
  requireCjs.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: { serviceRoleHelpers: { listTableRows: vi.fn(async () => []), getTableRow } },
  };
  delete requireCjs.cache[requireCjs.resolve('../coupons.js')];
});

afterEach(() => {
  delete requireCjs.cache[requireCjs.resolve('../supabase.js')];
  delete requireCjs.cache[requireCjs.resolve('../coupons.js')];
});

const check = (coupon, customerKey) =>
  requireCjs('../coupons.js').validateCouponCustomerLimit(coupon, customerKey);
const LIMITADO = { id: 7, max_uses_per_customer: 2 };

describe('validateCouponCustomerLimit', () => {
  it('sem limite por cliente, passa sem consultar o banco — até sem conta', async () => {
    expect(await check({ id: 7, max_uses_per_customer: null }, '')).toEqual({ ok: true });
    expect(await check({ id: 7 }, 'user:abc')).toEqual({ ok: true });
    expect(await check(null, 'user:abc')).toEqual({ ok: true });
    expect(getTableRow).not.toHaveBeenCalled();
  });

  it('com limite e sem conta, pede login (COUPON_NOT_ELIGIBLE) sem ir ao banco', async () => {
    const state = await check(LIMITADO, '');
    expect(state.ok).toBe(false);
    expect(state.code).toBe(ERROR_CODES.COUPON_NOT_ELIGIBLE);
    expect(state.message).toMatch(/Entre na sua conta/);
    expect(getTableRow).not.toHaveBeenCalled();
  });

  it('consulta o uso pela chave do cliente E pelo id do cupom', async () => {
    await check(LIMITADO, 'user:abc');
    expect(getTableRow).toHaveBeenCalledWith(
      'coupon_customer_usage',
      expect.objectContaining({
        filters: [
          { column: 'coupon_id', value: 7 },
          { column: 'customer_key', value: 'user:abc' },
        ],
      }),
    );
  });

  it('sem linha de uso (nunca usou) conta como zero e passa', async () => {
    usage = null;
    expect(await check(LIMITADO, 'user:abc')).toEqual({ ok: true });
  });

  it('abaixo do limite passa; no limite ou acima é COUPON_EXHAUSTED', async () => {
    usage = { used_count: 1 };
    expect(await check(LIMITADO, 'user:abc')).toEqual({ ok: true });

    usage = { used_count: 2 };
    const noLimite = await check(LIMITADO, 'user:abc');
    expect(noLimite.ok).toBe(false);
    expect(noLimite.code).toBe(ERROR_CODES.COUPON_EXHAUSTED);
    expect(String(noLimite.message).length).toBeGreaterThan(0);

    usage = { used_count: 5 };
    expect((await check(LIMITADO, 'user:abc')).code).toBe(ERROR_CODES.COUPON_EXHAUSTED);
  });

  it('limite vindo como texto do banco compara como número', async () => {
    usage = { used_count: '1' };
    expect((await check({ id: 7, max_uses_per_customer: '2' }, 'user:abc')).ok).toBe(true);
    usage = { used_count: '2' };
    expect((await check({ id: 7, max_uses_per_customer: '2' }, 'user:abc')).ok).toBe(false);
  });
});
