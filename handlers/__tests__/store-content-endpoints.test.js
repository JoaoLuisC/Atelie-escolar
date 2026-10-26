import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  createSupabaseStore,
  installRateLimitPassthrough,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// Os dois endpoints PÚBLICOS que leem o conteúdo editável da loja:
// /api/home-content (textos da home) e o campo `sharedDescription` de
// /api/product-details (descrição comum a todos os produtos).

const PRODUTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function seed(settings = []) {
  return createSupabaseStore({
    categories: [],
    products: [
      {
        id: PRODUTO,
        slug: 'palavras-magicas',
        name: 'Palavras Mágicas',
        description: 'Descrição própria',
        price: 5,
        active: true,
      },
    ],
    settings,
  });
}

function install(settings) {
  const store = seed(settings);
  installSupabaseMock(store);
  installRateLimitPassthrough();
  return store;
}

beforeEach(() => {
  resetModuleRegistry();
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('home-content', () => {
  it('sem nada salvo, devolve conteúdo vazio (a home usa o padrão inteiro)', async () => {
    install([]);
    const res = createMockRes();

    await loadHandler('../home-content.js')({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, content: {} });
  });

  it('limpa de novo na leitura: link perigoso gravado à mão no banco não sai', async () => {
    install([
      {
        setting_key: 'homeContent',
        setting_value: {
          hero: { title: 'Bem-vinda', ctaLink: 'javascript:alert(1)' },
          campoDesconhecido: 'x',
        },
      },
    ]);
    const res = createMockRes();

    await loadHandler('../home-content.js')({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.content).toEqual({ hero: { title: 'Bem-vinda' } });
  });

  it('aceita o valor gravado como texto JSON (formato antigo da coluna)', async () => {
    install([
      { setting_key: 'homeContent', setting_value: JSON.stringify({ catalog: { title: 'Oi' } }) },
    ]);
    const res = createMockRes();

    await loadHandler('../home-content.js')({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.body.content).toEqual({ catalog: { title: 'Oi' } });
  });

  it('cache de catálogo: o CDN guarda por pouco tempo, o navegador não', async () => {
    install([]);
    const res = createMockRes();

    await loadHandler('../home-content.js')({ method: 'GET', query: {}, headers: {} }, res);

    expect(String(res.headers['cache-control'] || res.headers['Cache-Control'])).toMatch(
      /s-maxage=/,
    );
  });

  it('só GET', async () => {
    install([]);
    const res = createMockRes();

    await loadHandler('../home-content.js')({ method: 'POST', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(405);
  });
});

describe('product-details · sharedDescription', () => {
  it('sem descrição comum salva, o campo vem null', async () => {
    install([]);
    const res = createMockRes();

    await loadHandler('../product-details.js')(
      { method: 'GET', query: { slug: 'palavras-magicas' }, headers: {} },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.product.sharedDescription).toBeNull();
  });

  it('com descrição comum salva, vem junto do produto, preservando parágrafos', async () => {
    install([
      {
        setting_key: 'productDefaults',
        setting_value: {
          sharedDescriptionTitle: 'Sobre os materiais',
          sharedDescription: 'Parágrafo 1\n\nParágrafo 2',
        },
      },
    ]);
    const res = createMockRes();

    await loadHandler('../product-details.js')(
      { method: 'GET', query: { slug: 'palavras-magicas' }, headers: {} },
      res,
    );

    expect(res.body.product.description).toBe('Descrição própria');
    expect(res.body.product.sharedDescription).toEqual({
      title: 'Sobre os materiais',
      text: 'Parágrafo 1\n\nParágrafo 2',
    });
  });

  it('falha ao ler a configuração não derruba a página do produto', async () => {
    const store = install([]);
    const original = store.serviceRoleHelpers.getTableRow;
    store.serviceRoleHelpers.getTableRow = vi.fn(async (table, options) => {
      if (table === 'settings') throw new Error('banco fora');
      return original(table, options);
    });
    installSupabaseMock(store);
    const res = createMockRes();

    await loadHandler('../product-details.js')(
      { method: 'GET', query: { slug: 'palavras-magicas' }, headers: {} },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.product.sharedDescription).toBeNull();
  });
});
