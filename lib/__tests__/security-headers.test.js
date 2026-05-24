import { describe, expect, it } from 'vitest';
import {
  buildCspDirectives,
  createSecurityMiddleware,
  CSP_CONNECT_HOSTS,
  CSP_FRAME_HOSTS,
  CSP_SCRIPT_HOSTS,
} from '../security-headers.js';

function runMiddleware(middleware) {
  const headers = new Map();
  const res = {
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value));
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    removeHeader(name) {
      headers.delete(String(name).toLowerCase());
    },
  };
  const req = { headers: {}, method: 'GET', url: '/' };

  return new Promise((resolve, reject) => {
    middleware(req, res, (err) => (err ? reject(err) : resolve(res)));
  });
}

function parseCsp(value) {
  return value.split(';').map((s) => s.trim()).filter(Boolean).reduce((acc, directive) => {
    const [name, ...values] = directive.split(/\s+/);
    acc[name] = values;
    return acc;
  }, {});
}

describe('buildCspDirectives', () => {
  it('em produção inclui upgrade-insecure-requests e exclui localhost', () => {
    const directives = buildCspDirectives({ runtimeEnv: 'production' });
    expect(directives['upgrade-insecure-requests']).toEqual([]);
    expect(directives['connect-src']).not.toContain('ws://localhost:*');
  });

  it('em dev libera ws://localhost para HMR e omite upgrade-insecure-requests', () => {
    const directives = buildCspDirectives({ runtimeEnv: 'development' });
    expect(directives['upgrade-insecure-requests']).toBeNull();
    expect(directives['connect-src']).toContain('ws://localhost:*');
    expect(directives['connect-src']).toContain('http://localhost:*');
  });

  it('script-src restrito a hosts conhecidos (sem unsafe-inline ou unsafe-eval)', () => {
    const directives = buildCspDirectives({ runtimeEnv: 'production' });
    const src = directives['script-src'];
    expect(src).toContain("'self'");
    expect(src).not.toContain("'unsafe-inline'");
    expect(src).not.toContain("'unsafe-eval'");
    for (const host of CSP_SCRIPT_HOSTS) {
      expect(src).toContain(host);
    }
  });

  it('object-src none e frame-ancestors none (anti-clickjacking)', () => {
    const directives = buildCspDirectives({ runtimeEnv: 'production' });
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
  });

  it('frame-src e form-action liberados só para Mercado Pago', () => {
    const directives = buildCspDirectives({ runtimeEnv: 'production' });
    expect(directives['frame-src']).toEqual(["'self'", ...CSP_FRAME_HOSTS]);
    expect(directives['form-action']).toEqual(["'self'", ...CSP_FRAME_HOSTS]);
  });

  it('connect-src tem Supabase + MP + GA', () => {
    const directives = buildCspDirectives({ runtimeEnv: 'production' });
    for (const host of CSP_CONNECT_HOSTS) {
      expect(directives['connect-src']).toContain(host);
    }
  });
});

describe('createSecurityMiddleware (snapshot de headers)', () => {
  it('aplica CSP, HSTS, X-Frame-Options DENY e Referrer-Policy em produção', async () => {
    const middleware = createSecurityMiddleware({ runtimeEnv: 'production' });
    const res = await runMiddleware(middleware);

    expect(res.getHeader('content-security-policy')).toBeDefined();
    expect(res.getHeader('strict-transport-security')).toMatch(/max-age=\d+/);
    expect(res.getHeader('strict-transport-security')).toContain('includeSubDomains');
    expect(res.getHeader('x-frame-options')).toBe('DENY');
    expect(res.getHeader('x-content-type-options')).toBe('nosniff');
    expect(res.getHeader('referrer-policy')).toBe('strict-origin-when-cross-origin');

    const csp = parseCsp(res.getHeader('content-security-policy'));
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
  });

  it('não emite HSTS em desenvolvimento', async () => {
    const middleware = createSecurityMiddleware({ runtimeEnv: 'development' });
    const res = await runMiddleware(middleware);

    expect(res.getHeader('strict-transport-security')).toBeUndefined();
    expect(res.getHeader('content-security-policy')).toBeDefined();
  });
});
