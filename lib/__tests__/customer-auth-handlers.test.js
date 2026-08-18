import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A camada Supabase (perfil/role) é mockada: estes testes não tocam a rede.
// O acesso HTTP ao /auth/v1 é interceptado via global.fetch mockado.
vi.mock('../../services/supabase-auth', () => ({
  getProfileRoleByUserId: vi.fn(async () => ''),
  getProfileRoleByEmail: vi.fn(async () => ''),
  getAnonClient: vi.fn(() => null),
  getAdminClient: vi.fn(() => null),
}));

import { customerLogin, customerRegister, customerGoogleStart } from '../customer-auth-handlers.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader: vi.fn((k, v) => {
      res.headers[k] = v;
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

function makeFetchResponse({ ok = false, status = 400, json = {} }) {
  return {
    ok,
    status,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => json,
    text: async () => JSON.stringify(json),
  };
}

describe('customer-auth-handlers', () => {
  let original;
  let originalFetch;

  beforeEach(() => {
    original = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      APP_URL: process.env.APP_URL,
      CUSTOMER_SESSION_SECRET: process.env.CUSTOMER_SESSION_SECRET,
    };
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-stub-key';
    process.env.APP_URL = 'https://loja.example.com';
    process.env.CUSTOMER_SESSION_SECRET = 'fixed-customer-secret-for-tests';

    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('customerRegister — anti-enumeração de e-mail', () => {
    const NEUTRAL = 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.';

    it('e-mail já existente (422) retorna mensagem NEUTRA que não confirma existência', async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 422,
          json: { error_code: 'user_already_exists', msg: 'User already registered' },
        }),
      );

      const req = {
        body: { name: 'Fulano de Tal', email: 'existente@test.com', password: 'Password1' },
      };
      const res = createMockRes();
      await customerRegister(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toBe(NEUTRAL);
      // Não pode vazar que a conta já existe.
      expect(res.body.error.message).not.toMatch(/já cadastrad|existe|already|registrad/i);
      // Confirma que atingiu o endpoint de signup.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(String(global.fetch.mock.calls[0][0])).toContain('/auth/v1/signup');
    });

    it('mesma mensagem neutra quando o Supabase sinaliza "already been registered" via 400', async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 400,
          json: { msg: 'Email address has already been registered' },
        }),
      );

      const req = { body: { name: 'Fulano', email: 'existente@test.com', password: 'Password1' } };
      const res = createMockRes();
      await customerRegister(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe(NEUTRAL);
    });

    it('valida entrada antes de chamar o Supabase (senha curta)', async () => {
      const req = { body: { name: 'Fulano', email: 'a@b.com', password: 'curta' } };
      const res = createMockRes();
      await customerRegister(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toMatch(/8 caracteres/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('customerLogin — mensagem genérica de credencial', () => {
    it('credencial inválida retorna 401 com mensagem genérica (sem revelar qual campo)', async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 400,
          json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
        }),
      );

      const req = { body: { email: 'user@test.com', password: 'senhaErrada' } };
      const res = createMockRes();
      await customerLogin(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      // Regra A2: o cliente ramifica por CODE, nunca pelo texto em português.
      expect(res.body.error.code).toBe('CREDENTIALS_INVALID');
      expect(res.body.error.message).toBe('E-mail ou senha incorretos.');
      expect(res.body.error.message).not.toMatch(/não encontrad|inexistente|not found|no user/i);
    });

    it('e-mail inexistente produz a MESMA mensagem que senha errada (anti-enumeração)', async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 400,
          json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
        }),
      );

      const res = createMockRes();
      await customerLogin({ body: { email: 'naoexiste@test.com', password: 'qualquer' } }, res);
      expect(res.body.error.message).toBe('E-mail ou senha incorretos.');
    });

    it('email_not_confirmed é o ÚNICO caso com dica específica (só ocorre com senha correta)', async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 400,
          json: { error_code: 'email_not_confirmed', msg: 'Email not confirmed' },
        }),
      );

      const res = createMockRes();
      await customerLogin({ body: { email: 'user@test.com', password: 'Password1' } }, res);
      expect(res.statusCode).toBe(401);
      expect(res.body.error.message).toMatch(/não confirmado/i);
    });

    it('sem e-mail/senha retorna 401 sem chamar o Supabase', async () => {
      const res = createMockRes();
      await customerLogin({ body: { email: '', password: '' } }, res);
      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toMatch(/Informe e-mail e senha/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('customerGoogleStart — validação de redirect (open redirect)', () => {
    // sanitizeRelativeRedirect não é exportado; validamos através do redirect
    // final montado no callback do OAuth (param `redirect`).
    async function sanitizedRedirectFor(redirect) {
      const res = createMockRes();
      const req = { query: redirect === undefined ? {} : { redirect }, headers: {} };
      await customerGoogleStart(req, res);
      const location = res.headers['Location'];
      const authorize = new URL(location);
      const callback = new URL(authorize.searchParams.get('redirect_to'));
      return { location, redirect: callback.searchParams.get('redirect') };
    }

    it('emite um 302 para o endpoint authorize do Supabase com provider=google', async () => {
      const { location } = await sanitizedRedirectFor('/checkout');
      const res = createMockRes();
      await customerGoogleStart({ query: { redirect: '/checkout' }, headers: {} }, res);
      expect(res.statusCode).toBe(302);
      expect(location).toContain('/auth/v1/authorize');
      expect(new URL(location).searchParams.get('provider')).toBe('google');
    });

    it.each([
      ['//evil.com', 'protocol-relative'],
      ['http://evil.com/x', 'URL absoluta http'],
      ['https://evil.com', 'URL absoluta https'],
      ['javascript:alert(1)', 'esquema javascript'],
      ['ftp://host/x', 'outro esquema'],
    ])('ignora destino externo (%s) e cai no fallback /checkout', async (input) => {
      const { redirect } = await sanitizedRedirectFor(input);
      expect(redirect).toBe('/checkout');
    });

    it('usa o fallback /checkout quando nenhum redirect é informado', async () => {
      const { redirect } = await sanitizedRedirectFor(undefined);
      expect(redirect).toBe('/checkout');
    });

    it.each([
      ['/checkout/step-2', '/checkout/step-2'],
      ['/downloads?ref=1', '/downloads?ref=1'],
      ['  /perfil  ', '/perfil'],
    ])('preserva caminho relativo same-site (%s)', async (input, expected) => {
      const { redirect } = await sanitizedRedirectFor(input);
      expect(redirect).toBe(expected);
    });
  });
});
