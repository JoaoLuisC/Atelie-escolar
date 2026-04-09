import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    redirectedTo: undefined,
    setHeader: vi.fn((key, value) => {
      res.headers[key] = value;
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
    redirect: vi.fn((url) => {
      res.redirectedTo = url;
      return res;
    }),
  };

  return res;
}

describe('API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create-payment valida payload obrigatorio', async () => {
    const handler = (await import('../create-payment.js')).default;
    const req = {
      method: 'POST',
      body: {
        items: [],
        customer: { email: 'cliente@teste.com' },
      },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Items são obrigatórios');
  });

  it('verify-payment exige orderId', async () => {
    const handler = (await import('../verify-payment.js')).default;
    const req = { method: 'GET', query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('orderId é obrigatório');
  });

  it('download valida token obrigatorio', async () => {
    const handler = (await import('../download.js')).default;
    const req = { method: 'GET', query: {}, headers: {}, connection: { remoteAddress: '127.0.0.1' } };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Token é obrigatório');
  });

  it('admin-products responde preflight OPTIONS', async () => {
    const handler = (await import('../admin-products.js')).default;
    const req = { method: 'OPTIONS', headers: {}, query: {}, body: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
