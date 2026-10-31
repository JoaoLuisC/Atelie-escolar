import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  installModuleMock,
  installPartialMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// POST /api/admin/social-publish — sem rede de verdade: o `fetch` é falso.
// Garantias: entrada inválida é 400 (não 502), falha externa vira mensagem
// clara por tipo, o TikTok consulta o criador antes de postar e só aceita a
// privacidade que ele permite, e nenhuma publicação sai sem configuração.

const ENV = {
  META_PAGE_ACCESS_TOKEN: 'meta-token-de-teste',
  FACEBOOK_PAGE_ID: '1',
  INSTAGRAM_BUSINESS_ID: '2',
  TIKTOK_ACCESS_TOKEN: 'tiktok-token-de-teste',
  WHATSAPP_ACCESS_TOKEN: 'wa-token-de-teste',
  WHATSAPP_PHONE_NUMBER_ID: '3',
};

let logAdminAction;
let handler;
let saved;

function reply(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

beforeEach(() => {
  resetModuleRegistry();
  saved = { ...process.env };
  Object.assign(process.env, ENV);
  logAdminAction = vi.fn(async () => {});
  installModuleMock('../../lib/admin-session', { ensureStoreSession: () => true });
  installModuleMock('../../lib/admin-audit', { logAdminAction });
  installPartialMock('../../lib/rate-limit', {
    enforceRateLimit: async () => ({ blocked: false }),
  });
  handler = loadHandler('../admin/social-publish.js');
});

afterEach(() => {
  process.env = saved;
  resetModuleRegistry();
  vi.restoreAllMocks();
});

async function publish(body) {
  const res = createMockRes();
  await handler({ method: 'POST', headers: {}, body }, res);
  return res;
}

describe('admin/social-publish · entrada', () => {
  it('Instagram sem imagem é 400, sem chamar a API', async () => {
    globalThis.fetch = vi.fn();
    const res = await publish({ platform: 'instagram', caption: 'Oi' });
    expect(res.statusCode).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('WhatsApp com número inválido é 400', async () => {
    globalThis.fetch = vi.fn();
    const res = await publish({ platform: 'whatsapp', recipient: '12', caption: 'Oi' });
    expect(res.statusCode).toBe(400);
  });

  it('imagem acima de 8 MB é recusada antes de publicar', async () => {
    globalThis.fetch = vi.fn(async () =>
      reply(200, {}, { 'content-length': String(9 * 1024 * 1024) }),
    );
    const res = await publish({ platform: 'facebook', mediaUrl: 'https://cdn.test/a.jpg' });
    expect(res.statusCode).toBe(400);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('vídeo do TikTok acima de 64 MB é 400', async () => {
    globalThis.fetch = vi.fn();
    const res = await publish({ platform: 'tiktok', caption: 'x', videoSize: 65 * 1024 * 1024 });
    expect(res.statusCode).toBe(400);
  });

  it('rede não configurada responde 503 e não publica', async () => {
    delete process.env.PINTEREST_ACCESS_TOKEN;
    globalThis.fetch = vi.fn();
    const res = await publish({ platform: 'pinterest', mediaUrl: 'https://cdn.test/a.jpg' });
    expect(res.statusCode).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('admin/social-publish · falha externa', () => {
  it('token vencido (401) vira 422 com mensagem de reconectar, sem a resposta crua', async () => {
    globalThis.fetch = vi.fn(async () =>
      reply(401, { error: { message: 'Error validating access token: Session has expired' } }),
    );
    const res = await publish({ platform: 'facebook', caption: 'Oi' });
    expect(res.statusCode).toBe(422);
    expect(res.body.error.message).toMatch(/Reconecte/);
    expect(JSON.stringify(res.body)).not.toContain('Session has expired');
  });

  it('limite da rede (429) vira 429', async () => {
    globalThis.fetch = vi.fn(async () => reply(429, { error: { message: 'rate' } }));
    const res = await publish({ platform: 'facebook', caption: 'Oi' });
    expect(res.statusCode).toBe(429);
  });

  it('indisponibilidade (500) vira 502', async () => {
    globalThis.fetch = vi.fn(async () => reply(500, {}));
    const res = await publish({ platform: 'facebook', caption: 'Oi' });
    expect(res.statusCode).toBe(502);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

describe('admin/social-publish · TikTok', () => {
  it('consulta o criador e recusa privacidade que ele não permite', async () => {
    globalThis.fetch = vi.fn(async () =>
      reply(200, { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } }),
    );
    const res = await publish({
      platform: 'tiktok',
      caption: 'x',
      videoSize: 1024,
      privacy: 'PUBLIC_TO_EVERYONE',
    });
    expect(res.statusCode).toBe(400);
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain('creator_info');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('com privacidade permitida, inicia o upload e audita sem a legenda', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        reply(200, { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } }),
      )
      .mockResolvedValueOnce(reply(200, { data: { publish_id: 'p-1' }, error: { code: 'ok' } }));
    const res = await publish({ platform: 'tiktok', caption: 'legenda secreta', videoSize: 1024 });
    expect(res.statusCode).toBe(200);
    expect(String(globalThis.fetch.mock.calls[1][0])).toContain('video/init');
    const audit = logAdminAction.mock.calls[0][0];
    expect(audit.targetId).toBe('tiktok:p-1');
    expect(JSON.stringify(audit.after)).not.toContain('legenda secreta');
  });
});
