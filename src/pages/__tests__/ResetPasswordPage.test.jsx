import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from '../ResetPasswordPage';

const auth = {
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } }, error: null })),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  verifyOtp: vi.fn(async () => ({ data: { session: { access_token: 'token' } }, error: null })),
};
vi.mock('../../services/supabase-browser', () => ({
  getSupabaseBrowserClient: async () => ({ auth }),
}));
const pushToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ pushToast }) }));

describe('recuperação de senha', () => {
  it('espera a sessão do SDK sem consumir o código uma segunda vez', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?code=unico']}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled(),
    );
    expect(auth.getSession).toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('troca token_hash por sessão somente quando a página é aberta', async () => {
    render(
      <MemoryRouter
        initialEntries={['/reset-password?redirect=%2Fdownloads&token_hash=abc&type=recovery']}
      >
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'recovery' }),
    );
  });

  it('limpa token_hash e type da URL sem deixar "?" sobrando', async () => {
    const replaceState = vi.spyOn(globalThis.history, 'replaceState');
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=abc&type=recovery']}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(replaceState).toHaveBeenCalledWith({}, '', '/reset-password'));
    replaceState.mockRestore();
  });

  it('mantém os parâmetros que sobram depois de consumir o token', async () => {
    const replaceState = vi.spyOn(globalThis.history, 'replaceState');
    render(
      <MemoryRouter
        initialEntries={['/reset-password?token_hash=abc&type=recovery&redirect=%2Fcheckout']}
      >
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith({}, '', '/reset-password?redirect=%2Fcheckout'),
    );
    replaceState.mockRestore();
  });

  it('link no formato do template (SiteURL + next) mostra o destino de dentro do next', async () => {
    const next = encodeURIComponent('https://loja.test/reset-password?redirect=/admin');
    render(
      <MemoryRouter initialEntries={[`/reset-password?token_hash=abc&type=recovery&next=${next}`]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('o login do painel')).toBeInTheDocument();
  });

  it('next apontando para fora da allowlist cai em Meus produtos', async () => {
    const next = encodeURIComponent('https://evil.test/x?redirect=https://evil.test');
    render(
      <MemoryRouter initialEntries={[`/reset-password?token_hash=abc&type=recovery&next=${next}`]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Meus produtos')).toBeInTheDocument();
  });
});
