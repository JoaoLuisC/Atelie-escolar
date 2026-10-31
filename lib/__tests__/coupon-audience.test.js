import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/coupons.js · validateCouponAudience — quem pode usar cada cupom.
// O limite de verdade (global, por cliente, meta) é a RPC atômica no Postgres;
// aqui é a triagem que dá a mensagem certa antes de reservar.

const requireCjs = createRequire(import.meta.url);
const UID = '11111111-1111-4111-8111-111111111111';

let orders;
let usage;

function matches(row, filters) {
  return filters.every(({ column, operator = 'eq', value }) => {
    if (operator === 'ilike')
      return String(row[column]).toLowerCase() === String(value).toLowerCase();
    return String(row[column]) === String(value);
  });
}

beforeEach(() => {
  orders = [];
  usage = null;
  const listTableRows = vi.fn(async (table, { filters = [], limit } = {}) => {
    const rows = table === 'orders' ? orders.filter((row) => matches(row, filters)) : [];
    return limit ? rows.slice(0, limit) : rows;
  });
  const getTableRow = vi.fn(async (table) => (table === 'coupon_customer_usage' ? usage : null));
  const filename = requireCjs.resolve('../supabase.js');
  requireCjs.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: { serviceRoleHelpers: { listTableRows, getTableRow } },
  };
  delete requireCjs.cache[requireCjs.resolve('../coupons.js')];
});

afterEach(() => {
  delete requireCjs.cache[requireCjs.resolve('../supabase.js')];
  delete requireCjs.cache[requireCjs.resolve('../coupons.js')];
});

const check = (coupon, identity) =>
  requireCjs('../coupons.js').validateCouponAudience(coupon, identity);
const approved = (extra) => ({ payment_status: 'approved', ...extra });

describe('validateCouponAudience', () => {
  it('"todos" vale até sem conta', async () => {
    expect(await check({ audience: 'all' }, {})).toEqual({ ok: true });
  });

  it('público restrito exige conta', async () => {
    expect((await check({ audience: 'customers' }, {})).ok).toBe(false);
    expect((await check({ audience: 'customers' }, { email: 'a@b.com', uid: UID })).ok).toBe(true);
  });

  it('lista de e-mails ignora maiúsculas', async () => {
    const coupon = { audience: 'emails', eligible_emails: ['Ana@Escola.com'] };
    expect((await check(coupon, { email: 'ana@escola.COM' })).ok).toBe(true);
    expect((await check(coupon, { email: 'outra@escola.com' })).ok).toBe(false);
  });

  it('primeira compra: recusa quem já comprou pela conta ou por e-mail com outra caixa', async () => {
    orders = [approved({ customer_id: 'outro', customer_email: 'Old@Ex.com' })];
    expect((await check({ audience: 'new_customers' }, { email: 'old@ex.com' })).ok).toBe(false);

    orders = [approved({ customer_id: UID, customer_email: 'antigo@ex.com' })];
    expect(
      (await check({ audience: 'new_customers' }, { email: 'novo@ex.com', uid: UID })).ok,
    ).toBe(false);
  });

  it('primeira compra: pedido pendente/recusado não conta', async () => {
    orders = [{ customer_id: UID, customer_email: 'a@b.com', payment_status: 'pending' }];
    expect((await check({ audience: 'new_customers' }, { email: 'a@b.com', uid: UID })).ok).toBe(
      true,
    );
  });

  it('quem já comprou: exige ao menos uma compra aprovada', async () => {
    const coupon = { audience: 'returning_customers' };
    expect((await check(coupon, { email: 'a@b.com', uid: UID })).ok).toBe(false);
    orders = [approved({ customer_id: UID, customer_email: 'a@b.com' })];
    expect((await check(coupon, { email: 'a@b.com', uid: UID })).ok).toBe(true);
  });

  it('meta: a cada X compras aprovadas, um uso', async () => {
    const coupon = { id: 1, audience: 'purchase_milestone', purchases_required: 2 };
    orders = [approved({ customer_id: UID }), approved({ customer_id: UID })];
    expect((await check(coupon, { email: 'a@b.com', uid: UID })).ok).toBe(true);
    usage = { used_count: 1 };
    expect((await check(coupon, { email: 'a@b.com', uid: UID })).ok).toBe(false);
    orders.push(approved({ customer_id: UID }), approved({ customer_id: UID }));
    expect((await check(coupon, { email: 'a@b.com', uid: UID })).ok).toBe(true);
  });
});
