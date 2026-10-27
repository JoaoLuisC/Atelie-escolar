import crypto from 'node:crypto';
import { createRequire } from 'node:module';

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
// Painel da LOJA × painel da PLATAFORMA.
//
// A professora dona da loja (settings.storeOwner) administra produtos,
// pedidos, cupons, vendas e a página; o admin fica com usuários, segurança e
// professores. O corte vive no servidor: `ensureStoreSession` nos endpoints da
// loja, `ensureAdminSession` no resto. Outro professor (SELLER sem ser a dona)
// não pode cair no painel da loja — ele veria pedidos e clientes.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
let originalSecret;

/** Cookie de sessão REAL (assinado), como o login emitiria. */
function cookieFor(identity) {
  const { setSessionCookie } = requireCjs('../../lib/admin-session.js');
  const res = createMockRes();
  setSessionCookie(res, identity);
  return String(res.headers['Set-Cookie']).split(';')[0];
}

function req(identity, extra = {}) {
  return {
    method: 'GET',
    headers: identity ? { cookie: cookieFor(identity) } : {},
    query: {},
    body: {},
    ...extra,
  };
}

beforeEach(() => {
  resetModuleRegistry();
  originalSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalSecret;
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('ensureStoreSession', () => {
  it.each([
    ['admin', { role: 'admin', userId: OTHER_ID }, true],
    ['dona da loja', { role: 'seller', userId: OWNER_ID, storeOwner: true }, true],
    ['outro professor', { role: 'seller', userId: OTHER_ID }, false],
    ['cliente', { role: 'customer', userId: OTHER_ID }, false],
  ])('%s → %s', (_name, identity, allowed) => {
    const { ensureStoreSession } = requireCjs('../../lib/admin-session.js');
    const res = createMockRes();

    expect(ensureStoreSession(req(identity), res)).toBe(allowed);
    if (!allowed) expect(res.statusCode).toBe(403);
  });

  it('a dona da loja NÃO passa na guarda de admin (usuários, segurança)', () => {
    const { ensureAdminSession } = requireCjs('../../lib/admin-session.js');
    const res = createMockRes();

    expect(
      ensureAdminSession(req({ role: 'seller', userId: OWNER_ID, storeOwner: true }), res),
    ).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('a marca de dona da loja vai assinada no cookie (não dá para forjar)', () => {
    const { getStaffSession } = requireCjs('../../lib/admin-session.js');
    const legit = cookieFor({ role: 'seller', userId: OWNER_ID, storeOwner: true });
    const [payload, signature] = legit.split('=')[1].split('.');
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const otherCookie = cookieFor({ role: 'seller', userId: OTHER_ID });
    const [otherPayload] = otherCookie.split('=')[1].split('.');
    const tampered = JSON.parse(Buffer.from(otherPayload, 'base64url').toString('utf8'));
    tampered.storeOwner = true;
    const tamperedToken = `${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${signature}`;

    expect(forged.storeOwner).toBe(true);
    expect(getStaffSession({ headers: { cookie: `admin_session=${tamperedToken}` } })).toBeNull();
  });
});

describe('lib/store-owner · isStoreOwner', () => {
  function load(value) {
    installPartialMock('../../lib/supabase', {
      serviceRoleHelpers: {
        getTableRow: vi.fn(async () => (value ? { setting_value: value } : null)),
      },
    });
    return requireCjs('../../lib/store-owner.js');
  }

  it('só a professora gravada em settings.storeOwner é a dona', async () => {
    const { isStoreOwner } = load({ sellerId: OWNER_ID });
    expect(await isStoreOwner({ role: 'seller', userId: OWNER_ID })).toBe(true);
    expect(await isStoreOwner({ role: 'seller', userId: OTHER_ID })).toBe(false);
  });

  it('admin nunca é "dona da loja" (o admin já tem acesso por ser admin)', async () => {
    const { isStoreOwner } = load({ sellerId: OWNER_ID });
    expect(await isStoreOwner({ role: 'admin', userId: OWNER_ID })).toBe(false);
  });

  it('sem dona definida, ninguém é', async () => {
    const { isStoreOwner } = load(null);
    expect(await isStoreOwner({ role: 'seller', userId: OWNER_ID })).toBe(false);
  });
});

describe('PUT /api/admin/store-owner', () => {
  let logAdminAction;
  let profile;
  let updates;

  function loadStoreOwnerHandler() {
    logAdminAction = vi.fn(async () => {});
    updates = [];
    installModuleMock('../../lib/admin-audit', { logAdminAction });
    installPartialMock('../../lib/supabase', {
      getSupabaseConfig: () => ({ url: 'https://stub.supabase.co', serviceRoleKey: 'k' }),
      serviceRoleHelpers: {
        getTableRow: vi.fn(async (table) => {
          if (table === 'profiles') return profile;
          return { setting_key: 'storeOwner', setting_value: { sellerId: null } };
        }),
        updateTable: vi.fn(async (...args) => updates.push(args)),
        insertIntoTable: vi.fn(async () => [{}]),
      },
    });
    return loadHandler('../admin/store-owner.js');
  }

  function put(identity, sellerId) {
    return req(identity, {
      method: 'PUT',
      body: { sellerId },
      headers: {
        cookie: cookieFor(identity),
        origin: 'http://localhost:5173',
      },
    });
  }

  it('admin define uma professora como dona e a troca é auditada', async () => {
    profile = { id: OWNER_ID, role: 'SELLER' };
    const handler = loadStoreOwnerHandler();
    const res = createMockRes();

    await handler(put({ role: 'admin', userId: OTHER_ID }, OWNER_ID), res);

    expect(res.statusCode).toBe(200);
    expect(updates).toHaveLength(1);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'set_store_owner', after: { sellerId: OWNER_ID } }),
    );
  });

  it('conta que não é professor(a) não vira dona da loja', async () => {
    profile = { id: OWNER_ID, role: 'CUSTOMER' };
    const handler = loadStoreOwnerHandler();
    const res = createMockRes();

    await handler(put({ role: 'admin', userId: OTHER_ID }, OWNER_ID), res);

    expectApiError(res, { status: 400, code: 'VALIDATION_FAILED' });
    expect(updates).toHaveLength(0);
  });

  it('a própria dona da loja não escolhe a dona (só o admin)', async () => {
    profile = { id: OTHER_ID, role: 'SELLER' };
    const handler = loadStoreOwnerHandler();
    const res = createMockRes();

    await handler(put({ role: 'seller', userId: OWNER_ID, storeOwner: true }, OTHER_ID), res);

    expect(res.statusCode).toBe(403);
    expect(updates).toHaveLength(0);
  });
});
