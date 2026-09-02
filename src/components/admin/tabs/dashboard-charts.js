// ════════════════════════════════════════════════════════════════════
// GEOMETRIA DOS GRÁFICOS DO PAINEL — a matemática, fora do JSX.
//
// POR QUE ESTE ARQUIVO EXISTE
// `DashboardTab.jsx` tinha 819 linhas e nenhum teste. Dentro dele, três
// blocos de trigonometria e escala convertiam números de faturamento em
// coordenadas SVG: sparkline, linha de receita e rosca de categorias.
//
// É código com todos os modos de falha clássicos — divisão por zero quando o
// período inteiro vendeu zero, um ponto só (denominador `n - 1`), fatia maior
// que meia volta no arco, acumulado que não fecha 360° — e ele estava
// inalcançável para teste, porque só existia dentro de componentes que suíte
// nenhuma montava. O sintoma de um erro aqui não é exceção: é um gráfico
// plausível e errado, em cima do qual alguém decide preço e estoque.
//
// Fica junto do componente (regra C4), como `admin/utils/derive.js`.
//
// ⚠️ MOVE, não reescrita. O comportamento é o que já estava lá, incluindo os
// guardas `Math.max(1, ...)` que evitam divisão por zero devolvendo um eixo
// achatado em vez de `NaN`. `DashboardTab.test.jsx` foi escrito ANTES da
// extração e é a prova de que nada mudou na tela.
// ════════════════════════════════════════════════════════════════════

export const DONUT_PALETTE = Object.freeze([
  '#7c3aed',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#64748b',
]);

/**
 * Percentual para leitura humana: uma casa decimal abaixo de 10%, inteiro
 * acima. O `+` só aparece no positivo — em queda o próprio `-` já sinaliza.
 */
export function formatPct(value, { withSign = true } = {}) {
  if (!Number.isFinite(value)) return '0%';
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const sign = withSign && rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

/**
 * Pontos da sparkline dos cards de KPI, em viewBox 0–100.
 *
 * `Math.max(1, ...values)` é o guarda que faz um período todo zerado desenhar
 * uma linha na base em vez de `NaN` — sem ele o `<polyline>` some sem aviso.
 *
 * @returns {{points: string, areaPath: string}|null} `null` quando não há dado.
 */
export function sparklineGeometry(values = []) {
  if (!values.length) return null;

  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return { points, areaPath: `M0,100 L${points.replaceAll(' ', ' L')} L100,100 Z` };
}

/**
 * Linha de receita do período, em viewBox 0–100.
 *
 * O `* 0.85 - 5` reserva margem no topo para o marcador do valor máximo não
 * ser cortado pela borda do viewBox. Com uma entrada só, o ponto vai ao centro
 * — dividir por `n - 1` seria divisão por zero.
 *
 * @returns {{points: Array, linePath: string, areaPath: string}|null}
 */
export function revenueChartGeometry(entries, { width = 100, height = 100 } = {}) {
  if (!entries || entries.length === 0) return null;

  const values = entries.map((entry) => Number(entry.value || 0));
  const max = Math.max(1, ...values);
  const stepX = entries.length > 1 ? width / (entries.length - 1) : width;

  const points = values.map((value, index) => ({
    x: entries.length > 1 ? index * stepX : width / 2,
    y: height - (value / max) * height * 0.85 - 5,
    value,
    label: entries[index].label,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  return { points, linePath, areaPath };
}

/**
 * Fatias da rosca de categorias, com ângulo inicial/final e participação.
 *
 * A soma acumulada é calculada de uma vez, e não mutando um `let` dentro do
 * `map`: além de o React Compiler acusar a reatribuição, a versão sem mutação
 * diz o que faz. `entries` é a lista de categorias (meia dúzia), então o custo
 * quadrático é irrelevante.
 */
export function donutSegments(entries, palette = DONUT_PALETTE) {
  if (!entries || entries.length === 0) return { total: 0, segments: [] };

  const values = entries.map((entry) => Number(entry.value || 0));
  const total = values.reduce((soma, valor) => soma + valor, 0);
  const acumuladoAntes = values.map((_, index) =>
    values.slice(0, index).reduce((soma, valor) => soma + valor, 0),
  );

  const segments = entries.map((entry, index) => ({
    ...entry,
    color: palette[index % palette.length],
    startAngle: (acumuladoAntes[index] / total) * 360,
    endAngle: ((acumuladoAntes[index] + values[index]) / total) * 360,
    sharePct: total ? (values[index] / total) * 100 : 0,
  }));

  return { total, segments };
}

/** Ponto na circunferência. 0° é o topo (daí o `- 90`), sentido horário. */
export function polarToCartesian(angleDegrees, radius, { cx = 50, cy = 50 } = {}) {
  const angleRad = ((angleDegrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(angleRad), y: cy + radius * Math.sin(angleRad) };
}

/**
 * Caminho SVG de uma fatia da rosca (arco externo, corte, arco interno).
 *
 * `largeArc` é o flag que o SVG exige para fatias acima de meia volta: sem
 * ele, uma categoria com mais de 50% da receita é desenhada pelo caminho
 * curto e aparece como a MENOR fatia do gráfico.
 */
export function donutArcPath(
  startAngle,
  endAngle,
  { radius = 38, thickness = 14, cx = 50, cy = 50 } = {},
) {
  const centro = { cx, cy };
  const innerRadius = radius - thickness;

  const start = polarToCartesian(endAngle, radius, centro);
  const end = polarToCartesian(startAngle, radius, centro);
  const startInner = polarToCartesian(endAngle, innerRadius, centro);
  const endInner = polarToCartesian(startAngle, innerRadius, centro);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
}
