// ════════════════════════════════════════════════════════════════════
// Classificação da Curva ABC — espelho de `lib/abc-classification.js`.
//
// ── POR QUE É UMA CÓPIA, E NÃO UM IMPORT ────────────────────────────
// O original é CommonJS e roda em Node (ADR 0001); importá-lo aqui arrastaria
// o módulo para o bundle do browser. Mesma restrição, e mesma solução, de
// `src/constants/error-codes.js`: a duplicação é permitida, mas guardada por um
// teste de paridade — `src/utils/__tests__/abc-parity.test.js` compara as duas
// implementações sobre dezenas de distribuições e falha se elas divergirem em
// qualquer item.
//
// Isso importa porque as duas alimentam a MESMA tela: o widget inline do
// DashboardTab usa esta, e as abas de Curva ABC usam a do backend. Divergir
// significa o painel mostrar duas classificações diferentes para o mesmo
// produto, na mesma sessão.
// ════════════════════════════════════════════════════════════════════

/**
 * Classe de um item pela sua posição na curva acumulada.
 *
 * `rank === 1` é sempre A: sem esse caso, um catálogo (ou recorte) com UM item
 * só produzia acumulado de 100%, caía na faixa `> 95`, e o produto que gera
 * toda a receita aparecia como classe C — cauda longa. O topo da curva é, por
 * definição, a cabeça de Pareto.
 *
 * @param {number} cumulativePct  acumulado INCLUINDO este item, 0..100
 * @param {number} rank           posição na ordenação por receita, a partir de 1
 * @returns {'A'|'B'|'C'}
 */
export function classifyByCumulative(cumulativePct, rank) {
  if (rank === 1) return 'A';
  if (cumulativePct <= 80) return 'A';
  if (cumulativePct <= 95) return 'B';
  return 'C';
}
