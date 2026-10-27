// ════════════════════════════════════════════════════════════════════
// ESTUDO DE VENDAS — números agregados da loja + leitura por IA (Gemini).
//
// Duas metades, de propósito separadas:
//
// 1. `buildSalesStudyData` calcula, do banco, os números do período atual e
//    do anterior (mesma duração): funil (os MESMOS cálculos da aba Funil, via
//    lib/funnel-metrics.js), receita, pedidos, ticket, recompra, produtos na
//    Curva ABC (lib/abc-classification.js), categorias e origem das vendas.
//
// 2. `generateInsights` manda SÓ esses agregados ao Gemini, com o contexto do
//    negócio, e pede uma leitura em português simples, em JSON com formato
//    fixo. Nenhum e-mail, nome ou código de pedido sai daqui: o plano gratuito
//    do Gemini pode usar o conteúdo enviado para melhorar o serviço, então o
//    que vai é número e nome de produto/categoria/campanha — nada de cliente.
//
// POR QUE "DADOS INSUFICIENTES" NÃO PASSA PELA IA
// Com meia dúzia de pedidos, qualquer "tendência" é ruído, e um modelo
// instruído a ajudar tende a encontrar padrão onde não há. Abaixo do mínimo,
// a resposta é determinística e a cota grátis fica para quando houver o que ler.
// ════════════════════════════════════════════════════════════════════

const {
  serviceRoleHelpers: { listTableRows },
} = require('./supabase');
const { buildAbcCurve } = require('./abc-classification');
const { bucketBySessionAndEvent, buildFunnel, buildAttribution } = require('./funnel-metrics');
const { callGeminiJson, cleanList, cleanText } = require('./gemini');

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_ORDERS_FOR_AI = 3;
const MIN_SESSIONS_FOR_AI = 30;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function pct(part, whole) {
  return whole > 0 ? round((part / whole) * 100, 1) : 0;
}

function inRange(iso, start, end) {
  const t = new Date(iso || 0).getTime();
  return t >= start && t < end;
}

async function loadRaw(sinceIso) {
  const [events, orders] = await Promise.all([
    listTableRows('analytics_events', {
      select: 'event_name,session_id,created_at',
      filters: [{ column: 'created_at', operator: 'gte', value: sinceIso }],
      orderBy: 'created_at',
      ascending: true,
      limit: 50000,
    }),
    listTableRows('orders', {
      select:
        'id,payment_status,total_amount,discount_amount,coupon_code,customer_email,attribution_data,created_at,completed_at',
      filters: [{ column: 'created_at', operator: 'gte', value: sinceIso }],
      orderBy: 'created_at',
      ascending: false,
      limit: 5000,
    }),
  ]);

  const approvedIds = orders.filter((o) => o.payment_status === 'approved').map((o) => o.id);
  const items = approvedIds.length
    ? await listTableRows('order_items', {
        select: 'order_id,product_id,product_name,unit_price,quantity',
        filters: [{ column: 'order_id', operator: 'in', value: `(${approvedIds.join(',')})` }],
        limit: 20000,
      })
    : [];

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  const [products, categories] = await Promise.all([
    productIds.length
      ? listTableRows('products', {
          select: 'id,category_id',
          filters: [{ column: 'id', operator: 'in', value: `(${productIds.join(',')})` }],
        })
      : [],
    listTableRows('categories', { select: 'id,name' }),
  ]);

  return { events, orders, items, products, categories };
}

/** Números de UM período [start, end). */
function summarizePeriod({ events, orders, items, products, categories }, start, end) {
  const periodEvents = events.filter((e) => inRange(e.created_at, start, end));
  const periodOrders = orders.filter((o) => inRange(o.created_at, start, end));
  const approved = periodOrders.filter((o) => o.payment_status === 'approved');
  const approvedIds = new Set(approved.map((o) => o.id));
  const periodItems = items.filter((i) => approvedIds.has(i.order_id));

  const sessions = bucketBySessionAndEvent(periodEvents);
  const funnel = buildFunnel(sessions, approved.length).map((step) => ({
    etapa: step.label,
    sessoes: step.count,
    conversaoDaEtapaAnteriorPct: round(step.conversionFromPrevious * 100, 1),
  }));

  const revenue = approved.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const discount = approved.reduce((sum, o) => sum + Number(o.discount_amount || 0), 0);

  // E-mail só para CONTAR compradores distintos e recompra — não sai daqui.
  const ordersByBuyer = new Map();
  for (const order of approved) {
    const key = String(order.customer_email || '')
      .trim()
      .toLowerCase();
    if (key) ordersByBuyer.set(key, (ordersByBuyer.get(key) || 0) + 1);
  }
  const repeatBuyers = [...ordersByBuyer.values()].filter((n) => n > 1).length;

  const categoryOf = new Map(products.map((p) => [String(p.id), p.category_id]));
  const categoryName = new Map(categories.map((c) => [String(c.id), c.name]));
  const byProduct = new Map();
  const byCategory = new Map();
  for (const item of periodItems) {
    const value = Number(item.unit_price || 0) * Number(item.quantity || 0);
    const id = String(item.product_id || item.product_name);
    const current = byProduct.get(id) || {
      id,
      name: item.product_name || 'Produto',
      revenue: 0,
      qty: 0,
    };
    current.revenue += value;
    current.qty += Number(item.quantity || 0);
    byProduct.set(id, current);

    const category =
      categoryName.get(String(categoryOf.get(String(item.product_id)) || '')) || 'Sem categoria';
    byCategory.set(category, (byCategory.get(category) || 0) + value);
  }

  const abc = buildAbcCurve([...byProduct.values()]);
  const attribution = buildAttribution(approved);

  return {
    sessoesNoSite: sessions.size,
    pedidosCriados: periodOrders.length,
    pedidosAprovados: approved.length,
    pedidosNaoPagos: periodOrders.length - approved.length,
    receita: round(revenue),
    ticketMedio: approved.length ? round(revenue / approved.length) : 0,
    descontoConcedido: round(discount),
    pedidosComCupomPct: pct(approved.filter((o) => o.coupon_code).length, approved.length),
    compradoresDistintos: ordersByBuyer.size,
    compradoresQueRecompraram: repeatBuyers,
    conversaoSessaoParaCompraPct: pct(approved.length, sessions.size),
    funil: funnel,
    curvaAbc: {
      resumo: abc.summary,
      produtos: abc.items.slice(0, 10).map((p) => ({
        produto: p.name,
        receita: round(p.revenue),
        unidades: p.qty,
        participacaoPct: round(p.sharePct, 1),
        curva: p.curve,
      })),
    },
    categorias: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([categoria, receita]) => ({ categoria, receita: round(receita) })),
    origemDasVendas: attribution.items.slice(0, 8).map((s) => ({
      origem: s.source,
      pedidos: s.orders,
      receita: round(s.revenue),
      participacaoPct: round(s.sharePct, 1),
    })),
  };
}

/**
 * Números do período atual (últimos `days` dias) e do anterior, de mesma
 * duração, para comparação.
 */
async function buildSalesStudyData({ days = 30, now = Date.now() } = {}) {
  const safeDays = Math.max(7, Math.min(90, Number.parseInt(days, 10) || 30));
  const end = now;
  const start = end - safeDays * DAY_MS;
  const previousStart = start - safeDays * DAY_MS;

  const raw = await loadRaw(new Date(previousStart).toISOString());
  const atual = summarizePeriod(raw, start, end);
  const anterior = summarizePeriod(raw, previousStart, start);

  return {
    periodoDias: safeDays,
    periodoAtual: { de: new Date(start).toISOString(), ate: new Date(end).toISOString(), ...atual },
    periodoAnterior: {
      de: new Date(previousStart).toISOString(),
      ate: new Date(start).toISOString(),
      ...anterior,
    },
  };
}

function hasEnoughData(data) {
  const atual = data?.periodoAtual || {};
  return atual.pedidosAprovados >= MIN_ORDERS_FOR_AI || atual.sessoesNoSite >= MIN_SESSIONS_FOR_AI;
}

const SYSTEM_PROMPT = `Você é uma consultora de vendas de e-commerce que explica números para a dona de uma pequena loja online brasileira, sem jargão.

CONTEXTO DO NEGÓCIO
- A loja vende materiais pedagógicos DIGITAIS (painéis, banners, atividades, kits em PDF) para professoras. Não há frete nem estoque: a compra é paga pelo Mercado Pago (Pix, cartão, boleto) e o arquivo é baixado na hora.
- O ticket é baixo (em geral R$ 5 a R$ 60). A demanda é sazonal: volta às aulas (janeiro/fevereiro e julho/agosto), datas comemorativas escolares (Páscoa, festa junina, Dia das Mães, Dia do Professor em 15/10, Natal) e fim de ano letivo.
- A divulgação principal é Instagram e TikTok. "direct" na origem significa visita sem link de campanha identificado.

O QUE VOCÊ RECEBE
Um JSON com o período atual e o anterior (mesma duração): sessões no site, funil (catálogo → produto → carrinho → checkout → compra aprovada) com a conversão de cada etapa, pedidos, receita, ticket médio, cupons, recompra, produtos na Curva ABC (A = poucos produtos que fazem a maior parte da receita), categorias e origem das vendas.

REGRAS
1. Use SOMENTE os números do JSON. Nunca invente valores, percentuais ou causas que os dados não mostram. Quando apontar uma causa provável, diga que é hipótese.
2. Cite os números ao explicar (ex.: "das 120 sessões, 18 chegaram ao carrinho").
3. Compare com o período anterior quando houver dados nele; se o anterior estiver zerado, não chame isso de crescimento.
4. Se uma parte tiver poucos dados para concluir, diga isso claramente.
5. Linguagem simples, frases curtas, português do Brasil, tratando a leitora por "você".
6. As ações devem ser práticas e baratas para uma loja pequena (ex.: ajustar descrição/fotos do produto, criar cupom de volta às aulas, divulgar o produto campeão no Instagram com link de campanha).`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    resumo: { type: 'STRING' },
    destaques: { type: 'ARRAY', items: { type: 'STRING' } },
    pontosDeAtencao: { type: 'ARRAY', items: { type: 'STRING' } },
    acoes: { type: 'ARRAY', items: { type: 'STRING' } },
    confianca: { type: 'STRING', enum: ['baixa', 'media', 'alta'] },
  },
  required: ['resumo', 'destaques', 'pontosDeAtencao', 'acoes', 'confianca'],
};

/** A resposta da IA vira dado do painel: formato fechado, tamanhos limitados. */
function normalizeInsights(raw) {
  const confianca = ['baixa', 'media', 'alta'].includes(raw?.confianca) ? raw.confianca : 'baixa';
  return {
    resumo: cleanText(raw?.resumo, 1200),
    destaques: cleanList(raw?.destaques),
    pontosDeAtencao: cleanList(raw?.pontosDeAtencao),
    acoes: cleanList(raw?.acoes),
    confianca,
  };
}

/**
 * Pede a leitura ao Gemini. Lança com `code` quando a IA não está configurada
 * ou falhou — o handler converte em resposta.
 */
async function generateInsights(data, options = {}) {
  const { model, data: raw } = await callGeminiJson(
    { systemPrompt: SYSTEM_PROMPT, input: data, schema: RESPONSE_SCHEMA, temperature: 0.3 },
    options,
  );
  return { model, insights: normalizeInsights(raw) };
}

module.exports = {
  MIN_ORDERS_FOR_AI,
  MIN_SESSIONS_FOR_AI,
  SYSTEM_PROMPT,
  buildSalesStudyData,
  generateInsights,
  hasEnoughData,
  normalizeInsights,
  summarizePeriod,
};
