import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// Datas do cupom vindas só como "AAAA-MM-DD": o início vale desde 00:00 e o
// fim até 23:59:59, no horário de Brasília. Antes as duas viravam 23:59, e o
// cupom não valia no próprio dia de início.

const requireCjs = createRequire(import.meta.url);
const { couponCreateSchema } = requireCjs('../admin.schemas.js');

describe('couponCreateSchema · datas', () => {
  it('início = 00:00 e fim = 23:59:59 de Brasília', () => {
    const parsed = couponCreateSchema.parse({
      code: 'NATAL',
      discountValue: 10,
      validFrom: '2026-12-01',
      validUntil: '2026-12-31',
    });
    expect(parsed.validFrom).toBe('2026-12-01T03:00:00.000Z');
    expect(parsed.validUntil).toBe('2027-01-01T02:59:59.999Z');
  });
});
