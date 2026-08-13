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
// REENTREGA E REPLAY DA NOTIFICAÇÃO DO MERCADO PAGO.
//
// O MP reentrega a MESMA notificação por horas até receber um 2xx, e não há
// garantia de entrega única — reentrega é operação NORMAL, não ataque. O
// handler precisa então ser idempotente por construção, e todos os efeitos
// colaterais caros ou visíveis ao cliente (emitir download_tokens, provisionar
// a conta, gravar `payment_approved`, carimbar `completed_at`) têm que
// acontecer exatamente uma vez.
//
// Estes testes rodam o handler DUAS VEZES contra o MESMO estado de banco, que
// é a única forma de provar idempotência: um teste de chamada única passa
// mesmo num handler que reescreve tudo a cada notificação.
//
// Cobrem também o achado P1-5 (janela de frescor + parar de ecoar os tokens
// na resposta). Aqui lib/mercadopago-config.js roda DE VERDADE — o HMAC e a
// comparação de `ts` com o relógio local são exatamente o que está sob teste;
// substituí-los por um `() => true` deixaria o teste sem objeto.
// ════════════════════════════════════════════════════════════════════

const WEBHOOK_SECRET = 'segredo-de-webhook-fixo-para-teste';
const ORDER_CODE = 'ORD-0001';
const ORDER_ID = 10;
const ORDER_TOTAL = 200;
const TOLERANCE_SECONDS = 300;

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

function arrange({ payment = approvedPayment(), order = baseOrder(), items, tokens = [] } = {}) {
  const store = createSupabaseStore({
    orders: [order],
    order_items: items || [
      { id: 1, order_id: ORDER_ID, product_id: 'p1', product_name: 'Kit de Atividades', unit_price: 200, quantity: 1 },
    ],
    download_tokens: tokens,
  });
  installSupabaseMock(store);
  const security = installSecurityLoggerMock();

  const recordEvent = vi.fn(async () => {});
  installModuleMock('../../lib/analytics-events', { recordEvent });

  // Proxy do "e-mail/provisionamento": é esta função que cria o usuário no
  // Supabase Auth e dispara o convite de definição de senha. Chamá-la duas
  // vezes numa reentrega é e-mail duplicado para o comprador.
  const ensureCustomerAccountFromCheckout = vi.fn(async () => {});
  installModuleMock('../../lib/customer-account-provisioning', { ensureCustomerAccountFromCheckout });

  const sdk = installMercadoPagoSdkMock({ payment });

  return { store, security, recordEvent, ensureCustomerAccountFromCheckout, sdk, handler: loadHandler('../webhook.js') };
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

describe('webhook — idempotência de reentrega e frescor da assinatura', () => {
  const originalEnv = {};

  beforeEach(() => {
    for (const key of ['APP_ENV', 'NODE_ENV', 'VERCEL_ENV', 'WEBHOOK_SECRET', 'WEBHOOK_TOLERANCE_SECONDS', 'MERCADOPAGO_ACCESS_TOKEN']) {
      originalEnv[key] = process.env[key];
    }
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    delete process.env.WEBHOOK_TOLERANCE_SECONDS;
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

  describe('reentrega da mesma notificação aprovada', () => {
    it('não recria tokens, não move completed_at e não redispara provisionamento/analytics', async () => {
      const { handler, store, recordEvent, ensureCustomerAccountFromCheckout } = arrange();

      // ── 1ª entrega: efeitos acontecem ────────────────────────────
      const primeiraRes = createMockRes();
      await handler(webhookRequest('MP-1', { requestId: 'req-1' }), primeiraRes);

      const depoisDaPrimeira = store.rows('orders')[0];
      const tokensDaPrimeira = store.rows('download_tokens');
      expect(depoisDaPrimeira.payment_status).toBe('approved');
      expect(tokensDaPrimeira).toHaveLength(1);
      expect(recordEvent).toHaveBeenCalledTimes(1);
      expect(ensureCustomerAccountFromCheckout).toHaveBeenCalledTimes(1);

      // ── 2ª entrega: mesma notificação, requisição HTTP nova ──────
      // (o MP gera x-request-id e ts próprios a cada tentativa)
      vi.clearAllMocks();
      const segundaRes = createMockRes();
      await handler(webhookRequest('MP-1', { requestId: 'req-2' }), segundaRes);

      const depoisDaSegunda = store.rows('orders')[0];

      // completed_at é o carimbo da entrega: sobrescrevê-lo a cada reentrega
      // falsearia relatório e SLA, e é o sintoma de uma transição não-condicional.
      expect(depoisDaSegunda.completed_at).toBe(depoisDaPrimeira.completed_at);
      expect(depoisDaSegunda.payment_status).toBe('approved');
      expect(depoisDaSegunda.status).toBe('completed');

      // Token novo = credencial de download extra emitida de graça para quem
      // conseguir provocar uma reentrega.
      expect(store.rows('download_tokens')).toEqual(tokensDaPrimeira);
      expect(store.spies.insertIntoTable).not.toHaveBeenCalled();

      // Provisionamento e analytics só valem na PRIMEIRA aprovação: o segundo
      // disparo mandaria outro e-mail ao comprador e duplicaria a receita nos
      // relatórios.
      expect(ensureCustomerAccountFromCheckout).not.toHaveBeenCalled();
      expect(recordEvent).not.toHaveBeenCalled();

      // A transição continua sendo TENTADA (é ela que decide quem venceu),
      // mas condicionada em neq.approved — e portanto não afeta 0 linhas.
      const [, filtros] = store.spies.updateTable.mock.calls[0];
      expect(filtros).toMatchObject({ id: `eq.${ORDER_ID}`, payment_status: 'neq.approved' });

      // Reentrega não pode nem custar a leitura de order_items: com tokens já
      // emitidos não há o que criar, e o replay forçaria a consulta de graça.
      expect(store.callsFor(store.spies.listTableRows, 'order_items')).toHaveLength(0);

      expect(segundaRes.statusCode).toBe(200);
    });

    it('não emite token duplicado quando o pedido já tem tokens (corrida com verify-payment)', async () => {
      // Cenário real: o polling do frontend (verify-payment) venceu a corrida e
      // já emitiu o token antes de a notificação chegar.
      const { handler, store, recordEvent } = arrange({
        tokens: [{
          order_id: ORDER_ID, product_id: 'p1', product_name: 'Kit de Atividades',
          token: 'token-ja-existente', used: false,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          created_at: '2026-08-12T10:05:00.000Z',
        }],
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      expect(store.rows('download_tokens')).toHaveLength(1);
      expect(store.rows('download_tokens')[0].token).toBe('token-ja-existente');
      expect(store.spies.insertIntoTable).not.toHaveBeenCalled();
      // O pedido ainda não estava aprovado, então ESTA é a primeira aprovação:
      // o evento sai normalmente. Idempotência de token e de transição são
      // guardas independentes.
      expect(store.rows('orders')[0].payment_status).toBe('approved');
      expect(recordEvent).toHaveBeenCalledTimes(1);
    });

    it('emite UM token por produto mesmo com o produto repetido em duas linhas do pedido', async () => {
      const { handler, store } = arrange({
        items: [
          { id: 1, order_id: ORDER_ID, product_id: 'p1', product_name: 'Kit', unit_price: 100, quantity: 1 },
          { id: 2, order_id: ORDER_ID, product_id: 'p1', product_name: 'Kit', unit_price: 100, quantity: 1 },
        ],
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      // Sem a deduplicação por product_id, o INSERT em lote viola
      // UNIQUE(order_id, product_id); como o 409 é tratado como "outro
      // processo venceu", o pedido pago terminava SEM NENHUM token.
      expect(store.rows('download_tokens')).toHaveLength(1);
      expect(res.statusCode).toBe(200);
    });

    it('notificação atrasada de rejeição não rebaixa um pedido já aprovado', async () => {
      const { handler, store, recordEvent } = arrange({
        payment: approvedPayment({ status: 'rejected', status_detail: 'cc_rejected' }),
        order: baseOrder({
          payment_status: 'approved',
          status: 'completed',
          completed_at: '2026-08-12T11:00:00.000Z',
        }),
      });
      const res = createMockRes();

      await handler(webhookRequest(), res);

      // Sem o neq.approved neste ramo, o pedido pago virava 'failed' — com os
      // download_tokens ainda válidos e o pedido invisível para cliente e painel.
      const [order] = store.rows('orders');
      expect(order.payment_status).toBe('approved');
      expect(order.status).toBe('completed');
      expect(recordEvent).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/already approved/i);
    });
  });

  describe('janela de frescor da assinatura (P1-5)', () => {
    it('recusa assinatura VÁLIDA porém velha (replay) sem consultar o Mercado Pago', async () => {
      const { handler, store, security, sdk } = arrange();
      const res = createMockRes();

      // Assinatura corretamente calculada com o WEBHOOK_SECRET — só o instante
      // é antigo. É exatamente a forma de uma notificação capturada e reenviada.
      const velho = Math.floor(Date.now() / 1000) - (TOLERANCE_SECONDS + 60);
      await handler(webhookRequest('MP-1', { requestId: 'req-replay', tsSeconds: velho }), res);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid signature' });

      // Nada foi consultado nem escrito: o gate é a primeira coisa do handler.
      expect(sdk.get).not.toHaveBeenCalled();
      expect(store.spies.updateTable).not.toHaveBeenCalled();
      expect(store.spies.insertIntoTable).not.toHaveBeenCalled();

      // O motivo separa varredura da internet (hash_mismatch) de replay de uma
      // notificação real (stale_timestamp) — só o segundo exige que alguém
      // tenha tido acesso a uma notificação legítima.
      const event = security.recordSecurityEvent.mock.calls[0][0];
      expect(event.eventName).toBe('webhook_invalid_signature');
      expect(event.properties.reason).toBe('stale_timestamp');
      expect(event.properties.age_seconds).toBeGreaterThan(TOLERANCE_SECONDS);
      expect(event.properties.tolerance_seconds).toBe(TOLERANCE_SECONDS);
    });

    it('recusa assinatura datada no FUTURO além da tolerância', async () => {
      const { handler, security, sdk } = arrange();
      const res = createMockRes();

      const futuro = Math.floor(Date.now() / 1000) + (TOLERANCE_SECONDS + 60);
      await handler(webhookRequest('MP-1', { requestId: 'req-futuro', tsSeconds: futuro }), res);

      // Valor absoluto na comparação: um `ts` no futuro só vem de relógio
      // adulterado ou skew grosseiro, e não pode virar janela infinita.
      expect(res.statusCode).toBe(401);
      expect(sdk.get).not.toHaveBeenCalled();
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.reason).toBe('stale_timestamp');
    });

    it('aceita assinatura dentro da janela (reentrega legítima chega sempre fresca)', async () => {
      const { handler, store, sdk } = arrange();
      const res = createMockRes();

      const recente = Math.floor(Date.now() / 1000) - (TOLERANCE_SECONDS - 60);
      await handler(webhookRequest('MP-1', { requestId: 'req-fresco', tsSeconds: recente }), res);

      expect(res.statusCode).toBe(200);
      expect(sdk.get).toHaveBeenCalledTimes(1);
      expect(store.rows('orders')[0].payment_status).toBe('approved');
    });

    it('respeita WEBHOOK_TOLERANCE_SECONDS, mas ignora valor inválido (fail-closed no default)', async () => {
      // Uma janela estreita configurada explicitamente vale…
      process.env.WEBHOOK_TOLERANCE_SECONDS = '30';
      const estreito = arrange();
      const resEstreito = createMockRes();
      await estreito.handler(
        webhookRequest('MP-1', { requestId: 'req-a', tsSeconds: Math.floor(Date.now() / 1000) - 60 }),
        resEstreito,
      );
      expect(resEstreito.statusCode).toBe(401);

      // …mas um erro de digitação não pode significar "sem proteção": cai no
      // default de 300s em vez de desligar a checagem.
      resetModuleRegistry();
      process.env.WEBHOOK_TOLERANCE_SECONDS = 'zero';
      const invalido = arrange();
      const resInvalido = createMockRes();
      await invalido.handler(
        webhookRequest('MP-1', { requestId: 'req-b', tsSeconds: Math.floor(Date.now() / 1000) - (TOLERANCE_SECONDS + 60) }),
        resInvalido,
      );
      expect(resInvalido.statusCode).toBe(401);
      expect(invalido.security.recordSecurityEvent.mock.calls[0][0].properties.tolerance_seconds)
        .toBe(TOLERANCE_SECONDS);
    });
  });

  describe('a resposta do webhook não é canal de entrega (P1-5)', () => {
    it('não ecoa downloadTokens no corpo do 200 de aprovação', async () => {
      const { handler, store } = arrange();
      const res = createMockRes();

      await handler(webhookRequest(), res);

      const tokenEmitido = store.rows('download_tokens')[0].token;
      expect(tokenEmitido).toMatch(/^[0-9a-f]{64}$/);

      // O corpo do webhook não tem destinatário autenticado: quem consegue
      // emitir a requisição lê a resposta. Ecoar os tokens fazia deste endpoint
      // um leitor de credenciais de download sem sessão nenhuma. Os dois
      // consumidores legítimos continuam servidos por endpoints autenticados
      // (verify-payment e customer-orders).
      expect(res.body).not.toHaveProperty('downloadTokens');
      expect(JSON.stringify(res.body)).not.toContain(tokenEmitido);
      expect(res.body).toEqual({ message: 'Webhook processed successfully' });
    });
  });
});
