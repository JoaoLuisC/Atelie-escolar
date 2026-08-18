import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, apiRequest, errorMessageOf, getApiBaseUrl, parseJson } from '../api';

// ════════════════════════════════════════════════════════════════════
// `src/utils/api.js` — item P4.2, e o guardião do que o P1 fechou.
//
// Este é o cliente HTTP ÚNICO (regra C1) e a porta por onde o envelope da
// regra A1 entra na aplicação. Depois que o shim de achatamento saiu, as telas
// leem `data.error?.message` e ramificam por `data.error?.code` — e é aqui que
// isso pode voltar a quebrar sem ninguém ver.
//
// As duas propriedades caras:
//   • TIMEOUT: `fetch` cru não tem. Sem ele, uma rede ruim deixa a tela
//     carregando para sempre. É a razão declarada da regra C1.
//   • COMPOSIÇÃO DE SIGNAL: `apiRequest` sempre criou o próprio
//     AbortController e SOBRESCREVIA o `signal` do chamador, o que empurrava
//     as telas com polling para `fetch` cru — abrindo mão do timeout
//     justamente onde ele mais importa.
// ════════════════════════════════════════════════════════════════════

function resposta(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('getApiBaseUrl', () => {
  it('em localhost aponta para o Express de desenvolvimento', () => {
    expect(getApiBaseUrl()).toBe('http://localhost:3000/api');
  });
});

describe('parseJson', () => {
  it('devolve o corpo COMO O BACKEND O EMITIU — sem achatar o erro', async () => {
    // O shim que achatava `error` para string saiu: era o marco declarado do
    // fim da migração A1. Se ele voltar, este teste cai.
    const body = {
      success: false,
      error: { code: 'COUPON_EXPIRED', message: 'Este cupom expirou.' },
    };

    await expect(parseJson(resposta(body))).resolves.toEqual(body);
  });

  it('corpo que não é objeto vira {}', async () => {
    await expect(parseJson(resposta('texto'))).resolves.toEqual({});
    await expect(parseJson(resposta(null))).resolves.toEqual({});
  });

  it('JSON inválido não derruba a tela', async () => {
    const quebrado = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token');
      },
    };
    await expect(parseJson(quebrado)).resolves.toEqual({});
  });
});

describe('errorMessageOf', () => {
  it('extrai a mensagem do envelope', () => {
    expect(errorMessageOf({ error: { code: 'X', message: 'Deu ruim.' } })).toBe('Deu ruim.');
  });

  it('sem erro, devolve string vazia — nunca "undefined"', () => {
    expect(errorMessageOf({ success: true })).toBe('');
    expect(errorMessageOf(null)).toBe('');
    expect(errorMessageOf(undefined)).toBe('');
  });
});

describe('apiError', () => {
  it('PRESERVA o code do envelope — é o elo que quebrou o re-login (P0.1)', () => {
    const erro = apiError(
      { error: { code: 'ADMIN_SESSION_INVALID', message: 'Sessão inválida.' } },
      'fallback',
    );

    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toBe('Sessão inválida.');
    expect(erro.code).toBe('ADMIN_SESSION_INVALID');
  });

  it('sem mensagem, usa o fallback', () => {
    expect(apiError({}, 'Falha genérica.').message).toBe('Falha genérica.');
  });

  it('sem code, usa o defaultCode — e sem ele, null', () => {
    expect(apiError({}, 'x', { defaultCode: 'UNAUTHORIZED' }).code).toBe('UNAUTHORIZED');
    expect(apiError({}, 'x').code).toBeNull();
  });

  it('o code da resposta VENCE o default', () => {
    const erro = apiError({ error: { code: 'FORBIDDEN', message: 'm' } }, 'x', {
      defaultCode: 'UNAUTHORIZED',
    });
    expect(erro.code).toBe('FORBIDDEN');
  });
});

describe('apiRequest', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monta a URL a partir da base, com ou sem barra inicial', async () => {
    await apiRequest('products');
    expect(String(globalThis.fetch.mock.calls[0][0])).toBe('http://localhost:3000/api/products');

    globalThis.fetch.mockClear();
    await apiRequest('/products');
    expect(String(globalThis.fetch.mock.calls[0][0])).toBe('http://localhost:3000/api/products');
  });

  it('devolve resposta e corpo já normalizado', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true, products: [1] }));
    const { response, data } = await apiRequest('/products');

    expect(response.ok).toBe(true);
    expect(data.products).toEqual([1]);
  });

  it('SEMPRE passa um signal — é o timeout da regra C1', async () => {
    await apiRequest('/products');
    expect(globalThis.fetch.mock.calls[0][1].signal).toBeDefined();
  });

  it('`timeoutMs` não vaza para o fetch como opção desconhecida', async () => {
    await apiRequest('/products', { timeoutMs: 50 });
    expect(globalThis.fetch.mock.calls[0][1]).not.toHaveProperty('timeoutMs');
  });

  it('estouro de tempo vira mensagem de humano, não AbortError cru', async () => {
    globalThis.fetch = vi.fn(async () => {
      const erro = new Error('abort');
      erro.name = 'AbortError';
      throw erro;
    });

    await expect(apiRequest('/products')).rejects.toThrow(/Tempo de resposta da API excedido/);
  });

  it('cancelamento do CHAMADOR repassa o AbortError original', async () => {
    // A distinção importa: quem cancelou sabe por quê (desmontou a tela,
    // trocou de pedido) e não deve ver "tempo excedido" na tela.
    const controller = new AbortController();
    controller.abort();

    globalThis.fetch = vi.fn(async () => {
      const erro = new Error('abort');
      erro.name = 'AbortError';
      throw erro;
    });

    await expect(apiRequest('/products', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('o signal do chamador NÃO é descartado — ele compõe com o timeout', async () => {
    // A regressão que isto trava: `apiRequest` sobrescrevia o `signal` de
    // `options`, e por isso `DownloadsPage` (que faz polling e precisa abortar
    // ao desmontar) caía em `fetch` cru, sem timeout nenhum.
    const controller = new AbortController();
    let capturado;
    globalThis.fetch = vi.fn(async (_url, init) => {
      capturado = init.signal;
      return resposta({ success: true });
    });

    await apiRequest('/products', { signal: controller.signal });
    expect(capturado.aborted).toBe(false);

    controller.abort();
    expect(capturado.aborted).toBe(true);
  });

  it('repassa método, headers e corpo', async () => {
    await apiRequest('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":"a@b.com"}',
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"email":"a@b.com"}');
  });
});
