import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/customer-account-provisioning.js` — item P4.1 (segundo módulo na ordem
// de risco) e a prova do §2.3.b.
//
// Por que importa: isto roda DENTRO do webhook de pagamento, provisionando a
// conta de quem acabou de comprar. Antes, achar um e-mail custava até DEZ
// chamadas sequenciais à Admin API do Supabase — e havia um TETO: passando de
// 2.000 usuários a função devolvia `null` para quem existe, e o chamador seguia
// para criar a conta DUPLICADA.
//
// ── POR QUE O SDK ENTRA DE VERDADE ──────────────────────────────────
// O módulo é CommonJS (ADR 0001) e faz `require('@supabase/supabase-js')`, que
// `vi.mock` não intercepta. Em vez de contornar, a única fronteira substituída
// é o `fetch` — então as asserções são sobre as CHAMADAS DE REDE que saem, que
// é exatamente o que o item mede: quantas idas à Admin API custa achar um
// e-mail.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { ensureCustomerAccountFromCheckout } = requireCjs('../customer-account-provisioning.js');

const PERFIL_ID = '11111111-2222-3333-4444-555555555555';

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nome) => (nome.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Roteia por URL: a busca indexada é RPC do PostgREST, o resto é Admin API.
 * `perfil` = o que `find_profile_id_by_email` devolve (uuid ou null).
 */
function stubRede({ perfil = null, buscaFalha = false } = {}) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const alvo = String(url);

    if (alvo.includes('rpc/find_profile_id_by_email')) {
      return buscaFalha ? json({ message: 'boom' }, 500) : json(perfil);
    }

    // GET /auth/v1/admin/users/<uid> — getUserById
    if (/\/auth\/v1\/admin\/users\/[^/?]+$/.test(alvo)) {
      return json({ id: PERFIL_ID, email: 'cliente@exemplo.test' });
    }

    // POST /auth/v1/admin/users — createUser
    if (alvo.endsWith('/auth/v1/admin/users') && init.method === 'POST') {
      return json({ id: 'novo-id', email: 'novo@exemplo.test' });
    }

    // POST /auth/v1/recover — resetPasswordForEmail
    if (alvo.includes('/auth/v1/recover')) {
      return json({});
    }

    return json({});
  });
}

/** URLs chamadas, para afirmar sobre o CUSTO da busca. */
function urlsChamadas() {
  return globalThis.fetch.mock.calls.map(([url]) => String(url));
}

/** Corpo JSON enviado na n-ésima chamada. */
function corpoDaChamada(indice) {
  const [, init] = globalThis.fetch.mock.calls[indice];
  return JSON.parse(init.body);
}

describe('ensureCustomerAccountFromCheckout', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    process.env.APP_URL = 'https://loja.test';
    delete process.env.CUSTOMER_PASSWORD_SETUP_REDIRECT;
  });

  afterEach(() => {
    process.env = ambienteOriginal;
    vi.restoreAllMocks();
  });

  it('e-mail vazio não provisiona nada nem toca a rede', async () => {
    stubRede();
    const resultado = await ensureCustomerAccountFromCheckout({ email: '  ', name: 'Fulano' });

    expect(resultado).toEqual({ skipped: true, reason: 'missing-email' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('conta existente: UMA busca indexada, e nenhuma varredura paginada', async () => {
    stubRede({ perfil: PERFIL_ID });

    const resultado = await ensureCustomerAccountFromCheckout({
      email: 'Cliente@Exemplo.TEST',
      name: 'Cliente',
    });

    expect(resultado).toEqual({ created: false, emailDispatched: false, userId: PERFIL_ID });

    const urls = urlsChamadas();
    // A regressão que isto trava: `listUsers({ page, perPage })` — até dez idas
    // à Admin API, com teto em 2.000 usuários.
    expect(urls.filter((u) => /admin\/users\?/.test(u))).toEqual([]);
    expect(urls.filter((u) => u.includes('rpc/find_profile_id_by_email'))).toHaveLength(1);
    // Sem criação e sem e-mail de senha para quem já tem conta.
    expect(urls.filter((u) => u.includes('/auth/v1/recover'))).toEqual([]);
  });

  it('normaliza o e-mail antes de buscar', async () => {
    stubRede({ perfil: PERFIL_ID });
    await ensureCustomerAccountFromCheckout({ email: '  Cliente@Exemplo.TEST ', name: 'x' });

    expect(corpoDaChamada(0)).toEqual({ p_email: 'cliente@exemplo.test' });
  });

  it('conta nova: cria e dispara o e-mail de definição de senha', async () => {
    stubRede({ perfil: null });

    const resultado = await ensureCustomerAccountFromCheckout({
      email: 'novo@exemplo.test',
      name: 'Nova Cliente',
    });

    expect(resultado).toEqual({ created: true, emailDispatched: true, userId: 'novo-id' });

    const urls = urlsChamadas();
    expect(urls.some((u) => u.endsWith('/auth/v1/admin/users'))).toBe(true);
    expect(urls.some((u) => u.includes('/auth/v1/recover'))).toBe(true);
  });

  it('a senha inicial é aleatória e nunca reaproveitada', async () => {
    stubRede({ perfil: null });
    await ensureCustomerAccountFromCheckout({ email: 'a@exemplo.test', name: 'A' });
    const primeira = corpoDaChamada(1).password;

    stubRede({ perfil: null });
    await ensureCustomerAccountFromCheckout({ email: 'b@exemplo.test', name: 'B' });
    const segunda = corpoDaChamada(1).password;

    expect(primeira).not.toBe(segunda);
    expect(primeira.length).toBeGreaterThan(20);
  });

  it('falha na busca PROPAGA — nunca é lida como "não existe"', async () => {
    // O modo de falha caro: tratar erro de consulta como ausência criaria conta
    // duplicada para um cliente que já tem uma.
    stubRede({ buscaFalha: true });

    await expect(
      ensureCustomerAccountFromCheckout({ email: 'cliente@exemplo.test', name: 'X' }),
    ).rejects.toThrow();

    expect(urlsChamadas().some((u) => u.endsWith('/auth/v1/admin/users'))).toBe(false);
  });

  it('sem configuração do Supabase, falha alto em vez de seguir sem provisionar', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    stubRede();

    await expect(
      ensureCustomerAccountFromCheckout({ email: 'cliente@exemplo.test', name: 'X' }),
    ).rejects.toThrow(/admin config missing/i);
  });
});
