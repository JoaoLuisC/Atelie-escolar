import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  createSupabaseStore,
  installModuleMock,
  installRateLimitPassthrough,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// Endpoints PÚBLICOS do catálogo — achados da validação de 2026-10-01.
//
//   LOJA-02  categoria com nome de UUID virava chip, pílula e URL de sitemap;
//            faixa da home sem produto aparecia vazia.
//   LOJA-05  /produtos/123 respondia 500: "número puro" ia para a coluna id,
//            que é UUID, e o cast falhava no PostgREST.
//   LOJA-06  o link da faixa usava o NOME e o sitemap o SLUG.
//   LOJA-25  o sitemap listava /login (bloqueado no robots.txt) e caía num
//            domínio que não resolve quando APP_URL faltava.
//   LOJA-35  token de descadastro inventado ("abc") ouvia "Inscrição cancelada".
//   CROSS-07 cache de 5 min no NAVEGADOR escondia mudanças do painel.
// ════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CAT_JUNINA = '11111111-1111-4111-8111-111111111111';
const CAT_FANTASMA = '22222222-2222-4222-8222-222222222222';
const CAT_VAZIA = '33333333-3333-4333-8333-333333333333';
const PROD_QUADRILHA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROD_FANTASMA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function seed() {
  return createSupabaseStore({
    categories: [
      { id: CAT_JUNINA, name: 'Festa Junina', slug: 'festa-junina', active: true },
      {
        // A categoria-fantasma do CROSS-01: o NOME é o id de outra categoria.
        id: CAT_FANTASMA,
        name: '7c48c087-0225-40af-bfc7-05d2ada5c638',
        slug: '7c48c087-0225-40af-bfc7-05d2ada5c638',
        active: true,
      },
      { id: CAT_VAZIA, name: 'Natal', slug: 'natal', active: true },
    ],
    products: [
      {
        id: PROD_QUADRILHA,
        slug: 'banner-quadrilha',
        name: 'Banner Quadrilha',
        price: 29.9,
        category_id: CAT_JUNINA,
        active: true,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: PROD_FANTASMA,
        slug: 'kit-festa',
        name: 'Kit Festa',
        price: 20,
        category_id: CAT_FANTASMA,
        active: true,
        created_at: '2026-05-01T00:00:00.000Z',
      },
    ],
    settings: [],
    email_subscribers: [],
  });
}

let store;

beforeEach(() => {
  resetModuleRegistry();
  store = seed();

  // Reproduz o comportamento do PostgREST que causava o LOJA-05: filtrar a
  // coluna `id` (uuid) por um valor que não é UUID é ERRO de cast, não "0
  // linhas".
  const listOriginal = store.serviceRoleHelpers.listTableRows;
  const listComCast = vi.fn(async (name, options = {}) => {
    const filtroId = (options.filters || []).find((filter) => filter.column === 'id');
    if (filtroId && !UUID_RE.test(String(filtroId.value))) {
      throw new Error('invalid input syntax for type uuid');
    }
    return listOriginal(name, options);
  });
  store.serviceRoleHelpers.listTableRows = listComCast;
  store.serviceRoleHelpers.getTableRow = vi.fn(
    async (name, options) => (await listComCast(name, options))[0] || null,
  );

  installSupabaseMock(store);
  installRateLimitPassthrough();
  installModuleMock('../../lib/sales-counts', {
    loadSoldCountByProduct: vi.fn(async () => new Map()),
  });
  installModuleMock('../../lib/email-sender', {
    sendEmail: vi.fn(async () => ({ sent: true })),
    getAppUrl: () => 'https://loja.test',
  });
});

afterEach(() => {
  resetModuleRegistry();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('product-details · identificador', () => {
  it('/produtos/123: número puro é SLUG — 404, nunca 500 (LOJA-05)', async () => {
    const handler = loadHandler('../product-details.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: { slug: '123' }, headers: {} }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  it('UUID continua buscando pela coluna id', async () => {
    const handler = loadHandler('../product-details.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: { id: PROD_QUADRILHA }, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.product.slug).toBe('banner-quadrilha');
    expect(res.body.product.categorySlug).toBe('festa-junina');
  });

  it('categoria com nome de UUID não vai para a pílula (LOJA-02)', async () => {
    const handler = loadHandler('../product-details.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: { slug: 'kit-festa' }, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.product.category).toBeNull();
    expect(res.body.product.categorySlug).toBeNull();
  });

  it('o navegador não guarda a resposta; só o CDN, por pouco tempo (CROSS-04/07)', async () => {
    const handler = loadHandler('../product-details.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: { slug: 'banner-quadrilha' }, headers: {} }, res);

    expect(res.headers['Cache-Control']).toMatch(/max-age=0/);
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=60/);
  });
});

describe('products · categorias públicas', () => {
  it('nome de UUID vira `category: null`; o produto continua listado (LOJA-02)', async () => {
    const handler = loadHandler('../products.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    const porSlug = Object.fromEntries(res.body.products.map((p) => [p.slug, p]));
    expect(porSlug['kit-festa'].category).toBeNull();
    expect(porSlug['banner-quadrilha']).toMatchObject({
      category: 'Festa Junina',
      categorySlug: 'festa-junina',
    });
    expect(res.headers['Cache-Control']).toMatch(/max-age=0/);
  });
});

describe('home-sections · faixas', () => {
  it('sem faixa vazia, sem faixa de categoria-fantasma, e link pelo slug (LOJA-02/06)', async () => {
    const handler = loadHandler('../home-sections.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    const titulos = res.body.sections.map((section) => section.title);
    // "Natal" não tem produto; a fantasma tem nome de UUID.
    expect(titulos).not.toContain('Natal');
    expect(titulos.some((titulo) => UUID_RE.test(titulo))).toBe(false);

    const junina = res.body.sections.find((section) => section.title === 'Festa Junina');
    expect(junina.link).toBe('/produtos?categoria=festa-junina');
    expect(res.body.sections.every((section) => section.products.length > 0)).toBe(true);
  });
});

describe('sitemap.xml', () => {
  it('sem categoria-fantasma, sem /login, e na origem do pedido quando falta APP_URL (LOJA-02/25)', async () => {
    vi.stubEnv('APP_URL', '');
    // O sitemap usa `listTableRows` direto do módulo, não do namespace.
    installModuleMock('../../lib/supabase', {
      getSupabaseConfig: () => ({ url: 'https://projeto-teste.supabase.co' }),
      listTableRows: store.serviceRoleHelpers.listTableRows,
    });
    const handler = loadHandler('../sitemap.xml.js');
    const res = createMockRes();
    res.send = vi.fn((body) => {
      res.body = body;
      return res;
    });

    await handler(
      { method: 'GET', headers: { host: 'atelie.example', 'x-forwarded-proto': 'https' } },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<loc>https://atelie.example/produtos?categoria=festa-junina</loc>');
    expect(res.body).not.toContain('7c48c087');
    expect(res.body).not.toContain('/login');
    expect(res.body).not.toContain('profamarciarcardoso.com.br');
  });
});

describe('unsubscribe · token', () => {
  it('token sem o formato de token é 400 — não "Inscrição cancelada" (LOJA-35)', async () => {
    const handler = loadHandler('../unsubscribe.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: { token: 'abc' }, headers: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION_FAILED');
  });

  it('token bem formado e desconhecido recebe a MESMA resposta do válido, sem afirmar remoção', async () => {
    const handler = loadHandler('../unsubscribe.js');
    const res = createMockRes();

    await handler({ method: 'GET', query: { token: 'x'.repeat(43) }, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).not.toMatch(/Inscrição cancelada/i);
    expect(res.body.message).toMatch(/não receberá mais e-mails de marketing/i);
  });
});
