import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// Validação de fluxos de 2026-10-05 no navegador (relatório no histórico do git).
//
// ACH-02 — trocar papel dava 500: o handler gravava 'seller' cru e a
//          constraint `check_valid_role` do banco só aceita MAIÚSCULAS.
// ACH-04 — excluir produto com pedidos dava 500 genérico (FK de order_items).
// ACH-07 — "Revogar acesso" só apagava `profiles`: a conta de auth.users
//          continuava entrando.
//
// Como em admin-products-category.test.js, o alvo é o handler inteiro (factory
// + auditoria) com só o `fetch` trocado: o defeito morava na conversa com o
// PostgREST e com a Admin API do GoTrue.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { setSessionCookie } = requireCjs('../../lib/admin-session.js');

const APP_ORIGIN = 'https://loja.test';
const USER_ID = '0b7c8a52-6a51-4c4f-9a0e-2f4d3c1b7a10';
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

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json', forEach: () => {} },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

/**
 * `fetch` falso. `routes` decide cada chamada por (método, caminho); o que não
 * casar devolve 200 com lista vazia (ex.: auditoria do admin).
 */
function installFetch(routes) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const parsed = new URL(String(url));
    const method = options.method || 'GET';
    const call = { method, path: parsed.pathname, search: parsed.search, body: options.body };
    calls.push(call);
    for (const route of routes) {
      if (route.method === method && parsed.pathname.endsWith(route.path)) {
        return route.reply(call);
      }
    }
    return jsonResponse(200, []);
  });
  return calls;
}

function loadFresh(path) {
  // services/supabase-auth guarda o client em cache de módulo: cada teste
  // precisa de um novo, apontando para o `fetch` falso da vez.
  for (const key of Object.keys(requireCjs.cache)) {
    if (/[\\/](handlers|lib|services)[\\/]/.test(key) && !key.includes('node_modules')) {
      delete requireCjs.cache[key];
    }
  }
  return requireCjs(path);
}

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

const PERFIL_CLIENTE = { id: USER_ID, email: 'cliente@loja.test', role: 'CUSTOMER' };

describe('/admin/users · trocar papel (ACH-02)', () => {
  it('grava o papel na forma canônica do banco (SELLER), não o "seller" do schema', async () => {
    const calls = installFetch([
      {
        method: 'GET',
        path: '/rest/v1/profiles',
        reply: () => jsonResponse(200, [PERFIL_CLIENTE]),
      },
      { method: 'PATCH', path: '/rest/v1/profiles', reply: () => jsonResponse(200, [{}]) },
    ]);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('PUT', { body: { id: USER_ID, role: 'vendedor' } }), res);

    expect(res.statusCode).toBe(200);
    const patch = calls.find((c) => c.method === 'PATCH' && c.path.endsWith('/profiles'));
    expect(JSON.parse(patch.body)).toEqual({ role: 'SELLER' });
  });

  it('constraint do banco recusando o papel vira 400 com motivo, não 500 genérico', async () => {
    installFetch([
      {
        method: 'GET',
        path: '/rest/v1/profiles',
        reply: () => jsonResponse(200, [PERFIL_CLIENTE]),
      },
      {
        method: 'PATCH',
        path: '/rest/v1/profiles',
        reply: () =>
          jsonResponse(400, {
            code: '23514',
            message: 'new row for relation "profiles" violates check constraint "check_valid_role"',
          }),
      },
    ]);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('PUT', { body: { id: USER_ID, role: 'seller' } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toMatch(/recusou este papel/);
  });

  it('falha inesperada ao SALVAR não diz "carregar"', async () => {
    installFetch([
      {
        method: 'GET',
        path: '/rest/v1/profiles',
        reply: () => jsonResponse(200, [PERFIL_CLIENTE]),
      },
      {
        method: 'PATCH',
        path: '/rest/v1/profiles',
        reply: () => jsonResponse(500, { message: 'x' }),
      },
    ]);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('PUT', { body: { id: USER_ID, role: 'customer' } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe('Erro ao salvar o usuário.');
  });
});

describe('/admin/users · revogar acesso (ACH-07)', () => {
  it('bloqueia o login em auth.users ANTES de apagar o perfil', async () => {
    const calls = installFetch([
      {
        method: 'GET',
        path: '/rest/v1/profiles',
        reply: () => jsonResponse(200, [PERFIL_CLIENTE]),
      },
      {
        method: 'PUT',
        path: `/auth/v1/admin/users/${USER_ID}`,
        reply: () => jsonResponse(200, { id: USER_ID }),
      },
      { method: 'DELETE', path: '/rest/v1/profiles', reply: () => jsonResponse(200, []) },
    ]);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('DELETE', { query: { id: USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    const banIndex = calls.findIndex((c) => c.method === 'PUT' && c.path.includes('/auth/v1/'));
    const deleteIndex = calls.findIndex((c) => c.method === 'DELETE');
    expect(banIndex).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(calls[banIndex].body)).toMatchObject({ ban_duration: '876000h' });
    expect(deleteIndex).toBeGreaterThan(banIndex);
  });

  it('se o ban falhar, NADA é apagado (falha fechada)', async () => {
    const calls = installFetch([
      {
        method: 'GET',
        path: '/rest/v1/profiles',
        reply: () => jsonResponse(200, [PERFIL_CLIENTE]),
      },
      {
        method: 'PUT',
        path: `/auth/v1/admin/users/${USER_ID}`,
        reply: () => jsonResponse(500, { msg: 'boom' }),
      },
    ]);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('DELETE', { query: { id: USER_ID } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe('Erro ao revogar o acesso do usuário.');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});

describe('/admin/products · excluir produto com pedidos (ACH-04)', () => {
  it('FK de order_items vira 409 com orientação para pausar', async () => {
    installFetch([
      {
        method: 'DELETE',
        path: '/rest/v1/products',
        reply: () =>
          jsonResponse(409, {
            code: '23503',
            message:
              'update or delete on table "products" violates foreign key constraint "order_items_product_id_fkey"',
          }),
      },
    ]);
    const handler = loadFresh('../admin/products.js');

    const res = createRes();
    await handler(reqAdmin('DELETE', { query: { id: PRODUTO_ID } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/Pause o produto/);
  });
});

describe('/admin/users · a dona da loja não sai pela aba Usuários', () => {
  const PERFIL_DONA = { id: USER_ID, email: 'dona@loja.test', role: 'SELLER' };
  const rotasDaDona = [
    { method: 'GET', path: '/rest/v1/profiles', reply: () => jsonResponse(200, [PERFIL_DONA]) },
    {
      method: 'GET',
      path: '/rest/v1/settings',
      reply: () => jsonResponse(200, [{ setting_value: { sellerId: USER_ID } }]),
    },
  ];

  it('rebaixar a dona para cliente devolve 409 e não grava nada', async () => {
    const calls = installFetch(rotasDaDona);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('PUT', { body: { id: USER_ID, role: 'customer' } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error.message).toMatch(/dona da loja/);
    expect(calls.some((c) => c.method === 'PATCH' && c.path.endsWith('/profiles'))).toBe(false);
  });

  it('revogar o acesso da dona devolve 409 antes de banir', async () => {
    const calls = installFetch(rotasDaDona);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('DELETE', { query: { id: USER_ID } }), res);

    expect(res.statusCode).toBe(409);
    expect(calls.some((c) => c.path.includes('/auth/v1/admin/users'))).toBe(false);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('trocar só o nome da dona continua permitido', async () => {
    installFetch([
      ...rotasDaDona,
      { method: 'PATCH', path: '/rest/v1/profiles', reply: () => jsonResponse(200, [{}]) },
    ]);
    const handler = loadFresh('../admin/users.js');

    const res = createRes();
    await handler(reqAdmin('PUT', { body: { id: USER_ID, name: 'Profa. Márcia' } }), res);

    expect(res.statusCode).toBe(200);
  });
});
