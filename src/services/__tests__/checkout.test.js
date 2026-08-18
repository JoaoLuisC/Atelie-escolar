import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureAbandonedCart, createPayment, verifyPayment } from '../checkout';

// ════════════════════════════════════════════════════════════════════
// `src/services/checkout.js` — regra C2, item P5.1.
//
// É o caminho do dinheiro. As três funções têm contratos de FALHA diferentes,
// e é essa diferença que os testes travam:
//   • `createPayment` LEVANTA — sem pagamento não há checkout;
//   • `verifyPayment` devolve a resposta crua, porque 429 não é falha;
//   • `captureAbandonedCart` nunca levanta — captura de marketing não pode
//     quebrar a compra.
// ════════════════════════════════════════════════════════════════════

function resposta(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('createPayment', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve o pedido e a URL de pagamento', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta({ success: true, orderId: 'ORD-1', initPoint: 'https://mp.test/pagar' }),
    );

    await expect(createPayment({ items: [] })).resolves.toEqual({
      orderId: 'ORD-1',
      paymentUrl: 'https://mp.test/pagar',
    });
  });

  it('cai para `sandboxInitPoint` quando não há `initPoint`', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta({ success: true, orderId: 'ORD-1', sandboxInitPoint: 'https://mp.test/sandbox' }),
    );

    const { paymentUrl } = await createPayment({});
    expect(paymentUrl).toBe('https://mp.test/sandbox');
  });

  it('SEM URL de pagamento, levanta — não devolve `undefined`', async () => {
    // O modo de falha que isto evita: `undefined` viajava até o `window.open`,
    // o navegador abria uma aba em branco e a cliente concluía que o pagamento
    // falhou. Sem erro em lugar nenhum.
    globalThis.fetch = vi.fn(async () => resposta({ success: true, orderId: 'ORD-1' }));

    await expect(createPayment({})).rejects.toThrow(/URL de pagamento/);
  });

  it('erro da API preserva mensagem E código do envelope', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta(
        { success: false, error: { code: 'VALIDATION_FAILED', message: 'Carrinho vazio.' } },
        { ok: false, status: 400 },
      ),
    );

    await expect(createPayment({})).rejects.toMatchObject({
      message: 'Carrinho vazio.',
      code: 'VALIDATION_FAILED',
    });
  });

  it('`success: false` com HTTP 200 também levanta', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: false, error: { message: 'não' } }));
    await expect(createPayment({})).rejects.toThrow();
  });
});

describe('verifyPayment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve resposta E corpo — o 429 precisa do status', async () => {
    // 429 não é falha nem resposta final: é o servidor pedindo ritmo. A tela
    // aplica backoff sem limpar o pedido pendente, e para isso precisa do
    // status — não de uma exceção.
    globalThis.fetch = vi.fn(async () =>
      resposta({ success: false, retryAfterSeconds: 30 }, { ok: false, status: 429 }),
    );

    const { response, data } = await verifyPayment({ orderId: 'ORD-1', email: 'a@b.com' });

    expect(response.status).toBe(429);
    expect(data.retryAfterSeconds).toBe(30);
  });

  it('manda orderId e e-mail no CORPO, nunca na query string', async () => {
    // Na query string o e-mail vaza para access logs da Vercel, histórico do
    // navegador e header Referer (achado M6).
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));

    await verifyPayment({ orderId: 'ORD-1', email: 'cliente@exemplo.test' });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).not.toContain('cliente@exemplo.test');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ orderId: 'ORD-1', email: 'cliente@exemplo.test' });
  });
});

describe('captureAbandonedCart', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('envia com `keepalive` — a captura sobrevive ao fechamento da aba', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));

    await expect(captureAbandonedCart({ email: 'a@b.com' })).resolves.toBe(true);
    expect(globalThis.fetch.mock.calls[0][1].keepalive).toBe(true);
  });

  it('NUNCA levanta — captura de marketing não pode quebrar o checkout', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('rede caiu');
    });

    await expect(captureAbandonedCart({ email: 'a@b.com' })).resolves.toBe(false);
  });
});
