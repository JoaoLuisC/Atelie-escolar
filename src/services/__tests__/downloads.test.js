import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDownloadUrl, fetchMyOrders, fetchOrderStatus } from '../downloads';

// ════════════════════════════════════════════════════════════════════
// `src/services/downloads.js` — regra C2, item P5.1.
//
// É a tela da ENTREGA: se ela falha, a cliente pagou e não recebeu. As duas
// decisões que os testes travam:
//   • 401 é ESTADO ("sua sessão expirou", com caminho de volta), não exceção;
//   • o `signal` do chamador é REPASSADO — a tela troca de pedido e desmonta, e
//     sem ele a resposta do pedido antigo sobrescreve a do atual.
// ════════════════════════════════════════════════════════════════════

function resposta(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('fetchOrderStatus', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('manda orderId e e-mail no CORPO, nunca na query string', async () => {
    await fetchOrderStatus({ orderId: 'ORD-1', email: 'cliente@exemplo.test' });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).not.toContain('cliente@exemplo.test');
    expect(JSON.parse(init.body)).toEqual({ orderId: 'ORD-1', email: 'cliente@exemplo.test' });
  });

  it('devolve resposta e corpo, sem interpretar', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta({ success: true, order: { paymentStatus: 'approved' } }),
    );

    const { response, data } = await fetchOrderStatus({ orderId: 'ORD-1', email: 'a@b.com' });
    expect(response.ok).toBe(true);
    expect(data.order.paymentStatus).toBe('approved');
  });

  it('repassa o signal do chamador', async () => {
    const controller = new AbortController();
    await fetchOrderStatus({ orderId: 'ORD-1', email: 'a@b.com', signal: controller.signal });
    expect(globalThis.fetch.mock.calls[0][1].signal).toBeDefined();
  });
});

describe('fetchMyOrders', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve os pedidos da conta', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true, orders: [{ id: 1 }] }));

    await expect(fetchMyOrders()).resolves.toEqual({
      orders: [{ id: 1 }],
      sessionExpired: false,
    });
  });

  it('401 vira `sessionExpired`, NÃO exceção', async () => {
    // "Sua sessão expirou" é um estado da tela, com texto próprio e caminho de
    // volta para o login — não uma falha a ser jogada num toast genérico.
    globalThis.fetch = vi.fn(async () => resposta({ success: false }, { ok: false, status: 401 }));

    await expect(fetchMyOrders()).resolves.toEqual({ orders: [], sessionExpired: true });
  });

  it('falha de verdade levanta, preservando o code do envelope', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Banco fora do ar.' } },
        { ok: false, status: 500 },
      ),
    );

    await expect(fetchMyOrders()).rejects.toMatchObject({
      message: 'Banco fora do ar.',
      code: 'INTERNAL_ERROR',
    });
  });

  it('envia o cookie de sessão', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true, orders: [] }));
    await fetchMyOrders();
    expect(globalThis.fetch.mock.calls[0][1].credentials).toBe('include');
  });

  it('resposta sem `orders` vira lista vazia', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));
    await expect(fetchMyOrders()).resolves.toMatchObject({ orders: [] });
  });
});

describe('buildDownloadUrl', () => {
  it('escapa o token na query string', () => {
    // O token é a credencial que entrega o produto pago; um `&` sem escape
    // truncaria o parâmetro e o download responderia "token inválido".
    expect(buildDownloadUrl('a/b&c')).toContain('token=a%2Fb%26c');
  });

  it('aponta para o endpoint de download da API', () => {
    expect(buildDownloadUrl('tok')).toMatch(/\/api\/download\?token=tok$/);
  });
});
