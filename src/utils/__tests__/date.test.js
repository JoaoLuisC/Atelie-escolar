import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, toDateSafe } from '../date';

describe('toDateSafe', () => {
  it('ausente é null, não 31/12/1969', () => {
    expect(toDateSafe(null)).toBeNull();
    expect(toDateSafe(undefined)).toBeNull();
    expect(toDateSafe('')).toBeNull();
  });

  it('inválido é null; válido é Date', () => {
    expect(toDateSafe('não é data')).toBeNull();
    expect(toDateSafe('2026-08-13T12:47:00.000Z')).toBeInstanceOf(Date);
    expect(toDateSafe(0)).toBeInstanceOf(Date);
  });
});

describe('formatDate / formatDateTime', () => {
  it('ausente ou inválido vira "-"', () => {
    for (const value of [null, undefined, '', 'xyz']) {
      expect(formatDate(value)).toBe('-');
      expect(formatDateTime(value)).toBe('-');
    }
  });

  it('válido sai em pt-BR', () => {
    expect(formatDate('2026-08-13T12:47:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(formatDateTime('2026-08-13T12:47:00.000Z')).toMatch(
      /^\d{2}\/\d{2}\/2026,? \d{2}:\d{2}$/,
    );
  });
});
