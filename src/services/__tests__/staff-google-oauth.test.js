import { afterEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// Volta do Google: cliente × professor(a).
//
// Os dois logins usam o mesmo OAuth do Supabase e voltam com `?code=` na URL.
// O AuthProvider tenta concluir o login do CLIENTE em toda montagem que vê um
// `code`; sem a saída pelo marcador `oauth=staff`, a professora que entrou com
// Google em /admin ganharia também uma sessão de cliente — e o `code` de uso
// único seria gasto pelo fluxo errado.
// ════════════════════════════════════════════════════════════════════

const getSession = vi.fn(async () => ({ data: { session: { access_token: 'tok' } } }));
const signOut = vi.fn(async () => ({}));
const apiRequest = vi.fn(async () => ({
  response: { ok: true },
  data: { success: true, user: { role: 'seller', email: 'prof@escola.com' } },
}));

vi.mock('../supabase-browser', async (importOriginal) => ({
  ...(await importOriginal()),
  getSupabaseBrowserClient: async () => ({ auth: { getSession, signOut } }),
}));
vi.mock('../../utils/api', () => ({
  apiRequest: (...args) => apiRequest(...args),
  apiError: (data, fallback) => new Error(data?.error?.message || fallback),
}));

function visit(path) {
  globalThis.window.history.replaceState({}, '', path);
}

afterEach(() => {
  vi.clearAllMocks();
  visit('/');
});

describe('volta do Google do professor(a)', () => {
  it('o fluxo do cliente ignora `oauth=staff` e não gasta o code', async () => {
    visit('/admin?oauth=staff&code=abc');
    const { consumeCustomerSessionFromAuthCallback } = await import('../customer-auth.js');

    expect(await consumeCustomerSessionFromAuthCallback()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('o fluxo de staff troca o token pela sessão e limpa a URL', async () => {
    visit('/admin?oauth=staff&code=abc');
    const { completeStaffGoogleLogin } = await import('../admin-auth.js');

    const data = await completeStaffGoogleLogin();

    expect(data.user.role).toBe('seller');
    expect(apiRequest).toHaveBeenCalledWith(
      '/admin/login-google',
      expect.objectContaining({ body: JSON.stringify({ accessToken: 'tok' }) }),
    );
    expect(globalThis.window.location.search).toBe('');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('fora da volta do Google, o fluxo de staff não faz nada', async () => {
    visit('/admin');
    const { completeStaffGoogleLogin } = await import('../admin-auth.js');

    expect(await completeStaffGoogleLogin()).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('conta que não é de professor(a): a mensagem do servidor chega à tela', async () => {
    visit('/admin?oauth=staff&code=abc');
    apiRequest.mockResolvedValueOnce({
      response: { ok: false },
      data: { success: false, error: { message: 'Esta conta Google não está cadastrada' } },
    });
    const { completeStaffGoogleLogin } = await import('../admin-auth.js');

    await expect(completeStaffGoogleLogin()).rejects.toThrow('não está cadastrada');
    expect(signOut).toHaveBeenCalled();
  });
});
