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
    authState.customerSession = { email: 'cliente@teste.com' };

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

    expect(await screen.findByText(/Nenhum produto liberado ainda/)).toBeInTheDocument();
    expect(screen.queryByText(/entre na sua conta/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico de pedidos' }));
    expect(screen.getByText(/Escolha um pedido no seu histórico/)).toBeInTheDocument();
  });

  it('lista produtos aprovados e prepara um novo link de download', async () => {
    authState.customerSession = { email: 'cliente@teste.com' };
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true,
      json: async () =>
        String(url).includes('/customer-orders')
          ? {
              success: true,
              orders: [
                {
                  orderId: 'ORD-1',
                  paymentStatus: 'approved',
                  items: [{ id: 'p1', title: 'Material' }],
                },
              ],
            }
          : {
              success: true,
              order: {
                paymentStatus: 'approved',
                downloadTokens: [{ productId: 'p1', token: 'novo-token', available: true }],
              },
            },
    }));
    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <DownloadsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Material')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));
    expect(await screen.findByRole('link', { name: 'Baixar arquivo' })).toHaveAttribute(
      'href',
      expect.stringContaining('novo-token'),
    );
  });

  function mockRefundApi(eligibility) {
    globalThis.fetch = vi.fn(async (url, init = {}) => ({
      ok: true,
      json: async () => {
        if (String(url).includes('/customer-orders')) {
          return {
            success: true,
            orders: [
              {
                orderId: 'ORD-1',
                internalOrderId: 'pedido-1',
                paymentStatus: 'approved',
                totalAmount: 20,
                createdAt: '2026-10-30T12:00:00.000Z',
                items: [{ id: 'p1', title: 'Kit de leitura' }],
              },
            ],
          };
        }
        if (String(url).includes('/verify-payment')) {
          return {
            success: true,
            order: { orderId: 'ORD-1', paymentStatus: 'approved', items: [], downloadTokens: [] },
          };
        }
        if (String(url).includes('/refund-request') && init.method !== 'POST') {
          return { success: true, requests: [], eligibility: [eligibility] };
        }
        return { success: true, requestId: 'r1' };
      },
    }));
  }

  function postedRefund() {
    const [, options] = globalThis.fetch.mock.calls.find(
      ([url, init]) => String(url).includes('/refund-request') && init?.method === 'POST',
    );
    return JSON.parse(options.body);
  }

  it('"Seus produtos" conta PRODUTOS liberados, não pedidos', async () => {
    authState.customerSession = { email: 'cliente@teste.com' };
    mockRefundApi({ orderId: 'ORD-1', flow: 'simple' });
    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <DownloadsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Kit de leitura')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Seus produtos\s*1/ })).toBeInTheDocument();
    expect(screen.queryByText(/pedido\(s\)/)).not.toBeInTheDocument();
  });

  it('histórico: a linha inteira abre o pedido, com data, itens, total e situação', async () => {
    authState.customerSession = { email: 'cliente@teste.com' };
    mockRefundApi({ orderId: 'ORD-1', flow: 'simple' });
    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <DownloadsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Histórico de pedidos' }));
    const row = await screen.findByRole('button', { name: 'Abrir pedido ORD-1' });
    expect(row).toHaveTextContent('30/10/2026');
    expect(row).toHaveTextContent('1 item');
    expect(row).toHaveTextContent('Aprovado');
    expect(screen.queryByRole('button', { name: /Desistir da compra/ })).not.toBeInTheDocument();
  });

  it('sem download e no prazo: desistência com um clique dentro do pedido aberto', async () => {
    authState.customerSession = { email: 'cliente@teste.com' };
    mockRefundApi({ orderId: 'ORD-1', flow: 'simple', deadline: '2026-11-08T12:00:00.000Z' });
    render(
      <MemoryRouter initialEntries={['/downloads?order=ORD-1']}>
        <DownloadsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Histórico de pedidos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Desistir da compra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desistência' }));
    expect(await screen.findByText(/Desistência do pedido #ORD-1 registrada/)).toBeInTheDocument();
    expect(postedRefund()).toEqual({
      orderId: 'ORD-1',
      reasonCategory: 'desistencia',
      reason: '',
      phone: '',
    });
  });

  it('já baixou: mostra a data do download e pede categoria e descrição', async () => {
    authState.customerSession = { email: 'cliente@teste.com' };
    mockRefundApi({
      orderId: 'ORD-1',
      flow: 'support',
      flowReason: 'downloaded',
      firstDownloadAt: '2026-10-30T12:00:00.000Z',
      downloadCount: 2,
    });
    render(
      <MemoryRouter initialEntries={['/downloads?order=ORD-1']}>
        <DownloadsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Histórico de pedidos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir suporte ou devolução' }));
    expect(screen.getByRole('note')).toHaveTextContent(/já foi baixado em 30\/10\/2026/);
    const select = screen.getByLabelText('O que aconteceu?');
    const descricao = screen.getByLabelText(/Descreva o problema/);
    expect(select).toBeRequired();
    expect(descricao).toBeRequired();
    fireEvent.change(select, { target: { value: 'nao_abre' } });
    fireEvent.change(descricao, { target: { value: 'O PDF abre em branco no computador.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido de suporte' }));
    expect(await screen.findByText(/responde em até 5 dias úteis/)).toBeInTheDocument();
    expect(postedRefund()).toMatchObject({
      reasonCategory: 'nao_abre',
      reason: 'O PDF abre em branco no computador.',
    });
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
