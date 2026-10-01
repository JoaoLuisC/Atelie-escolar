import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// Validação de 2026-10-01 — ADM-22/CROSS-01/CROSS-11 e ADM-23/CROSS-02.
//
// 1. CATEGORIA-FANTASMA. O wizard mandava `categoryId` = UUID e
//    `resolveCategoryId` só reconhecia id numérico: o UUID era tratado como
//    nome, não achava slug e virava uma categoria NOVA chamada "8f3c…". Toda
//    criação e toda edição de produto plantava uma dessas.
// 2. EDIÇÃO DESTRUTIVA. Um PUT que não fala de `active` não pode reativar um
//    produto pausado, e `originalPrice: null` não pode virar 0.
//
// O alvo é o handler de produção inteiro (factory + auditoria), com só o
// PostgREST trocado por um duplo em memória: é na conversa com o banco que o
// defeito morava, então mockar `lib/supabase` pularia exatamente ele.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const productsHandler = requireCjs('../admin/products.js');
const { setSessionCookie } = requireCjs('../../lib/admin-session.js');

const APP_ORIGIN = 'https://loja.test';
const CATEGORIA_REAL = 'd8f53f51-0074-41c5-b825-888237692d36';
const PRODUTO_ID = '55392863-def7-49b9-a803-abb4f29b5854';

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

function reqAdmin(method, { body, query = {} } = {}) {
  const carrier = { setHeader: (_k, v) => (carrier.value = v) };
  setSessionCookie(carrier, { email: 'dona@loja.test' });
  return {
    method,
    headers: { cookie: String(carrier.value).split(';')[0], origin: APP_ORIGIN },
    query,
    body,
  };
}

/** PostgREST em memória: GET filtra por `col=eq.valor`, POST insere, PATCH atualiza. */
function installFakeDb(tables) {
  let seq = 0;
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/rest/v1/')[1];
    const rows = (tables[table] ||= []);
    const filters = [...parsed.searchParams.entries()].filter(
      ([key, value]) =>
        !['select', 'order', 'limit', 'offset'].includes(key) && value.startsWith('eq.'),
    );
    const matches = (row) => filters.every(([key, value]) => String(row[key]) === value.slice(3));
    const method = options.method || 'GET';

    let data = [];
    if (method === 'GET') {
      data = rows.filter(matches);
      const limit = Number(parsed.searchParams.get('limit'));
      if (limit) data = data.slice(0, limit);
    } else if (method === 'POST') {
      const payload = JSON.parse(options.body);
      const novas = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
        id: row.id ?? `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
        ...row,
      }));
      rows.push(...novas);
      data = novas;
    } else if (method === 'PATCH') {
      const payload = JSON.parse(options.body);
      data = rows.filter(matches).map((row) => Object.assign(row, payload));
    }

    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  });
  return tables;
}

describe('/admin/products · categoria escolhida é a gravada (ADM-22)', () => {
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

  it('POST com o UUID de uma categoria existente grava esse id e NÃO cria categoria', async () => {
    const db = installFakeDb({
      categories: [{ id: CATEGORIA_REAL, name: 'Decoração de Sala', slug: 'decoracao-de-sala' }],
    });

    const res = createRes();
    await productsHandler(
      reqAdmin('POST', { body: { name: 'Kit QA', price: 19.9, categoryId: CATEGORIA_REAL } }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(db.categories).toHaveLength(1);
    expect(db.products[0].category_id).toBe(CATEGORIA_REAL);
  });

  it('UUID inexistente é 400 — nunca vira categoria com o id como nome', async () => {
    const db = installFakeDb({ categories: [] });

    const res = createRes();
    await productsHandler(
      reqAdmin('POST', {
        body: { name: 'Kit QA', price: 19.9, categoryId: '4655ad03-e7cc-478a-8005-e4dd4a5666c0' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(db.categories).toHaveLength(0);
    expect(db.products || []).toHaveLength(0);
  });

  it('nome sem categoria correspondente também não cria nada', async () => {
    const db = installFakeDb({ categories: [] });

    const res = createRes();
    await productsHandler(
      reqAdmin('POST', { body: { name: 'Kit QA', price: 19.9, category: 'Festa Nova' } }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(db.categories).toHaveLength(0);
  });

  it('nome legado ainda resolve pela categoria EXISTENTE com aquele slug', async () => {
    const db = installFakeDb({
      categories: [{ id: CATEGORIA_REAL, name: 'Festa Junina', slug: 'festa-junina' }],
    });

    const res = createRes();
    await productsHandler(
      reqAdmin('POST', { body: { name: 'Kit QA', price: 19.9, category: 'Festa Junina' } }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(db.products[0].category_id).toBe(CATEGORIA_REAL);
    expect(db.categories).toHaveLength(1);
  });
});

describe('/admin/products · editar não destrói o produto (ADM-23)', () => {
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

  function produtoPausado() {
    return {
      id: PRODUTO_ID,
      name: '[TESTE] Produto',
      description: 'desc',
      price: 9.9,
      original_price: 19.9,
      image_url: 'https://cdn/a.png',
      images: ['https://cdn/a.png', 'https://cdn/b.png'],
      videos: [],
      download_url: 'product_files/a.pdf',
      category_id: CATEGORIA_REAL,
      active: false,
      featured: true,
      product_type: 'kit',
      is_kit: true,
      faq: [{ question: 'P?', answer: 'R.' }],
      reviews: [{ author: 'Ana', text: 'Bom', role: '', location: '', rating: 5 }],
      benefits: [{ icon: '', label: 'PDF' }],
    };
  }

  it('PUT sem `active`/`featured` preserva o produto pausado e em destaque', async () => {
    const db = installFakeDb({
      categories: [{ id: CATEGORIA_REAL, name: 'Decoração de Sala', slug: 'decoracao-de-sala' }],
      products: [produtoPausado()],
    });

    const res = createRes();
    await productsHandler(
      reqAdmin('PUT', { body: { id: PRODUTO_ID, price: 12.9, categoryId: CATEGORIA_REAL } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const salvo = db.products[0];
    expect(salvo.active).toBe(false);
    expect(salvo.featured).toBe(true);
    expect(salvo.price).toBe(12.9);
    // Campos que o corpo não mencionou ficam como estavam.
    expect(salvo.original_price).toBe(19.9);
    expect(salvo.images).toHaveLength(2);
    expect(salvo.faq).toHaveLength(1);
    expect(salvo.reviews).toHaveLength(1);
    expect(salvo.benefits).toHaveLength(1);
    expect(salvo.is_kit).toBe(true);
    expect(salvo.category_id).toBe(CATEGORIA_REAL);
    expect(db.categories).toHaveLength(1);
  });

  it('originalPrice null limpa para null (não para 0)', async () => {
    const db = installFakeDb({ products: [produtoPausado()] });

    const res = createRes();
    await productsHandler(reqAdmin('PUT', { body: { id: PRODUTO_ID, originalPrice: null } }), res);

    expect(res.statusCode).toBe(200);
    expect(db.products[0].original_price).toBeNull();
  });

  it('productType no corpo mantém is_kit coerente', async () => {
    const db = installFakeDb({ products: [produtoPausado()] });

    const res = createRes();
    await productsHandler(
      reqAdmin('PUT', { body: { id: PRODUTO_ID, productType: 'individual' } }),
      res,
    );

    expect(db.products[0].product_type).toBe('individual');
    expect(db.products[0].is_kit).toBe(false);
  });

  it('GET ?id devolve o produto COMPLETO para o wizard de edição', async () => {
    installFakeDb({
      categories: [{ id: CATEGORIA_REAL, name: 'Decoração de Sala' }],
      products: [produtoPausado()],
    });

    const res = createRes();
    await productsHandler(reqAdmin('GET', { query: { id: PRODUTO_ID } }), res);

    expect(res.statusCode).toBe(200);
    const { product } = res.body;
    expect(product.id).toBe(PRODUTO_ID);
    expect(product.images).toHaveLength(2);
    expect(product.originalPrice).toBe(19.9);
    expect(product.productType).toBe('kit');
    expect(product.faq).toHaveLength(1);
    expect(product.active).toBe(false);
    expect(product.category).toBe('Decoração de Sala');
  });

  it('GET ?id de produto inexistente é 404', async () => {
    installFakeDb({ products: [] });
    const res = createRes();
    await productsHandler(reqAdmin('GET', { query: { id: PRODUTO_ID } }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('/admin/categories · PUT (ADM-26 / CROSS-12)', () => {
  const categoriesHandler = requireCjs('../admin/categories.js');
  const OUTRA = '7c48c087-0225-40af-bfc7-05d2ada5c638';
  const FANTASMA = '208f1934-faa7-481d-8942-1923922891d2';
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

  it('renomear para o nome de OUTRA categoria é 409, não 500', async () => {
    const db = installFakeDb({
      categories: [
        { id: CATEGORIA_REAL, name: 'Decoração de Sala', slug: 'decoracao-de-sala' },
        { id: OUTRA, name: 'Festa Junina', slug: 'festa-junina' },
      ],
    });

    const res = createRes();
    await categoriesHandler(
      reqAdmin('PUT', { body: { id: CATEGORIA_REAL, name: 'Festa Junina' } }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.error.message).toBe('Categoria já existe.');
    expect(db.categories[0].name).toBe('Decoração de Sala');
  });

  it('categoria-fantasma (nome = UUID) pode ser desativada sem trocar o nome', async () => {
    const db = installFakeDb({
      categories: [{ id: FANTASMA, name: OUTRA, slug: OUTRA, active: true }],
    });

    const res = createRes();
    await categoriesHandler(
      reqAdmin('PUT', { body: { id: FANTASMA, name: OUTRA, active: false } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(db.categories[0].active).toBe(false);
  });

  it('RENOMEAR para um UUID continua recusado', async () => {
    installFakeDb({
      categories: [{ id: CATEGORIA_REAL, name: 'Decoração de Sala', slug: 'decoracao-de-sala' }],
    });

    const res = createRes();
    await categoriesHandler(reqAdmin('PUT', { body: { id: CATEGORIA_REAL, name: OUTRA } }), res);

    expect(res.statusCode).toBe(400);
  });
});
