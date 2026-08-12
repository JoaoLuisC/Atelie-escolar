import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// Regressões da auditoria de 2026-08-12. Estes testes afirmam sobre a URL
// REAL enviada ao PostgREST, não sobre o retorno do handler — é a única forma
// de travar o operador do filtro, que era exatamente o defeito:
//
//   • `ilike` recebia o e-mail da sessão como PADRÃO LIKE. Como `_` é
//     caractere legal e corriqueiro em e-mail e curinga de 1 caractere no
//     LIKE, `ana_lima@x.com` casava `ana.lima@x.com` e o endpoint devolvia os
//     pedidos — e os download_tokens — de terceiros.
//   • /api/products projetava `download_url`, o localizador do arquivo pago,
//     num endpoint público.
// ════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://projeto-teste.supabase.co';

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader: vi.fn((key, value) => { res.headers[key] = value; }),
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((payload) => { res.body = payload; return res; }),
    end: vi.fn(() => res),
    redirect: vi.fn(() => res),
  };
  return res;
}

/** URLs capturadas do fetch global, na ordem em que o handler as emitiu. */
let requestedUrls = [];

function stubFetch(routes) {
  globalThis.fetch = vi.fn(async (url) => {
    const asString = String(url);
    requestedUrls.push(asString);
    for (const [fragment, payload] of routes) {
      if (asString.includes(fragment)) {
        return jsonResponse(payload);
      }
    }
    return jsonResponse([]);
  });
}

function urlFor(tableFragment) {
  return requestedUrls.find((url) => url.includes(tableFragment));
}

describe('regressões de autorização nas queries PostgREST', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    requestedUrls = [];
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = 'anon-key-de-teste';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-de-teste';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('customer-orders filtra por e-mail exato (eq), nunca por padrão LIKE', async () => {
    const { setCustomerSessionCookie } = await import('../../lib/customer-session.js');

    // E-mail com underscore: o caractere que transformava o filtro em curinga.
    const email = 'ana_lima@gmail.com';
    const cookieRes = createMockRes();
    setCustomerSessionCookie(cookieRes, { uid: 'uid-1', email, name: 'Ana', role: 'customer' });
    const cookie = String(cookieRes.headers['Set-Cookie']).split(';')[0];

    stubFetch([['orders?', [{
      id: '11111111-1111-1111-1111-111111111111',
      order_code: 'ORD-1',
      total_amount: 10,
      status: 'completed',
      payment_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      customer_email: email,
    }]]]);

    const handler = (await import('../customer-orders.js')).default;
    const req = { method: 'GET', headers: { cookie }, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);

    const ordersUrl = urlFor('orders?');
    expect(ordersUrl).toBeDefined();
    // O operador é o controle de segurança: eq compara valor, ilike compara padrão.
    expect(ordersUrl).toContain('customer_email=eq.');
    expect(ordersUrl).not.toContain('ilike');
    // O e-mail vai como valor literal (percent-encoded), sem virar padrão.
    expect(decodeURIComponent(ordersUrl)).toContain(`customer_email=eq.${email}`);

    // Itens e tokens são buscados por id de pedido, restritos ao que o filtro
    // acima retornou — nunca por e-mail.
    for (const fragment of ['order_items?', 'download_tokens?']) {
      const url = urlFor(fragment);
      expect(url, `${fragment} deveria ter sido consultado`).toBeDefined();
      expect(decodeURIComponent(url)).toContain('order_id=in.(11111111-1111-1111-1111-111111111111)');
      expect(url).not.toContain('customer_email');
    }
  });

  it('customer-orders exige sessão de cliente', async () => {
    stubFetch([]);
    const handler = (await import('../customer-orders.js')).default;
    const req = { method: 'GET', headers: {}, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('products (endpoint público) não projeta download_url', async () => {
    stubFetch([]);
    const handler = (await import('../products.js')).default;
    const req = { method: 'GET', headers: {}, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);

    const productsUrl = urlFor('products?');
    expect(productsUrl).toBeDefined();
    expect(decodeURIComponent(productsUrl)).not.toContain('download_url');
    expect(JSON.stringify(res.body)).not.toContain('download_url');
  });
});
