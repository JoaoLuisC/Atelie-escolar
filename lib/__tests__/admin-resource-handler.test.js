import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// §3.1 / §3.2 / P1.2 / P2.1 — a factory dos recursos CRUD do admin.
//
// O ganho que este teste protege NÃO é o corte de ~275 linhas. É que a
// auditoria de escrita (regra I1), a sessão admin, o envelope e o header
// `Allow` do 405 passaram a ter UM lugar — antes eram cinco cópias, e o
// próximo recurso admin dependia de alguém lembrar de copiar o bloco certo.
//
// ── POR QUE SEM `vi.mock` ───────────────────────────────────────────
// Os módulos de `lib/` são CommonJS (ADR 0001) e são carregados por
// `createRequire`, que é `require` de verdade — `vi.mock` não intercepta esse
// caminho. Em vez de contornar com injeção de dependência só para o teste, as
// dependências reais rodam com ambiente controlado e a única fronteira
// substituída é o `fetch`. Sai mais forte: a auditoria da regra I1 é
// verificada pela ESCRITA que ela emite, não por um espião que confirma que
// uma função foi chamada.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { createAdminResourceHandler } = requireCjs('../admin-resource-handler.js');
const { setSessionCookie } = requireCjs('../admin-session.js');

const APP_ORIGIN = 'https://loja.test';

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

/** Cookie de sessão admin válido, emitido pelo próprio módulo de sessão. */
function issueAdminCookie(identity = { email: 'dona@loja.test' }) {
  const carrier = { setHeader: (_k, v) => (carrier.value = v) };
  setSessionCookie(carrier, identity);
  return String(carrier.value).split(';')[0];
}

function reqComSessao(method, extras = {}) {
  return {
    method,
    headers: { cookie: issueAdminCookie(), origin: APP_ORIGIN },
    query: {},
    ...extras,
  };
}

function buildHandler(overrides = {}) {
  return createAdminResourceHandler({
    targetType: 'widget',
    errorMessage: 'Erro ao processar widgets do admin.',
    loggerName: 'admin-widgets',
    handlerName: 'adminWidgetsHandler',
    operations: {
      GET: async () => ({ status: 200, body: { widgets: [{ id: '1' }] } }),
      POST: async () => ({ status: 201, body: { id: 'novo-id' } }),
      DELETE: async () => ({
        error: { status: 404, code: 'NOT_FOUND', message: 'Widget não encontrado.' },
      }),
      ...overrides,
    },
  });
}

/** Chamadas de escrita que chegaram ao PostgREST, por tabela. */
function inserts(tabela) {
  return globalThis.fetch.mock.calls.filter((call) => String(call[0]).includes(`/${tabela}`));
}

describe('createAdminResourceHandler', () => {
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

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => [{ id: 'linha-gravada' }],
      text: async () => '[]',
    }));
  });

  afterEach(() => {
    process.env = ambienteOriginal;
    vi.restoreAllMocks();
  });

  it('nomeia o handler para o stack trace da Vercel (regra A5)', () => {
    expect(buildHandler().name).toBe('adminWidgetsHandler');
  });

  it('preflight OPTIONS responde 204 sem corpo (regra A4)', async () => {
    const res = createRes();
    await buildHandler()({ method: 'OPTIONS', headers: {} }, res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('405 traz o header Allow derivado do PRÓPRIO mapa de operações', async () => {
    const res = createRes();
    await buildHandler()(reqComSessao('PUT'), res);

    expect(res.statusCode).toBe(405);
    // A lista sai de Object.keys(operations) — é o que impede o `Allow` de
    // divergir do que o handler realmente aceita, como acontecia quando cada
    // arquivo repetia a lista à mão.
    expect(res.headers.allow).toBe('GET, POST, DELETE, OPTIONS');
    expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('sem cookie de sessão: 401 ADMIN_SESSION_INVALID, sem tocar a operação', async () => {
    const operacao = vi.fn();
    const res = createRes();

    await buildHandler({ GET: operacao })({ method: 'GET', headers: {}, query: {} }, res);

    expect(operacao).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('ADMIN_SESSION_INVALID');
  });

  it('escrita sem Origin confiável: 403 FORBIDDEN (anti-CSRF)', async () => {
    const res = createRes();
    await buildHandler()(
      { method: 'POST', headers: { cookie: issueAdminCookie() }, query: {}, body: {} },
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('sucesso sai pelo envelope plano da regra A1', async () => {
    const res = createRes();
    await buildHandler()(reqComSessao('GET'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, widgets: [{ id: '1' }] });
  });

  it('falha da operação sai por fail(), com code e error OBJETO', async () => {
    const res = createRes();
    await buildHandler()(reqComSessao('DELETE'), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    // O defeito do P1.2 era exatamente este: `error` chegava como string, sem
    // `code`, e um `if` por código na tela virava ramo morto para sempre.
    expect(typeof res.body.error).toBe('object');
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('escrita bem-sucedida grava a trilha de auditoria (regra I1)', async () => {
    const res = createRes();
    await buildHandler()(reqComSessao('POST', { body: { nome: 'x' } }), res);

    const auditoria = inserts('admin_audit_log');
    expect(auditoria).toHaveLength(1);

    const gravado = JSON.parse(auditoria[0][1].body);
    expect(gravado).toMatchObject({
      action: 'create',
      target_type: 'widget',
      target_id: 'novo-id',
      admin_id: 'dona@loja.test',
    });
  });

  it('leitura NÃO grava auditoria', async () => {
    const res = createRes();
    await buildHandler()(reqComSessao('GET'), res);
    expect(inserts('admin_audit_log')).toHaveLength(0);
  });

  it('escrita que falhou NÃO grava auditoria', async () => {
    const res = createRes();
    await buildHandler()(reqComSessao('DELETE'), res);
    expect(inserts('admin_audit_log')).toHaveLength(0);
  });

  it('Supabase ausente vira 500 com code, não exceção', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = createRes();

    await buildHandler()(reqComSessao('GET'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Supabase não configurado.');
  });

  it('exceção na operação vira 500 com a mensagem do recurso, sem vazar o erro', async () => {
    const res = createRes();
    const handler = buildHandler({
      GET: async () => {
        throw new Error('coluna secreta_x não existe em public.widgets');
      },
    });

    await handler(reqComSessao('GET'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Erro ao processar widgets do admin.');
    expect(JSON.stringify(res.body)).not.toContain('secreta_x');
  });

  it('CORS é o primeiro passo, antes de qualquer decisão (regra A3)', async () => {
    const res = createRes();
    await buildHandler()({ method: 'OPTIONS', headers: { origin: APP_ORIGIN } }, res);

    expect(res.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
  });
});
