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

  /**
   * `coupons`/`couponCode` ligam o cupom ao pedido; `prepare(store)` roda com o
   * banco falso já montado, antes do handler — é onde um teste injeta a falha
   * do banco que quer provocar.
   */
  async function criarPedido(headers, { coupons = [], couponCode, prepare } = {}) {
    const store = arrange({ products: [productRow(P1, 12.9)], coupons });
    const createPaymentPreference = vi.fn(async () => ({
      id: 'pref-1',
      init_point: 'https://mp/pagar',
    }));
    installPartialMock('../../lib/mercadopago-config', { createPaymentPreference });
    prepare?.(store);
    const handler = loadHandler('../create-payment.js');
    const res = createMockRes();
    await handler(
      post(
        {
          items: [{ productId: P1, quantity: 1 }],
          customer: { name: 'Ana Silva', email: 'outro@exemplo.com' },
          acceptedDownloadTerms: true,
          ...(couponCode ? { couponCode } : {}),
        },
        headers,
      ),
      res,
    );
    return { store, res, createPaymentPreference };
  }

  /** O 23503 que o PostgREST devolve numa FK violada (ex.: customer_id sem auth.users). */
  function foreignKeyViolation(table = 'orders', constraint = 'orders_customer_id_fkey') {
    const error = new Error(
      `insert or update on table "${table}" violates foreign key constraint "${constraint}"`,
    );
    error.statusCode = 409;
    error.details = { code: '23503' };
    return error;
  }

  it('com sessão, grava o e-mail da CONTA, não o do formulário', async () => {
    const cookie = sessionCookieFor({ uid: 'uid-1', email: 'Conta@Escola.com', name: 'Ana' });
    const { store, res, createPaymentPreference } = await criarPedido({ cookie });

    expect(res.statusCode).toBe(200);
    expect(store.rows('orders')[0].customer_email).toBe('conta@escola.com');
    expect(createPaymentPreference.mock.calls[0][2]).toBe('conta@escola.com');
  });

  it('convidado (sem sessão) precisa criar ou acessar a conta', async () => {
    const { store, res } = await criarPedido({});

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('CUSTOMER_SESSION_INVALID');
    expect(store.rows('orders')).toHaveLength(0);
  });

  it('cookie válido de conta já excluída: 401 que limpa o cookie, não 500', async () => {
    // A sessão é assinada e está na validade, mas a conta foi apagada (LGPD):
    // o INSERT em orders viola a FK para auth.users. Para a cliente é "entre de
    // novo", não "erro ao criar pagamento".
    const cookie = sessionCookieFor({ uid: 'uid-apagado', email: 'ex@escola.com', name: 'Ex' });
    const { store, res, createPaymentPreference } = await criarPedido(
      { cookie },
      {
        prepare: (s) => s.spies.insertIntoTable.mockRejectedValueOnce(foreignKeyViolation()),
      },
    );

    expectApiError(res, {
      status: 401,
      code: 'CUSTOMER_SESSION_INVALID',
      message: 'Sua conta não foi encontrada. Entre de novo.',
    });
    expect(String(res.headers['Set-Cookie'])).toMatch(/Max-Age=0/);
    expect(store.rows('orders')).toHaveLength(0);
    expect(createPaymentPreference).not.toHaveBeenCalled();
  });

  it('a mesma falha devolve a reserva do cupom que já tinha sido feita', async () => {
    const cookie = sessionCookieFor({ uid: 'uid-apagado', email: 'ex@escola.com', name: 'Ex' });
    const { store, res } = await criarPedido(
      { cookie },
      {
        coupons: [{ ...CUPOM_10, used_count: 0 }],
        couponCode: CUPOM_10.code,
        prepare: (s) => s.spies.insertIntoTable.mockRejectedValueOnce(foreignKeyViolation()),
      },
    );

    expect(res.statusCode).toBe(401);
    // Reservou (increment) e devolveu (decrement) — o cupom volta a zero.
    const rpcs = store.spies.supabaseRequest.mock.calls.map(([path]) => path);
    expect(rpcs).toEqual(['rpc/increment_coupon_usage', 'rpc/decrement_coupon_usage']);
    expect(store.rows('coupons')[0].used_count).toBe(0);
  });

  it('23503 depois do pedido criado NÃO derruba a sessão: é erro do pedido, não conta apagada', async () => {
    // Com `orders` já gravado, a FK que falha é de order_items. Segue pelo
    // catch genérico (que espelha o status do PostgREST) — sem 401 e sem
    // limpar o cookie de uma cliente que existe.
    const cookie = sessionCookieFor({ uid: 'uid-1', email: 'conta@escola.com', name: 'Ana' });
    const { res } = await criarPedido(
      { cookie },
      {
        prepare: (s) =>
          s.spies.insertIntoTable.mockImplementation(async (table, rows) => {
            if (table === 'order_items') {
              throw foreignKeyViolation('order_items', 'order_items_product_id_fkey');
            }
            const incoming = (Array.isArray(rows) ? rows : [rows]).map((row) => ({
              id: 'o1',
              ...row,
            }));
            s.state[table].push(...incoming);
            return incoming;
          }),
      },
    );

    expect(res.body.success).toBe(false);
    expect(res.statusCode).not.toBe(401);
    expect(res.body.error.code).not.toBe('CUSTOMER_SESSION_INVALID');
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});
