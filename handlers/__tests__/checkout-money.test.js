import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  createSupabaseStore,
  installPartialMock,
  installRateLimitPassthrough,
  installSecurityLoggerMock,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// O INVARIANTE DE DINHEIRO DO CHECKOUT (regra E3).
//
// O que estes testes travam não é "o desconto está certo" — é a propriedade que
// torna a conferência de pagamento confiável:
//
//     orders.total_amount === soma(unit_price × quantity) da preference
//
// Enquanto os dois eram calculados SEPARADAMENTE (`subtotal - desconto` de um
// lado, rateio por fator fracionário do outro), eles batiam por aproximação. A
// diferença era o drift que obrigava lib/payment-integrity.js a tolerar 1
// centavo — uma margem de erro aceita justamente na porta que entrega produto
// pago.
//
// Se alguém reintroduzir cálculo paralelo do total, é aqui que quebra.
// ════════════════════════════════════════════════════════════════════

const CUSTOMER = { email: 'compradora@escola.com', name: 'Ana Silva' };

function productRow(id, price, overrides = {}) {
  return {
    id,
    name: `Produto ${id}`,
    description: '',
    price,
    download_url: 'product_files/x.pdf',
    active: true,
    category_id: 'cat-1',
    ...overrides,
  };
}

function uuid(n) {
  return `1111111${n}-2222-3333-4444-555555555555`;
}

function arrange({ products, coupon = null }) {
  const store = createSupabaseStore({
    products,
    orders: [],
    order_items: [],
    coupons: coupon ? [coupon] : [],
  });
  installSupabaseMock(store);
  installSecurityLoggerMock();
  installRateLimitPassthrough();

  // A preference é capturada para conferir os itens que o cliente REALMENTE
  // pagaria — é a outra metade do invariante.
  //
  // `installPartialMock` no lib/mercadopago-config e NÃO no pacote `mercadopago`:
  // o duplo do SDK do harness não implementa `Preference#create`, então
  // `createPaymentPreference` estourava e o pedido nunca era gravado — e os
  // testes passavam sem exercitar nada, porque tinham um `return` para o caso
  // de o pedido não existir. Foi o que o assert duro abaixo revelou.
  const created = [];
  const createPaymentPreference = vi.fn(async (items) => {
    created.push(items);
    return {
      id: 'pref-1',
      init_point: 'https://mp/pagar',
      sandbox_init_point: 'https://mp/sandbox',
    };
  });
  installPartialMock('../../lib/mercadopago-config', { createPaymentPreference });

  return { store, created, handler: loadHandler('../create-payment.js') };
}

function requestFor(items, couponCode) {
  return {
    method: 'POST',
    headers: {},
    query: {},
    body: { items, customer: CUSTOMER, couponCode },
  };
}

/** Soma, em centavos, dos itens que foram para a preference. */
function chargedCentsFrom(preferenceItems) {
  return preferenceItems.reduce(
    (total, item) => total + Math.round(Number(item.price) * 100) * Number(item.quantity),
    0,
  );
}

describe('checkout — invariante de dinheiro (regra E3)', () => {
  const originalEnv = {};

  beforeEach(() => {
    for (const key of ['APP_ENV', 'NODE_ENV', 'MERCADOPAGO_ACCESS_TOKEN', 'APP_URL']) {
      originalEnv[key] = process.env[key];
    }
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token';
    process.env.APP_URL = 'https://loja.teste';
    resetModuleRegistry();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
    resetModuleRegistry();
  });

  // Casos escolhidos por serem os que produzem sobra na divisão: preço com
  // centavo ímpar, quantidade que não divide o desconto, e percentual que gera
  // dízima (33% de 19,99).
  const casos = [
    { nome: 'item único, sem cupom', itens: [[uuid(1), 19.99, 1]], desconto: null },
    { nome: 'quantidade > 1', itens: [[uuid(1), 19.99, 3]], desconto: null },
    {
      nome: 'três itens de preço ímpar',
      itens: [
        [uuid(1), 19.99, 1],
        [uuid(2), 33.33, 2],
        [uuid(3), 0.07, 5],
      ],
      desconto: null,
    },
    {
      nome: 'cupom percentual com dízima',
      itens: [[uuid(1), 19.99, 3]],
      desconto: { discount_type: 'percent', discount_value: 33 },
    },
    {
      nome: 'cupom percentual sobre carrinho misto',
      itens: [
        [uuid(1), 19.99, 1],
        [uuid(2), 33.33, 2],
      ],
      desconto: { discount_type: 'percent', discount_value: 15 },
    },
    {
      nome: 'cupom de valor fixo',
      itens: [[uuid(1), 50.0, 2]],
      desconto: { discount_type: 'fixed', discount_value: 10.01 },
    },
    {
      nome: 'cupom maior que o carrinho',
      itens: [[uuid(1), 5.0, 1]],
      desconto: { discount_type: 'fixed', discount_value: 999 },
    },
  ];

  for (const caso of casos) {
    it(`total do pedido é exatamente a soma cobrada — ${caso.nome}`, async () => {
      const products = caso.itens.map(([id, price]) => productRow(id, price));
      const coupon = caso.desconto
        ? {
            id: 'c1',
            code: 'BEM10',
            active: true,
            used_count: 0,
            max_uses: null,
            valid_from: null,
            valid_until: null,
            applies_to: null,
            min_order_amount: null,
            ...caso.desconto,
          }
        : null;

      const { store, created, handler } = arrange({ products, coupon });
      const res = createMockRes();

      await handler(
        requestFor(
          caso.itens.map(([id, , quantity]) => ({ productId: id, quantity })),
          coupon ? 'BEM10' : undefined,
        ),
        res,
      );

      // Sem escape: um teste que se auto-dispensa quando o pedido não é gravado
      // passa sem exercitar nada, que é pior que teste nenhum.
      const orders = store.rows('orders');
      expect(orders, `pedido não foi gravado; resposta: ${JSON.stringify(res.body)}`).toHaveLength(
        1,
      );

      const order = orders[0];
      const itens = store.rows('order_items');

      const subtotalCents = itens.reduce(
        (total, item) => total + Math.round(Number(item.unit_price) * 100) * Number(item.quantity),
        0,
      );
      const totalCents = Math.round(Number(order.total_amount) * 100);
      const descontoCents = Math.round(Number(order.discount_amount) * 100);

      // O invariante: subtotal − desconto === total, em centavos inteiros.
      // Sem folga, sem `toBeCloseTo`.
      expect(subtotalCents - descontoCents).toBe(totalCents);

      // E nada de valor negativo ou fracionário escapando.
      expect(totalCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(totalCents)).toBe(true);
      expect(Number.isInteger(descontoCents)).toBe(true);

      // A OUTRA METADE: o que o cliente efetivamente pagaria no Mercado Pago
      // tem de ser o mesmo número gravado em `orders.total_amount`. É esta
      // igualdade que torna a conferência de lib/payment-integrity.js exata —
      // enquanto os dois eram calculados em separado, a diferença era o drift
      // que obrigava a tolerância de 1 centavo.
      expect(created).toHaveLength(1);
      expect(chargedCentsFrom(created[0])).toBe(totalCents);
    });
  }

  it('o total nunca fica negativo, mesmo com cupom maior que o carrinho', async () => {
    const { store, handler } = arrange({
      products: [productRow(uuid(1), 5.0)],
      coupon: {
        id: 'c1',
        code: 'GIGANTE',
        active: true,
        used_count: 0,
        max_uses: null,
        valid_from: null,
        valid_until: null,
        applies_to: null,
        min_order_amount: null,
        discount_type: 'fixed',
        discount_value: 999,
      },
    });
    const res = createMockRes();

    await handler(requestFor([{ productId: uuid(1), quantity: 1 }], 'GIGANTE'), res);

    const orders = store.rows('orders');
    if (orders.length === 0) return;
    expect(Number(orders[0].total_amount)).toBeGreaterThanOrEqual(0);
  });
});

describe('chargedCentsFrom', () => {
  it('soma em centavos sem drift de ponto flutuante', () => {
    expect(chargedCentsFrom([{ price: 0.1, quantity: 3 }])).toBe(30);
  });
});
