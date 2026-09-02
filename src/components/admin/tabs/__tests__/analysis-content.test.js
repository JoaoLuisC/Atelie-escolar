import { describe, expect, it } from 'vitest';

import {
  CURVE_STYLES,
  EXPLANATIONS,
  PERIOD_OPTIONS,
  RELATIONSHIP_STYLES,
  SECTION_TONES,
  cellTone,
} from '../analysis-content';

// ════════════════════════════════════════════════════════════════════
// O conteúdo da aba de análise — forma e escala.
//
// O texto em si é decisão editorial e não se trava em teste: mudar uma frase
// não pode quebrar o CI. O que se trava é a FORMA, porque o componente indexa
// esses objetos por chave e renderiza os campos direto:
// `EXPLANATIONS[explainKey].how` alimenta uma seção do modal, e uma chave sem
// `how` renderiza uma seção vazia sem erro nenhum no console — some do modal
// e ninguém percebe até alguém abrir e não achar a explicação.
//
// A escala do heatmap é a única lógica aqui, e ela merece teste próprio: são
// seis degraus, e o erro clássico é o `>=` de fronteira — 50% caindo na faixa
// de 30%, o que faz uma coorte excelente parecer mediana.
// ════════════════════════════════════════════════════════════════════

describe('cellTone · escala do heatmap de retenção', () => {
  it('acerta cada fronteira, e não a faixa de baixo', () => {
    // Exatamente nos limites: é onde um `>` no lugar de `>=` se esconde.
    expect(cellTone(50)).toBe('bg-emerald-500 text-white');
    expect(cellTone(30)).toBe('bg-emerald-300 text-emerald-900');
    expect(cellTone(15)).toBe('bg-amber-200 text-amber-900');
    expect(cellTone(5)).toBe('bg-orange-200 text-orange-900');
  });

  it('separa retenção nenhuma de retenção mínima', () => {
    // 0,1% e 0% precisam ser visualmente distintos: o primeiro é uma coorte
    // que voltou pouco, o segundo é uma que não voltou. Colapsar os dois faz
    // a tabela mentir sobre o pior caso.
    expect(cellTone(0.1)).toBe('bg-slate-200 text-slate-700');
    expect(cellTone(0)).toBe('bg-slate-50 text-slate-400');
  });

  it('é monotônica: retenção maior nunca recebe tom mais fraco', () => {
    const tons = [0, 1, 5, 10, 15, 25, 30, 45, 50, 80, 100].map(cellTone);
    const distintos = [...new Set(tons)];
    // Seis degraus, e a sequência não volta atrás — cada tom novo aparece uma
    // vez só, em ordem.
    expect(distintos).toHaveLength(6);
    expect(tons).toEqual([...tons].sort((a, b) => distintos.indexOf(a) - distintos.indexOf(b)));
  });
});

describe('EXPLANATIONS · forma que o modal consome', () => {
  const CHAVES = ['products', 'customers', 'cohort'];

  it('cobre os três gráficos que têm botão de explicação', () => {
    expect(Object.keys(EXPLANATIONS).sort()).toEqual([...CHAVES].sort());
  });

  it.each(CHAVES)('%s tem título, intro e as três seções do modal', (chave) => {
    const item = EXPLANATIONS[chave];

    expect(item.title).toBeTruthy();
    expect(item.intro).toBeTruthy();
    // `how`, `observe` e `act` viram as três seções. Faltando uma, a seção
    // renderiza vazia — sem erro, sem aviso, sem conteúdo.
    for (const secao of ['how', 'observe', 'act']) {
      expect(Array.isArray(item[secao]), `${chave}.${secao} não é lista`).toBe(true);
      expect(item[secao].length, `${chave}.${secao} está vazia`).toBeGreaterThan(0);
      expect(item[secao].every((linha) => typeof linha === 'string' && linha.trim())).toBe(true);
    }
  });
});

describe('tabelas de estilo', () => {
  it('cobre as três classes da curva ABC, com rótulo e descrição', () => {
    expect(Object.keys(CURVE_STYLES)).toEqual(['A', 'B', 'C']);
    for (const classe of ['A', 'B', 'C']) {
      expect(CURVE_STYLES[classe]).toMatchObject({
        label: classe,
        desc: expect.any(String),
        chip: expect.any(String),
        bar: expect.any(String),
      });
    }
  });

  it('cobre os três tipos de relacionamento que o backend classifica', () => {
    // As chaves precisam bater com `relationshipSummary` de
    // /api/admin/abc-customers; uma chave a mais aqui é card que nunca
    // aparece, uma a menos é cliente que desaparece do resumo.
    expect(Object.keys(RELATIONSHIP_STYLES).sort()).toEqual(['eventual', 'recorrente', 'vip']);
  });

  it('os tons de seção cobrem os usados pelo modal', () => {
    expect(Object.keys(SECTION_TONES).sort()).toEqual(['amber', 'emerald', 'slate']);
  });

  it('os períodos são os que o backend aceita', () => {
    expect(PERIOD_OPTIONS.map((opcao) => opcao.value)).toEqual(['month', 'quarter', 'year']);
    expect(PERIOD_OPTIONS.every((opcao) => opcao.label)).toBe(true);
  });
});
