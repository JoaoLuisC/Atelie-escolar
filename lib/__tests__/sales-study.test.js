import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

// lib/sales-study.js — os números do Estudo de vendas e o contrato com o Gemini.

const requireCjs = createRequire(import.meta.url);
const { summarizePeriod, hasEnoughData, normalizeInsights, generateInsights } =
  requireCjs('../sales-study.js');

const START = Date.parse('2026-10-01T00:00:00Z');
const END = Date.parse('2026-10-31T00:00:00Z');
const at = (day) => `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`;

function raw() {
  const events = [];
  // 10 sessões no catálogo, 6 viram produto, 3 carrinho, 2 checkout.
  for (let i = 0; i < 10; i += 1)
    events.push({ event_name: 'view_catalog', session_id: `s${i}`, created_at: at(5) });
  for (let i = 0; i < 6; i += 1)
    events.push({ event_name: 'view_item', session_id: `s${i}`, created_at: at(5) });
  for (let i = 0; i < 3; i += 1)
    events.push({ event_name: 'add_to_cart', session_id: `s${i}`, created_at: at(5) });
  for (let i = 0; i < 2; i += 1)
    events.push({ event_name: 'begin_checkout', session_id: `s${i}`, created_at: at(5) });

  const orders = [
    {
      id: 1,
      payment_status: 'approved',
      total_amount: 30,
      discount_amount: 0,
      customer_email: 'ana@x.com',
      attribution_data: { utm_source: 'instagram' },
      created_at: at(6),
    },
    {
      id: 2,
      payment_status: 'approved',
      total_amount: 10,
      discount_amount: 2,
      coupon_code: 'VOLTA',
      customer_email: 'ANA@x.com',
      attribution_data: {},
      created_at: at(8),
    },
    {
      id: 3,
      payment_status: 'pending',
      total_amount: 50,
      customer_email: 'bia@x.com',
      attribution_data: {},
      created_at: at(9),
    },
    // Fora do período: não conta.
    {
      id: 4,
      payment_status: 'approved',
      total_amount: 999,
      customer_email: 'old@x.com',
      attribution_data: {},
      created_at: '2026-09-15T12:00:00Z',
    },
  ];
  const items = [
    { order_id: 1, product_id: 'p1', product_name: 'Painel Outono', unit_price: 30, quantity: 1 },
    { order_id: 2, product_id: 'p2', product_name: 'Kit Natal', unit_price: 12, quantity: 1 },
  ];
  const products = [
    { id: 'p1', category_id: 'c1' },
    { id: 'p2', category_id: 'c2' },
  ];
  const categories = [
    { id: 'c1', name: 'Painéis' },
    { id: 'c2', name: 'Datas comemorativas' },
  ];
  return { events, orders, items, products, categories };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('summarizePeriod', () => {
  const resumo = summarizePeriod(raw(), START, END);

  it('conta pedidos, receita e ticket só do período, só aprovados', () => {
    expect(resumo.pedidosCriados).toBe(3);
    expect(resumo.pedidosAprovados).toBe(2);
    expect(resumo.receita).toBe(40);
    expect(resumo.ticketMedio).toBe(20);
    expect(resumo.descontoConcedido).toBe(2);
    expect(resumo.pedidosComCupomPct).toBe(50);
  });

  it('funil usa as mesmas etapas da aba Funil, com a conversão de cada uma', () => {
    expect(resumo.sessoesNoSite).toBe(10);
    expect(resumo.funil.map((e) => e.sessoes)).toEqual([10, 6, 3, 2, 2]);
    expect(resumo.funil[1].conversaoDaEtapaAnteriorPct).toBe(60);
  });

  it('recompra conta o mesmo comprador sem diferenciar maiúsculas', () => {
    expect(resumo.compradoresDistintos).toBe(1);
    expect(resumo.compradoresQueRecompraram).toBe(1);
  });

  it('Curva ABC, categorias e origem das vendas', () => {
    expect(resumo.curvaAbc.produtos[0]).toMatchObject({ produto: 'Painel Outono', curva: 'A' });
    expect(resumo.categorias[0]).toEqual({ categoria: 'Painéis', receita: 30 });
    expect(resumo.origemDasVendas.map((o) => o.origem)).toEqual(['instagram', 'direct']);
  });

  it('nenhum e-mail sai no resumo que vai para a IA', () => {
    expect(JSON.stringify(resumo)).not.toMatch(/@x\.com/i);
  });
});

describe('hasEnoughData', () => {
  it('pede pelo menos 3 pedidos aprovados ou 30 sessões no período atual', () => {
    expect(hasEnoughData({ periodoAtual: { pedidosAprovados: 2, sessoesNoSite: 29 } })).toBe(false);
    expect(hasEnoughData({ periodoAtual: { pedidosAprovados: 3, sessoesNoSite: 0 } })).toBe(true);
    expect(hasEnoughData({ periodoAtual: { pedidosAprovados: 0, sessoesNoSite: 30 } })).toBe(true);
  });
});

describe('normalizeInsights', () => {
  it('formato fechado: listas limitadas a 5 itens e confiança válida', () => {
    const out = normalizeInsights({
      resumo: 'ok',
      destaques: Array.from({ length: 9 }, (_, i) => `d${i}`),
      pontosDeAtencao: 'não é lista',
      acoes: ['  a1  ', ''],
      confianca: 'altíssima',
    });
    expect(out.destaques).toHaveLength(5);
    expect(out.pontosDeAtencao).toEqual([]);
    expect(out.acoes).toEqual(['a1']);
    expect(out.confianca).toBe('baixa');
  });
});

describe('generateInsights', () => {
  const dados = { periodoDias: 30, periodoAtual: { pedidosAprovados: 5 } };

  it('sem chave, avisa que a IA não está configurada', async () => {
    await expect(generateInsights(dados, { apiKey: '' })).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
    });
  });

  it('chama o Gemini com JSON estruturado e devolve a leitura normalizada', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    resumo: 'Vendas estáveis.',
                    destaques: ['x'],
                    pontosDeAtencao: ['y'],
                    acoes: ['z'],
                    confianca: 'media',
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));

    const { insights, model } = await generateInsights(dados, { apiKey: 'k', fetchImpl });

    expect(model).toBe('gemini-2.5-flash');
    expect(insights).toEqual({
      resumo: 'Vendas estáveis.',
      destaques: ['x'],
      pontosDeAtencao: ['y'],
      acoes: ['z'],
      confianca: 'media',
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect(options.headers['x-goog-api-key']).toBe('k');
    const body = JSON.parse(options.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(dados);
  });

  it('cota estourada vira AI_QUOTA; resposta ilegível vira AI_FAILED', async () => {
    await expect(
      generateInsights(dados, {
        apiKey: 'k',
        fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
      }),
    ).rejects.toMatchObject({ code: 'AI_QUOTA' });

    await expect(
      generateInsights(dados, {
        apiKey: 'k',
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'não é json' }] } }] }),
        }),
      }),
    ).rejects.toMatchObject({ code: 'AI_FAILED' });
  });
});
