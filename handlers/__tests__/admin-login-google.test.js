import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  expectApiError,
  installModuleMock,
  installPartialMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// `handlers/admin/login-google.js` — professor(a) entra com Google.
//
// A decisão sob teste é QUEM recebe o cookie `admin_session`: só o perfil
// SELLER. Admin/master têm 2º fator, e o Google pularia essa etapa; cliente e
// conta Google nova (que o próprio OAuth cria como CUSTOMER) não são staff.
// Mockado só o I/O: Supabase Auth, o papel em `profiles`, o contador e o log.
// ════════════════════════════════════════════════════════════════════

const IP = '203.0.113.9';
const TOKEN = 'token-do-supabase';

let handler;
let getUser;
let getProfileRoleByUserId;
let enforceRateLimit;
let recordSecurityEvent;
let originalSecret;

async function loginGoogle(body = { accessToken: TOKEN }, method = 'POST') {
  const res = createMockRes();
  await handler(
    { method, body, headers: { 'user-agent': 'vitest', 'x-real-ip': IP }, socket: {} },
    res,
  );
  return res;
}

beforeEach(() => {
  resetModuleRegistry();
  originalSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

  recordSecurityEvent = vi.fn(async () => {});
  installModuleMock('../../lib/security-logger', {
    recordSecurityEvent,
    extractClientIp: () => IP,
  });

  enforceRateLimit = vi.fn(async () => ({ blocked: false, failOpen: false }));
  installPartialMock('../../lib/rate-limit', { enforceRateLimit });

  getUser = vi.fn(async () => ({
    data: { user: { id: 'uid-prof', email: 'Prof@Escola.com' } },
    error: null,
  }));
  getProfileRoleByUserId = vi.fn(async () => 'SELLER');
  installModuleMock('../../services/supabase-auth', {
    getAnonClient: () => ({ auth: { getUser } }),
    getProfileRoleByUserId,
  });

  handler = loadHandler('../admin/login-google.js');
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalSecret;
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('login de professor(a) com Google', () => {
  it('perfil SELLER abre a sessão de staff com o papel e o e-mail', async () => {
    const res = await loginGoogle();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      user: { role: 'seller', email: 'prof@escola.com' },
    });
    expect(String(res.headers['Set-Cookie'])).toContain('admin_session=');
    // O token é conferido no Supabase e o papel lido pelo id do usuário.
    expect(getUser).toHaveBeenCalledWith(TOKEN);
    expect(getProfileRoleByUserId).toHaveBeenCalledWith('uid-prof');
  });

  it.each(['ADMIN', 'MASTER'])(
    'perfil %s é barrado (2º fator não pode ser pulado)',
    async (role) => {
      getProfileRoleByUserId.mockResolvedValueOnce(role);

      const res = await loginGoogle();

      expectApiError(res, { status: 403, code: 'FORBIDDEN' });
      expect(res.headers['Set-Cookie']).toBeUndefined();
      expect(recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({ reason: 'google_admin_blocked' }),
        }),
      );
    },
  );

  it.each(['CUSTOMER', null])('perfil %s não é professor(a): 401 sem cookie', async (role) => {
    getProfileRoleByUserId.mockResolvedValueOnce(role);

    const res = await loginGoogle();

    expectApiError(res, { status: 401, code: 'UNAUTHORIZED' });
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('token que o Supabase não reconhece: 401 sem consultar o papel', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad jwt' } });

    const res = await loginGoogle();

    expectApiError(res, { status: 401, code: 'UNAUTHORIZED' });
    expect(getProfileRoleByUserId).not.toHaveBeenCalled();
  });

  it('sem token: 400 antes de tocar o Supabase', async () => {
    const res = await loginGoogle({});

    expectApiError(res, { status: 400, code: 'VALIDATION_FAILED' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('só aceita POST e passa pelo rate limit próprio', async () => {
    expect((await loginGoogle({}, 'GET')).statusCode).toBe(405);

    await loginGoogle();
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ bucket: 'staff-google-login' }),
    );
  });
});
