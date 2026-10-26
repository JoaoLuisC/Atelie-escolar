import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerAuthPage } from '../CustomerAuthPage';
import { recoveryErrorMessage } from '../ResetPasswordPage';

const pushToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast }),
}));

const authState = {};
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('../../services/supabase-browser', () => ({
  buildPasswordResetRedirectUrl: () => 'http://localhost/reset-password',
  getSupabaseBrowserClient: async () => null,
}));

vi.mock('../../services/customer-auth', () => ({
  confirmAccountDeletion: vi.fn(),
  exportMyData: vi.fn(),
  requestAccountDeletion: vi.fn(),
}));

function renderAt(url = '/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CustomerAuthPage />
    </MemoryRouter>,
  );
}

describe('CustomerAuthPage', () => {
  beforeEach(() => {
    pushToast.mockReset();
    Object.assign(authState, {
      authReady: true,
      customerSession: null,
      loginCustomer: vi.fn(async () => {
        throw new Error('E-mail ou senha incorretos.');
      }),
      loginCustomerGoogle: vi.fn(),
      registerCustomer: vi.fn(),
      logoutCustomer: vi.fn(),
      setCustomerSession: vi.fn(),
    });
  });

  it('cadastro com falha de envio mostra a mensagem do servidor, não "verifique os dados" (LOJA-37)', async () => {
    authState.registerCustomer = vi.fn(async () => {
      const error = new Error(
        'Não foi possível enviar o e-mail de confirmação agora. Seus dados estão certos — tente novamente mais tarde.',
      );
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    });
    renderAt('/login?mode=register');

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cliente QA' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'qa@exemplo.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Abcdefg1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('e-mail de confirmação');
  });

  it('o seletor Entrar/Cadastrar expõe o estado (LOJA-50)', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Entrar', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cadastrar', pressed: false })).toBeInTheDocument();
  });

  it('trocar de aba limpa o erro de login antigo (LOJA-46)', async () => {
    renderAt();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar' }).at(-1));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar', pressed: false }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('erro do login Google na URL aparece na tela, sem o texto livre da URL (LOJA-44)', () => {
    renderAt('/login?oauth=google&error=access_denied&error_description=texto-de-terceiro');
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('login com Google foi cancelado');
    expect(alerta).not.toHaveTextContent('texto-de-terceiro');
  });

  it('logado, respeita o ?redirect= (LOJA-47)', () => {
    authState.customerSession = { email: 'cliente@teste.com', role: 'customer' };
    renderAt('/login?redirect=/downloads');
    const link = screen.getByRole('link', { name: /Ir para Meus produtos/ });
    expect(link).toHaveAttribute('href', '/downloads');
  });

  it('conta admin não vê "Excluir minha conta" (CROSS-16)', () => {
    authState.customerSession = { email: 'admin@teste.com', role: 'admin' };
    renderAt('/conta');
    expect(screen.queryByRole('heading', { name: 'Excluir minha conta' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Baixar meus dados' })).toBeInTheDocument();
  });

  it('confirmação de exclusão deslogada oferece o login e volta ao link (LOJA-51)', () => {
    renderAt('/conta?delete_token=tok.123');
    expect(screen.queryByRole('button', { name: /Excluir permanentemente/ })).toBeNull();
    const link = screen.getByRole('link', { name: /Entrar para confirmar/ });
    const redirect = new URLSearchParams(link.getAttribute('href').split('?')[1]).get('redirect');
    expect(redirect).toBe('/conta?delete_token=tok.123');
  });

  it('cliente comum continua vendo "Excluir minha conta"', async () => {
    authState.customerSession = { email: 'cliente@teste.com', role: 'customer' };
    renderAt('/conta');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Excluir minha conta' })).toBeInTheDocument(),
    );
  });
});

describe('recoveryErrorMessage (LOJA-45)', () => {
  it('"Auth session missing!" vira português', () => {
    const error = Object.assign(new Error('Auth session missing!'), {
      name: 'AuthSessionMissingError',
    });
    expect(recoveryErrorMessage(error, 'fallback')).toMatch(/link de recuperação/);
  });

  it('senha igual à anterior', () => {
    const error = Object.assign(
      new Error('New password should be different from the old password.'),
      {
        code: 'same_password',
      },
    );
    expect(recoveryErrorMessage(error, 'fallback')).toBe(
      'A nova senha precisa ser diferente da anterior.',
    );
  });

  it('desconhecido cai no texto da tela, nunca no inglês do SDK', () => {
    expect(recoveryErrorMessage(new Error('Something odd'), 'Texto da tela.')).toBe(
      'Texto da tela.',
    );
  });
});

describe('CustomerAuthPage · volta do login com Google', () => {
  function renderComRotas(url) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/login" element={<CustomerAuthPage />} />
          <Route path="/checkout" element={<p>PÁGINA DO CARRINHO</p>} />
          <Route path="/downloads" element={<p>PÁGINA DE DOWNLOADS</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    Object.assign(authState, {
      authReady: true,
      customerSession: { uid: 'u1', email: 'cliente@gmail.com', name: 'Cliente', role: 'customer' },
      loginCustomer: vi.fn(),
      loginCustomerGoogle: vi.fn(),
      registerCustomer: vi.fn(),
      logoutCustomer: vi.fn(),
      setCustomerSession: vi.fn(),
    });
  });

  it('com a sessão do Google estabelecida, segue direto para o carrinho (checkout)', async () => {
    renderComRotas('/login?oauth=google&redirect=/checkout');
    expect(await screen.findByText('PÁGINA DO CARRINHO')).toBeInTheDocument();
  });

  it('respeita o destino de quem mandou para o login', async () => {
    renderComRotas('/login?oauth=google&redirect=/downloads');
    expect(await screen.findByText('PÁGINA DE DOWNLOADS')).toBeInTheDocument();
  });

  it('erro na volta do Google fica no login, com a mensagem', async () => {
    authState.customerSession = null;
    renderComRotas('/login?oauth=google&error=access_denied');
    expect(screen.queryByText('PÁGINA DO CARRINHO')).toBeNull();
  });

  it('sem ter vindo do Google, quem já está logado vê o aviso (não é redirecionado)', () => {
    renderComRotas('/login');
    expect(screen.getByText('Você já está conectado')).toBeInTheDocument();
  });
});
