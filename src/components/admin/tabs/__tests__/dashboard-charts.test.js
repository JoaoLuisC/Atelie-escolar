import { describe, expect, it } from 'vitest';

import {
  DONUT_PALETTE,
  donutArcPath,
  donutSegments,
  formatPct,
  polarToCartesian,
  revenueChartGeometry,
  sparklineGeometry,
} from '../dashboard-charts';

// ════════════════════════════════════════════════════════════════════
// A matemática dos gráficos do painel — as bordas que ninguém via.
//
// Estas funções viviam dentro de `DashboardTab.jsx` e por isso nunca foram
// exercitadas com o caso difícil. O sintoma de um erro aqui não é exceção nem
// tela em branco: é um gráfico **plausível e errado**, em cima do qual alguém
// decide preço e estoque. Daí o recorte dos casos: período todo zerado, uma
// entrada só, e fatia maior que meia volta.
// ════════════════════════════════════════════════════════════════════

describe('formatPct', () => {
  it('usa uma casa decimal abaixo de 10% e inteiro acima', () => {
    expect(formatPct(8.34)).toBe('+8.3%');
    expect(formatPct(12.4)).toBe('+12%');
  });

  it('não põe sinal em queda — o `-` já diz tudo', () => {
    expect(formatPct(-8.3)).toBe('-8.3%');
    expect(formatPct(-12.4)).toBe('-12%');
  });

  it('omite o sinal quando pedido, e trata zero como neutro', () => {
    expect(formatPct(8.3, { withSign: false })).toBe('8.3%');
    expect(formatPct(0)).toBe('0%');
  });

  it('devolve 0% para valor não finito em vez de "NaN%"', () => {
    // `Number(undefined)`/divisão por zero chegam aqui na vida real; imprimir
    // "NaN%" num KPI é pior que imprimir 0%, porque parece defeito de tela.
    for (const entrada of [undefined, null, NaN, Infinity, 'x']) {
      expect(formatPct(entrada)).toBe('0%');
    }
  });
});

describe('sparklineGeometry', () => {
  it('devolve null sem dado — o card some, não desenha linha vazia', () => {
    expect(sparklineGeometry([])).toBeNull();
    expect(sparklineGeometry()).toBeNull();
  });

  it('espalha os pontos de 0 a 100 no eixo x', () => {
    const { points } = sparklineGeometry([0, 5, 10]);
    const xs = points.split(' ').map((p) => Number(p.split(',')[0]));
    expect(xs).toEqual([0, 50, 100]);
  });

  it('inverte o eixo y: valor maior fica mais alto (y menor)', () => {
    const { points } = sparklineGeometry([1, 10]);
    const ys = points.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBe(0);
  });

  it('não divide por zero num período inteiro zerado', () => {
    // O guarda `Math.max(1, ...)` faz a linha correr na base. Sem ele, todo
    // ponto vira NaN e o `<polyline>` desaparece sem erro no console.
    const { points } = sparklineGeometry([0, 0, 0]);
    expect(points).toBe('0,100 50,100 100,100');
  });

  it('sobrevive a um ponto só (denominador n-1)', () => {
    const { points } = sparklineGeometry([7]);
    expect(points).toBe('0,0');
  });

  it('fecha a área voltando à base', () => {
    const { areaPath } = sparklineGeometry([1, 2]);
    expect(areaPath.startsWith('M0,100 L')).toBe(true);
    expect(areaPath.endsWith('L100,100 Z')).toBe(true);
  });
});

describe('revenueChartGeometry', () => {
  const entradas = [
    { label: 'Seg', value: 100 },
    { label: 'Ter', value: 200 },
    { label: 'Qua', value: 0 },
  ];

  it('devolve null sem entrada — quem mostra o vazio é o componente', () => {
    expect(revenueChartGeometry([])).toBeNull();
    expect(revenueChartGeometry(null)).toBeNull();
  });

  it('gera um ponto por entrada, com rótulo e valor preservados', () => {
    const { points } = revenueChartGeometry(entradas);
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.label)).toEqual(['Seg', 'Ter', 'Qua']);
    expect(points.map((p) => p.value)).toEqual([100, 200, 0]);
  });

  it('reserva margem no topo para o marcador do máximo não ser cortado', () => {
    const { points } = revenueChartGeometry(entradas);
    const maximo = points[1];
    // 100 - 85 - 5 = 10: acima de zero de propósito.
    expect(maximo.y).toBeCloseTo(10, 5);
    expect(maximo.y).toBeGreaterThan(0);
  });

  it('centraliza a entrada única em vez de dividir por zero', () => {
    const { points } = revenueChartGeometry([{ label: 'Hoje', value: 50 }]);
    expect(points[0].x).toBe(50);
    expect(Number.isFinite(points[0].y)).toBe(true);
  });

  it('trata valor ausente como zero, sem NaN no caminho', () => {
    const { linePath } = revenueChartGeometry([
      { label: 'a', value: null },
      { label: 'b' },
      { label: 'c', value: 10 },
    ]);
    expect(linePath).not.toMatch(/NaN/);
  });

  it('fecha a área na base, do último ao primeiro ponto', () => {
    const { areaPath, points } = revenueChartGeometry(entradas, { width: 100, height: 100 });
    expect(areaPath).toContain(`L${points[points.length - 1].x},100`);
    expect(areaPath.endsWith(`L${points[0].x},100 Z`)).toBe(true);
  });
});

describe('donutSegments', () => {
  const entradas = [
    { label: 'Apostilas', value: 700 },
    { label: 'Jogos', value: 300 },
  ];

  it('devolve total e fatias, com a participação de cada uma', () => {
    const { total, segments } = donutSegments(entradas);
    expect(total).toBe(1000);
    expect(segments.map((s) => Math.round(s.sharePct))).toEqual([70, 30]);
  });

  it('encadeia os ângulos e fecha a volta completa', () => {
    // A propriedade que importa: o fim de uma fatia é o começo da próxima, e a
    // última termina em 360°. Sem isso sobra (ou falta) um pedaço na rosca.
    const { segments } = donutSegments(entradas);
    expect(segments[0].startAngle).toBe(0);
    expect(segments[0].endAngle).toBeCloseTo(segments[1].startAngle, 10);
    expect(segments[segments.length - 1].endAngle).toBeCloseTo(360, 10);
  });

  it('preserva os campos originais da entrada', () => {
    const { segments } = donutSegments([{ label: 'X', value: 1, extra: 'preservado' }]);
    expect(segments[0].extra).toBe('preservado');
  });

  it('cicla a paleta quando há mais categorias que cores', () => {
    const muitas = Array.from({ length: DONUT_PALETTE.length + 2 }, (_, i) => ({
      label: `c${i}`,
      value: 1,
    }));
    const { segments } = donutSegments(muitas);
    expect(segments[DONUT_PALETTE.length].color).toBe(DONUT_PALETTE[0]);
    expect(segments[DONUT_PALETTE.length + 1].color).toBe(DONUT_PALETTE[1]);
  });

  it('devolve conjunto vazio sem entrada', () => {
    expect(donutSegments([])).toEqual({ total: 0, segments: [] });
    expect(donutSegments(null)).toEqual({ total: 0, segments: [] });
  });
});

describe('donutArcPath / polarToCartesian', () => {
  it('põe 0° no topo do círculo', () => {
    const { x, y } = polarToCartesian(0, 38);
    expect(x).toBeCloseTo(50, 10);
    expect(y).toBeCloseTo(12, 10);
  });

  it('avança no sentido horário: 90° é a direita', () => {
    const { x, y } = polarToCartesian(90, 38);
    expect(x).toBeCloseTo(88, 10);
    expect(y).toBeCloseTo(50, 10);
  });

  it('marca largeArc em fatia acima de meia volta', () => {
    // Sem este flag, uma categoria com mais de 50% da receita é desenhada pelo
    // caminho curto e aparece como a MENOR fatia — gráfico plausível e errado.
    const grande = donutArcPath(0, 270);
    const pequena = donutArcPath(0, 90);
    expect(grande).toMatch(/A 38 38 0 1 0/);
    expect(pequena).toMatch(/A 38 38 0 0 0/);
  });

  it('desenha o anel: arco externo, corte e arco interno', () => {
    const path = donutArcPath(0, 120);
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain('A 38 38');
    expect(path).toContain('A 24 24'); // 38 - 14 de espessura
    expect(path.endsWith('Z')).toBe(true);
    expect(path).not.toMatch(/NaN/);
  });
});
