import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// §1.1 — o SDK saiu do caminho crítico e virou `import()` dinâmico.
//
// O que este teste protege NÃO é o tamanho do bundle (isso se mede no `dist`,
// com os `grep` documentados no vite.config.js). É a propriedade de
// CORRETUDE que o import dinâmico introduziu: a memoização precisa ser da
// PROMESSA, não do cliente. Memoizando só o cliente, duas chamadas
// concorrentes — o efeito do ResetPasswordPage e um clique em "Entrar com
// Google" — entrariam as duas no `import()` e criariam DOIS clientes, cada um
// com seu `code_verifier` de PKCE. O login com Google então falharia depois do
// redirect, e só em produção.
// ════════════════════════════════════════════════════════════════════

const createClient = vi.fn(() => ({ auth: { id: Math.random() } }));

vi.mock('@supabase/supabase-js', () => ({
  get createClient() {
    return createClient;
  },
}));

async function loadModule() {
  vi.resetModules();
  return import('../supabase-browser.js');
}

describe('getSupabaseBrowserClient (§1.1)', () => {
  beforeEach(() => {
    createClient.mockClear();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-de-teste');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('cria UM cliente só sob chamadas concorrentes (PKCE state único)', async () => {
    const { getSupabaseBrowserClient } = await loadModule();

    const [a, b, c] = await Promise.all([
      getSupabaseBrowserClient(),
      getSupabaseBrowserClient(),
      getSupabaseBrowserClient(),
    ]);

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('reaproveita o mesmo cliente em chamadas sequenciais', async () => {
    const { getSupabaseBrowserClient } = await loadModule();

    const primeiro = await getSupabaseBrowserClient();
    const segundo = await getSupabaseBrowserClient();

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(primeiro).toBe(segundo);
  });

  it('mantém o fluxo PKCE e a persistência de sessão', async () => {
    const { getSupabaseBrowserClient } = await loadModule();
    await getSupabaseBrowserClient();

    expect(createClient).toHaveBeenCalledWith('https://projeto.supabase.co', 'anon-key-de-teste', {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  });

  it('devolve null sem configuração, sem baixar o SDK', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { getSupabaseBrowserClient } = await loadModule();

    await expect(getSupabaseBrowserClient()).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('funções de URL continuam síncronas (§1.1)', () => {
  it('não dependem do SDK', async () => {
    const { buildOAuthRedirectUrl, buildPasswordResetRedirectUrl } = await loadModule();

    // Chamadas SÍNCRONAS de propósito: se um dia virarem async, o SDK volta
    // ao caminho crítico por elas.
    expect(buildOAuthRedirectUrl('/downloads')).toContain('oauth=google');
    expect(buildPasswordResetRedirectUrl('/downloads')).toContain('redirect=%2Fdownloads');
    expect(createClient).not.toHaveBeenCalled();
  });
});
