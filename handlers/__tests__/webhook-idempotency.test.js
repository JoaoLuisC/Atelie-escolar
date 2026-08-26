import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectApiError,
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

// ── Os limites vêm DO MÓDULO, nunca copiados ─────────────────────────
// Este arquivo já pagou o preço de repetir o número: enquanto a janela era de
// 300s, `const TOLERANCE_SECONDS = 300` aqui era inofensivo; quando ela foi
// recalibrada para 48h (ver o bloco longo em lib/mercadopago-config.js:81-151),
// dois testes passaram a falhar em cima de um comportamento CORRETO — eles
// afirmavam sobre o contrato ANTIGO, não sobre a intenção. Importando os
// limites, o teste segue dizendo o que sempre quis dizer ("`ts` fora da janela
// é recusado antes de qualquer I/O") e só fica vermelho quando ISSO quebra.
//
// `createRequire` em vez de `import`: é o mesmo carregador CJS que o harness
// usa (money-path-harness.js:42), então lemos exatamente o módulo que o handler
// vai carregar, sem depender da inferência de named exports do interop ESM.
const requireCjs = createRequire(import.meta.url);
const {
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS: TOLERANCE_SECONDS,
  MAX_WEBHOOK_TOLERANCE_SECONDS: TOLERANCE_MAX_SECONDS,
  DEFAULT_FUTURE_SKEW_SECONDS: FUTURE_SKEW_SECONDS,
} = requireCjs('../../lib/mercadopago-config');

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

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
  const security = installSecurityLoggerMock();

  const recordEvent = vi.fn(async () => {});
  installModuleMock('../../lib/analytics-events', { recordEvent });

  // Proxy do "e-mail/provisionamento": é esta função que cria o usuário no
  // Supabase Auth e dispara o convite de definição de senha. Chamá-la duas
  // vezes numa reentrega é e-mail duplicado para o comprador.
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

describe('webhook — idempotência de reentrega e frescor da assinatura', () => {
  const originalEnv = {};

  beforeEach(() => {
    for (const key of [
      'APP_ENV',
      'NODE_ENV',
      'VERCEL_ENV',
      'WEBHOOK_SECRET',
      'WEBHOOK_TOLERANCE_SECONDS',
      'MERCADOPAGO_ACCESS_TOKEN',
    ]) {
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
        tokens: [
          {
            order_id: ORDER_ID,
            product_id: 'p1',
            product_name: 'Kit de Atividades',
            token: 'token-ja-existente',
            used: false,
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
            created_at: '2026-08-12T10:05:00.000Z',
          },
        ],
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
          {
            id: 1,
            order_id: ORDER_ID,
            product_id: 'p1',
            product_name: 'Kit',
            unit_price: 100,
            quantity: 1,
          },
          {
            id: 2,
            order_id: ORDER_ID,
            product_id: 'p1',
            product_name: 'Kit',
            unit_price: 100,
            quantity: 1,
          },
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
      // O cenário realista de vazamento (histórico de git, export de log, túnel
      // de dev esquecido) nasce muito além da janela, que é o que a torna útil
      // mesmo larga.
      const velho = nowSeconds() - (TOLERANCE_SECONDS + 60);
      await handler(webhookRequest('MP-1', { requestId: 'req-replay', tsSeconds: velho }), res);

      expect(res.statusCode).toBe(401);
      expectApiError(res, { status: 401, code: 'UNAUTHORIZED', message: 'Invalid signature' });

      // Nada foi consultado nem escrito: o gate é a primeira coisa do handler.
      // Esta é a metade do teste que NÃO depende do tamanho da janela e que
      // precisa sobreviver a qualquer recalibração dela.
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

    it('recusa assinatura datada no FUTURO além da folga de skew (janela assimétrica)', async () => {
      const { handler, security, sdk } = arrange();
      const res = createMockRes();

      // O limite do FUTURO é derivado do skew (~2min), não da tolerância do
      // passado (~48h) — e é essa assimetria que está sob teste: reentrega
      // legítima é sempre um evento do passado, então o lado do futuro pode ser
      // apertado de graça, enquanto apertar o do passado custaria "cliente
      // pagou e não recebeu". O mesmo deslocamento no passado é ACEITO (ver o
      // teste da reentrega de horas depois).
      const futuro = nowSeconds() + (FUTURE_SKEW_SECONDS + 60);
      await handler(webhookRequest('MP-1', { requestId: 'req-futuro', tsSeconds: futuro }), res);

      expect(res.statusCode).toBe(401);
      expect(sdk.get).not.toHaveBeenCalled();

      const event = security.recordSecurityEvent.mock.calls[0][0];
      expect(event.properties.reason).toBe('stale_timestamp');
      // Idade NEGATIVA e limite registrado = o EFETIVAMENTE violado (o do
      // futuro). Gravar aqui a janela do passado tornaria o evento impossível
      // de interpretar meses depois: "age=-180s, tolerance=172800s" não diz a
      // ninguém por que a requisição foi recusada.
      expect(event.properties.age_seconds).toBeLessThan(0);
      expect(event.properties.tolerance_seconds).toBe(FUTURE_SKEW_SECONDS);
    });

    it('aceita assinatura quase no limite da janela do passado', async () => {
      const { handler, store, sdk } = arrange();
      const res = createMockRes();

      const recente = nowSeconds() - (TOLERANCE_SECONDS - 60);
      await handler(webhookRequest('MP-1', { requestId: 'req-fresco', tsSeconds: recente }), res);

      expect(res.statusCode).toBe(200);
      expect(sdk.get).toHaveBeenCalledTimes(1);
      expect(store.rows('orders')[0].payment_status).toBe('approved');
    });

    it('aceita reentrega de HORAS depois — o caso que a janela de 300s quebrava', async () => {
      // ESTE é o desfecho que motivou a recalibração, e é por isso que ele tem
      // teste próprio em vez de sair de graça no teste do limite acima: a
      // primeira entrega caiu em 5xx (Supabase piscou), o Mercado Pago
      // reentregou horas depois em backoff crescente e — se ele reaproveita o
      // `ts` do manifesto original, que o contrato NÃO garante que não —
      // a notificação chega com assinatura válida e horas de idade. Com 300s
      // isso virava 401 e o pedido pago nunca era aprovado: um `if` de
      // segurança transformando um 5xx transitório em cliente lesado.
      const { handler, store, sdk } = arrange();
      const res = createMockRes();

      const seisHorasAtras = nowSeconds() - 6 * 60 * 60;
      await handler(
        webhookRequest('MP-1', { requestId: 'req-reentrega', tsSeconds: seisHorasAtras }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(sdk.get).toHaveBeenCalledTimes(1);
      expect(store.rows('orders')[0].payment_status).toBe('approved');
      expect(store.rows('download_tokens')).toHaveLength(1);
    });

    it('respeita WEBHOOK_TOLERANCE_SECONDS, mas ignora valor inválido (fail-closed no default)', async () => {
      // Uma janela estreita configurada explicitamente vale…
      process.env.WEBHOOK_TOLERANCE_SECONDS = '30';
      const estreito = arrange();
      const resEstreito = createMockRes();
      await estreito.handler(
        webhookRequest('MP-1', { requestId: 'req-a', tsSeconds: nowSeconds() - 60 }),
        resEstreito,
      );
      expect(resEstreito.statusCode).toBe(401);
      expect(
        estreito.security.recordSecurityEvent.mock.calls[0][0].properties.tolerance_seconds,
      ).toBe(30);

      // …mas um erro de digitação não pode significar "sem proteção": cai no
      // DEFAULT do módulo em vez de desligar a checagem. O que importa aqui não
      // é o número, é que o fallback continua sendo um limite finito.
      resetModuleRegistry();
      process.env.WEBHOOK_TOLERANCE_SECONDS = 'zero';
      const invalido = arrange();
      const resInvalido = createMockRes();
      await invalido.handler(
        webhookRequest('MP-1', {
          requestId: 'req-b',
          tsSeconds: nowSeconds() - (TOLERANCE_SECONDS + 60),
        }),
        resInvalido,
      );
      expect(resInvalido.statusCode).toBe(401);
      expect(
        invalido.security.recordSecurityEvent.mock.calls[0][0].properties.tolerance_seconds,
      ).toBe(TOLERANCE_SECONDS);
    });

    it('CLAMPA valor acima do teto em vez de aceitá-lo (um zero a mais não desliga a proteção)', async () => {
      // `WEBHOOK_TOLERANCE_SECONDS` digitado com um zero a mais desligaria a
      // proteção na prática e ninguém perceberia — nada quebra, o sistema só
      // fica silenciosamente replayável para sempre, que é o P1-5 de volta.
      // Clampar (e não cair no default) é deliberado: quem escreveu um número
      // grande quis uma janela grande, e a maior autorizada é o teto.
      process.env.WEBHOOK_TOLERANCE_SECONDS = String(TOLERANCE_MAX_SECONDS * 100);
      const { handler, security, sdk } = arrange();
      const res = createMockRes();

      const alemDoTeto = nowSeconds() - (TOLERANCE_MAX_SECONDS + 60);
      await handler(webhookRequest('MP-1', { requestId: 'req-teto', tsSeconds: alemDoTeto }), res);

      expect(res.statusCode).toBe(401);
      expect(sdk.get).not.toHaveBeenCalled();
      expect(security.recordSecurityEvent.mock.calls[0][0].properties.tolerance_seconds).toBe(
        TOLERANCE_MAX_SECONDS,
      );
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

      // O corpo carrega EXATAMENTE o flag do envelope (regra A1) e a mensagem —
      // nada mais. Afirmado por igualdade estrita de propósito: o valor deste
      // teste está em falhar quando QUALQUER campo novo aparecer aqui, porque é
      // assim que um token voltaria a vazar.
      expect(Object.keys(res.body).sort()).toEqual(['message', 'success']);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Webhook processed successfully');
    });
  });
});
