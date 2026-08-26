import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// §2.1 — truncamento silencioso no /admin/dashboard.
//
// O handler varria 7 tabelas SEM `limit`. `listTableRows` só emite `limit` se
// o chamador passar um, então quem decidiria o corte seria o `db-max-rows` do
// PostgREST — e esse corte acontece SEM ERRO. O faturamento apareceria menor do
// que é e nada avisaria. É a pior classe de defeito deste projeto: um número de
// dinheiro errado que não levanta exceção.
//
// Este teste trava as duas metades da correção: o teto EXISTE em toda chamada,
// e encostar nele vira sinal na resposta — não só numa linha de log que a dona
// da loja nunca vai ler.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const dashboardHandler = requireCjs('../admin/dashboard.js');
const { setSessionCookie } = requireCjs('../../lib/admin-session.js');

const APP_ORIGIN = 'https://loja.test';

function createRes() {
  const res = {
    statusCode: 0,
    body: undefined,
    headers: {},
    setHeader: vi.fn((k, v) => {
      res.headers[String(k).toLowerCase()] = v;
      return res;
    }),
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload) => {
      res.body = payload;
      return res;
    }),
    end: vi.fn(() => res),
  };
  return res;
}

function reqAdmin() {
  const carrier = { setHeader: (_k, v) => (carrier.value = v) };
  setSessionCookie(carrier, { email: 'dona@loja.test' });
  return {
    method: 'GET',
    headers: { cookie: String(carrier.value).split(';')[0], origin: APP_ORIGIN },
    query: {},
  };
}

/** Linhas devolvidas por tabela; o resto responde vazio. */
function stubSupabase(rowsByTable) {
  globalThis.fetch = vi.fn(async (url) => {
    const tabela = String(url).split('/rest/v1/')[1]?.split('?')[0] || '';
    const linhas = rowsByTable[tabela] || [];
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => linhas,
      text: async () => JSON.stringify(linhas),
    };
  });
}

/** Extrai o `limit` que cada tabela recebeu na query string. */
function limitesPedidos() {
  const porTabela = {};
  for (const [url] of globalThis.fetch.mock.calls) {
    const texto = String(url);
    const tabela = texto.split('/rest/v1/')[1]?.split('?')[0];
    const limite = new URL(texto).searchParams.get('limit');
    if (tabela) porTabela[tabela] = limite;
  }
  return porTabela;
}

describe('/admin/dashboard · teto explícito e truncamento visível (§2.1)', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.ADMIN_SESSION_SECRET = 'segredo-fixo-para-testes';
    process.env.APP_URL = APP_ORIGIN;
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  });

  afterEach(() => {
    process.env = ambienteOriginal;
    vi.restoreAllMocks();
  });

  it('TODA consulta leva um limit explícito', async () => {
    stubSupabase({});
    const res = createRes();
    await dashboardHandler(reqAdmin(), res);

    expect(res.statusCode).toBe(200);

    const limites = limitesPedidos();
    const tabelas = [
      'products',
      'categories',
      'profiles',
      'orders',
      'order_items',
      'download_logs',
      'settings',
    ];

    expect(Object.keys(limites).sort()).toEqual([...tabelas].sort());
    for (const tabela of tabelas) {
      // O número vem do próprio handler: uma segunda lista aqui divergiria na
      // primeira vez que um teto mudasse, e o teste passaria a proteger o
      // valor errado.
      expect(Number(limites[tabela]), `${tabela} sem limit`).toBe(dashboardHandler.LIMITS[tabela]);
    }
  });

  it('caso normal: `truncated` volta vazio', async () => {
    stubSupabase({ orders: [{ id: '1', total_amount: 10, payment_status: 'approved' }] });
    const res = createRes();
    await dashboardHandler(reqAdmin(), res);

    expect(res.body.truncated).toEqual([]);
  });

  it('encostou no teto: a tabela aparece em `truncated`', async () => {
    // O sinal precisa chegar à TELA. Um `log.warn` sozinho não serve: quem olha
    // o número do faturamento é a dona da loja, e ela não lê log da Vercel.
    const limiteDeOrders = dashboardHandler.LIMITS.orders;
    stubSupabase({
      orders: Array.from({ length: limiteDeOrders }, (_, i) => ({
        id: String(i),
        total_amount: 1,
        payment_status: 'approved',
      })),
    });

    const res = createRes();
    await dashboardHandler(reqAdmin(), res);

    expect(res.body.truncated).toContain('orders');
  });

  it('declara a política de cache de relatório administrativo (regra E4)', async () => {
    stubSupabase({});
    const res = createRes();
    await dashboardHandler(reqAdmin(), res);

    expect(res.headers['cache-control']).toBe('private, max-age=3600');
  });
});
