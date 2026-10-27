import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  expectApiError,
  installModuleMock,
  installPartialMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// POST /api/admin/ai-assist — só com sessão da loja, só tarefa conhecida, e
// cada falha da IA vira uma mensagem que a professora entende.

let runAiAssist;
let enforceRateLimit;
let authorized;
let handler;

function post(body) {
  return { method: 'POST', headers: {}, body };
}

beforeEach(() => {
  resetModuleRegistry();
  authorized = true;
  installModuleMock('../../lib/admin-session', {
    ensureStoreSession: vi.fn((_req, res) => {
      if (!authorized) res.status(401).json({ success: false, error: { code: 'X' } });
      return authorized;
    }),
  });
  installModuleMock('../../lib/admin-audit', { logAdminAction: vi.fn(async () => {}) });
  installPartialMock('../../lib/supabase', { getSupabaseConfig: () => ({ url: 'https://stub' }) });
  enforceRateLimit = vi.fn(async () => ({ blocked: false }));
  installModuleMock('../../lib/rate-limit', { enforceRateLimit });
  runAiAssist = vi.fn(async () => ({ model: 'm', suggestion: { descricao: 'ok' } }));
  installModuleMock('../../lib/ai-assist', {
    TASK_NAMES: ['productCopy', 'productSeo', 'homeCopy'],
    runAiAssist,
  });
  handler = loadHandler('../admin/ai-assist.js');
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

async function call(body) {
  const res = createMockRes();
  await handler(post(body), res);
  return res;
}

describe('admin/ai-assist', () => {
  it('devolve a sugestão da tarefa pedida', async () => {
    const res = await call({ task: 'productCopy', input: { name: 'Painel' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ task: 'productCopy', suggestion: { descricao: 'ok' } });
    expect(enforceRateLimit).toHaveBeenCalled();
  });

  it('sem sessão da loja não chama a IA', async () => {
    authorized = false;
    await call({ task: 'productCopy', input: { name: 'Painel' } });
    expect(runAiAssist).not.toHaveBeenCalled();
  });

  it('tarefa desconhecida e produto sem nome: 400 antes da IA', async () => {
    expectApiError(await call({ task: 'qualquer' }), { status: 400, code: 'VALIDATION_FAILED' });
    expectApiError(await call({ task: 'productSeo', input: {} }), {
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(runAiAssist).not.toHaveBeenCalled();
  });

  it.each([
    ['AI_QUOTA', 429, 'RATE_LIMITED'],
    ['AI_NOT_CONFIGURED', 503, 'SERVICE_UNAVAILABLE'],
    ['AI_FAILED', 503, 'SERVICE_UNAVAILABLE'],
  ])('%s vira %s com mensagem amigável', async (aiCode, status, code) => {
    runAiAssist.mockRejectedValueOnce(Object.assign(new Error('x'), { code: aiCode }));
    const res = await call({ task: 'homeCopy', input: {} });
    expectApiError(res, { status, code });
  });
});
