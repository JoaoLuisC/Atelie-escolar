import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installPartialMock,
  resetModuleRegistry,
} from '../../handlers/__tests__/money-path-harness.js';

// lib/seller-scope.js — no painel da loja, a professora vê só pedidos e
// clientes dos materiais DELA, e o valor só da parte dela. Admin vê tudo.

const requireCjs = createRequire(import.meta.url);
const MARCIA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// p1 é da Márcia; p2 é de outra professora.
const ITEMS = [
  { order_id: 'o1', product_id: 'p1', unit_price: 20, quantity: 1, total_price: 20 },
  { order_id: 'o2', product_id: 'p1', unit_price: 10, quantity: 1, total_price: 10 },
  { order_id: 'o2', product_id: 'p2', unit_price: 30, quantity: 1, total_price: 30 },
  { order_id: 'o3', product_id: 'p2', unit_price: 50, quantity: 1, total_price: 50 },
];

const ORDERS = [
  // Só material dela, com cupom: total já com desconto (20 → 18).
  { id: 'o1', customer_email: 'ana@x.com', total_amount: 18, discount_amount: 2 },
  // Misto: dela 10 de 40 → 25% do total.
  { id: 'o2', customer_email: 'bia@x.com', total_amount: 40, discount_amount: 0 },
  // Só da outra professora: some do painel dela.
  { id: 'o3', customer_email: 'caio@x.com', total_amount: 50, discount_amount: 0 },
];

function filterIn(rows, filters = []) {
  return rows.filter((row) =>
    filters.every((f) => {
      if (f.operator === 'in') {
        const values = String(f.value).slice(1, -1).split(',');
        return values.includes(String(row[f.column]));
      }
      return String(row[f.column]) === String(f.value);
    }),
  );
}

beforeEach(() => {
  resetModuleRegistry();
  installPartialMock('../../lib/supabase', {
    serviceRoleHelpers: {
      listTableRows: vi.fn(async (table, { filters }) => {
        if (table === 'products') {
          return filterIn(
            [
              { id: 'p1', seller_id: MARCIA },
              { id: 'p2', seller_id: 'outra' },
            ],
            filters,
          );
        }
        if (table === 'order_items') return filterIn(ITEMS, filters);
        return [];
      }),
    },
  });
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('scopeOrderRows', () => {
  it('admin (sem recorte) vê todos os pedidos, com o valor cheio', async () => {
    const { scopeOrderRows } = requireCjs('../seller-scope.js');
    const { orders } = await scopeOrderRows(ORDERS, null);
    expect(orders).toBe(ORDERS);
  });

  it('professora vê só os pedidos com material dela, no valor da parte dela', async () => {
    const { scopeOrderRows } = requireCjs('../seller-scope.js');
    const { orders, productIds } = await scopeOrderRows(ORDERS, { sellerId: MARCIA });

    expect(orders.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(orders[0]).toMatchObject({ total_amount: 18, discount_amount: 2 });
    expect(orders[1]).toMatchObject({ total_amount: 10 });
    expect([...productIds]).toEqual(['p1']);
  });

  it('professora sem produto não vê pedido nenhum', async () => {
    const { scopeOrderRows } = requireCjs('../seller-scope.js');
    const { orders } = await scopeOrderRows(ORDERS, { sellerId: 'sem-produtos' });
    expect(orders).toEqual([]);
  });
});

describe('itens e clientes', () => {
  it('só os itens dos materiais dela', () => {
    const { scopeItemRows } = requireCjs('../seller-scope.js');
    expect(scopeItemRows(ITEMS, new Set(['p1'])).map((i) => i.order_id)).toEqual(['o1', 'o2']);
    expect(scopeItemRows(ITEMS, null)).toBe(ITEMS);
  });

  it('cliente = quem comprou dela (por e-mail ou conta)', () => {
    const { scopeCustomerRows } = requireCjs('../seller-scope.js');
    const profiles = [
      { id: 'u1', email: 'ANA@x.com' },
      { id: 'u2', email: 'bia@x.com' },
      { id: 'u3', email: 'caio@x.com' },
      { id: 'u4', email: 'outro@x.com' },
    ];
    const scopedOrders = [
      { customer_email: 'ana@x.com' },
      { customer_email: '', customer_id: 'u2' },
    ];
    expect(scopeCustomerRows(profiles, scopedOrders).map((p) => p.id)).toEqual(['u1', 'u2']);
  });
});

describe('getSellerScope', () => {
  it('só sessão de professora tem recorte', () => {
    resetModuleRegistry();
    const session = { role: 'seller', userId: MARCIA };
    installPartialMock('../../lib/admin-session', { getStaffSession: () => session });
    const { getSellerScope } = requireCjs('../seller-scope.js');
    expect(getSellerScope({})).toEqual({ sellerId: MARCIA });
    session.role = 'admin';
    expect(getSellerScope({})).toBeNull();
  });
});
