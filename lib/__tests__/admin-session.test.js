import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  hasValidAdminSession,
  getAdminIdentity,
  parseCookies,
  safeCompare,
} from '../admin-session.js';

// createSessionToken/verifySessionToken não são exportados: o round-trip é
// exercido através de setSessionCookie -> (cookie) -> hasValidAdminSession /
// getAdminIdentity, que é exatamente o caminho usado em produção.

function createMockRes() {
  const res = {
    headers: {},
    setHeader: vi.fn((k, v) => { res.headers[k] = v; }),
  };
  return res;
}

function parseSetCookie(header) {
  const first = String(header).split(';')[0];
  const eq = first.indexOf('=');
  return { name: first.slice(0, eq), value: first.slice(eq + 1) };
}

function reqWithCookie(name, value) {
  return { headers: { cookie: `${name}=${value}` } };
}

// Emite um cookie de sessão e devolve tanto o header cru quanto uma req já
// montada com o token, pronta para verificação.
function issueSession(identity) {
  const res = createMockRes();
  setSessionCookie(res, identity);
  const header = res.headers['Set-Cookie'];
  const { name, value } = parseSetCookie(header);
  return { header, name, value, req: reqWithCookie(name, value) };
}

describe('admin-session', () => {
  let original;

  beforeEach(() => {
    original = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    };
    // Segredo fixo -> assinatura determinística, independente do fallback.
    process.env.ADMIN_SESSION_SECRET = 'fixed-admin-secret-for-tests';
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('round-trip de token', () => {
    it('assina e verifica uma sessão válida, expondo a identidade (lowercased)', () => {
      const { req } = issueSession({ email: 'Admin@Shop.com', role: 'Owner' });
      expect(hasValidAdminSession(req)).toBe(true);
      expect(getAdminIdentity(req)).toBe('admin@shop.com');
    });

    it('retrocompatível: token sem e-mail cai na identidade genérica "admin"', () => {
      const { req } = issueSession({});
      expect(hasValidAdminSession(req)).toBe(true);
      expect(getAdminIdentity(req)).toBe('admin');
    });

    it('usa o nome de cookie canônico admin_session', () => {
      const { name } = issueSession({ email: 'a@b.com' });
      expect(name).toBe(SESSION_COOKIE_NAME);
      expect(SESSION_COOKIE_NAME).toBe('admin_session');
    });
  });

  describe('rejeição de tokens inválidos', () => {
    it('rejeita assinatura adulterada', () => {
      const { name, value } = issueSession({ email: 'a@b.com' });
      const flipped = value.slice(0, -1) + (value.endsWith('A') ? 'B' : 'A');
      const req = reqWithCookie(name, flipped);
      expect(hasValidAdminSession(req)).toBe(false);
      expect(getAdminIdentity(req)).toBeNull();
    });

    it('rejeita payload adulterado (assinatura não confere mais)', () => {
      const { name, value } = issueSession({ email: 'a@b.com' });
      const [payload, sig] = value.split('.');
      const tamperedPayload = 'X' + payload.slice(1);
      const req = reqWithCookie(name, `${tamperedPayload}.${sig}`);
      expect(hasValidAdminSession(req)).toBe(false);
    });

    it('rejeita token sem separador de assinatura', () => {
      const req = reqWithCookie(SESSION_COOKIE_NAME, 'naoehumtoken');
      expect(hasValidAdminSession(req)).toBe(false);
    });

    it('rejeita quando não há cookie de sessão', () => {
      expect(hasValidAdminSession({ headers: {} })).toBe(false);
      expect(getAdminIdentity({ headers: {} })).toBeNull();
    });

    it('rejeita token assinado com outro segredo (binding do segredo)', () => {
      const { name, value } = issueSession({ email: 'a@b.com' });
      process.env.ADMIN_SESSION_SECRET = 'um-segredo-completamente-diferente';
      const req = reqWithCookie(name, value);
      expect(hasValidAdminSession(req)).toBe(false);
    });

    it('rejeita token expirado (exp no passado)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const { name, value } = issueSession({ email: 'a@b.com' });

      // TTL da sessão admin é 8h; avança 24h para garantir expiração.
      vi.setSystemTime(new Date('2020-01-02T00:00:00Z'));
      const req = reqWithCookie(name, value);
      expect(hasValidAdminSession(req)).toBe(false);
      expect(getAdminIdentity(req)).toBeNull();
    });
  });

  describe('flags do cookie (Set-Cookie)', () => {
    it('em produção inclui HttpOnly, SameSite=Strict, Path=/, Secure e Max-Age', () => {
      process.env.APP_ENV = 'production';
      process.env.NODE_ENV = 'production';
      const res = createMockRes();
      setSessionCookie(res, { email: 'a@b.com' });
      const header = res.headers['Set-Cookie'];

      expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(header).toContain('Path=/');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      expect(header).toContain('Secure');
      expect(header).toMatch(/Max-Age=\d+/);
    });

    it('em desenvolvimento omite Secure mas mantém as demais flags', () => {
      process.env.APP_ENV = 'development';
      process.env.NODE_ENV = 'development';
      const res = createMockRes();
      setSessionCookie(res, { email: 'a@b.com' });
      const header = res.headers['Set-Cookie'];

      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      expect(header).toContain('Path=/');
      expect(header).not.toContain('Secure');
    });

    it('clearSessionCookie zera o valor e o Max-Age', () => {
      const res = createMockRes();
      clearSessionCookie(res);
      const header = res.headers['Set-Cookie'];
      const { value } = parseSetCookie(header);
      expect(value).toBe('');
      expect(header).toContain('Max-Age=0');
      expect(header).toContain('HttpOnly');
    });
  });

  describe('safeCompare (timing-safe)', () => {
    it('retorna true para strings idênticas', () => {
      expect(safeCompare('segredo-igual', 'segredo-igual')).toBe(true);
    });

    it('retorna false para conteúdo diferente de mesmo tamanho', () => {
      expect(safeCompare('abcdef', 'abcdeg')).toBe(false);
    });

    it('é sensível a maiúsculas/minúsculas', () => {
      expect(safeCompare('Token', 'token')).toBe(false);
    });

    it('retorna false para tamanhos diferentes (sem lançar)', () => {
      expect(safeCompare('curto', 'bem-mais-longo')).toBe(false);
    });

    it('trata nullish como string vazia sem lançar', () => {
      expect(safeCompare(null, undefined)).toBe(true);
      expect(safeCompare('x', null)).toBe(false);
    });
  });

  describe('parseCookies', () => {
    it('decompõe múltiplos cookies e decodifica os valores', () => {
      const req = { headers: { cookie: 'a=1; b=two%20words; admin_session=tok.sig' } };
      const cookies = parseCookies(req);
      expect(cookies.a).toBe('1');
      expect(cookies.b).toBe('two words');
      expect(cookies.admin_session).toBe('tok.sig');
    });

    it('retorna objeto vazio sem header de cookie', () => {
      expect(parseCookies({ headers: {} })).toEqual({});
      expect(parseCookies({})).toEqual({});
    });
  });
});
