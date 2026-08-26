import { createRequire } from 'node:module';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// Contrato dos CINCO recursos CRUD do admin — §3.1/§3.2 + P1.2 + P2.1.
//
// A factory é testada isoladamente em `lib/__tests__/admin-resource-handler`.
// Aqui o alvo é o WIRING: os cinco handlers de produção realmente passam por
// ela, com o mapa de métodos certo. É o que garante que o header `Allow` do
// 405 não volte a divergir do que cada handler aceita — antes cada arquivo
// repetia a lista à mão e bastava alguém acrescentar um método e esquecer.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);

const RECURSOS = [
  { arquivo: 'products', handler: 'adminProductsHandler', allow: 'GET, POST, PUT, PATCH, DELETE' },
  { arquivo: 'categories', handler: 'adminCategoriesHandler', allow: 'GET, POST, PUT, DELETE' },
  { arquivo: 'coupons', handler: 'adminCouponsHandler', allow: 'GET, POST, PUT, DELETE' },
  { arquivo: 'orders', handler: 'adminOrdersHandler', allow: 'GET, PUT, DELETE' },
  { arquivo: 'users', handler: 'adminUsersHandler', allow: 'GET, PUT, DELETE' },
];

function createRes() {
  const res = {
    statusCode: 0,
    body: undefined,
    headers: {},
    ended: false,
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
    end: vi.fn(() => {
      res.ended = true;
      return res;
    }),
  };
  return res;
}

describe('contrato dos recursos CRUD do admin', () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = 'segredo-fixo-para-testes';
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
  });

  for (const { arquivo, handler: nomeEsperado, allow } of RECURSOS) {
    describe(`api/admin/${arquivo}.js`, () => {
      const handler = requireCjs(`../admin/${arquivo}.js`);

      it(`exporta ${nomeEsperado} (regra A5)`, () => {
        expect(typeof handler).toBe('function');
        expect(handler.name).toBe(nomeEsperado);
      });

      it('preflight responde 204 (regra A4)', async () => {
        const res = createRes();
        await handler({ method: 'OPTIONS', headers: {} }, res);
        expect(res.statusCode).toBe(204);
      });

      it(`405 declara Allow: ${allow}, OPTIONS`, async () => {
        const res = createRes();
        await handler({ method: 'TRACE', headers: {}, query: {} }, res);

        expect(res.statusCode).toBe(405);
        expect(res.headers.allow).toBe(`${allow}, OPTIONS`);
      });

      it('sem sessão devolve 401 ADMIN_SESSION_INVALID no envelope da A1', async () => {
        const res = createRes();
        await handler({ method: 'GET', headers: {}, query: {} }, res);

        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
        expect(typeof res.body.error).toBe('object');
        expect(res.body.error.code).toBe('ADMIN_SESSION_INVALID');
      });
    });
  }

  it('todos os cinco vêm da factory — nenhum ficou com o bloco copiado', () => {
    // A prova é o `name`: a factory o define por configuração. Um handler que
    // voltasse a ser `async function (req, res)` escrito à mão teria outro
    // nome ou nenhum, e o teste de `name` acima cairia junto.
    const nomes = RECURSOS.map(({ arquivo }) => requireCjs(`../admin/${arquivo}.js`).name);
    expect(new Set(nomes).size).toBe(RECURSOS.length);
  });
});
