import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { classifyByCumulative as classifyFront } from '../abc';
import { deriveAbcCurve } from '../../components/admin/utils/derive';

const requireCjs = createRequire(import.meta.url);
const { classifyByCumulative: classifyBack, buildAbcCurve } = requireCjs(
  '../../../lib/abc-classification.js',
);

// ════════════════════════════════════════════════════════════════════
// PARIDADE DA CURVA ABC ENTRE BROWSER E SERVIDOR.
//
// O mesmo cálculo existe duas vezes por restrição de bundle (CommonJS no
// backend, ESM no browser — ADR 0001), e as duas alimentam a MESMA tela: o
// widget inline do DashboardTab usa a do browser, as abas de Curva ABC usam a
// do servidor. Divergir significa o painel mostrar duas classificações
// diferentes para o mesmo produto na mesma sessão — e ninguém percebe, porque
// as duas telas são consultadas em momentos diferentes.
//
// O comentário no topo de lib/abc-classification.js já pedia essa consistência
// ("mantém a mesma classificação do derive.js"). Pedir por comentário não
// impede divergir; este teste impede.
// ════════════════════════════════════════════════════════════════════

/** Distribuições escolhidas por serem as que passam perto das bordas 80/95. */
const DISTRIBUICOES = [
  [42],
  [800, 150, 50],
  [60, 40],
  [50, 50],
  [80, 15, 5],
  [79, 16, 5],
  [81, 14, 5],
  [100, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [500, 300, 100, 60, 40],
  [19.99, 33.33, 0.07],
  [1000, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [33.33, 33.33, 33.34],
];

describe('curva ABC — servidor e browser concordam', () => {
  for (const receitas of DISTRIBUICOES) {
    it(`mesma classificação para [${receitas.join(', ')}]`, () => {
      const back = buildAbcCurve(receitas.map((revenue, i) => ({ id: `p${i}`, revenue })));
      const front = deriveAbcCurve(receitas.map((rev, i) => ({ id: `p${i}`, rev, name: `p${i}` })));

      expect(front.items.map((i) => i.id)).toEqual(back.items.map((i) => i.id));
      expect(front.items.map((i) => i.curve)).toEqual(back.items.map((i) => i.curve));
      expect(front.items.map((i) => i.rank)).toEqual(back.items.map((i) => i.rank));
      expect(front.summary).toEqual(back.summary);
      expect(front.totalRevenue).toBeCloseTo(back.totalRevenue, 6);
    });
  }

  it('a função de classificação em si é idêntica em toda a faixa', () => {
    for (let pct = 0; pct <= 100; pct += 0.5) {
      for (const rank of [1, 2, 3, 17]) {
        expect(classifyFront(pct, rank)).toBe(classifyBack(pct, rank));
      }
    }
  });
});

describe('correção do achado: o primeiro colocado é sempre A', () => {
  it('catálogo de um item só é A, não C', () => {
    // Antes da correção: acumulado 100% caía na faixa `> 95` e o produto que
    // gera TODA a receita aparecia no painel como cauda longa.
    expect(buildAbcCurve([{ id: 'p1', revenue: 42 }]).items[0].curve).toBe('A');
    expect(deriveAbcCurve([{ id: 'p1', rev: 42 }]).items[0].curve).toBe('A');
  });

  it('o resumo reflete a correção', () => {
    expect(buildAbcCurve([{ id: 'p1', revenue: 42 }]).summary).toEqual({ A: 1, B: 0, C: 0 });
  });

  it('o segundo colocado NÃO ganha tratamento especial', () => {
    // A correção é mínima de propósito: só o rank 1. Um segundo item que
    // ultrapasse 95% de acumulado continua C — mudar isso reclassificaria
    // relatórios que hoje estão certos.
    const { items } = buildAbcCurve([
      { id: 'p1', revenue: 990 },
      { id: 'p2', revenue: 10 },
    ]);
    expect(items.map((i) => i.curve)).toEqual(['A', 'C']);
  });

  it('distribuição de 3+ itens não mudou de classificação', () => {
    // Regressão: a correção não pode mexer no caso que já estava certo.
    expect(
      buildAbcCurve([
        { id: 'p1', revenue: 800 },
        { id: 'p2', revenue: 150 },
        { id: 'p3', revenue: 50 },
      ]).items.map((i) => i.curve),
    ).toEqual(['A', 'B', 'C']);
  });
});
