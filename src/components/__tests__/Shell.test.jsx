import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Shell } from '../Shell';

// ════════════════════════════════════════════════════════════════════
// Cabeçalho e rodapé da loja — achados LOJA-09, 13, 28, 30, 39 e 49.
// ════════════════════════════════════════════════════════════════════

const logoutCustomer = vi.fn();
const pushToast = vi.fn();
let sessao = null;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ customerSession: sessao, logoutCustomer }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.hash}`}</output>;
}

function renderShell(caminho = '/produtos') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route
          path="*"
          element={
            <Shell>
              <p>conteúdo</p>
              <LocationProbe />
            </Shell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  sessao = null;
  vi.clearAllMocks();
});

describe('Shell · menu mobile (LOJA-28)', () => {
  it('Esc fecha o menu', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(document.getElementById('menu-mobile')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.getElementById('menu-mobile')).toBeNull();
  });

  it('clique fora fecha o menu', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));

    fireEvent.pointerDown(screen.getByText('conteúdo'));
    expect(document.getElementById('menu-mobile')).toBeNull();
  });

  it('o botão declara o que controla', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
      'aria-controls',
      'menu-mobile',
    );
  });
});

describe('Shell · navegação interna', () => {
  it('"Como Funciona" é navegação interna para /#como-funciona (LOJA-09)', () => {
    renderShell('/produtos');
    const [link] = screen.getAllByRole('link', { name: /Como Funciona/i });
    fireEvent.click(link);
    expect(screen.getByTestId('url')).toHaveTextContent('/#como-funciona');
  });

  it('existe "Pular para o conteúdo" (LOJA-30)', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /Pular para o conteúdo/i })).toHaveAttribute(
      'href',
      '#conteudo',
    );
    expect(document.getElementById('conteudo')).not.toBeNull();
  });
});

describe('Shell · rodapé', () => {
  it('não publica contatos fictícios nem links genéricos de rede social (LOJA-13)', () => {
    renderShell();
    expect(screen.queryByText(/99999-9999/)).toBeNull();
    expect(document.querySelector('a[href="https://www.facebook.com"]')).toBeNull();
    expect(document.querySelector('a[href="https://www.pinterest.com"]')).toBeNull();
  });

  it('o link de /downloads se chama "Meus produtos" (LOJA-49)', () => {
    renderShell();
    const links = screen.getAllByRole('link', { name: /Meus produtos/i });
    expect(links.some((link) => link.getAttribute('href') === '/downloads')).toBe(true);
    expect(screen.queryByRole('link', { name: /^Downloads$/ })).toBeNull();
  });

  it('tem atalho para as preferências de cookies', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Cookies' })).toHaveAttribute(
      'href',
      '/privacidade#cookies',
    );
  });
});

describe('Shell · sair (LOJA-39)', () => {
  it('só anuncia "Sessão encerrada." depois que o servidor confirma', async () => {
    sessao = { email: 'ana@exemplo.test', role: 'customer' };
    logoutCustomer.mockRejectedValueOnce(new Error('Sem conexão com o servidor.'));
    renderShell();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);

    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith('Sem conexão com o servidor.', 'error'),
    );
    expect(pushToast).not.toHaveBeenCalledWith('Sessão encerrada.', 'info');
  });

  it('com sucesso, anuncia o encerramento', async () => {
    sessao = { email: 'ana@exemplo.test', role: 'customer' };
    logoutCustomer.mockResolvedValueOnce(undefined);
    renderShell();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);

    await waitFor(() => expect(pushToast).toHaveBeenCalledWith('Sessão encerrada.', 'info'));
  });
});

describe('Shell · carrinho (CROSS-15)', () => {
  it('o perfil admin também tem o botão do carrinho', () => {
    sessao = { email: 'admin@exemplo.test', role: 'admin' };
    renderShell();
    expect(screen.getByRole('button', { name: /Abrir carrinho/i })).toBeInTheDocument();
  });
});
