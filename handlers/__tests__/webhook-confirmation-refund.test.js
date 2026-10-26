import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSignedWebhookHeaders,
  createMockRes,
  createSupabaseStore,
  installMercadoPagoSdkMock,
  installModuleMock,
  installSecurityLoggerMock,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// Webhook — os dois comportamentos que faltavam (13-ROADMAP §3.12 e estorno):
//
//   • na PRIMEIRA aprovação sai o e-mail de confirmação do pedido (antes não
//     saía nada); reentrega não manda de novo;
//   • estorno/chargeback de pedido aprovado tira o pedido de `approved` e
//     queima os links de download (antes seguiam valendo até expirar).
// ════════════════════════════════════════════════════════════════════

const WEBHOOK_SECRET = 'segredo-de-webhook-fixo-para-teste';
const ORDER_CODE = 'ORD-0001';
const ORDER_ID = 10;
const ORDER_TOTAL = 200;

function baseOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    order_code: ORDER_CODE,
    customer_name: 'Cliente Teste',
    customer_email: 'dono@real.com',
    status: 'pending',
    payment_status: 'pending',
    total_amount: ORDER_TOTAL,
    payment_id: null,
    created_at: '2026-08-12T10:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

function payment(overrides = {}) {
  return {
    id: 'MP-1',
    status: 'approved',
    external_reference: ORDER_CODE,
    transaction_amount: ORDER_TOTAL,
    currency_id: 'BRL',
    live_mode: true,
    payment_method_id: 'pix',
    ...overrides,
  };
}

function token(overrides = {}) {
  return {
    order_id: ORDER_ID,
    product_id: 'p1',
    product_name: 'Kit de Atividades',
    token: 'token-vivo',
    used: false,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    created_at: '2026-08-12T10:05:00.000Z',
    ...overrides,
  };
}

function arrange({ mpPayment = payment(), order = baseOrder(), tokens = [], provision } = {}) {
  const store = createSupabaseStore({
    orders: [order],
    order_items: [
      {
        id: 1,
        order_id: ORDER_ID,
        product_id: 'p1',
        product_name: 'Kit de Atividades',
        unit_price: 200,
        quantity: 1,
      },
    ],
    download_tokens: tokens,
  });
  installSupabaseMock(store);
  installSecurityLoggerMock();

  const recordEvent = vi.fn(async () => {});
  installModuleMock('../../lib/analytics-events', { recordEvent });

  const ensureCustomerAccountFromCheckout = vi.fn(async () => provision || { created: false });
  installModuleMock('../../lib/customer-account-provisioning', {
    ensureCustomerAccountFromCheckout,
  });

  const sendOrderConfirmation = vi.fn(async () => ({ sent: true }));
  installModuleMock('../../lib/order-confirmation', { sendOrderConfirmation });

  installMercadoPagoSdkMock({ payment: mpPayment });

  return { store, recordEvent, sendOrderConfirmation, handler: loadHandler('../webhook.js') };
}

function webhookRequest(requestId = 'req-1') {
  return {
    method: 'POST',
    headers: {
      'user-agent': 'MercadoPago WebHook v1.0 payment',
      ...buildSignedWebhookHeaders({ paymentId: 'MP-1', requestId, secret: WEBHOOK_SECRET }),
    },
    body: { type: 'payment', data: { id: 'MP-1' } },
  };
}

const originalEnv = {};

beforeEach(() => {
  for (const key of [
    'APP_ENV',
    'NODE_ENV',
    'VERCEL_ENV',
    'WEBHOOK_SECRET',
    'MERCADOPAGO_ACCESS_TOKEN',
  ]) {
    originalEnv[key] = process.env[key];
  }
  process.env.APP_ENV = 'test';
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL_ENV;
  process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-access-token';
  resetModuleRegistry();
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('confirmação do pedido por e-mail', () => {
  it('sai na primeira aprovação, avisando quando a conta acabou de ser criada', async () => {
    const { handler, sendOrderConfirmation } = arrange({ provision: { created: true } });

    await handler(webhookRequest(), createMockRes());

    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
    const [{ order, isNewAccount }] = sendOrderConfirmation.mock.calls[0];
    expect(order.order_code).toBe(ORDER_CODE);
    expect(order.customer_email).toBe('dono@real.com');
    expect(isNewAccount).toBe(true);
  });

  it('reentrega da notificação aprovada não manda o e-mail de novo', async () => {
    const { handler, sendOrderConfirmation } = arrange();

    await handler(webhookRequest('req-1'), createMockRes());
    await handler(webhookRequest('req-2'), createMockRes());

    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('pagamento que não reconcilia com o pedido não confirma nada', async () => {
    const { handler, sendOrderConfirmation } = arrange({
      mpPayment: payment({ transaction_amount: 1 }),
    });

    await handler(webhookRequest(), createMockRes());

    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });
});

describe('estorno e chargeback', () => {
  it.each(['refunded', 'charged_back'])(
    '%s de pedido aprovado: pedido sai de approved e os links são queimados',
    async (status) => {
      const { handler, store, recordEvent } = arrange({
        mpPayment: payment({ status }),
        order: baseOrder({ status: 'completed', payment_status: 'approved', payment_id: 'MP-1' }),
        tokens: [token()],
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      expect(res.statusCode).toBe(200);
      const pedido = store.rows('orders')[0];
      expect(pedido.payment_status).toBe(status);
      expect(pedido.status).toBe('refunded');

      const [link] = store.rows('download_tokens');
      expect(link.used).toBe(true);
      expect(new Date(link.expires_at).getTime()).toBeLessThanOrEqual(Date.now());

      expect(recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'payment_refunded' }),
      );
    },
  );

  it('estorno de pedido que não estava aprovado não mexe em nada', async () => {
    const { handler, store, recordEvent } = arrange({
      mpPayment: payment({ status: 'refunded' }),
      order: baseOrder({ payment_status: 'pending' }),
      tokens: [token()],
    });

    await handler(webhookRequest(), createMockRes());

    expect(store.rows('orders')[0].payment_status).toBe('pending');
    expect(store.rows('download_tokens')[0].used).toBe(false);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('reentrega do estorno é idempotente', async () => {
    const { handler, recordEvent } = arrange({
      mpPayment: payment({ status: 'refunded' }),
      order: baseOrder({ status: 'completed', payment_status: 'approved' }),
      tokens: [token()],
    });

    await handler(webhookRequest('req-1'), createMockRes());
    await handler(webhookRequest('req-2'), createMockRes());

    expect(recordEvent).toHaveBeenCalledTimes(1);
  });
});
