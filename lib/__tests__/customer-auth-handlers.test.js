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
        body: { name: 'Fulano de Tal', email: 'existente@test.com', password: 'Password1!' },
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

      const req = { body: { name: 'Fulano', email: 'existente@test.com', password: 'Password1!' } };
      const res = createMockRes();
      await customerRegister(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe(NEUTRAL);
    });

    it('falha no ENVIO do e-mail (5xx do Supabase) não culpa os dados (LOJA-37)', async () => {
      // O que a validação viu: SMTP com credencial inválida no Supabase Auth.
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 500,
          json: { code: 'unexpected_failure', message: 'Error sending confirmation email' },
        }),
      );

      const req = { body: { name: 'Fulano', email: 'novo@test.com', password: 'Password1!' } };
      const res = createMockRes();
      await customerRegister(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.error.message).toMatch(/e-mail de confirmação/);
      expect(res.body.error.message).not.toMatch(/Verifique os dados/);
    });

    it('limite de envio do Supabase vira 429, não 400', async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 429,
          json: { error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' },
        }),
      );

      const req = { body: { name: 'Fulano', email: 'novo@test.com', password: 'Password1!' } };
      const res = createMockRes();
      await customerRegister(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('valida entrada antes de chamar o Supabase (senha curta)', async () => {
      const req = { body: { name: 'Fulano', email: 'a@b.com', password: 'curta' } };
      const res = createMockRes();
      await customerRegister(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toMatch(/8 caracteres/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('recusa senha sem caractere especial antes de cadastrar', async () => {
      const res = createMockRes();
      await customerRegister(
        { body: { name: 'Fulano', email: 'a@b.com', password: 'Password1' } },
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toMatch(/caractere especial/);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('customerRegister — conta criada no checkout', () => {
    const SIGNUP_SEM_SESSAO = { user: { id: 'u1', email: 'a@b.com' } };
    const SENHA = 'Senha#Forte1';

    beforeEach(() => {
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-stub-key';
    });
    afterEach(() => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });

    it('confirma o e-mail pela Admin API do GoTrue e já abre a sessão', async () => {
      global.fetch
        .mockResolvedValueOnce(
          makeFetchResponse({ ok: true, status: 200, json: SIGNUP_SEM_SESSAO }),
        )
        .mockResolvedValueOnce(makeFetchResponse({ ok: true, status: 200, json: { id: 'u1' } }))
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: true,
            status: 200,
            json: { access_token: 't', user: { id: 'u1', email: 'a@b.com' } },
          }),
        );
      const res = createMockRes();
      await customerRegister(
        { body: { name: 'Ana', email: 'a@b.com', password: SENHA, source: 'checkout' } },
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toMatchObject({ uid: 'u1', email: 'a@b.com' });
      const [confirmUrl, confirmInit] = global.fetch.mock.calls[1];
      expect(String(confirmUrl)).toContain('/auth/v1/admin/users/u1');
      expect(confirmInit.method).toBe('PUT');
      expect(confirmInit.headers.Authorization).toBe('Bearer service-stub-key');
      expect(JSON.parse(confirmInit.body)).toEqual({ email_confirm: true });
      expect(String(global.fetch.mock.calls[2][0])).toContain('grant_type=password');
      expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(String));
    });

    it('fora do checkout, continua pedindo a confirmação por e-mail', async () => {
      global.fetch.mockResolvedValueOnce(
        makeFetchResponse({ ok: true, status: 200, json: SIGNUP_SEM_SESSAO }),
      );
      const res = createMockRes();
      await customerRegister({ body: { name: 'Ana', email: 'a@b.com', password: SENHA } }, res);

      expect(res.body).toMatchObject({ success: true, verificationRequired: true });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('se a Admin API recusar, cai no caminho normal (confirmar por e-mail)', async () => {
      global.fetch
        .mockResolvedValueOnce(
          makeFetchResponse({ ok: true, status: 200, json: SIGNUP_SEM_SESSAO }),
        )
        .mockResolvedValueOnce(makeFetchResponse({ ok: false, status: 403, json: { msg: 'x' } }));
      const res = createMockRes();
      await customerRegister(
        { body: { name: 'Ana', email: 'a@b.com', password: SENHA, source: 'checkout' } },
        res,
      );
      expect(res.body).toMatchObject({ verificationRequired: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);
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
      await customerLogin({ body: { email: 'user@test.com', password: 'Password1!' } }, res);
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
    ])('ignora destino externo (%s) e cai no fallback /downloads', async (input) => {
      const { redirect } = await sanitizedRedirectFor(input);
      expect(redirect).toBe('/downloads');
    });

    it('usa o fallback /downloads (Meus produtos) quando nenhum redirect é informado', async () => {
      const { redirect } = await sanitizedRedirectFor(undefined);
      expect(redirect).toBe('/downloads');
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
