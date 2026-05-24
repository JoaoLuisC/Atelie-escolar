import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader: vi.fn((k, v) => { res.headers[k] = v; }),
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((payload) => { res.body = payload; return res; }),
    end: vi.fn(() => res),
  };
  return res;
}

function buildSignedHeaders(paymentId, requestId, secret) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return {
    'x-signature': `ts=${ts},v1=${hash}`,
    'x-request-id': requestId,
  };
}

describe('webhook signature regression', () => {
  let originalEnv;

  beforeEach(() => {
    vi.resetModules();
    originalEnv = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    process.env.WEBHOOK_SECRET = 'test-webhook-secret-fixed';
    // Configura Supabase para passar do getSupabaseConfig().
    process.env.SUPABASE_URL = 'http://localhost:0/supabase-stub';
    process.env.SUPABASE_ANON_KEY = 'anon-stub';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-stub';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('retorna 401 para assinatura invalida quando APP_ENV=production', async () => {
    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'production';
    const handler = (await import('../webhook.js')).default;

    const req = {
      method: 'POST',
      headers: { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'req-1' },
      body: { type: 'payment', data: { id: '12345' } },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid signature' });
  });

  it('retorna 401 para assinatura invalida quando APP_ENV=development (nao mais apenas production)', async () => {
    process.env.APP_ENV = 'development';
    process.env.NODE_ENV = 'development';
    const handler = (await import('../webhook.js')).default;

    const req = {
      method: 'POST',
      headers: { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'req-2' },
      body: { type: 'payment', data: { id: '67890' } },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid signature' });
  });

  it('aceita request sem assinatura valida quando APP_ENV=test (somente nesse ambiente)', async () => {
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    const handler = (await import('../webhook.js')).default;

    const req = {
      method: 'POST',
      headers: {},
      body: { type: 'unknown-event', data: { id: 'noop' } },
    };
    const res = createMockRes();

    await handler(req, res);

    // No type=payment, retorna 200 "event type not handled".
    expect(res.statusCode).toBe(200);
  });

  it('rejeita GET (Method Not Allowed)', async () => {
    const handler = (await import('../webhook.js')).default;
    const req = { method: 'GET', headers: {}, body: {} };
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('reconhece assinatura HMAC valida (manifest correto)', async () => {
    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'production';
    const handler = (await import('../webhook.js')).default;

    const paymentId = '99999';
    const headers = buildSignedHeaders(paymentId, 'req-valid', 'test-webhook-secret-fixed');

    const req = {
      method: 'POST',
      headers,
      body: { type: 'unknown-event', data: { id: paymentId } },
    };
    const res = createMockRes();

    await handler(req, res);

    // type !== payment retorna 200 mesmo com assinatura valida — confirma que a assinatura passou.
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ message: 'Event type not handled' });
  });
});
