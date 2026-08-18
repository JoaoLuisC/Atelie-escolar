import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchCrossSell,
  fetchHomeSections,
  fetchProductByIdentifier,
  fetchProducts,
} from '../products';

// ════════════════════════════════════════════════════════════════════
// `src/services/products.js` — item P4.2.
//
// A camada de serviço é a fronteira que a regra C2 protege: é aqui que o
// contrato da API vira dado de tela. Testá-la é barato (sem JSX, sem montar
// página) e é o que permite mudar o envelope do backend sem caçar JSX.
//
// A propriedade mais cara deste arquivo NÃO é "devolve a lista": é a
// diferença entre o que PODE falhar em silêncio e o que NÃO pode. Catálogo
// que falha precisa levantar; cross-sell que falha precisa sumir da tela.
// ════════════════════════════════════════════════════════════════════

function respostaOk(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function respostaErro(status, body = {}) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

/** URL da n-ésima chamada, já sem o prefixo da base. */
function caminhoDa(indice = 0) {
  return String(globalThis.fetch.mock.calls[indice][0]);
}

describe('src/services/products', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => respostaOk({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchProducts', () => {
    it('devolve a lista do envelope', async () => {
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true, products: [{ id: 1 }] }));
      await expect(fetchProducts()).resolves.toEqual([{ id: 1 }]);
    });

    it('resposta sem `products` vira lista vazia, não undefined', async () => {
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true }));
      await expect(fetchProducts()).resolves.toEqual([]);
    });

    it('falha de catálogo LEVANTA — a vitrine sem produto é erro, não estado', async () => {
      globalThis.fetch = vi.fn(async () => respostaErro(500));
      await expect(fetchProducts()).rejects.toThrow(/500/);
    });
  });

  describe('fetchHomeSections', () => {
    it('devolve as seções e cai para lista vazia', async () => {
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true, sections: [{ id: 'a' }] }));
      await expect(fetchHomeSections()).resolves.toEqual([{ id: 'a' }]);

      globalThis.fetch = vi.fn(async () => respostaOk({ success: true }));
      await expect(fetchHomeSections()).resolves.toEqual([]);
    });
  });

  describe('fetchProductByIdentifier', () => {
    it('identificador numérico vira `id`; o resto vira `slug`', async () => {
      // O backend decide a coluna pelo parâmetro. Trocar os dois faria a
      // página de produto responder 404 para todo slug — silenciosamente,
      // porque 404 aqui é "não existe", não "erro".
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true, product: { id: 7 } }));

      await fetchProductByIdentifier('7');
      expect(caminhoDa()).toContain('/product-details?id=7');

      globalThis.fetch.mockClear();
      await fetchProductByIdentifier('kit-alfabetizacao');
      expect(caminhoDa()).toContain('/product-details?slug=kit-alfabetizacao');
    });

    it('escapa o identificador na query string', async () => {
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true, product: null }));
      await fetchProductByIdentifier('a b&c=d');
      expect(caminhoDa()).toContain('slug=a%20b%26c%3Dd');
    });

    it('identificador vazio nem chama a API', async () => {
      await expect(fetchProductByIdentifier('   ')).resolves.toBeNull();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('404 é "não existe" (null), não erro', async () => {
      globalThis.fetch = vi.fn(async () => respostaErro(404));
      await expect(fetchProductByIdentifier('sumido')).resolves.toBeNull();
    });

    it('500 levanta — é falha, não ausência', async () => {
      globalThis.fetch = vi.fn(async () => respostaErro(500));
      await expect(fetchProductByIdentifier('kit')).rejects.toThrow(/500/);
    });
  });

  describe('fetchCrossSell', () => {
    it('devolve a lista de relacionados', async () => {
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true, products: [{ id: 2 }] }));
      await expect(fetchCrossSell('1')).resolves.toEqual([{ id: 2 }]);
    });

    it('NUNCA levanta por falha da API — cross-sell é enfeite', async () => {
      // A seção some; a página de produto continua de pé. O oposto seria
      // derrubar a tela que vende por causa de uma sugestão.
      globalThis.fetch = vi.fn(async () => {
        throw new Error('rede caiu');
      });
      await expect(fetchCrossSell('1')).resolves.toEqual([]);
    });

    it('mas PROPAGA o cancelamento do CHAMADOR — cancelar não é falhar', async () => {
      // A seção monta dentro de um efeito que cancela ao trocar de produto.
      // Engolir o abort faria a resposta do produto ANTIGO sobrescrever a
      // lista do atual.
      //
      // A distinção é sutil e mora em `apiRequest`: um AbortError com o signal
      // do chamador ABORTADO é repassado; sem isso, ele vira
      // "Tempo de resposta da API excedido" — que é falha de verdade e, aqui,
      // vira lista vazia. Os dois casos estão travados: este e o próximo.
      const controller = new AbortController();
      controller.abort();

      globalThis.fetch = vi.fn(async () => {
        const erro = new Error('cancelado');
        erro.name = 'AbortError';
        throw erro;
      });

      await expect(fetchCrossSell('1', { signal: controller.signal })).rejects.toMatchObject({
        name: 'AbortError',
      });
    });

    it('timeout do cliente (sem cancelamento do chamador) vira lista vazia', async () => {
      globalThis.fetch = vi.fn(async () => {
        const erro = new Error('abortado pelo timeout');
        erro.name = 'AbortError';
        throw erro;
      });

      await expect(fetchCrossSell('1')).resolves.toEqual([]);
    });

    it('resposta com formato inesperado vira lista vazia', async () => {
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true, products: 'nao-e-array' }));
      await expect(fetchCrossSell('1')).resolves.toEqual([]);
    });

    it('sem productId nem chama a API', async () => {
      await expect(fetchCrossSell('')).resolves.toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('repassa o signal do chamador', async () => {
      const controller = new AbortController();
      globalThis.fetch = vi.fn(async () => respostaOk({ success: true, products: [] }));

      await fetchCrossSell('1', { signal: controller.signal });
      expect(globalThis.fetch.mock.calls[0][1].signal).toBeDefined();
    });
  });
});
