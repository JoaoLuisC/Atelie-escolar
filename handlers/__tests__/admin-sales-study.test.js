import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  createSupabaseStore,
  installModuleMock,
  installPartialMock,
  installRateLimitPassthrough,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// /api/admin/sales-study — Vendas → Estudo de vendas.

let store;
let logAdminAction;
let generateInsights;

function arrange({ orders = [], settings = [] } = {}) {
  store = createSupabaseStore({
    analytics_events: [],
    orders,
    order_items: [],
    products: [],
    categories: [],
    settings,
  });
  installSupabaseMock(store);
  installRateLimitPassthrough();
  installModuleMock('../../lib/admin-session', {
    ensureAdminSession: () => true,
    ensureStoreSession: () => true,
  });
  logAdminAction = vi.fn(async () => {});
  installModuleMock('../../lib/admin-audit', { logAdminAction });
  generateInsights = vi.fn(async () => ({
    model: 'gemini-2.5-flash',
    insights: { resumo: 'ok', destaques: [], pontosDeAtencao: [], acoes: [], confianca: 'media' },
  }));
  installPartialMock('../../lib/sales-study', { generateInsights });
  return loadHandler('../admin/sales-study.js');
}

function pedidosAprovados(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    payment_status: 'approved',
    total_amount: 20,
    customer_email: `c${i}@x.com`,
    attribution_data: {},
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

beforeEach(() => {
  resetModuleRegistry();
  vi.stubEnv('GEMINI_API_KEY', 'chave-de-teste');
});

afterEach(() => {
  resetModuleRegistry();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('admin/sales-study', () => {
  it('GET devolve a última análise salva, sem gastar a IA', async () => {
    const handler = arrange({
      settings: [{ setting_key: 'salesStudy', setting_value: { generatedAt: 'x', days: 30 } }],
    });
    const res = createMockRes();

    await handler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.study).toMatchObject({ days: 30 });
    expect(res.body.aiConfigured).toBe(true);
    expect(generateInsights).not.toHaveBeenCalled();
  });

  it('POST com poucos dados não chama a IA, mas salva os números e audita', async () => {
    const handler = arrange({ orders: pedidosAprovados(1) });
    const res = createMockRes();

    await handler({ method: 'POST', query: {}, headers: {}, body: { days: 30 } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.study.aiError).toBe('INSUFFICIENT_DATA');
    expect(res.body.study.data.periodoAtual.pedidosAprovados).toBe(1);
    expect(generateInsights).not.toHaveBeenCalled();
    expect(store.rows('settings')[0].setting_key).toBe('salesStudy');
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'generate', targetType: 'sales_study' }),
    );
  });

  it('POST com dados suficientes traz a leitura da IA', async () => {
    const handler = arrange({ orders: pedidosAprovados(4) });
    const res = createMockRes();

    await handler({ method: 'POST', query: {}, headers: {}, body: { days: 30 } }, res);

    expect(generateInsights).toHaveBeenCalledTimes(1);
    expect(res.body.study.insights.resumo).toBe('ok');
    expect(res.body.study.aiError).toBeNull();
  });

  it('IA fora do ar não derruba a resposta: os números saem com o aviso', async () => {
    const handler = arrange({ orders: pedidosAprovados(4) });
    generateInsights.mockRejectedValue(Object.assign(new Error('x'), { code: 'AI_QUOTA' }));
    const res = createMockRes();

    await handler({ method: 'POST', query: {}, headers: {}, body: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.study.aiError).toBe('AI_QUOTA');
    expect(res.body.study.aiMessage).toMatch(/cota/);
    expect(res.body.study.insights).toBeNull();
  });

  it('só GET e POST', async () => {
    const handler = arrange();
    const res = createMockRes();

    await handler({ method: 'DELETE', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(405);
  });
});
