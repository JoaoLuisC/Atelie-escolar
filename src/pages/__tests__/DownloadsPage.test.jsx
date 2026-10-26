import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DownloadsPage } from '../DownloadsPage';

// `pushToast` ESTÁVEL, como o do ToastProvider real: um `vi.fn()` novo a cada
// render muda a identidade de `loadOrder` e re-dispara a consulta em laço.
const pushToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast }),
}));

const authState = { customerSession: null, logoutCustomer: vi.fn() };

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

describe('DownloadsPage', () => {
  beforeEach(() => {
    authState.customerSession = null;
    localStorage.clear();
  });

  it('mostra estado vazio quando nao ha pedido selecionado', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, orders: [] }),
    });

    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nenhum pedido selecionado')).toBeInTheDocument();
  });

  it('mostra estado de erro quando pedido retorna falha de token invalido', async () => {
    // Envelope da regra A1. A fixture usava `{ error: 'texto' }`, o formato
    // que o CONTRIBUTING dá por extinto — e ela só passava porque o shim de
    // achatamento de `parseJson` ainda existia. Com o shim removido (marco do
    // fim da migração A1), a fixture precisa ser o que o backend realmente
    // emite: `fail()` de lib/http.js.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { code: 'DOWNLOAD_TOKEN_INVALID', message: 'Token invalido' },
      }),
    });
    localStorage.setItem('lastOrderEmail', 'cliente@teste.com');

    render(
      <MemoryRouter initialEntries={['/downloads?order=ORD-ERRO']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Falha ao carregar pedido')).toBeInTheDocument();
    expect(screen.getAllByText('Token invalido').length).toBeGreaterThan(0);
  });
  it('sem pedido: nada de stepper "Processando" nem botão "Atualizar" (LOJA-48)', async () => {
    globalThis.fetch = vi.fn();
    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nenhum pedido selecionado')).toBeInTheDocument();
    expect(screen.queryByText('Processando')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
    // O convite para entrar aparece UMA vez, na caixa própria.
    expect(screen.getAllByText(/entre na sua conta/i)).toHaveLength(1);
  });

  it('logado e sem pedido, não manda "entrar na conta" (LOJA-41)', async () => {
    authState.customerSession = { email: 'cliente@teste.com' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, orders: [] }),
    });
    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Escolha um pedido no seu histórico/)).toBeInTheDocument();
    expect(screen.queryByText(/entre na sua conta/i)).toBeNull();
  });

  it('pedido sem e-mail: o campo prometido existe e consulta o pedido (LOJA-42)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, order: { paymentStatus: 'pending', items: [] } }),
    });
    render(
      <MemoryRouter initialEntries={['/downloads?order=ORD-X']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    const campo = await screen.findByLabelText('E-mail usado na compra');
    expect(globalThis.fetch).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'compradora@escola.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar pedido' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toContain('/verify-payment');
    expect(JSON.parse(options.body)).toEqual({ orderId: 'ORD-X', email: 'compradora@escola.com' });
  });

  it('não lê e-mail da URL; pede o segundo fator na própria tela', async () => {
    globalThis.fetch = vi.fn();
    render(
      <MemoryRouter initialEntries={['/downloads?order=ORD-X&email=cliente%40teste.com']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/informe abaixo o e-mail usado na compra/i)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('E-mail usado na compra')).toBeInTheDocument();
  });
});
