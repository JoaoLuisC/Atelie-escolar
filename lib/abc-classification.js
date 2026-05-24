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

function classifyByCumulative(cumulativePct) {
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
    return {
      ...item,
      revenue,
      rank: index + 1,
      sharePct: (revenue / totalRevenue) * 100,
      cumulativePct,
      curve: classifyByCumulative(cumulativePct),
    };
  });

  const summary = enriched.reduce((acc, item) => {
    acc[item.curve] = (acc[item.curve] || 0) + 1;
    return acc;
  }, { A: 0, B: 0, C: 0 });

  return { totalRevenue, items: enriched, summary };
}

module.exports = {
  buildAbcCurve,
  classifyByCumulative,
};
