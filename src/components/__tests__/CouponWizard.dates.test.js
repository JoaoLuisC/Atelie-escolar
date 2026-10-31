import { describe, expect, it } from 'vitest';

import { endOfBrtDayIso, startOfBrtDayIso, toDateInputValue } from '../CouponWizard';

// ════════════════════════════════════════════════════════════════════
// ADM-39 da validação de 2026-10-01: a validade do cupom aparecia um dia
// antes e RECUAVA mais um dia a cada edição salva sem mudança (31/12 → 30 →
// 29). A data do `<input type="date">` ia crua e virava meia-noite UTC. A
// propriedade que importa é a ida e volta: salvar e reabrir dá o mesmo dia.
// As datas valem no horário de Brasília, em qualquer fuso do navegador.
// ════════════════════════════════════════════════════════════════════

describe('validade do cupom (ADM-39)', () => {
  it('ida e volta preserva o dia escolhido, por várias edições seguidas', () => {
    let fim = '2026-12-31';
    let inicio = '2026-11-01';
    for (let edicao = 0; edicao < 3; edicao += 1) {
      fim = toDateInputValue(endOfBrtDayIso(fim));
      inicio = toDateInputValue(startOfBrtDayIso(inicio));
    }
    expect(fim).toBe('2026-12-31');
    expect(inicio).toBe('2026-11-01');
  });

  it('o fim vale até 23:59:59 e o início desde 00:00, horário de Brasília', () => {
    expect(endOfBrtDayIso('2026-12-31')).toBe('2027-01-01T02:59:59.999Z');
    expect(startOfBrtDayIso('2026-11-01')).toBe('2026-11-01T03:00:00.000Z');
  });

  it('campo vazio = sem limite', () => {
    expect(endOfBrtDayIso('')).toBeNull();
    expect(startOfBrtDayIso('')).toBeNull();
    expect(toDateInputValue(null)).toBe('');
  });
});
