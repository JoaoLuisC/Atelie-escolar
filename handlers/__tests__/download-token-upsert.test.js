import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
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
// §2.3.a — `createTokensForOrder` em LOTE, e o que isso quase quebrou.
//
// A troca de N `insert` em série por UM `upsert` é ganho de latência dentro da
// confirmação de pagamento — o momento em que a cliente está olhando para a
// tela esperando. Mas ela traz o risco que o próprio item marcou com ⚠️:
//
// `Prefer: resolution=merge-duplicates` — o PADRÃO do PostgREST, e o que
// `upsertIntoTable` usava FIXO — ATUALIZA a linha existente com todas as
// colunas enviadas. Em `download_tokens` isso teria duas consequências, e a
// segunda é pior que a documentada no item:
//
//   1. o `token` de um link JÁ ENVIADO POR E-MAIL seria trocado, e o link
//      pararia de funcionar;
//   2. `used: false` seria reescrito sobre um token JÁ CONSUMIDO — o download
//      de uso único voltaria a abrir.
//
// ── ONDE A JANELA REALMENTE EXISTE ──────────────────────────────────
// `verify-payment` só cria tokens quando `loadDownloadTokens` volta vazio,
// então o caso comum nunca chega ao conflito. A janela é a CORRIDA: o webhook
// insere entre aquela leitura e a escrita. É exatamente a corrida que o
// `try/catch` por item cobria engolindo o 409, e é ela que `ignore-duplicates`
// cobre agora — em uma chamada em vez de N.
//
// Daí a forma dos testes: um verifica a CHAMADA (lote único, com a resolução
// certa) e outro verifica o MECANISMO (o header que sai de `lib/supabase.js`,
// e o wrapper de service role que quase o engoliu).
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);

const ORDER_CODE = 'ORD-0001';
const ORDER_ID = 10;
const ORDER_TOTAL = 200;
const OWNER_EMAIL = 'dono@real.com';
const TOKEN_DO_WEBHOOK = 'b'.repeat(64);

const ORDER_ITEMS = [
  {
    id: 1,
    order_id: ORDER_ID,
    product_id: 'p1',
    product_name: 'Kit de Atividades',
    unit_price: 100,
    quantity: 1,
  },
  {
    id: 2,
    order_id: ORDER_ID,
    product_id: 'p2',
    product_name: 'Painel de Rotina',
    unit_price: 100,
    quantity: 1,
  },
];

function pedidoPendente(overrides = {}) {
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

function pagamentoAprovado(overrides = {}) {
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

function arrange({ order = pedidoPendente(), tokens = [], items = ORDER_ITEMS } = {}) {
  const store = createSupabaseStore({
    orders: [order],
    order_items: items,
    download_tokens: tokens,
  });
  installSupabaseMock(store);
  installSecurityLoggerMock();
  installRateLimitPassthrough();

  installModuleMock('../../lib/customer-account-provisioning', {
    ensureCustomerAccountFromCheckout: vi.fn(async () => {}),
  });
  installModuleMock('../../lib/mercadopago-config', {
    initializeMercadoPago: vi.fn(() => ({ cliente: 'falso' })),
    getPaymentInfo: vi.fn(async () => null),
    validateWebhookSignature: vi.fn(() => true),
    inspectWebhookSignature: vi.fn(() => ({ valid: true, reason: null })),
  });
  installMercadoPagoSdkMock({ searchResults: [pagamentoAprovado()] });

  return { store, handler: loadHandler('../verify-payment.js') };
}

function verifyRequest() {
  return {
    method: 'POST',
    headers: { 'user-agent': 'jsdom' },
    body: { orderId: ORDER_CODE, email: OWNER_EMAIL },
    query: {},
  };
}

function chamadasDeToken(store) {
  return store.spies.upsertIntoTable.mock.calls.filter(([tabela]) => tabela === 'download_tokens');
}

describe('createTokensForOrder — lote com ignore-duplicates (§2.3.a)', () => {
  const ambienteOriginal = {};

  beforeEach(() => {
    for (const key of ['APP_ENV', 'NODE_ENV', 'MERCADOPAGO_ACCESS_TOKEN']) {
      ambienteOriginal[key] = process.env[key];
    }
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-access-token';
    resetModuleRegistry();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ambienteOriginal)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetModuleRegistry();
    vi.restoreAllMocks();
  });

  it('um pedido de 2 itens gera UMA chamada, não uma por item', async () => {
    const { store, handler } = arrange();

    await handler(verifyRequest(), createMockRes());

    const chamadas = chamadasDeToken(store);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0][1]).toHaveLength(2);
    expect(store.rows('download_tokens')).toHaveLength(2);
  });

  it('declara a constraint e pede ignore-duplicates, não o merge padrão', async () => {
    const { store, handler } = arrange();

    await handler(verifyRequest(), createMockRes());

    const [, , onConflict, options] = chamadasDeToken(store)[0];
    expect(onConflict).toBe('order_id,product_id');
    expect(options).toMatchObject({ resolution: 'ignore-duplicates' });
  });

  it('token já existente: não emite credencial nova nem toca na linha', async () => {
    // Caso comum (não a corrida): `loadDownloadTokens` já encontra o token do
    // webhook, então nem se chega ao upsert. Emitir de novo seria credencial
    // extra para o mesmo produto pago.
    const { store, handler } = arrange({
      tokens: [
        {
          token: TOKEN_DO_WEBHOOK,
          order_id: ORDER_ID,
          product_id: 'p1',
          product_name: 'Kit de Atividades',
          used: true,
          used_at: '2026-08-12T10:10:00.000Z',
          expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
          created_at: '2026-08-12T10:05:00.000Z',
        },
      ],
    });

    const res = createMockRes();
    await handler(verifyRequest(), res);

    expect(chamadasDeToken(store)).toHaveLength(0);

    const [linha] = store.rows('download_tokens');
    expect(linha.token).toBe(TOKEN_DO_WEBHOOK);
    expect(linha.used).toBe(true);
    expect(res.body.order.downloadTokens[0].token).toBe(TOKEN_DO_WEBHOOK);
  });

  it('devolve o conjunto PERSISTIDO, não o que acabou de ser gerado', async () => {
    // Com `ignore-duplicates` o token que vale pode ser o do webhook. Montar a
    // resposta a partir do payload enviado entregaria à cliente um token que
    // não está no banco.
    const { store, handler } = arrange();

    const res = createMockRes();
    await handler(verifyRequest(), res);

    const persistidos = store.rows('download_tokens').map((linha) => linha.token);
    const respondidos = res.body.order.downloadTokens.map((t) => t.token);
    expect(respondidos.sort()).toEqual(persistidos.sort());
  });
});

describe('upsertIntoTable — o mecanismo por trás (lib/supabase.js)', () => {
  const ambienteOriginal = {};

  beforeEach(() => {
    ambienteOriginal.env = { ...process.env };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => [],
      text: async () => '[]',
    }));
  });

  afterEach(() => {
    process.env = ambienteOriginal.env;
    vi.restoreAllMocks();
  });

  it('a resolução escolhida chega ao header Prefer', () => {
    const { upsertIntoTable } = requireCjs('../../lib/supabase.js');

    return upsertIntoTable('download_tokens', [{ id: 1 }], 'order_id,product_id', {
      resolution: 'ignore-duplicates',
    }).then(() => {
      const [, init] = globalThis.fetch.mock.calls[0];
      expect(init.headers.Prefer).toContain('resolution=ignore-duplicates');
    });
  });

  it('o wrapper de service role REPASSA a resolução', async () => {
    // Regressão real encontrada ao aplicar o §2.3.a: o wrapper era
    // `(table, rows, onConflict) => upsertIntoTable(..., { useServiceRole: true })`
    // e engolia o 4º argumento. A escolha de `ignore-duplicates` chegaria ao
    // código e seria silenciosamente inerte — a pior forma de um parâmetro de
    // segurança falhar.
    const { serviceRoleHelpers } = requireCjs('../../lib/supabase.js');

    await serviceRoleHelpers.upsertIntoTable(
      'download_tokens',
      [{ id: 1 }],
      'order_id,product_id',
      {
        resolution: 'ignore-duplicates',
      },
    );

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.Prefer).toContain('resolution=ignore-duplicates');
  });

  it('sem opção, mantém o merge-duplicates que os outros chamadores esperam', async () => {
    const { upsertIntoTable } = requireCjs('../../lib/supabase.js');

    await upsertIntoTable('qualquer_tabela', [{ id: 1 }], 'id');

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.Prefer).toContain('resolution=merge-duplicates');
  });
});
