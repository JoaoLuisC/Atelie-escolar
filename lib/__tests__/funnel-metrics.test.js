import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// lib/funnel-metrics.js — os cálculos do funil compartilhados pela aba Funil e
// pelo Estudo de vendas.

const { FUNNEL_STEPS, bucketBySessionAndEvent, buildFunnel, buildAttribution } = createRequire(
  import.meta.url,
)('../funnel-metrics.js');

describe('funil', () => {
  it('conta sessões distintas por etapa e a conversão da anterior', () => {
    const sessions = bucketBySessionAndEvent([
      { event_name: 'view_catalog', session_id: 'a' },
      { event_name: 'view_catalog', session_id: 'a' },
      { event_name: 'view_catalog', session_id: 'b' },
      { event_name: 'view_item', session_id: 'a' },
      { event_name: 'view_item', session_id: '' },
    ]);

    const funil = buildFunnel(sessions, 1);

    expect(funil.map((s) => s.key)).toEqual(FUNNEL_STEPS.map((s) => s.key));
    expect(funil.map((s) => s.count)).toEqual([2, 1, 0, 0, 1]);
    expect(funil[1].conversionFromPrevious).toBe(0.5);
    expect(funil[3].conversionFromPrevious).toBe(0);
  });

  it('atribuição soma só pedidos aprovados, por origem', () => {
    const { items, totalRevenue, totalApproved } = buildAttribution([
      {
        payment_status: 'approved',
        total_amount: 30,
        attribution_data: { utm_source: 'Instagram' },
      },
      { payment_status: 'approved', total_amount: 10, attribution_data: {} },
      { payment_status: 'pending', total_amount: 99, attribution_data: { utm_source: 'tiktok' } },
    ]);

    expect(totalApproved).toBe(2);
    expect(totalRevenue).toBe(40);
    expect(items.map((i) => [i.source, i.revenue])).toEqual([
      ['instagram', 30],
      ['direct', 10],
    ]);
  });
});
