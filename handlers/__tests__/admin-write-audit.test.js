import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  installModuleMock,
  installSecurityLoggerMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// Auditoria dos dois writers admin que NÃO passam pela factory.
//
// `logAdminAction` chegava aos 5 recursos CRUD pela factory
// (lib/admin-resource-handler.js) e a handlers/admin/settings.js pelo próprio
// arquivo. Estes dois ficaram de fora, e os dois APAGAM dado:
//
//   • cleanup-events — purga `analytics_events` com mais de 180 dias, via RPC.
//     Irreversível, e sem linha de audit não havia como saber quem mandou.
//   • upload-url — emite o token que autoriza a gravação no Storage e, na
//     confirmação, APAGA o objeto que violou a política.
//
// O teste afirma sobre a CHAMADA que o handler faz, não sobre o texto do
// arquivo: é a distinção que o rate limit do login de cliente ensinou (a
// suíte ficou verde enquanto a guarda estava fora do módulo servido).
//
// O par negativo é tão importante quanto o positivo: requisição barrada por
// método ou por sessão não pode gravar linha nenhuma. Audit log que registra
// tentativa recusada como se fosse ação executada é pior que ausente — ele
// mente na hora em que alguém precisa dele.
// ════════════════════════════════════════════════════════════════════

let auditCalls = [];

function installAuditSpy() {
  auditCalls = [];
  installModuleMock('../../lib/admin-audit', {
    logAdminAction: vi.fn(async (entry) => {
      auditCalls.push(entry);
    }),
  });
}

function installAdminSession({ authorized = true } = {}) {
  installModuleMock('../../lib/admin-session', {
    ensureAdminSession: vi.fn(() => authorized),
    setAdminCorsHeaders: () => {},
    getAdminIdentity: () => 'admin@teste.com',
  });
}

const SUPABASE_CONFIG = {
  url: 'https://projeto-teste.supabase.co',
  anonKey: 'anon-de-teste',
  serviceRoleKey: 'service-role-de-teste',
};

beforeEach(() => {
  resetModuleRegistry();
  installAuditSpy();
  installSecurityLoggerMock();
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── handlers/admin/cleanup-events.js ────────────────────────────────

describe('admin/cleanup-events · purga de analytics no audit log', () => {
  function installSupabase(rpcResult) {
    const supabaseRequest = vi.fn(async () => rpcResult);
    installModuleMock('../../lib/supabase', {
      getSupabaseConfig: () => SUPABASE_CONFIG,
      supabaseRequest,
    });
    return supabaseRequest;
  }

  async function run(req, { authorized = true, rpcResult = 0 } = {}) {
    installAdminSession({ authorized });
    const supabaseRequest = installSupabase(rpcResult);
    const res = createMockRes();
    const handler = loadHandler('../admin/cleanup-events.js');
    await handler(req, res);
    return { res, supabaseRequest };
  }

  it('grava a linha de auditoria quando a purga acontece', async () => {
    const { res } = await run({ method: 'POST', headers: {}, body: {} }, { rpcResult: 4211 });

    expect(res.statusCode).toBe(200);
    expect(res.body?.deleted).toBe(4211);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      action: 'delete',
      targetType: 'analytics_events',
      after: { deleted: 4211 },
    });
    // A identidade sai da sessão dentro de logAdminAction — o que o handler
    // precisa entregar é o `req`, senão a linha vira 'admin' genérico.
    expect(auditCalls[0].req).toBeTruthy();
  });

  it('registra também a purga que não encontrou nada (deleted: 0)', async () => {
    await run({ method: 'POST', headers: {}, body: {} }, { rpcResult: 0 });

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].after).toEqual({ deleted: 0 });
  });

  it('não grava nada quando a sessão admin é recusada', async () => {
    const { supabaseRequest } = await run(
      { method: 'POST', headers: {}, body: {} },
      { authorized: false },
    );

    expect(supabaseRequest).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([]);
  });

  it('não grava nada quando o método é barrado', async () => {
    const { supabaseRequest } = await run({ method: 'GET', headers: {}, body: {} });

    expect(supabaseRequest).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([]);
  });
});

// ─── handlers/admin/upload-url.js ────────────────────────────────────

describe('admin/upload-url · Storage no audit log', () => {
  const PATH = '1725200000000-a1b2c3-planilha.png';

  /**
   * Duplo do Storage por URL. Só os endpoints que o handler chama; qualquer
   * outro LANÇA, para que uma chamada nova não passe despercebida.
   */
  function installStorageFetch({ objectRow = null, onDelete = () => {} } = {}) {
    const calls = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      const method = options.method || 'GET';
      const href = String(url);
      calls.push({ url: href, method });

      if (href.includes('/storage/v1/bucket/')) {
        // GET lê a config; PUT converge a política. Ambos best-effort.
        return { ok: true, json: async () => ({ public: true }) };
      }
      if (href.includes('/storage/v1/object/upload/sign/')) {
        return { ok: true, json: async () => ({ url: '/object/upload/sign/x?token=abc' }) };
      }
      if (href.includes('/storage/v1/object/list/')) {
        return { ok: true, json: async () => (objectRow ? [objectRow] : []) };
      }
      if (method === 'DELETE') {
        onDelete();
        return { ok: true, json: async () => ({}) };
      }
      throw new Error(`fetch inesperado: ${method} ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, calls };
  }

  async function run(body, { authorized = true, storage = {} } = {}) {
    installAdminSession({ authorized });
    installModuleMock('../../lib/supabase', { getSupabaseConfig: () => SUPABASE_CONFIG });
    const storageDouble = installStorageFetch(storage);
    const res = createMockRes();
    const handler = loadHandler('../admin/upload-url.js');
    await handler({ method: 'POST', headers: {}, body }, res);
    return { res, ...storageDouble };
  }

  it('registra a autorização de gravação emitida pelo sign', async () => {
    const { res } = await run({ kind: 'image', filename: 'Planilha.png', mimeType: 'image/png' });

    expect(res.statusCode).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      action: 'create',
      targetType: 'storage_object',
      after: { bucket: 'product_images', kind: 'image', mimeType: 'image/png' },
    });
    // O targetId aponta o objeto REAL — bucket + path escolhido pelo servidor,
    // que é o que permite cruzar a linha do audit com o que está no bucket.
    expect(auditCalls[0].targetId).toBe(`product_images/${res.body.path}`);
  });

  it('registra a remoção do objeto que a confirmação rejeitou', async () => {
    let deleted = false;
    const { res } = await run(
      { kind: 'image', action: 'confirm', path: PATH },
      {
        storage: {
          objectRow: { name: PATH, metadata: { size: 20 * 1024 * 1024, mimetype: 'image/png' } },
          onDelete: () => {
            deleted = true;
          },
        },
      },
    );

    expect(res.statusCode).toBe(400);
    expect(deleted).toBe(true);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      action: 'delete',
      targetType: 'storage_object',
      targetId: `product_images/${PATH}`,
      after: { removed: true },
    });
    expect(auditCalls[0].before).toMatchObject({ bucket: 'product_images', path: PATH });
    expect(auditCalls[0].after.reasons.join('; ')).toMatch(/tamanho/);
  });

  it('não grava linha na confirmação que aprovou o objeto', async () => {
    const { res } = await run(
      { kind: 'image', action: 'confirm', path: PATH },
      {
        storage: {
          objectRow: { name: PATH, metadata: { size: 1024, mimetype: 'image/png' } },
        },
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.verified).toBe(true);
    expect(auditCalls).toEqual([]);
  });

  it('não grava nada quando a sessão admin é recusada', async () => {
    const { fetchMock } = await run(
      { kind: 'image', filename: 'Planilha.png', mimeType: 'image/png' },
      { authorized: false },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([]);
  });

  it('não grava nada quando a validação da declaração barra o arquivo', async () => {
    const { res } = await run({
      kind: 'image',
      filename: 'payload.svg',
      mimeType: 'image/svg+xml',
    });

    expect(res.statusCode).toBe(400);
    expect(auditCalls).toEqual([]);
  });
});
