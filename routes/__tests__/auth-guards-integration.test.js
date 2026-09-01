import { createRequire } from 'node:module';
import http from 'node:http';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// AS GUARDAS DE AUTH DE CLIENTE ESTÃO NO CAMINHO DE PRODUÇÃO?
//
// POR QUE ESTE TESTE SOBE UM SERVIDOR DE VERDADE
// A regressão do 660fe74 não estava em nenhum handler: estava na MONTAGEM.
// `routes/auth.routes.js` importava a lógica crua de
// `lib/customer-auth-handlers` em vez dos módulos de
// `handlers/auth/customer/**`, e com isso `enforceRateLimit` e a checagem
// anti-CSRF do logout simplesmente não rodavam — enquanto as suítes que
// chamavam os handlers DIRETO continuavam verdes, porque testavam o módulo
// certo pelo caminho errado.
//
// Chamar o handler direto aqui repetiria o mesmo erro. Este teste monta o app
// que a Vercel serve (`createApiApp`, o mesmo de `api/index.js`) e fala com
// ele por HTTP, então o que ele afirma é o que a cliente encontra.
//
// `node:http` e não `fetch`: `src/test/setupNodeTests.js` derruba o `fetch`
// global de propósito, e é justamente esse `fetch` que precisamos manter
// mockado para emular a RPC `rate_limit_hit` do Postgres.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { createApiApp } = requireCjs('../../lib/express-app.js');
const { errorHandler } = requireCjs('../../middleware/error.middleware.js');

const RPC_URL_FRAGMENT = '/rest/v1/rpc/rate_limit_hit';
const GOTRUE_FRAGMENT = '/auth/v1/token';

let server;
let baseUrl;
let originalFetch;
let originalEnv;

/** Resposta do PostgREST no formato que `lib/supabase.js` espera. */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Uma linha de `rate_limit_hit`. `allowed: false` é o balde estourado. */
function rpcRow({ allowed = true, remaining = 4, limit = 5, retryAfter = 600 } = {}) {
  return [
    {
      allowed,
      hit_count: allowed ? limit - remaining : limit + 1,
      remaining,
      limit_value: limit,
      window_seconds: 600,
      retry_after_seconds: retryAfter,
    },
  ];
}

/** Estado do mock: o que a próxima chamada da RPC devolve. */
let rpcRows = rpcRow();

function request(method, pathname, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      `${baseUrl}${pathname}`,
      {
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : undefined;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      },
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(async () => {
  originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    APP_URL: process.env.APP_URL,
  };

  // A RPC precisa estar "configurada" para o contador ser consultado — sem
  // isto `enforceRateLimit` cai no fail-open e o teste passaria por engano.
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-stub-key';
  process.env.SUPABASE_ANON_KEY = 'anon-stub-key';
  process.env.APP_URL = 'http://localhost:5173';

  const app = createApiApp({ runtimeEnv: 'test' });
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  Object.assign(process.env, originalEnv);
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
  }
  if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  rpcRows = rpcRow();
  originalFetch = global.fetch;
  global.fetch = vi.fn(async (url) => {
    const target = String(url);
    if (target.includes(RPC_URL_FRAGMENT)) return jsonResponse(rpcRows);
    // Se o teste chegar aqui é porque a guarda DEIXOU passar: a chamada de
    // autenticação ao GoTrue só acontece depois do contador.
    if (target.includes(GOTRUE_FRAGMENT)) {
      return jsonResponse({ error: 'invalid_grant' }, { ok: false, status: 400 });
    }
    return jsonResponse([], { ok: false, status: 500 });
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function rpcCalls() {
  return global.fetch.mock.calls.filter((call) => String(call[0]).includes(RPC_URL_FRAGMENT));
}

describe('guardas de auth de cliente no app servido em produção', () => {
  describe('rate limit (o que o 660fe74 desligou)', () => {
    it.each([
      ['/api/auth/customer/login', 'POST', { email: 'a@b.com', password: 'senha-errada' }],
      [
        '/api/auth/customer/register',
        'POST',
        { email: 'a@b.com', password: 'Senha123', name: 'A' },
      ],
      ['/api/auth/customer/google/callback', 'POST', { accessToken: 'x' }],
    ])('%s consulta o contador antes de qualquer trabalho', async (pathname, method, body) => {
      await request(method, pathname, { headers: { origin: 'http://localhost:5173' }, body });

      expect(rpcCalls().length).toBeGreaterThan(0);
    });

    it('/api/auth/customer/google/start consulta o contador', async () => {
      await request('GET', '/api/auth/customer/google/start');
      expect(rpcCalls().length).toBeGreaterThan(0);
    });

    it('devolve 429 no envelope quando o balde estoura', async () => {
      rpcRows = rpcRow({ allowed: false, remaining: 0, retryAfter: 420 });

      const res = await request('POST', '/api/auth/customer/login', {
        headers: { origin: 'http://localhost:5173' },
        body: { email: 'a@b.com', password: 'senha-errada' },
      });

      expect(res.status).toBe(429);
      expect(res.body?.success).toBe(false);
      expect(res.body?.error?.code).toBe('RATE_LIMITED');
    });

    it('bloqueado NÃO chega ao Supabase Auth — a guarda vem antes do recurso caro', async () => {
      rpcRows = rpcRow({ allowed: false, remaining: 0 });

      await request('POST', '/api/auth/customer/login', {
        headers: { origin: 'http://localhost:5173' },
        body: { email: 'a@b.com', password: 'senha-errada' },
      });

      const chamadasGoTrue = global.fetch.mock.calls.filter((call) =>
        String(call[0]).includes(GOTRUE_FRAGMENT),
      );
      expect(chamadasGoTrue).toEqual([]);
    });
  });

  describe('anti-CSRF do logout', () => {
    it('recusa origem externa com 403', async () => {
      const res = await request('POST', '/api/auth/customer/logout', {
        headers: { origin: 'https://site-malicioso.example' },
      });

      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('FORBIDDEN');
    });

    it('recusa requisicao sem Origin nem Referer (fail-closed)', async () => {
      const res = await request('POST', '/api/auth/customer/logout');
      expect(res.status).toBe(403);
    });

    it('aceita same-origin', async () => {
      const res = await request('POST', '/api/auth/customer/logout', {
        headers: { origin: 'http://localhost:5173' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('guarda de metodo (405, nao o 404 do Express)', () => {
    it.each([
      ['GET', '/api/auth/customer/login'],
      ['GET', '/api/auth/customer/register'],
      ['GET', '/api/auth/customer/logout'],
      ['POST', '/api/auth/customer/session'],
      ['POST', '/api/auth/customer/google/start'],
      ['GET', '/api/auth/customer/google/callback'],
    ])('%s %s -> 405', async (method, pathname) => {
      const res = await request(method, pathname, { headers: { origin: 'http://localhost:5173' } });

      expect(res.status).toBe(405);
      expect(res.body?.error?.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('405 nao custa escrita no contador', async () => {
      await request('GET', '/api/auth/customer/login');
      expect(rpcCalls()).toEqual([]);
    });
  });
});
