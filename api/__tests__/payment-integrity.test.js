import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectApiError,
  buildSignedWebhookHeaders,
  createMockRes,
  createSupabaseStore,
  installMercadoPagoSdkMock,
  installModuleMock,
  installRateLimitPassthrough,
  installSecurityLoggerMock,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// RECONCILIAÇÃO DE VALOR — achado P0-1 da revisão 2026-08-12.
//
// O QUE ESTES TESTES TRAVAM
// Existem exatamente DUAS portas que transicionam um pedido para `approved` e
// emitem `download_tokens` — api/webhook.js (notificação do Mercado Pago) e
// api/verify-payment.js (polling do frontend, que consulta o MP por
// `external_reference`). Antes da correção, as duas decidiam só por
// `payment.status === 'approved'` + um `external_reference` que resolvesse
// para um pedido existente: `transaction_amount` e `currency_id` não eram
// lidos em lugar nenhum de api/ ou lib/. Um pagamento de R$ 0,01 apontado
// para o order_code de um pedido de R$ 200 entregava o produto digital
// inteiro.
//
// Por isso cada caso roda contra AS DUAS portas: fechar uma e esquecer a
// outra não fecha nada. E as asserções são sobre EFEITO — o estado final da
// linha em `orders` e a existência de linhas em `download_tokens` —, não
// sobre o corpo da resposta. Um handler que respondesse "não aprovado" mas
// tivesse escrito no banco antes passaria num teste de status code e falha
// aqui, que é o comportamento que interessa.
//
// A tolerância de 1 centavo é testada nas DUAS bordas (199,99 aprova /
// 199,98 recusa): sem o par, trocar `paid + 0.01 < due` por `paid < due` ou
// afrouxar a folga para R$ 1 passaria despercebido.
// ════════════════════════════════════════════════════════════════════

const WEBHOOK_SECRET = 'segredo-de-webhook-fixo-para-teste';
const ORDER_CODE = 'ORD-0001';
const ORDER_ID = 10;
const ORDER_TOTAL = 200;
const OWNER_EMAIL = 'dono@real.com';

const ORDER_ITEMS = [
  {
    id: 1,
    order_id: ORDER_ID,
    product_id: 'p1',
    product_name: 'Kit de Atividades',
    unit_price: 200,
    quantity: 1,
  },
];

function baseOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    order_code: ORDER_CODE,
    customer_name: 'Cliente Teste',
    customer_email: OWNER_EMAIL,
    status: 'pending',
    payment_status: 'pending',
    total_amount: ORDER_TOTAL,
    payment_id: null,
    created_at: '2026-08-12T10:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

function approvedPayment(overrides = {}) {
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

// ─── Arranjo do webhook ──────────────────────────────────────────────
// lib/mercadopago-config.js entra INTEIRO e de verdade: o HMAC e a janela de
// frescor são controles, não ruído a ser mockado. Só o SDK (`mercadopago`,
// que fala com a rede via node-fetch) é substituído.
function arrangeWebhook({ payment, order = baseOrder(), items = ORDER_ITEMS, tokens = [] } = {}) {
  const store = createSupabaseStore({
    orders: [order],
    order_items: items,
    download_tokens: tokens,
  });
  installSupabaseMock(store);
  const security = installSecurityLoggerMock();

  const recordEvent = vi.fn(async () => {});
  installModuleMock('../../lib/analytics-events', { recordEvent });

  const ensureCustomerAccountFromCheckout = vi.fn(async () => {});
  installModuleMock('../../lib/customer-account-provisioning', {
    ensureCustomerAccountFromCheckout,
  });

  const sdk = installMercadoPagoSdkMock({ payment });

  return {
    store,
    security,
    recordEvent,
    ensureCustomerAccountFromCheckout,
    sdk,
    handler: loadHandler('../webhook.js'),
  };
}

function webhookRequest(paymentId = 'MP-1', { requestId = 'req-1', tsSeconds } = {}) {
  return {
    method: 'POST',
    headers: {
      'user-agent': 'MercadoPago WebHook v1.0 payment',
      ...buildSignedWebhookHeaders({ paymentId, requestId, secret: WEBHOOK_SECRET, tsSeconds }),
    },
    body: { type: 'payment', data: { id: paymentId } },
  };
}

// ─── Arranjo do verify-payment ───────────────────────────────────────
function arrangeVerify({
  order = baseOrder(),
  items = ORDER_ITEMS,
  tokens = [],
  searchResults = [],
} = {}) {
  const store = createSupabaseStore({
    orders: order ? [order] : [],
    order_items: items,
    download_tokens: tokens,
  });
  installSupabaseMock(store);
  const security = installSecurityLoggerMock();
  installRateLimitPassthrough();

  const ensureCustomerAccountFromCheckout = vi.fn(async () => {});
  installModuleMock('../../lib/customer-account-provisioning', {
    ensureCustomerAccountFromCheckout,
  });

  // Aqui o HMAC não participa: o gate é o valor. Basta o cliente do SDK.
  installModuleMock('../../lib/mercadopago-config', {
    initializeMercadoPago: vi.fn(() => ({ cliente: 'falso' })),
    getPaymentInfo: vi.fn(async () => null),
    validateWebhookSignature: vi.fn(() => true),
    inspectWebhookSignature: vi.fn(() => ({ valid: true, reason: null })),
  });

  const sdk = installMercadoPagoSdkMock({ searchResults });

  return {
    store,
    security,
    ensureCustomerAccountFromCheckout,
    sdk,
    handler: loadHandler('../verify-payment.js'),
  };
}

function verifyRequest({ orderId = ORDER_CODE, email = OWNER_EMAIL } = {}) {
  return {
    method: 'POST',
    headers: { 'user-agent': 'jsdom' },
    body: { orderId, email },
    query: {},
  };
}

describe('reconciliação de valor pago × total do pedido (P0-1)', () => {
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

  // ── webhook.js ────────────────────────────────────────────────────
  describe('api/webhook.js', () => {
    it('não aprova nem emite token quando o valor pago é menor que o total', async () => {
      const { handler, store, security, recordEvent } = arrangeWebhook({
        payment: approvedPayment({ transaction_amount: 0.01 }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      // Estado do banco é a asserção que importa: nada foi liberado.
      const [order] = store.rows('orders');
      expect(order.payment_status).toBe('pending');
      expect(order.status).toBe('pending');
      expect(order.completed_at).toBeNull();
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(store.spies.insertIntoTable).not.toHaveBeenCalled();
      // O gate roda ANTES de qualquer escrita — nem o UPDATE condicional sai.
      expect(store.spies.updateTable).not.toHaveBeenCalled();
      expect(recordEvent).not.toHaveBeenCalled();

      // 200 deliberado (o MP reentrega tudo que não for 2xx; divergência de
      // valor é condição permanente). O corpo diz que não aprovou.
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/not approved/i);

      expect(security.recordSecurityEvent).toHaveBeenCalledTimes(1);
      const event = security.recordSecurityEvent.mock.calls[0][0];
      expect(event.eventName).toBe('payment_amount_mismatch');
      expect(event.severity).toBe('error');
      expect(event.properties.reason).toBe('amount_below_order_total');
      expect(event.properties.transaction_amount).toBe(0.01);
      expect(event.properties.order_total_amount).toBe(ORDER_TOTAL);
      // O evento carrega order_code e valores, mas nunca o e-mail do cliente.
      expect(JSON.stringify(event)).not.toContain(OWNER_EMAIL);
    });

    it('recusa moeda diferente de BRL mesmo com valor numericamente suficiente', async () => {
      const { handler, store, security } = arrangeWebhook({
        // 200 USD "≥" 200 BRL numa comparação crua — e compraria o produto
        // por menos de um terço do preço.
        payment: approvedPayment({ currency_id: 'USD', transaction_amount: ORDER_TOTAL }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'currency_mismatch',
      );
    });

    it('recusa quando transaction_amount está ausente (fail-closed)', async () => {
      const { handler, store, security } = arrangeWebhook({
        payment: approvedPayment({ transaction_amount: undefined }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      // "Não consegui conferir o valor" nunca pode significar "libera".
      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'payment_amount_unusable',
      );
    });

    it('recusa quando orders.total_amount é null (fail-closed no total do pedido)', async () => {
      const { handler, store, security } = arrangeWebhook({
        order: baseOrder({ total_amount: null }),
        payment: approvedPayment({ transaction_amount: 0.01 }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'order_total_unusable',
      );
    });

    it('recusa um centavo abaixo da tolerância (199,98 para um pedido de 200)', async () => {
      const { handler, store } = arrangeWebhook({
        payment: approvedPayment({ transaction_amount: 199.98 }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
    });

    it('aceita dentro da tolerância de arredondamento (199,99 para um pedido de 200)', async () => {
      const { handler, store } = arrangeWebhook({
        payment: approvedPayment({ transaction_amount: 199.99 }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      // O rateio do cupom arredonda por unidade: a folga de 1 centavo existe
      // para não recusar pagamento legítimo.
      expect(store.rows('orders')[0].payment_status).toBe('approved');
      expect(store.rows('download_tokens')).toHaveLength(1);
    });

    it('aprova e emite os tokens quando o valor bate exatamente', async () => {
      const { handler, store, recordEvent, ensureCustomerAccountFromCheckout, security } =
        arrangeWebhook({
          payment: approvedPayment(),
        });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      const [order] = store.rows('orders');
      expect(order.payment_status).toBe('approved');
      expect(order.status).toBe('completed');
      expect(order.payment_id).toBe('MP-1');
      expect(order.completed_at).toEqual(expect.any(String));

      const tokens = store.rows('download_tokens');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].product_id).toBe('p1');
      expect(tokens[0].used).toBe(false);
      // 32 bytes aleatórios em hex — o token é a credencial de entrega.
      expect(tokens[0].token).toMatch(/^[0-9a-f]{64}$/);
      expect(new Date(tokens[0].expires_at).getTime()).toBeGreaterThan(Date.now());

      // A transição precisa ser condicional (`neq.approved`), senão reentrega
      // do MP sobrescreve completed_at. Ver webhook-idempotency.test.js.
      const [, filters] = store.spies.updateTable.mock.calls[0];
      expect(filters).toMatchObject({ id: `eq.${ORDER_ID}`, payment_status: 'neq.approved' });

      expect(recordEvent).toHaveBeenCalledTimes(1);
      expect(recordEvent.mock.calls[0][0].eventName).toBe('payment_approved');
      expect(ensureCustomerAccountFromCheckout).toHaveBeenCalledTimes(1);
      expect(security.recordSecurityEvent).not.toHaveBeenCalled();

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ message: 'Webhook processed successfully' });
    });

    it('aprova quando o cliente pagou MAIS que o devido', async () => {
      const { handler, store } = arrangeWebhook({
        payment: approvedPayment({ transaction_amount: ORDER_TOTAL + 50 }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      // Cobrar a mais é caso de suporte/estorno, não falha de segurança na
      // entrega: travar puniria quem já pagou.
      expect(store.rows('orders')[0].payment_status).toBe('approved');
      expect(store.rows('download_tokens')).toHaveLength(1);
    });

    it('recusa pagamento de sandbox (live_mode=false) quando o runtime é produção', async () => {
      process.env.APP_ENV = 'production';
      const { handler, store, security } = arrangeWebhook({
        payment: approvedPayment({ live_mode: false }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      // Credencial de teste em produção = entregar produto real contra
      // dinheiro que não existe.
      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'test_payment_in_production',
      );
    });

    it('aceita live_mode=false fora de produção (é assim que se roda em sandbox)', async () => {
      const { handler, store } = arrangeWebhook({
        payment: approvedPayment({ live_mode: false }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('approved');
    });
  });

  // ── verify-payment.js ─────────────────────────────────────────────
  describe('api/verify-payment.js', () => {
    it('não aprova nem emite token quando o pagamento aprovado vale menos que o pedido', async () => {
      const { handler, store, security } = arrangeVerify({
        searchResults: [approvedPayment({ id: 'MP-FORJADO', transaction_amount: 0.01 })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      const [order] = store.rows('orders');
      expect(order.payment_status).toBe('pending');
      expect(order.completed_at).toBeNull();
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(store.spies.insertIntoTable).not.toHaveBeenCalled();
      expect(store.spies.updateTable).not.toHaveBeenCalled();

      // O cliente segue vendo "pending": o motivo fica só no log, para não
      // ensinar ao atacante qual campo ele precisa ajustar.
      expect(res.statusCode).toBe(200);
      expect(res.body.order.paymentStatus).toBe('pending');
      expect(res.body.order.downloadTokens).toEqual([]);

      const event = security.recordSecurityEvent.mock.calls[0][0];
      expect(event.eventName).toBe('payment_amount_mismatch');
      expect(event.properties.source).toBe('verify-payment');
      expect(JSON.stringify(event)).not.toContain(OWNER_EMAIL);
    });

    it('não aprova quando a moeda não é BRL', async () => {
      const { handler, store, security } = arrangeVerify({
        searchResults: [approvedPayment({ currency_id: 'USD' })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(security.recordSecurityEvent.mock.calls[0][0].eventName).toBe(
        'payment_amount_mismatch',
      );
    });

    it('aprova, emite tokens e os devolve quando o valor reconcilia', async () => {
      const { handler, store, ensureCustomerAccountFromCheckout } = arrangeVerify({
        searchResults: [approvedPayment({ id: 'MP-OK' })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      const [order] = store.rows('orders');
      expect(order.payment_status).toBe('approved');
      expect(order.status).toBe('completed');
      expect(order.payment_id).toBe('MP-OK');

      const tokens = store.rows('download_tokens');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].token).toMatch(/^[0-9a-f]{64}$/);

      expect(res.statusCode).toBe(200);
      expect(res.body.order.paymentStatus).toBe('approved');
      expect(res.body.order.downloadTokens).toHaveLength(1);
      expect(res.body.order.downloadTokens[0].token).toBe(tokens[0].token);
      expect(ensureCustomerAccountFromCheckout).toHaveBeenCalledTimes(1);
    });

    it('recusa fail-closed quando orders.total_amount é null (regressão da rodada de correção)', async () => {
      // O bug: `Number(order?.total_amount || 0)` fazia `due` virar 0 para uma
      // linha corrompida (migration parcial, insert que não gravou o total), e
      // aí `0.01 + 0.01 >= 0` aprovava o pedido e emitia os tokens. O webhook
      // já era fail-closed nesse caso; esta porta, não — e o atacante escolhe
      // a porta mais fraca.
      const { handler, store, security } = arrangeVerify({
        order: baseOrder({ total_amount: null }),
        searchResults: [approvedPayment({ id: 'MP-CENTAVO', transaction_amount: 0.01 })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(store.spies.insertIntoTable).not.toHaveBeenCalled();
      expect(store.spies.updateTable).not.toHaveBeenCalled();

      const event = security.recordSecurityEvent.mock.calls[0][0];
      expect(event.properties.reason).toBe('order_total_unusable');
      // Total ilegível vira `null`, não `0`: logar zero fabricaria um número
      // plausível justamente no caso em que o problema é não haver número.
      expect(event.properties.order_total_amount).toBeNull();
    });

    it('recusa quando transaction_amount está ausente (fail-closed)', async () => {
      const { handler, store, security } = arrangeVerify({
        searchResults: [approvedPayment({ transaction_amount: undefined })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'payment_amount_unusable',
      );
    });

    it('recusa um centavo abaixo da tolerância (199,98 para um pedido de 200)', async () => {
      const { handler, store } = arrangeVerify({
        searchResults: [approvedPayment({ transaction_amount: 199.98 })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
    });

    it('aceita dentro da tolerância de arredondamento (199,99 para um pedido de 200)', async () => {
      const { handler, store } = arrangeVerify({
        searchResults: [approvedPayment({ transaction_amount: 199.99 })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      // Mesma folga do webhook: as duas bordas travadas nos dois lados impedem
      // que uma das portas afrouxe a tolerância sozinha.
      expect(store.rows('orders')[0].payment_status).toBe('approved');
      expect(store.rows('download_tokens')).toHaveLength(1);
    });

    it('aprova quando o cliente pagou MAIS que o devido', async () => {
      const { handler, store } = arrangeVerify({
        searchResults: [approvedPayment({ transaction_amount: ORDER_TOTAL + 50 })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('approved');
      expect(store.rows('download_tokens')).toHaveLength(1);
    });

    it('recusa pagamento de sandbox (live_mode=false) quando o runtime é produção', async () => {
      process.env.APP_ENV = 'production';
      // Esta checagem existia SÓ no webhook: o polling do frontend, chamando a
      // mesma busca no MP, aprovava o pagamento de teste que o webhook recusava.
      const { handler, store, security } = arrangeVerify({
        searchResults: [approvedPayment({ live_mode: false })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('pending');
      expect(store.rows('download_tokens')).toHaveLength(0);
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'test_payment_in_production',
      );
    });

    it('aceita live_mode=false fora de produção (é assim que se roda em sandbox)', async () => {
      const { handler, store } = arrangeVerify({
        searchResults: [approvedPayment({ live_mode: false })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(store.rows('orders')[0].payment_status).toBe('approved');
    });

    it('persiste a aprovação mesmo quando os tokens JÁ existem (pedido não fica pending)', async () => {
      // O bug: o UPDATE de `orders` morava dentro da função que criava os
      // tokens, e ela só rodava quando não havia nenhum. Bastava um poll morrer
      // entre o INSERT dos tokens e o UPDATE (504 do Supabase) para as duas
      // condições divergirem: dali em diante todo poll via "já tem token",
      // pulava a criação — e com ela o único ponto que escrevia em `orders` —
      // mas ainda devolvia `approved` montado em memória. O comprador baixava
      // os arquivos e o pedido ficava `pending` PARA SEMPRE no banco: fora do
      // painel, fora do faturamento, e invisível para a sequência pós-compra,
      // que filtra `payment_status = 'approved'`.
      const { handler, store } = arrangeVerify({
        tokens: [
          {
            order_id: ORDER_ID,
            product_id: 'p1',
            product_name: 'Kit de Atividades',
            token: 'token-de-poll-anterior',
            used: false,
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
            created_at: '2026-08-12T10:05:00.000Z',
          },
        ],
        searchResults: [approvedPayment({ id: 'MP-OK' })],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      // A asserção que importa é sobre o BANCO, não sobre o corpo: era
      // exatamente a divergência entre os dois que definia o bug.
      const [order] = store.rows('orders');
      expect(order.payment_status).toBe('approved');
      expect(order.status).toBe('completed');
      expect(order.payment_id).toBe('MP-OK');
      expect(order.completed_at).toEqual(expect.any(String));

      // E sem emitir credencial nova: o token existente é reaproveitado.
      expect(store.rows('download_tokens')).toHaveLength(1);
      expect(store.spies.insertIntoTable).not.toHaveBeenCalled();
      expect(res.body.order.downloadTokens[0].token).toBe('token-de-poll-anterior');
    });

    it('não redispara o provisionamento quando outro processo já aprovou', async () => {
      // Provisionamento é e-mail para o comprador. Antes ele saía sempre que os
      // tokens fossem criados — condição diferente de "esta é a primeira
      // aprovação". Numa corrida em que o webhook aprovou e este poll criou os
      // tokens, o convite de senha ia duas vezes.
      const { handler, ensureCustomerAccountFromCheckout } = arrangeVerify({
        order: baseOrder({ payment_status: 'approved', status: 'completed' }),
        searchResults: [approvedPayment()],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      expect(ensureCustomerAccountFromCheckout).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('um pagamento forjado mais recente não impede a aprovação do legítimo', async () => {
      const { handler, store } = arrangeVerify({
        // A busca vem ordenada por date_created desc: o forjado (mais novo)
        // é o primeiro. Pegar "o mais recente e checar depois" deixaria o
        // comprador travado para sempre — negação de serviço de graça para
        // quem souber o order_code.
        searchResults: [
          approvedPayment({ id: 'MP-FORJADO', transaction_amount: 0.01 }),
          approvedPayment({ id: 'MP-LEGITIMO', transaction_amount: ORDER_TOTAL }),
        ],
      });
      const res = createMockRes();

      await handler(verifyRequest(), res);

      const [order] = store.rows('orders');
      expect(order.payment_status).toBe('approved');
      expect(order.payment_id).toBe('MP-LEGITIMO');
      expect(res.body.order.downloadTokens).toHaveLength(1);
    });
  });

  // ── Paridade entre as DUAS portas ─────────────────────────────────
  //
  // Este bloco não testa uma regra nova: testa que webhook.js e
  // verify-payment.js decidem IGUAL. A correção do P0-1 foi aplicada nas duas
  // portas com rigor diferente, e o resultado prático foi que a proteção valia
  // o que valia a mais frouxa — um pedido com total_amount ilegível era
  // recusado pelo webhook e aprovado pelo verify por R$ 0,01.
  //
  // A checagem deixou de ser duplicada (lib/payment-integrity.js), e mesmo
  // assim este bloco continua sendo o que detecta a próxima divergência: ele
  // exercita os dois HANDLERS de ponta a ponta, então pega o que a extração
  // não pode impedir — uma porta que chame a função no lugar errado do fluxo
  // (depois de já ter escrito no banco), que ignore o `ok`, ou que volte a
  // ter lógica de valor própria. O que mudou é a classe de bug que sobra,
  // não a necessidade do teste.
  describe('paridade webhook × verify-payment', () => {
    const CENARIOS = [
      {
        nome: 'total do pedido nulo',
        order: { total_amount: null },
        payment: { transaction_amount: 0.01 },
        reason: 'order_total_unusable',
      },
      {
        nome: 'total do pedido negativo',
        order: { total_amount: -10 },
        payment: { transaction_amount: 0.01 },
        reason: 'order_total_unusable',
      },
      {
        nome: 'total do pedido em string vazia',
        order: { total_amount: '' },
        payment: { transaction_amount: 0.01 },
        reason: 'order_total_unusable',
      },
      // ZERO reprova desde a extração (`due <= 0`). A linha zerada é real e não
      // hipotética: api/create-payment.js grava o pedido ANTES de criar a
      // preference, então um cupom de 100% deixa `total_amount = 0` em `orders`
      // mesmo quando o Mercado Pago recusa a cobrança de valor zero. Com o
      // antigo `due < 0`, esse pedido aceitava qualquer pagamento — `0.01 +
      // 0.01 >= 0` — e entregava os produtos por um centavo.
      {
        nome: 'total do pedido zerado (cupom de 100% deixa a linha gravada)',
        order: { total_amount: 0 },
        payment: { transaction_amount: 0.01 },
        reason: 'order_total_unusable',
      },
      {
        nome: 'valor pago ausente',
        order: {},
        payment: { transaction_amount: undefined },
        reason: 'payment_amount_unusable',
      },
      {
        nome: 'valor pago negativo',
        order: {},
        payment: { transaction_amount: -200 },
        reason: 'payment_amount_unusable',
      },
      {
        nome: 'moeda diferente de BRL',
        order: {},
        payment: { currency_id: 'USD' },
        reason: 'currency_mismatch',
      },
      {
        nome: 'valor abaixo do total',
        order: {},
        payment: { transaction_amount: 199.98 },
        reason: 'amount_below_order_total',
      },
    ];

    for (const cenario of CENARIOS) {
      it(`recusa com o MESMO motivo nas duas portas: ${cenario.nome}`, async () => {
        const noWebhook = arrangeWebhook({
          order: baseOrder(cenario.order),
          payment: approvedPayment(cenario.payment),
        });
        await noWebhook.handler(webhookRequest(), createMockRes());

        resetModuleRegistry();

        const noVerify = arrangeVerify({
          order: baseOrder(cenario.order),
          searchResults: [approvedPayment(cenario.payment)],
        });
        await noVerify.handler(verifyRequest(), createMockRes());

        // Mesmo efeito: nenhuma das duas aprova nem emite credencial de entrega.
        for (const { store } of [noWebhook, noVerify]) {
          expect(store.rows('orders')[0].payment_status).toBe('pending');
          expect(store.rows('download_tokens')).toHaveLength(0);
          expect(store.spies.insertIntoTable).not.toHaveBeenCalled();
        }

        // Mesmo vocabulário: um operador lendo o alerta não precisa saber por
        // qual porta a tentativa entrou para entender o que aconteceu.
        const eventoWebhook = noWebhook.security.recordSecurityEvent.mock.calls[0][0];
        const eventoVerify = noVerify.security.recordSecurityEvent.mock.calls[0][0];
        expect(eventoWebhook.eventName).toBe('payment_amount_mismatch');
        expect(eventoVerify.eventName).toBe(eventoWebhook.eventName);
        expect(eventoVerify.severity).toBe(eventoWebhook.severity);
        expect(eventoWebhook.properties.reason).toBe(cenario.reason);
        expect(eventoVerify.properties.reason).toBe(cenario.reason);
      });
    }

    it('as duas aprovam exatamente na mesma borda de tolerância', async () => {
      // 199,99 aprova nas duas; 199,98 recusa nas duas. Sem o par, afrouxar a
      // tolerância de uma das portas passaria despercebido.
      for (const [valor, esperado] of [
        [199.99, 'approved'],
        [199.98, 'pending'],
      ]) {
        resetModuleRegistry();
        const noWebhook = arrangeWebhook({
          payment: approvedPayment({ transaction_amount: valor }),
        });
        await noWebhook.handler(webhookRequest(), createMockRes());

        resetModuleRegistry();
        const noVerify = arrangeVerify({
          searchResults: [approvedPayment({ transaction_amount: valor })],
        });
        await noVerify.handler(verifyRequest(), createMockRes());

        expect(noWebhook.store.rows('orders')[0].payment_status).toBe(esperado);
        expect(noVerify.store.rows('orders')[0].payment_status).toBe(esperado);
      }
    });

    it('as duas aceitam a folga de 1 centavo em valor que quebra em ponto flutuante', async () => {
      // Regressão de aritmética, não de política: com due=2.29 e paid=2.28, a
      // forma ingênua `paid + 0.01 < due` vale 2.2899999999999996 < 2.29 →
      // TRUE, e um pagamento exatamente dentro da folga era recusado. O erro
      // cai sempre no falso negativo — recusar quem pagou certo —, e no webhook
      // isso não é reprocessado: vira cliente pago sem produto. A comparação em
      // centavos inteiros elimina a classe sem mover o limite.
      const centavo = { total_amount: 2.29 };
      const pago = { transaction_amount: 2.28 };

      const noWebhook = arrangeWebhook({
        order: baseOrder(centavo),
        payment: approvedPayment(pago),
      });
      await noWebhook.handler(webhookRequest(), createMockRes());

      resetModuleRegistry();

      const noVerify = arrangeVerify({
        order: baseOrder(centavo),
        searchResults: [approvedPayment(pago)],
      });
      await noVerify.handler(verifyRequest(), createMockRes());

      expect(noWebhook.store.rows('orders')[0].payment_status).toBe('approved');
      expect(noVerify.store.rows('orders')[0].payment_status).toBe('approved');
      expect(noWebhook.security.recordSecurityEvent).not.toHaveBeenCalled();
    });

    it('as duas recusam pagamento de sandbox quando o runtime é produção', async () => {
      process.env.APP_ENV = 'production';

      const noWebhook = arrangeWebhook({ payment: approvedPayment({ live_mode: false }) });
      await noWebhook.handler(webhookRequest(), createMockRes());

      resetModuleRegistry();

      const noVerify = arrangeVerify({ searchResults: [approvedPayment({ live_mode: false })] });
      await noVerify.handler(verifyRequest(), createMockRes());

      expect(noWebhook.store.rows('orders')[0].payment_status).toBe('pending');
      expect(noVerify.store.rows('orders')[0].payment_status).toBe('pending');
      expect(noWebhook.security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'test_payment_in_production',
      );
      expect(noVerify.security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe(
        'test_payment_in_production',
      );
    });
  });

  // ── Anti-enumeração do verify-payment ─────────────────────────────
  describe('api/verify-payment.js — anti-enumeração', () => {
    it('e-mail errado devolve resposta IDÊNTICA à de pedido inexistente', async () => {
      // Mesmo comprimento do e-mail real (13 chars): força o timingSafeEqual
      // a rodar de verdade, em vez de sair pela guarda de tamanho.
      expect('evil@evil.com'.length).toBe(OWNER_EMAIL.length);

      const primeiro = arrangeVerify();
      const resErrado = createMockRes();
      await primeiro.handler(verifyRequest({ email: 'evil@evil.com' }), resErrado);

      resetModuleRegistry();
      const segundo = arrangeVerify({ order: null });
      const resInexistente = createMockRes();
      await segundo.handler(verifyRequest({ orderId: 'ORD-NAO-EXISTE' }), resInexistente);

      // Byte a byte iguais: nada na resposta distingue "existe mas não é seu"
      // de "não existe" — é o que impede varredura de order_code.
      expect(resErrado.statusCode).toBe(404);
      expect(resInexistente.statusCode).toBe(404);
      expect(resErrado.body).toEqual(resInexistente.body);
      expectApiError(resErrado, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        message: 'Pedido não encontrado',
      });

      // E nada do pedido vaza junto do 404.
      expect(JSON.stringify(resErrado.body)).not.toContain(OWNER_EMAIL);
      expect(JSON.stringify(resErrado.body)).not.toContain(String(ORDER_TOTAL));
      // Não chega a consultar o Mercado Pago: a checagem de posse vem antes.
      expect(primeiro.sdk.search).not.toHaveBeenCalled();
    });

    it('e-mail de tamanho diferente devolve 404, não 500 (timingSafeEqual não estoura)', async () => {
      const { handler, security } = arrangeVerify();
      const res = createMockRes();

      // 6 chars contra 13: sem a guarda `expectedBuf.length === providedBuf.length`,
      // crypto.timingSafeEqual LANÇA, o catch responde 500 — e o 500 vira o
      // oráculo que o 404 uniforme existia para fechar.
      await handler(verifyRequest({ email: 'a@b.co' }), res);

      expect(res.statusCode).toBe(404);
      expectApiError(res, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        message: 'Pedido não encontrado',
      });
      expect(security.recordSecurityEvent).toHaveBeenCalledTimes(1);
    });

    it('registra a tentativa com hash do e-mail, nunca com o e-mail em claro', async () => {
      const { handler, security } = arrangeVerify();
      const res = createMockRes();

      await handler(verifyRequest({ email: 'atacante@evil.com' }), res);

      const event = security.recordSecurityEvent.mock.calls[0][0];
      expect(event.eventName).toBe('verify_payment_email_mismatch');
      expect(event.properties.provided_email_hash).toMatch(/^[0-9a-f]{16}$/);
      // Nem o e-mail tentado nem o do titular podem aparecer no log.
      expect(JSON.stringify(event)).not.toContain('atacante@evil.com');
      expect(JSON.stringify(event)).not.toContain(OWNER_EMAIL);
    });
  });
});
