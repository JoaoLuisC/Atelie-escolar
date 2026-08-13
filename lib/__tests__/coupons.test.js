import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const { normalizeCode, buildEligibleSet, computeDiscount, validateCouponState } =
  requireCjs('../coupons.js');
const { ERROR_CODES } = requireCjs('../http.js');

// ════════════════════════════════════════════════════════════════════
// `lib/coupons.js` decide QUANTO desconto o cliente recebe e se o cupom vale.
// É lógica de dinheiro compartilhada entre api/validate-coupon.js (prévia) e
// api/create-payment.js (cobrança) — as duas PRECISAM concordar, senão o
// cliente vê um total na tela e paga outro.
// ════════════════════════════════════════════════════════════════════

function coupon(overrides = {}) {
  return {
    id: 'c1',
    code: 'BEM10',
    discount_type: 'percent',
    discount_value: 10,
    active: true,
    used_count: 0,
    max_uses: null,
    valid_from: null,
    valid_until: null,
    applies_to: null,
    min_order_amount: null,
    ...overrides,
  };
}

describe('normalizeCode', () => {
  it('apara, sobe para maiúscula e limita o tamanho', () => {
    expect(normalizeCode('  bem10 ')).toBe('BEM10');
    expect(normalizeCode('a'.repeat(100))).toHaveLength(64);
  });

  it('valor ausente vira string vazia, não "undefined"', () => {
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('validateCouponState', () => {
  it('cupom inexistente é COUPON_NOT_FOUND', () => {
    const state = validateCouponState(null, 100);
    expect(state.ok).toBe(false);
    expect(state.code).toBe(ERROR_CODES.COUPON_NOT_FOUND);
  });

  it('emite os códigos canônicos da regra A2, não grafia própria', () => {
    const casos = [
      [coupon({ active: false }), ERROR_CODES.COUPON_INACTIVE],
      [coupon({ valid_from: '2999-01-01T00:00:00Z' }), ERROR_CODES.COUPON_NOT_YET_VALID],
      [coupon({ valid_until: '2000-01-01T00:00:00Z' }), ERROR_CODES.COUPON_EXPIRED],
      [coupon({ max_uses: 5, used_count: 5 }), ERROR_CODES.COUPON_EXHAUSTED],
      [coupon({ min_order_amount: 500 }), ERROR_CODES.COUPON_MINIMUM_NOT_MET],
    ];
    for (const [c, expected] of casos) {
      const state = validateCouponState(c, 100);
      expect(state.ok).toBe(false);
      expect(state.code).toBe(expected);
      // Toda recusa precisa de mensagem para humano além do código.
      expect(String(state.message).length).toBeGreaterThan(0);
    }
  });

  it('`used_count` abaixo de `max_uses` ainda vale', () => {
    expect(validateCouponState(coupon({ max_uses: 5, used_count: 4 }), 100).ok).toBe(true);
  });

  it('subtotal exatamente no mínimo é aceito', () => {
    // Borda: `<` e não `<=`, senão um pedido de exatamente R$ 50 com mínimo
    // de R$ 50 seria recusado.
    expect(validateCouponState(coupon({ min_order_amount: 50 }), 50).ok).toBe(true);
    expect(validateCouponState(coupon({ min_order_amount: 50 }), 49.99).ok).toBe(false);
  });
});

describe('buildEligibleSet', () => {
  const items = [
    { productId: 'p1', categoryId: 'c1' },
    { productId: 'p2', categoryId: 'c2' },
    { productId: 'p3', categoryId: null },
  ];

  it('sem restrição, todos os itens são elegíveis', () => {
    for (const appliesTo of [null, undefined, {}, { product_ids: [], category_ids: [] }]) {
      const { eligible, restricted } = buildEligibleSet(appliesTo, items);
      expect(restricted).toBe(false);
      expect(eligible).toHaveLength(3);
    }
  });

  it('filtra por produto', () => {
    const { eligible, restricted } = buildEligibleSet({ product_ids: ['p2'] }, items);
    expect(restricted).toBe(true);
    expect(eligible.map((i) => i.productId)).toEqual(['p2']);
  });

  it('filtra por categoria', () => {
    const { eligible } = buildEligibleSet({ category_ids: ['c2'] }, items);
    expect(eligible.map((i) => i.productId)).toEqual(['p2']);
  });

  it('produto OU categoria — a união, não a interseção', () => {
    const { eligible } = buildEligibleSet({ product_ids: ['p1'], category_ids: ['c2'] }, items);
    expect(eligible.map((i) => i.productId).sort()).toEqual(['p1', 'p2']);
  });

  it('item sem categoria não casa com restrição por categoria', () => {
    // `String(item.categoryId || '')` vira '' — não pode casar com um id real.
    const { eligible } = buildEligibleSet({ category_ids: [''] }, items);
    expect(eligible.map((i) => i.productId)).toEqual(['p3']);
  });

  it('compara como string — id numérico e textual são o mesmo item', () => {
    const numericos = [{ productId: 7, categoryId: 9 }];
    expect(buildEligibleSet({ product_ids: [7] }, numericos).eligible).toHaveLength(1);
    expect(buildEligibleSet({ product_ids: ['7'] }, numericos).eligible).toHaveLength(1);
  });
});

describe('computeDiscount', () => {
  it('percentual sobre o subtotal quando o cupom não é restrito', () => {
    expect(computeDiscount(coupon({ discount_value: 10 }), 200, 0)).toBe(20);
  });

  it('percentual sobre o subtotal ELEGÍVEL quando é restrito', () => {
    const restrito = coupon({ discount_value: 10, applies_to: { product_ids: ['p1'] } });
    expect(computeDiscount(restrito, 200, 50)).toBe(5);
  });

  it('grampeia o percentual em 0..100', () => {
    expect(computeDiscount(coupon({ discount_value: 150 }), 100, 0)).toBe(100);
    expect(computeDiscount(coupon({ discount_value: -10 }), 100, 0)).toBe(0);
  });

  it('valor fixo nunca passa da base — desconto não vira crédito', () => {
    const fixo = coupon({ discount_type: 'fixed', discount_value: 999 });
    expect(computeDiscount(fixo, 100, 0)).toBe(100);
  });

  it('valor fixo negativo vira zero', () => {
    const fixo = coupon({ discount_type: 'fixed', discount_value: -50 });
    expect(computeDiscount(fixo, 100, 0)).toBe(0);
  });

  it('base zero ou negativa não gera desconto', () => {
    expect(computeDiscount(coupon(), 0, 0)).toBe(0);
    expect(computeDiscount(coupon(), -10, 0)).toBe(0);
  });

  it('arredonda ao centavo', () => {
    // 33% de 19,99 = 6,5967 → 6,60
    expect(computeDiscount(coupon({ discount_value: 33 }), 19.99, 0)).toBe(6.6);
  });

  it('cupom restrito sem item elegível não desconta nada', () => {
    const restrito = coupon({ applies_to: { category_ids: ['nao-existe'] } });
    expect(computeDiscount(restrito, 200, 0)).toBe(0);
  });
});
