/**
 * Curva ABC compartilhada entre endpoints server-side e o widget inline
 * em [DashboardTab.jsx](../src/components/admin/tabs/DashboardTab.jsx).
 *
 * Princípio de Pareto:
 * - Classe A: produtos/clientes que acumulam até 80% da receita
 * - Classe B: do 80% ao 95%
 * - Classe C: o restante (cauda longa)
 *
 * Mantém a mesma classificação do `derive.js` para consistência visual.
 */

/**
 * Classe de um item pela sua posição na curva acumulada.
 *
 * ── POR QUE O `rank === 1` TEM TRATAMENTO PRÓPRIO ───────────────────
 * Sem ele, um catálogo (ou um período) com UM item só produzia acumulado de
 * 100%, caía na faixa `> 95` e o produto que gera TODA a receita aparecia no
 * painel como classe C — cauda longa. Semanticamente invertido: o topo da
 * curva é, por definição, a cabeça de Pareto.
 *
 * O caso não é hipotético para esta loja: catálogo pequeno, e qualquer recorte
 * por categoria ou por período curto pode devolver um item só.
 *
 * O tratamento é deliberadamente MÍNIMO — "o primeiro colocado é sempre A" —
 * e não uma mudança na regra das faixas. Trocar a faixa (por exemplo, medir o
 * acumulado ANTES de somar o item) reclassificaria carrinhos de 3+ itens que
 * hoje estão certos, o que seria mexer num relatório de negócio para consertar
 * uma borda.
 *
 * @param {number} cumulativePct  acumulado INCLUINDO este item, 0..100
 * @param {number} rank           posição na ordenação por receita, a partir de 1
 */
function classifyByCumulative(cumulativePct, rank) {
  if (rank === 1) return 'A';
  if (cumulativePct <= 80) return 'A';
  if (cumulativePct <= 95) return 'B';
  return 'C';
}

/**
 * Recebe lista de { id, name, revenue, qty?, meta? } e retorna lista
 * com sharePct, cumulativePct, rank e curve (A/B/C). Filtra revenue<=0.
 */
function buildAbcCurve(items) {
  const ranked = (items || [])
    .filter((item) => Number(item.revenue || 0) > 0)
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));

  const totalRevenue = ranked.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  if (totalRevenue === 0) {
    return { totalRevenue: 0, items: [], summary: { A: 0, B: 0, C: 0 } };
  }

  let cumulative = 0;
  const enriched = ranked.map((item, index) => {
    const revenue = Number(item.revenue || 0);
    cumulative += revenue;
    const cumulativePct = (cumulative / totalRevenue) * 100;
    const rank = index + 1;
    return {
      ...item,
      revenue,
      rank,
      sharePct: (revenue / totalRevenue) * 100,
      cumulativePct,
      curve: classifyByCumulative(cumulativePct, rank),
    };
  });

  const summary = enriched.reduce(
    (acc, item) => {
      acc[item.curve] = (acc[item.curve] || 0) + 1;
      return acc;
    },
    { A: 0, B: 0, C: 0 },
  );

  return { totalRevenue, items: enriched, summary };
}

module.exports = {
  buildAbcCurve,
  classifyByCumulative,
};
