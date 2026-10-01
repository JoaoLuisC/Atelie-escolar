import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  createSupabaseStore,
  expectApiError,
  installPartialMock,
  installRateLimitPassthrough,
  installSecurityLoggerMock,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

const requireCjs = createRequire(import.meta.url);

// ════════════════════════════════════════════════════════════════════
// CROSS-03 / CROSS-08 / LOJA-40 — a tela precisa mostrar o valor que será
// cobrado.
//
// O caso real da validação: o preço foi de R$ 9,90 para R$ 12,90 no painel, o
// carrinho continuou com 9,90 e a prévia do cupom (10%) somou o preço do
// NAVEGADOR — a tela mostrou R$ 35,82, e o create-payment, que relê o banco,
// cobraria R$ 38,52. A prévia agora lê a mesma fonte que a cobrança.
// ════════════════════════════════════════════════════════════════════

const P1 = '11111111-2222-3333-4444-555555555555';
const P2 = '11111112-2222-3333-4444-555555555555';
const PAUSADO = '11111113-2222-3333-4444-555555555555';

function productRow(id, price, overrides = {}) {
  return {
    id,
    name: `Produto ${id.slice(0, 8)}`,
    description: '',
    price,
    download_url: 'product_files/x.pdf',
    active: true,
    category_id: 'cat-real',
    ...overrides,
  };
}

const CUPOM_10 = {
  id: 'c1',
  code: 'TESTE-QA-P3-01',
  discount_type: 'percent',
  discount_value: 10,
  active: true,
  used_count: 0,
  max_uses: 5,
  valid_from: null,
  valid_until: null,
  applies_to: null,
  min_order_amount: null,
};

function arrange({ products, coupons = [CUPOM_10] }) {
  const store = createSupabaseStore({ products, coupons, orders: [], order_items: [] });
  installSupabaseMock(store);
  installSecurityLoggerMock();
  installRateLimitPassthrough();
  return store;
}

function post(body, headers = {}) {
  return { method: 'POST', headers, query: {}, body };
}

describe('validate-coupon — preço do servidor, não do navegador', () => {
  beforeEach(() => resetModuleRegistry());
  afterEach(() => {
    vi.restoreAllMocks();
    resetModuleRegistry();
  });

  it('o desconto é calculado sobre o preço ATUAL do banco (CROSS-03)', async () => {
    arrange({ products: [productRow(P1, 12.9), productRow(P2, 29.9)] });
    const handler = loadHandler('../validate-coupon.js');
    const res = createMockRes();

    // O navegador ainda manda o preço velho (9,90) — e é ignorado.
    await handler(
      post({
        code: 'TESTE-QA-P3-01',
        items: [
          { productId: P1, price: 9.9, quantity: 1 },
          { productId: P2, price: 29.9, quantity: 1 },
        ],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.subtotal).toBe(42.8);
    expect(res.body.discount).toBe(4.28);
    // O mesmo número que o create-payment cobraria: (12,90 + 29,90) − 10%.
    expect(res.body.total).toBe(38.52);
    expect(res.body.items.map((item) => item.price)).toEqual([12.9, 29.9]);
  });

  it('categoria vem do banco, não do `categoryId` enviado (CROSS-08)', async () => {
    arrange({
      products: [productRow(P1, 10)],
      coupons: [{ ...CUPOM_10, applies_to: { category_ids: ['cat-real'] } }],
    });
    const handler = loadHandler('../validate-coupon.js');
    const res = createMockRes();

    await handler(
      post({
        code: 'TESTE-QA-P3-01',
        items: [{ productId: P1, categoryId: 'categoria-fantasma', quantity: 1 }],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.discount).toBe(1);
  });

  it('carrinho vazio não "aplica" cupom de −R$ 0,00 (CROSS-05)', async () => {
    arrange({ products: [] });
    const handler = loadHandler('../validate-coupon.js');
    const res = createMockRes();

    await handler(post({ code: 'TESTE-QA-P3-01', items: [] }), res);

    expectApiError(res, { status: 422, code: 'VALIDATION_FAILED', message: /Adicione produtos/ });
  });

  it('mínimo do cupom sai no formato brasileiro (CROSS-05)', async () => {
    arrange({
      products: [productRow(P1, 10)],
      coupons: [{ ...CUPOM_10, min_order_amount: 1000 }],
    });
    const handler = loadHandler('../validate-coupon.js');
    const res = createMockRes();

    await handler(post({ code: 'TESTE-QA-P3-01', items: [{ productId: P1, quantity: 1 }] }), res);

    expectApiError(res, { status: 422, code: 'COUPON_MINIMUM_NOT_MET' });
    expect(res.body.error.message).toBe('Pedido mínimo para este cupom é R$ 1.000,00.');
  });

  it('modo cotação devolve preço atual e marca o pausado como indisponível (CROSS-03/04)', async () => {
    arrange({
      products: [productRow(P1, 12.9), productRow(PAUSADO, 5, { active: false })],
    });
    const handler = loadHandler('../validate-coupon.js');
    const res = createMockRes();

    await handler(
      post({
        quote: true,
        items: [
          { productId: P1, quantity: 1 },
          { productId: PAUSADO, quantity: 1 },
          { productId: 'nao-e-uuid', quantity: 1 },
        ],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.subtotal).toBe(12.9);
    expect(res.body.items).toEqual([
      expect.objectContaining({ productId: P1, price: 12.9, available: true }),
      expect.objectContaining({ productId: PAUSADO, available: false }),
      expect.objectContaining({ productId: 'nao-e-uuid', available: false }),
    ]);
  });
});

describe('create-payment — logado, o pedido é da conta (LOJA-40)', () => {
  const originalEnv = {};

  beforeEach(() => {
    for (const key of ['MERCADOPAGO_ACCESS_TOKEN', 'APP_URL', 'CUSTOMER_SESSION_SECRET']) {
      originalEnv[key] = process.env[key];
    }
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token';
    process.env.APP_URL = 'https://loja.teste';
    process.env.CUSTOMER_SESSION_SECRET = 'segredo-de-teste-da-sessao-do-cliente';
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

  function sessionCookieFor(user) {
    const { setCustomerSessionCookie } = requireCjs('../../lib/customer-session.js');
    const res = createMockRes();
    setCustomerSessionCookie(res, user);
    return String(res.headers['Set-Cookie']).split(';')[0];
  }

  async function criarPedido(headers) {
    const store = arrange({ products: [productRow(P1, 12.9)], coupons: [] });
    const createPaymentPreference = vi.fn(async () => ({
      id: 'pref-1',
      init_point: 'https://mp/pagar',
    }));
    installPartialMock('../../lib/mercadopago-config', { createPaymentPreference });
    const handler = loadHandler('../create-payment.js');
    const res = createMockRes();
    await handler(
      post(
        {
          items: [{ productId: P1, quantity: 1 }],
          customer: { name: 'Ana Silva', email: 'outro@exemplo.com' },
        },
        headers,
      ),
      res,
    );
    return { store, res, createPaymentPreference };
  }

  it('com sessão, grava o e-mail da CONTA, não o do formulário', async () => {
    const cookie = sessionCookieFor({ uid: 'uid-1', email: 'Conta@Escola.com', name: 'Ana' });
    const { store, res, createPaymentPreference } = await criarPedido({ cookie });

    expect(res.statusCode).toBe(200);
    expect(store.rows('orders')[0].customer_email).toBe('conta@escola.com');
    expect(createPaymentPreference.mock.calls[0][2]).toBe('conta@escola.com');
  });

  it('convidado (sem sessão) segue com o e-mail do formulário', async () => {
    const { store, res } = await criarPedido({});

    expect(res.statusCode).toBe(200);
    expect(store.rows('orders')[0].customer_email).toBe('outro@exemplo.com');
  });
});
