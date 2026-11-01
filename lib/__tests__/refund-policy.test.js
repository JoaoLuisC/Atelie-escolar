import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// lib/refund-policy.js — a regra de devolução por download (Termos, seção 7).

const requireCjs = createRequire(import.meta.url);
const { decideRefundFlow, validateRefundReason } = requireCjs('../refund-policy.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-01T12:00:00.000Z');
const order = (daysAgo) => ({ completed_at: new Date(NOW - daysAgo * DAY).toISOString() });

describe('decideRefundFlow', () => {
  it('até 7 dias e sem download: simples, com o prazo final', () => {
    expect(decideRefundFlow({ order: order(6.9), evidence: { count: 0 }, now: NOW })).toEqual({
      flow: 'simple',
      reason: 'ok',
      deadline: new Date(NOW - 6.9 * DAY + 7 * DAY).toISOString(),
    });
  });

  it('qualquer download vira suporte, mesmo no primeiro dia', () => {
    expect(decideRefundFlow({ order: order(0.1), evidence: { count: 1 }, now: NOW }).flow).toBe(
      'support',
    );
  });

  it('mais de 7 dias sem download: suporte por prazo', () => {
    expect(decideRefundFlow({ order: order(7.1), evidence: { count: 0 }, now: NOW })).toMatchObject(
      {
        flow: 'support',
        reason: 'expired',
      },
    );
  });

  it('sem completed_at, o prazo conta do created_at', () => {
    const created = { created_at: new Date(NOW - 8 * DAY).toISOString() };
    expect(decideRefundFlow({ order: created, evidence: { count: 0 }, now: NOW }).flow).toBe(
      'support',
    );
  });
});

describe('validateRefundReason', () => {
  it('simples: motivo opcional, categoria padrão desistência', () => {
    expect(validateRefundReason('simple', {})).toEqual({
      ok: true,
      category: 'desistencia',
      reason: '',
    });
    expect(validateRefundReason('simple', { reasonCategory: 'inventada' }).ok).toBe(false);
  });

  it('suporte: exige categoria de suporte e descrição de 20+ caracteres', () => {
    expect(validateRefundReason('support', { reason: 'x'.repeat(40) }).ok).toBe(false);
    expect(
      validateRefundReason('support', { reasonCategory: 'desistencia', reason: 'x'.repeat(40) }).ok,
    ).toBe(false);
    expect(validateRefundReason('support', { reasonCategory: 'defeito', reason: 'curto' }).ok).toBe(
      false,
    );
    expect(
      validateRefundReason('support', {
        reasonCategory: 'defeito',
        reason: ' Faltam páginas 3 a 5 ',
      }),
    ).toEqual({ ok: true, category: 'defeito', reason: 'Faltam páginas 3 a 5' });
  });
});
