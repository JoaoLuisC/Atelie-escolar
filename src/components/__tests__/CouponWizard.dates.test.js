import { describe, expect, it } from 'vitest';

import { endOfLocalDayIso, toDateInputValue } from '../CouponWizard';

// ════════════════════════════════════════════════════════════════════
// ADM-39 da validação de 2026-10-01: a validade do cupom aparecia um dia
// antes e RECUAVA mais um dia a cada edição salva sem mudança (31/12 → 30 →
// 29). A data do `<input type="date">` ia crua e virava meia-noite UTC. A
// propriedade que importa é a ida e volta: salvar e reabrir dá o mesmo dia.
// ════════════════════════════════════════════════════════════════════

describe('validade do cupom (ADM-39)', () => {
  it('ida e volta preserva o dia escolhido, por várias edições seguidas', () => {
    let campo = '2026-12-31';
    for (let edicao = 0; edicao < 3; edicao += 1) {
      campo = toDateInputValue(endOfLocalDayIso(campo));
    }
    expect(campo).toBe('2026-12-31');
  });

  it('a data escolhida vale até o FIM daquele dia (horário local)', () => {
    const fim = new Date(endOfLocalDayIso('2026-12-31'));
    expect(fim.getFullYear()).toBe(2026);
    expect(fim.getMonth()).toBe(11);
    expect(fim.getDate()).toBe(31);
    expect(fim.getHours()).toBe(23);
    expect(fim.getMinutes()).toBe(59);
  });

  it('campo vazio = sem expiração', () => {
    expect(endOfLocalDayIso('')).toBeNull();
    expect(toDateInputValue(null)).toBe('');
  });
});
