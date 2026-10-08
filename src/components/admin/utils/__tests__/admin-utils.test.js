import { describe, expect, it } from 'vitest';

import { categoryLabel, ORPHAN_CATEGORY_LABEL } from '../category-label';
import {
  deriveComparisonDelta,
  deriveFaturamentoSeries,
  deriveMonthlyComparison,
  deriveTicketMedio,
} from '../derive';
import { friendlyAdminError, NETWORK_ERROR_MESSAGE } from '../errors';

describe('categoryLabel (ADM-04/ADM-35)', () => {
  it('nome em formato UUID não é exibido como nome', () => {
    expect(categoryLabel('d8f53f51-0074-41c5-b825-888237692d36')).toBe(ORPHAN_CATEGORY_LABEL);
  });

  it('nome normal passa; vazio vira o fallback', () => {
    expect(categoryLabel('Festa Junina')).toBe('Festa Junina');
    expect(categoryLabel('')).toBe('Sem categoria');
  });
});

describe('friendlyAdminError (ADM-50)', () => {
  it('"Failed to fetch" vira mensagem em português', () => {
    expect(friendlyAdminError(new TypeError('Failed to fetch'))).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('mensagem da API passa intacta; sem mensagem, o fallback', () => {
    expect(friendlyAdminError(new Error('Categoria já existe.'))).toBe('Categoria já existe.');
    expect(friendlyAdminError(null, 'Erro X.')).toBe('Erro X.');
  });
});

describe('derive · barras e rótulos (ADM-15/ADM-20)', () => {
  it('mês sem venda fica sem barra; seis meses zerados viram lista vazia', () => {
    expect(deriveFaturamentoSeries([])).toEqual([]);

    const agora = new Date();
    const serie = deriveFaturamentoSeries([{ totalAmount: 100, completedAt: agora.toISOString() }]);
    expect(serie).toHaveLength(6);
    expect(serie.at(-1).pct).toBe(100);
    expect(serie.slice(0, 5).every((mes) => mes.pct === 0)).toBe(true);
  });

  it('nome do mês só com a 1ª letra maiúscula ("Setembro de 2026")', () => {
    const [anterior] = deriveMonthlyComparison([]);
    expect(anterior.label).toMatch(/^[A-ZÀ-Ú][a-zà-ú]+ de \d{4}$/);
  });
});

describe('derive · variação a partir de zero (ACH-08 de 05/10)', () => {
  const setembroZerado = { label: 'set', gross: 0, qty: 0, avg: 0 };
  const outubro = { label: 'out', gross: 12.9, qty: 1, avg: 12.9 };

  it('mês anterior zerado é "novo", não "+100%"', () => {
    expect(deriveComparisonDelta([setembroZerado, outubro])).toEqual({ pct: 0, trend: 'new' });
    expect(deriveTicketMedio([setembroZerado, outubro])).toMatchObject({ pct: 0, trend: 'new' });
  });

  it('com base diferente de zero, o percentual continua calculado', () => {
    const agosto = { label: 'ago', gross: 10, qty: 1, avg: 10 };
    expect(deriveComparisonDelta([agosto, outubro])).toMatchObject({ trend: 'up' });
    expect(deriveComparisonDelta([agosto, outubro]).pct).toBeCloseTo(29, 0);
  });
});
