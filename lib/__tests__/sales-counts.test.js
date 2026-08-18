import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/sales-counts.js` — item P4.1.
//
// Alimenta o "mais vendidos" da vitrine, que é público e anônimo. O módulo
// existe porque `/api/products` e `/api/home-sections` puxavam a base inteira
// de pedidos a cada hit não-cacheado, transformando a vitrine num
// amplificador para quem furasse o cache de borda.
//
// As três propriedades que este arquivo trava, e nenhuma é sobre o número:
//   • o RPC vem PRIMEIRO (a soma acontece no Postgres);
//   • o fallback existe e tem TETO nas duas consultas;
//   • nada disso pode LANÇAR — a ordenação por vendas é sinal acessório, e
//     devolver 500 numa página pública porque a contagem falhou seria trocar
//     um enfeite por uma loja fora do ar.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { WINDOW_MONTHS, loadSoldCountByProduct, windowStartIso } = requireCjs('../sales-counts.js');

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** URL + query de cada consulta feita a uma tabela. */
function consulta(tabela) {
  const chamada = globalThis.fetch.mock.calls.find(([url]) =>
    String(url).includes(`/rest/v1/${tabela}?`),
  );
  return chamada ? new URL(String(chamada[0])).searchParams : null;
}

describe('sales-counts', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ambienteOriginal;
    vi.restoreAllMocks();
  });

  describe('windowStartIso', () => {
    it('recua o número de meses pedido', () => {
      const inicio = new Date(windowStartIso(12));
      const meses =
        (new Date().getUTCFullYear() - inicio.getUTCFullYear()) * 12 +
        (new Date().getUTCMonth() - inicio.getUTCMonth());
      expect(meses).toBe(12);
    });

    it('a janela padrão é de um ano escolar inteiro', () => {
      expect(WINDOW_MONTHS).toBe(12);
    });
  });

  describe('camada 1 — agregação no Postgres', () => {
    it('soma pelo RPC e nem toca nas tabelas', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (String(url).includes('rpc/product_sales_counts')) {
          return json([
            { product_id: 'p1', sold_count: 7 },
            { product_id: 'p2', sold_count: 3 },
          ]);
        }
        return json([]);
      });

      const contagem = await loadSoldCountByProduct();

      expect(contagem.get('p1')).toBe(7);
      expect(contagem.get('p2')).toBe(3);
      // O ponto do módulo: o tráfego passa a ser proporcional ao catálogo, não
      // ao histórico de vendas.
      expect(consulta('order_items')).toBeNull();
      expect(consulta('orders')).toBeNull();
    });

    it('passa a janela e o teto de produtos ao RPC', async () => {
      globalThis.fetch = vi.fn(async () => json([]));
      await loadSoldCountByProduct();

      const corpo = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(corpo.p_limit).toBe(500);
      expect(new Date(corpo.p_since).getTime()).toBeLessThan(Date.now());
    });

    it('linha malformada não contamina a contagem', async () => {
      globalThis.fetch = vi.fn(async (url) =>
        String(url).includes('rpc/')
          ? json([null, 'texto', { product_id: '', sold_count: 5 }, { product_id: 'p1' }])
          : json([]),
      );

      const contagem = await loadSoldCountByProduct();
      expect(contagem.get('')).toBeUndefined();
      expect(contagem.get('p1')).toBe(0);
    });
  });

  describe('camada 2 — fallback com teto', () => {
    function stubComFallback({ orders, orderItems }) {
      globalThis.fetch = vi.fn(async (url) => {
        const alvo = String(url);
        // Migration não aplicada: o PostgREST responde 404 para a função.
        if (alvo.includes('rpc/product_sales_counts')) return json({ message: 'not found' }, 404);
        if (alvo.includes('/rest/v1/orders?')) return json(orders);
        if (alvo.includes('/rest/v1/order_items?')) return json(orderItems);
        return json([]);
      });
    }

    it('cruza itens com pedidos APROVADOS quando o RPC falha', async () => {
      stubComFallback({
        orders: [{ id: 1 }, { id: 2 }],
        orderItems: [
          { order_id: 1, product_id: 'p1', quantity: 2 },
          { order_id: 2, product_id: 'p1', quantity: 3 },
          // Pedido fora da lista de aprovados: NÃO conta.
          { order_id: 99, product_id: 'p1', quantity: 100 },
        ],
      });

      const contagem = await loadSoldCountByProduct();
      expect(contagem.get('p1')).toBe(5);
    });

    it('as DUAS consultas do fallback levam limit e janela', async () => {
      // Era exatamente a varredura sem teto que motivou o módulo.
      stubComFallback({ orders: [], orderItems: [] });
      await loadSoldCountByProduct();

      const pedidos = consulta('orders');
      const itens = consulta('order_items');

      expect(Number(pedidos.get('limit'))).toBeGreaterThan(0);
      expect(Number(itens.get('limit'))).toBeGreaterThan(0);
      expect(pedidos.get('created_at')).toMatch(/^gte\./);
      expect(itens.get('created_at')).toMatch(/^gte\./);
      expect(pedidos.get('payment_status')).toBe('eq.approved');
    });

    it('quantidade inválida ou negativa entra como zero, não como NaN', async () => {
      stubComFallback({
        orders: [{ id: 1 }],
        orderItems: [
          { order_id: 1, product_id: 'p1', quantity: 'muitos' },
          { order_id: 1, product_id: 'p1', quantity: -5 },
          { order_id: 1, product_id: 'p1', quantity: 4 },
        ],
      });

      expect((await loadSoldCountByProduct()).get('p1')).toBe(4);
    });
  });

  describe('degradação', () => {
    it('tudo falhando devolve Map vazio — a vitrine continua de pé', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('Postgres fora do ar');
      });

      const contagem = await loadSoldCountByProduct();
      expect(contagem).toBeInstanceOf(Map);
      expect(contagem.size).toBe(0);
    });

    it('RPC com formato inesperado cai para a varredura', async () => {
      // Cache do PostgREST ou proxy reescrevendo o corpo: o resultado não é
      // array, e tratá-lo como vazio zeraria o ranking em silêncio.
      globalThis.fetch = vi.fn(async (url) => {
        const alvo = String(url);
        if (alvo.includes('rpc/')) return json({ inesperado: true });
        if (alvo.includes('/rest/v1/orders?')) return json([{ id: 1 }]);
        if (alvo.includes('/rest/v1/order_items?')) {
          return json([{ order_id: 1, product_id: 'p1', quantity: 9 }]);
        }
        return json([]);
      });

      expect((await loadSoldCountByProduct()).get('p1')).toBe(9);
    });
  });
});
