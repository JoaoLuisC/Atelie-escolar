import { describe, expect, it } from 'vitest';

import { formatCount, formatCsvPercent, formatPercent, formatRatio } from '../number';

// ════════════════════════════════════════════════════════════════════
// `src/utils/number.js` — regra C3, item P5.2.
//
// O que estas funções absorveram eram 15 expressões inline em 5 abas do admin,
// e uma delas (`AnalysisTab.jsx:455`) já REIMPLEMENTAVA à mão o
// `.replace('.', ',')` de `currency.js`. Duas versões da mesma conversão na
// mesma tela é como uma passa a arredondar diferente da outra.
//
// A decisão que os testes travam não é o formato: é a diferença entre AUSENTE
// e ZERO. Mostrar `0` para dado que não foi medido inventa informação num
// painel de decisão.
// ════════════════════════════════════════════════════════════════════

describe('formatPercent', () => {
  it('uma casa decimal, vírgula e o símbolo', () => {
    expect(formatPercent(12.34)).toBe('12,3%');
    expect(formatPercent(0)).toBe('0,0%');
  });

  it('`withSign` prefixa `+` só em positivo — é variação, a direção é o dado', () => {
    expect(formatPercent(5.5, { withSign: true })).toBe('+5,5%');
    expect(formatPercent(0, { withSign: true })).toBe('+0,0%');
  });

  it('negativo leva o sinal ANTES do número, nunca `+-`', () => {
    expect(formatPercent(-5.5)).toBe('-5,5%');
    expect(formatPercent(-5.5, { withSign: true })).toBe('-5,5%');
  });

  it('respeita o número de casas pedido', () => {
    expect(formatPercent(12.345, { decimals: 2 })).toBe('12,35%');
    expect(formatPercent(12.345, { decimals: 0 })).toBe('12%');
  });

  it('valor ausente vira "—", não "NaN%" nem "0,0%"', () => {
    for (const ausente of [null, undefined, '', 'texto', Number.NaN, Infinity]) {
      expect(formatPercent(ausente)).toBe('—');
    }
  });

  it('o fallback é configurável', () => {
    expect(formatPercent(null, { fallback: 'sem dado' })).toBe('sem dado');
  });
});

describe('formatCount', () => {
  it('separador de milhar pt-BR, sem decimais', () => {
    expect(formatCount(1234)).toBe('1.234');
    expect(formatCount(1234567)).toBe('1.234.567');
    expect(formatCount(1234.9)).toBe('1.235');
  });

  it('ZERO é zero — medimos e não houve', () => {
    expect(formatCount(0)).toBe('0');
  });

  it('AUSENTE é "—" — não medimos, e isso não é a mesma coisa que zero', () => {
    for (const ausente of [null, undefined, '', 'muitos', Number.NaN]) {
      expect(formatCount(ausente)).toBe('—');
    }
  });

  it('string numérica é aceita', () => {
    expect(formatCount('1500')).toBe('1.500');
  });
});

describe('formatRatio', () => {
  it('sufixo `x` — `1,8x` e `1,8%` são leituras diferentes do mesmo número', () => {
    expect(formatRatio(1.83)).toBe('1,8x');
    expect(formatRatio(3)).toBe('3,0x');
  });

  it('ausente vira "—"', () => {
    expect(formatRatio(null)).toBe('—');
    expect(formatRatio('x')).toBe('—');
  });
});

describe('formatCsvPercent', () => {
  it('vírgula decimal e SEM o símbolo', () => {
    // Com o `%`, o Excel pt-BR trata a célula como texto e a coluna deixa de
    // somar — mesma razão de `formatCsvNumber` em currency.js.
    expect(formatCsvPercent(12.34)).toBe('12,3');
    expect(formatCsvPercent(12.34)).not.toContain('%');
  });

  it('ausente vira célula VAZIA, não "—"', () => {
    // Numa planilha, "—" é texto e quebra a soma; vazio é ausência de verdade.
    expect(formatCsvPercent(null)).toBe('');
    expect(formatCsvPercent(undefined)).toBe('');
    expect(formatCsvPercent('texto')).toBe('');
  });
});
