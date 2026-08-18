import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/customer-segmentation.js` — item P4.1.
//
// É a base dos e-mails automáticos: `inativo_90d` é o alvo da reativação e
// `inativo_180d` é quem NÃO pode receber marketing (regra D7). Uma tag errada
// aqui não quebra tela nenhuma — ela manda e-mail para quem não devia receber,
// que é a falha que custa reputação de domínio.
//
// ⚠️ ACHADO REGISTRADO, NÃO CORRIGIDO: as faixas se SOBREPÕEM. Quem comprou há
// 45 dias recebe `cliente_ativo` E `inativo_30d`; quem comprou há exatamente 90
// recebe `cliente_ativo` E `inativo_90d` — ou seja, um cliente "ativo" entra no
// alvo da reativação. Está fora dos dois documentos que esta rodada executa, e
// mudar faixa é decisão de quem opera a comunicação, não digitação. Os testes
// abaixo TRAVAM o comportamento atual e o deixam visível, que é o passo que
// permite decidir depois com dado na mão.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { VIP_THRESHOLD, computeCustomerTags, daysSince, loadCustomerHistory } = requireCjs(
  '../customer-segmentation.js',
);

const DIA_MS = 24 * 60 * 60 * 1000;

function haDias(dias) {
  return new Date(Date.now() - dias * DIA_MS).toISOString();
}

/** Histórico mínimo: N pedidos, o mais recente primeiro. */
function historico(pedidos) {
  return {
    orders: pedidos,
    itemsByOrder: new Map(),
    products: new Map(),
  };
}

function pedido({ dias = 10, total = 50 } = {}) {
  return { id: `o-${dias}-${total}`, total_amount: total, completed_at: haDias(dias) };
}

describe('daysSince', () => {
  it('conta dias inteiros para trás', () => {
    expect(daysSince(haDias(10))).toBe(10);
  });

  it('sem data devolve Infinity — nunca 0', () => {
    // 0 significaria "comprou hoje", que é o oposto do que a ausência diz. Com
    // Infinity o cliente cai em `inativo_180d`, que é o lado seguro: sem
    // marketing.
    expect(daysSince(null)).toBe(Infinity);
    expect(daysSince(undefined)).toBe(Infinity);
    expect(daysSince('')).toBe(Infinity);
  });
});

describe('computeCustomerTags', () => {
  it('sem pedido, sem tag — nem sequer "inativo"', () => {
    expect(computeCustomerTags(historico([]))).toEqual([]);
  });

  it('compra recente marca cliente_ativo', () => {
    expect(computeCustomerTags(historico([pedido({ dias: 5 })]))).toContain('cliente_ativo');
  });

  it('dois pedidos marcam cliente_recorrente', () => {
    const tags = computeCustomerTags(
      historico([pedido({ dias: 5, total: 10 }), pedido({ dias: 40, total: 10 })]),
    );
    expect(tags).toContain('cliente_recorrente');
  });

  it('cinco pedidos marcam VIP mesmo com LTV baixo', () => {
    const tags = computeCustomerTags(
      historico(Array.from({ length: 5 }, (_, i) => pedido({ dias: i + 1, total: 1 }))),
    );
    expect(tags).toContain('cliente_vip');
  });

  it('LTV acima do limiar marca VIP com um pedido só', () => {
    const tags = computeCustomerTags(historico([pedido({ dias: 1, total: VIP_THRESHOLD + 1 })]));
    expect(tags).toContain('cliente_vip');
  });

  it('LTV exatamente no limiar NÃO marca VIP (a comparação é estrita)', () => {
    const tags = computeCustomerTags(historico([pedido({ dias: 1, total: VIP_THRESHOLD })]));
    expect(tags).not.toContain('cliente_vip');
  });

  it('180+ dias marca inativo_180d — o corte de marketing da regra D7', () => {
    const tags = computeCustomerTags(historico([pedido({ dias: 200 })]));
    expect(tags).toContain('inativo_180d');
    expect(tags).not.toContain('cliente_ativo');
    expect(tags).not.toContain('inativo_90d');
  });

  it('entre 90 e 179 dias marca inativo_90d — o alvo da reativação', () => {
    const tags = computeCustomerTags(historico([pedido({ dias: 120 })]));
    expect(tags).toContain('inativo_90d');
    expect(tags).not.toContain('inativo_180d');
  });

  it('total ilegível conta como zero e não vira NaN no LTV', () => {
    const tags = computeCustomerTags(
      historico([{ id: 'x', total_amount: 'muito', completed_at: haDias(1) }]),
    );
    expect(tags).toContain('cliente_ativo');
    expect(tags).not.toContain('cliente_vip');
  });

  it('cai para created_at quando não há completed_at', () => {
    const tags = computeCustomerTags(
      historico([{ id: 'x', total_amount: 10, completed_at: null, created_at: haDias(3) }]),
    );
    expect(tags).toContain('cliente_ativo');
  });

  describe('sobreposição de faixas (comportamento ATUAL, registrado)', () => {
    it('45 dias recebe cliente_ativo E inativo_30d ao mesmo tempo', () => {
      const tags = computeCustomerTags(historico([pedido({ dias: 45 })]));
      expect(tags).toContain('cliente_ativo');
      expect(tags).toContain('inativo_30d');
    });

    it('exatamente 90 dias recebe cliente_ativo E inativo_90d', () => {
      // O caso mais incômodo da sobreposição: `inativo_90d` é o alvo do e-mail
      // de reativação com cupom, e este cliente também está marcado como ativo.
      const tags = computeCustomerTags(historico([pedido({ dias: 90 })]));
      expect(tags).toContain('cliente_ativo');
      expect(tags).toContain('inativo_90d');
    });
  });

  describe('tags de categoria', () => {
    it('uma tag por categoria comprada, sem repetição', () => {
      const base = historico([pedido({ dias: 5 })]);
      base.itemsByOrder.set('o1', [{ product_id: 'p1' }, { product_id: 'p2' }]);
      base.products.set('p1', { id: 'p1', category_id: 'c1' });
      base.products.set('p2', { id: 'p2', category_id: 'c1' });

      const tags = computeCustomerTags(base, new Map([['c1', 'alfabetizacao']]));
      expect(tags.filter((t) => t === 'categoria:alfabetizacao')).toHaveLength(1);
    });

    it('produto sem categoria, ou categoria fora do mapa, não gera tag', () => {
      const base = historico([pedido({ dias: 5 })]);
      base.itemsByOrder.set('o1', [{ product_id: 'p1' }, { product_id: 'p3' }]);
      base.products.set('p1', { id: 'p1', category_id: null });
      base.products.set('p3', { id: 'p3', category_id: 'c-desconhecida' });

      const tags = computeCustomerTags(base, new Map([['c1', 'alfabetizacao']]));
      expect(tags.some((t) => t.startsWith('categoria:'))).toBe(false);
    });

    it('sem mapa de categorias, nenhuma tag de categoria é inventada', () => {
      const base = historico([pedido({ dias: 5 })]);
      base.itemsByOrder.set('o1', [{ product_id: 'p1' }]);
      base.products.set('p1', { id: 'p1', category_id: 'c1' });

      expect(computeCustomerTags(base).some((t) => t.startsWith('categoria:'))).toBe(false);
    });
  });
});

describe('loadCustomerHistory', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  });

  afterEach(() => {
    process.env = ambienteOriginal;
    vi.restoreAllMocks();
  });

  it('sem Supabase configurado devolve histórico vazio, sem lançar', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    globalThis.fetch = vi.fn();

    const historicoVazio = await loadCustomerHistory('cliente@exemplo.test');
    expect(historicoVazio.orders).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('filtra por e-mail normalizado e só pedidos aprovados', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [],
      text: async () => '[]',
    }));

    await loadCustomerHistory('Cliente@Exemplo.TEST');

    const params = new URL(String(globalThis.fetch.mock.calls[0][0])).searchParams;
    expect(params.get('customer_email')).toBe('eq.cliente@exemplo.test');
    expect(params.get('payment_status')).toBe('eq.approved');
    expect(Number(params.get('limit'))).toBeGreaterThan(0);
  });

  it('sem pedidos, nem consulta itens nem produtos', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [],
      text: async () => '[]',
    }));

    await loadCustomerHistory('cliente@exemplo.test');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
