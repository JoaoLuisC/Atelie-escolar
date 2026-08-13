import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const { allocateDiscountCents, percentOfCents, sumItemsCents, toCents, toCentsOrZero, toReais } =
  requireCjs('../money.js');

// ════════════════════════════════════════════════════════════════════
// Regra E3. O que estes testes protegem não é a aritmética em si — é a
// PROPRIEDADE que torna possível apertar a tolerância de 1 centavo em
// lib/payment-integrity.js: a soma do rateio fecha EXATAMENTE com o desconto.
// ════════════════════════════════════════════════════════════════════

describe('toCents', () => {
  it('arredonda em vez de truncar (19.99 * 100 dá 1998.999… em IEEE 754)', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.07)).toBe(7);
    expect(toCents('1234.56')).toBe(123456);
  });

  it('devolve NaN para valor ilegível — nunca 0', () => {
    // Coerção para 0 é o bug que transformava total ausente em "pedido de
    // R$ 0,00, qualquer coisa paga" (ver lib/payment-integrity.js).
    for (const value of [null, undefined, '', 'abc', {}, NaN, Infinity]) {
      expect(Number.isNaN(toCents(value))).toBe(true);
    }
  });

  it('toCentsOrZero só é permissivo onde 0 é o valor correto', () => {
    expect(toCentsOrZero(null)).toBe(0);
    expect(toCentsOrZero(10.5)).toBe(1050);
  });
});

describe('toReais', () => {
  it('volta para 2 casas', () => {
    expect(toReais(1999)).toBe(19.99);
    expect(toReais(0)).toBe(0);
  });

  it('ida e volta é identidade para valores de 2 casas', () => {
    for (const value of [0, 0.01, 9.99, 19.9, 100, 1234.56, 99999.99]) {
      expect(toReais(toCents(value))).toBe(value);
    }
  });
});

describe('sumItemsCents', () => {
  it('soma preço × quantidade sem drift', () => {
    // Em ponto flutuante, 0.1 × 3 dá 0.30000000000000004.
    const items = [
      { price: 0.1, quantity: 3 },
      { price: 0.2, quantity: 1 },
    ];
    expect(sumItemsCents(items)).toBe(50);
    expect(toReais(sumItemsCents(items))).toBe(0.5);
  });

  it('ignora quantidade negativa e valor ilegível em vez de propagar NaN', () => {
    expect(
      sumItemsCents([
        { price: 'x', quantity: 2 },
        { price: 10, quantity: -1 },
      ]),
    ).toBe(0);
  });

  it('lista vazia ou inválida é zero', () => {
    expect(sumItemsCents([])).toBe(0);
    expect(sumItemsCents(null)).toBe(0);
  });
});

describe('percentOfCents', () => {
  it('arredonda ao centavo', () => {
    expect(percentOfCents(1999, 10)).toBe(200);
    expect(percentOfCents(333, 33)).toBe(110);
  });

  it('grampeia o percentual em 0..100', () => {
    expect(percentOfCents(1000, -5)).toBe(0);
    expect(percentOfCents(1000, 150)).toBe(1000);
  });
});

describe('allocateDiscountCents', () => {
  it('a soma do rateio é EXATAMENTE o desconto', () => {
    // Três itens iguais e 10 centavos: 10/3 não é inteiro, então alguém
    // precisa receber o centavo extra — e a soma tem de fechar mesmo assim.
    const partes = allocateDiscountCents([1000, 1000, 1000], 10);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(10);
    expect(partes).toEqual([4, 3, 3]);
  });

  it('fecha para qualquer combinação de pesos e desconto', () => {
    const casos = [
      [[1999, 4999, 350], 1234],
      [[1, 1, 1, 1, 1, 1, 1], 3],
      [[100000, 1], 99999],
      [[750, 750], 1],
      [[333, 333, 334], 100],
    ];
    for (const [pesos, desconto] of casos) {
      const partes = allocateDiscountCents(pesos, desconto);
      expect(partes.reduce((a, b) => a + b, 0)).toBe(desconto);
      // Ninguém recebe desconto maior que o próprio peso.
      partes.forEach((parte, i) => expect(parte).toBeLessThanOrEqual(pesos[i]));
    }
  });

  it('é proporcional: peso maior recebe desconto maior ou igual', () => {
    const partes = allocateDiscountCents([100, 900], 100);
    expect(partes[1]).toBeGreaterThan(partes[0]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('nunca rateia mais que o total dos pesos', () => {
    expect(allocateDiscountCents([100, 100], 5000)).toEqual([100, 100]);
  });

  it('é determinístico — o mesmo carrinho dá sempre o mesmo rateio', () => {
    const pesos = [1999, 1999, 4999, 350];
    const primeira = allocateDiscountCents(pesos, 777);
    for (let i = 0; i < 20; i += 1) {
      expect(allocateDiscountCents(pesos, 777)).toEqual(primeira);
    }
  });

  it('desconto zero ou pesos zerados não produzem NaN', () => {
    expect(allocateDiscountCents([100, 200], 0)).toEqual([0, 0]);
    expect(allocateDiscountCents([0, 0], 50)).toEqual([0, 0]);
  });
});
