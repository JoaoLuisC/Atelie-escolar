import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

// lib/refund-policy.js — a regra de devolução por download (Termos, seção 7).

const requireCjs = createRequire(import.meta.url);
import {
  installModuleMock,
  resetModuleRegistry,
} from '../../handlers/__tests__/money-path-harness.js';

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

describe('loadDownloadEvidence', () => {
  it('conta pelo MAIOR entre tokens usados e logs; primeira data e IP dos logs', async () => {
    resetModuleRegistry();
    const listTableRows = vi.fn(async (table) =>
      table === 'download_tokens'
        ? [
            { order_id: 'p1', used_at: '2026-10-30T10:00:00.000Z' },
            { order_id: 'p1', used_at: '2026-10-31T10:00:00.000Z' },
          ]
        : [
            {
              order_id: 'p1',
              ip_address: '203.0.113.7',
              downloaded_at: '2026-10-30T10:00:05.000Z',
            },
          ],
    );
    installModuleMock('../../lib/supabase', { serviceRoleHelpers: { listTableRows } });
    const fresh = requireCjs('../refund-policy.js');
    const evidence = await fresh.loadDownloadEvidence(['p1', 'p2']);
    expect(evidence.p1).toEqual({
      count: 2,
      firstAt: '2026-10-30T10:00:00.000Z',
      firstIp: '203.0.113.7',
    });
    expect(evidence.p2).toEqual({ count: 0, firstAt: null, firstIp: '' });
    // Filtra tokens usados, não todos.
    const tokenCall = listTableRows.mock.calls.find(([table]) => table === 'download_tokens');
    expect(tokenCall[1].filters).toContainEqual({ column: 'used', value: true });
    resetModuleRegistry();
  });
});
