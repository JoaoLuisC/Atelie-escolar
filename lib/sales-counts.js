const { createLogger } = require('./logger');

const log = createLogger('sales-counts');

// ════════════════════════════════════════════════════════════════════
// Contagem de "mais vendidos" por produto — achado M7.
//
// POR QUE ESTE MÓDULO EXISTE: /api/products e /api/home-sections são públicos,
// anônimos e, a cada requisição não-cacheada, faziam `select id from orders` e
// `select order_id,product_id,quantity from order_items` SEM `limit` e SEM
// janela temporal, com service role, só para somar quantidade por produto. O
// corpo da resposta não vazava PII, mas o custo por hit anônimo crescia junto
// com o histórico de vendas: um GET de 200 bytes puxava a base inteira do
// Postgres para dentro da função serverless. Furar o cache de borda (uma
// querystring aleatória por requisição) transformava a vitrine num amplificador.
//
// ESTRATÉGIA EM DUAS CAMADAS:
//   1. RPC public.product_sales_counts — a soma acontece no Postgres e volta
//      agregada (uma linha por PRODUTO, no máximo MAX_PRODUCTS). O tráfego passa
//      a ser proporcional ao catálogo, não ao histórico.
//   2. Fallback de varredura — mesma janela temporal, mas com `limit` EXPLÍCITO
//      nas duas tabelas. Existe para que o código continue correto se a migration
//      20260813000001_best_sellers_aggregate.sql ainda não tiver sido aplicada
//      (o projeto tem histórico de "migration não confirmada em produção",
//      P1-4 do relatório) — e mesmo assim já sem a varredura ilimitada.
//
// JANELA TEMPORAL: `soldCount` não é exibido em lugar nenhum do front — só
// ORDENA (src/hooks/useProductFilters.js:25 e a seção best_sellers da home).
// Limitar a janela preserva integralmente o resultado funcional "mais vendidos"
// e ainda melhora a recência do ranking.
// ════════════════════════════════════════════════════════════════════

const {
  supabaseRequest,
  serviceRoleHelpers: { listTableRows },
} = require('./supabase');

const RPC_PATH = 'rpc/product_sales_counts';

function toPositiveInt(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// 12 meses: um ano inteiro de sazonalidade escolar (o catálogo é material de
// escola — volta às aulas, festa junina, formatura), que é o ciclo relevante
// para dizer o que "vende bem". Configurável por env para ajuste sem deploy.
const WINDOW_MONTHS = toPositiveInt(process.env.BEST_SELLERS_WINDOW_MONTHS, 12);

// Tetos da camada 1 e da camada 2. O do RPC é por PRODUTO (o catálogo tem
// dezenas); os do fallback são por LINHA das tabelas de pedido, e por isso são
// mais folgados — mas finitos, que é o ponto do achado.
const MAX_PRODUCTS = 500;
const FALLBACK_ORDERS_LIMIT = toPositiveInt(process.env.BEST_SELLERS_SCAN_LIMIT, 2000);
const FALLBACK_ORDER_ITEMS_LIMIT = FALLBACK_ORDERS_LIMIT * 4;

function windowStartIso(months) {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - months);
  return start.toISOString();
}

function addQuantity(counts, productId, rawQuantity) {
  const key = String(productId || '');
  if (!key) return;
  const quantity = Number(rawQuantity);
  counts.set(
    key,
    (counts.get(key) || 0) + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0),
  );
}

/**
 * Camada 1 — agregação no Postgres.
 * @returns {Promise<Map<string, number>|null>} null quando a resposta não tem o
 *   formato esperado (migration não aplicada / cache do PostgREST / proxy
 *   reescrevendo o corpo) — o chamador cai no fallback.
 */
async function loadViaRpc(sinceIso) {
  const payload = await supabaseRequest(RPC_PATH, {
    method: 'POST',
    useServiceRole: true,
    body: JSON.stringify({ p_since: sinceIso, p_limit: MAX_PRODUCTS }),
  });

  if (!Array.isArray(payload)) return null;

  const counts = new Map();
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue;
    addQuantity(counts, row.product_id, row.sold_count);
  }
  return counts;
}

/**
 * Camada 2 — varredura limitada. Mantém o mesmo resultado do código antigo
 * (cruzar order_items com os pedidos aprovados), mas com teto nas duas queries
 * e recorte pela mesma janela usada pelo RPC.
 *
 * `order_items.created_at` é preenchido no mesmo instante que o pedido
 * (handlers/create-payment.js insere os dois em sequência), então filtrar os itens
 * pela janela é equivalente a filtrar os pedidos — e permite que o teto de
 * linhas caia sobre as vendas MAIS RECENTES, não sobre uma fatia arbitrária.
 */
async function loadViaScan(sinceIso) {
  const [approvedOrdersRows, orderItemsRows] = await Promise.all([
    listTableRows('orders', {
      select: 'id',
      filters: [
        { column: 'payment_status', value: 'approved' },
        { column: 'created_at', operator: 'gte', value: sinceIso },
      ],
      orderBy: 'created_at',
      ascending: false,
      limit: FALLBACK_ORDERS_LIMIT,
    }),
    listTableRows('order_items', {
      select: 'order_id,product_id,quantity',
      filters: [{ column: 'created_at', operator: 'gte', value: sinceIso }],
      orderBy: 'created_at',
      ascending: false,
      limit: FALLBACK_ORDER_ITEMS_LIMIT,
    }),
  ]);

  const approvedOrderIds = new Set((approvedOrdersRows || []).map((row) => String(row.id)));
  const counts = new Map();

  for (const item of orderItemsRows || []) {
    const orderId = String(item?.order_id || '');
    if (!orderId || !approvedOrderIds.has(orderId)) continue;
    addQuantity(counts, item.product_id, item.quantity);
  }

  return counts;
}

/**
 * Quantidade vendida por produto (pedidos aprovados, janela recente).
 *
 * NUNCA lança: em caso de falha devolve um Map vazio. A ordenação por vendas é
 * um sinal acessório da vitrine — degradar para "todos com 0" e ainda assim
 * entregar o catálogo é melhor do que devolver 500 numa página pública porque a
 * contagem de vendas falhou.
 *
 * @returns {Promise<Map<string, number>>} chave = product_id em string.
 */
async function loadSoldCountByProduct() {
  const sinceIso = windowStartIso(WINDOW_MONTHS);

  try {
    const viaRpc = await loadViaRpc(sinceIso);
    if (viaRpc) return viaRpc;
    log.warn('rpc_sales_counts_resposta_inesperada');
  } catch (error) {
    log.warn('rpc_sales_counts_indisponivel', {
      reason: error.message,
      fallback: 'varredura_com_teto',
    });
  }

  try {
    return await loadViaScan(sinceIso);
  } catch (error) {
    log.warn('varredura_de_vendas_falhou', {
      reason: error.message,
      efeito: 'vitrine_sem_ranking',
    });
    return new Map();
  }
}

module.exports = {
  loadSoldCountByProduct,
  // Exportados para teste e para quem precise da mesma janela/tetos.
  WINDOW_MONTHS,
  windowStartIso,
};
