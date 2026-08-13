import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const { buildAbcCurve } = requireCjs('../abc-classification.js');

// ════════════════════════════════════════════════════════════════════
// Curva ABC alimenta duas telas do painel (produtos e clientes) e a exportação
// em CSV. Errar a classificação não quebra nada visivelmente — só faz a dona
// da loja tomar decisão de estoque/preço com o ranking errado, que é o tipo de
// bug que sobrevive anos.
// ════════════════════════════════════════════════════════════════════

function entries(...revenues) {
  return revenues.map((revenue, i) => ({ id: `x${i}`, revenue }));
}

describe('buildAbcCurve', () => {
  it('ordena por receita decrescente e numera o rank a partir de 1', () => {
    const { items } = buildAbcCurve(entries(10, 100, 50));
    expect(items.map((i) => i.revenue)).toEqual([100, 50, 10]);
    expect(items.map((i) => i.rank)).toEqual([1, 2, 3]);
  });

  it('classifica pelo acumulado: A até 80%, B até 95%, C o resto', () => {
    // 800 / 150 / 50 → acumulados 80% / 95% / 100%.
    const { items } = buildAbcCurve(entries(800, 150, 50));
    expect(items.map((i) => i.curve)).toEqual(['A', 'B', 'C']);
  });

  it('o total é a soma das receitas', () => {
    const { totalRevenue } = buildAbcCurve(entries(800, 150, 50));
    expect(totalRevenue).toBe(1000);
  });

  it('o resumo conta quantos há em cada classe', () => {
    const { summary } = buildAbcCurve(entries(800, 150, 50));
    expect(summary).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('o acumulado do último item é 100%', () => {
    const { items } = buildAbcCurve(entries(37, 11, 5, 1));
    expect(items.at(-1).cumulativePct).toBeCloseTo(100, 6);
  });

  it('a soma dos shares fecha em 100%', () => {
    const { items } = buildAbcCurve(entries(33, 33, 34));
    const soma = items.reduce((total, item) => total + item.sharePct, 0);
    expect(soma).toBeCloseTo(100, 6);
  });

  it('lista vazia não estoura nem divide por zero', () => {
    const curve = buildAbcCurve([]);
    expect(curve.items).toEqual([]);
    expect(curve.totalRevenue).toBe(0);
    expect(Number.isFinite(curve.totalRevenue)).toBe(true);
  });

  it('receita total zero não produz NaN nos percentuais', () => {
    // Um período sem venda é caso REAL (loja nova, mês fechado), e NaN na tela
    // do painel é o sintoma clássico de divisão por zero não tratada.
    const { items } = buildAbcCurve(entries(0, 0));
    for (const item of items) {
      expect(Number.isNaN(item.sharePct)).toBe(false);
      expect(Number.isNaN(item.cumulativePct)).toBe(false);
    }
  });

  // ── ACHADO CORRIGIDO EM 13/08/2026 ──────────────────────────────────
  // Antes: com UM item só o acumulado é 100%, caía na faixa `> 95`, e o
  // produto que gera TODA a receita aparecia no painel como classe C — cauda
  // longa. Semanticamente invertido: o topo da curva é, por definição, a
  // cabeça de Pareto.
  //
  // A correção é `rank === 1` sempre 'A', e é mínima de propósito: mexer nas
  // faixas reclassificaria distribuições de 3+ itens que já estavam certas.
  //
  // A paridade com a implementação do browser
  // (src/components/admin/utils/derive.js, que consome src/utils/abc.js) é
  // travada em src/utils/__tests__/abc-parity.test.js.
  it('item único é classe A — ele É a cabeça da curva', () => {
    const { items, summary } = buildAbcCurve(entries(42));
    expect(items[0].cumulativePct).toBeCloseTo(100, 6);
    expect(items[0].curve).toBe('A');
    expect(summary).toEqual({ A: 1, B: 0, C: 0 });
  });

  it('a correção não vale para o segundo colocado', () => {
    const { items } = buildAbcCurve(entries(990, 10));
    expect(items.map((i) => i.curve)).toEqual(['A', 'C']);
  });

  it('preserva os campos extras da entrada', () => {
    const { items } = buildAbcCurve([{ id: 'p1', revenue: 10, name: 'Kit', orderCount: 3 }]);
    expect(items[0]).toMatchObject({ id: 'p1', name: 'Kit', orderCount: 3 });
  });

  it('não muta o array recebido', () => {
    const original = entries(1, 2, 3);
    const copia = original.map((e) => ({ ...e }));
    buildAbcCurve(original);
    expect(original).toEqual(copia);
  });
});
