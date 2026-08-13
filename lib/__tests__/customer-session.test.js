import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setCustomerSessionCookie,
  clearCustomerSessionCookie,
  getCustomerSessionFromRequest,
} from '../customer-session.js';

// createCustomerSessionToken/verifyCustomerSessionToken não são exportados;
// o round-trip é validado via setCustomerSessionCookie -> (cookie) ->
// getCustomerSessionFromRequest, o caminho real usado pelas rotas.

const COOKIE_NAME = 'customer_session';

function createMockRes() {
  const res = {
    headers: {},
    setHeader: vi.fn((k, v) => {
      res.headers[k] = v;
    }),
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

function issueSession(user) {
  const res = createMockRes();
  setCustomerSessionCookie(res, user);
  const header = res.headers['Set-Cookie'];
  const { name, value } = parseSetCookie(header);
  return { header, name, value, req: reqWithCookie(name, value) };
}

describe('customer-session', () => {
  let original;

  beforeEach(() => {
    original = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      CUSTOMER_SESSION_SECRET: process.env.CUSTOMER_SESSION_SECRET,
    };
    process.env.CUSTOMER_SESSION_SECRET = 'fixed-customer-secret-for-tests';
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

  describe('round-trip de sessão', () => {
    it('recupera o usuário da sessão preservando campos (role em lowercase)', () => {
      const { req } = issueSession({
        uid: 'user-123',
        email: 'Foo@Bar.com',
        name: 'Foo Bar',
        role: 'Customer',
      });

      const user = getCustomerSessionFromRequest(req);
      expect(user).toEqual({
        uid: 'user-123',
        email: 'Foo@Bar.com',
        name: 'Foo Bar',
        role: 'customer',
      });
    });

    it('usa o cookie customer_session', () => {
      const { name } = issueSession({ uid: 'u', email: 'a@b.com' });
      expect(name).toBe(COOKIE_NAME);
    });
  });

  describe('rejeição de tokens inválidos', () => {
    it('retorna null quando não há cookie', () => {
      expect(getCustomerSessionFromRequest({ headers: {} })).toBeNull();
    });

    it('retorna null para valor sem separador de assinatura', () => {
      const req = reqWithCookie(COOKIE_NAME, 'lixo-sem-ponto');
      expect(getCustomerSessionFromRequest(req)).toBeNull();
    });

    it('retorna null para assinatura adulterada', () => {
      const { name, value } = issueSession({ uid: 'u', email: 'a@b.com' });
      const flipped = value.slice(0, -1) + (value.endsWith('A') ? 'B' : 'A');
      expect(getCustomerSessionFromRequest(reqWithCookie(name, flipped))).toBeNull();
    });

    it('retorna null para payload adulterado', () => {
      const { name, value } = issueSession({ uid: 'u', email: 'a@b.com' });
      const [payload, sig] = value.split('.');
      const tampered = 'Z' + payload.slice(1);
      expect(getCustomerSessionFromRequest(reqWithCookie(name, `${tampered}.${sig}`))).toBeNull();
    });

    it('retorna null quando o segredo muda após a emissão (binding do segredo)', () => {
      const { name, value } = issueSession({ uid: 'u', email: 'a@b.com' });
      process.env.CUSTOMER_SESSION_SECRET = 'outro-segredo';
      expect(getCustomerSessionFromRequest(reqWithCookie(name, value))).toBeNull();
    });

    it('retorna null para token expirado (exp no passado)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const { name, value } = issueSession({ uid: 'u', email: 'a@b.com' });

      // TTL de 8h; avança 24h.
      vi.setSystemTime(new Date('2020-01-02T00:00:00Z'));
      expect(getCustomerSessionFromRequest(reqWithCookie(name, value))).toBeNull();
    });
  });

  describe('flags do cookie (Set-Cookie)', () => {
    it('em produção inclui HttpOnly, SameSite=Strict, Path=/, Secure e Max-Age', () => {
      process.env.APP_ENV = 'production';
      process.env.NODE_ENV = 'production';
      const res = createMockRes();
      setCustomerSessionCookie(res, { uid: 'u', email: 'a@b.com' });
      const header = res.headers['Set-Cookie'];

      expect(header).toContain(`${COOKIE_NAME}=`);
      expect(header).toContain('Path=/');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      expect(header).toContain('Secure');
      expect(header).toMatch(/Max-Age=\d+/);
    });

    it('em desenvolvimento omite Secure', () => {
      process.env.APP_ENV = 'development';
      process.env.NODE_ENV = 'development';
      const res = createMockRes();
      setCustomerSessionCookie(res, { uid: 'u', email: 'a@b.com' });
      const header = res.headers['Set-Cookie'];

      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      expect(header).not.toContain('Secure');
    });

    it('clearCustomerSessionCookie zera valor e Max-Age', () => {
      const res = createMockRes();
      clearCustomerSessionCookie(res);
      const header = res.headers['Set-Cookie'];
      const { value } = parseSetCookie(header);
      expect(value).toBe('');
      expect(header).toContain('Max-Age=0');
      expect(header).toContain('HttpOnly');
    });
  });
});
