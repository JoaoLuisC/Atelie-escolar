import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CheckoutPage } from '../CheckoutPage';

vi.mock('../../hooks/useCart', () => ({
  useCart: () => ({
    cart: [
      { id: 1, name: 'Produto Teste', price: 10, quantity: 1 },
    ],
    total: 10,
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    pushToast: vi.fn(),
  }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    customerSession: { email: 'cliente@teste.com', name: 'Cliente Teste' },
    setCustomerSession: vi.fn(),
    logoutCustomer: vi.fn(),
  }),
}));

describe('CheckoutPage', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    globalThis.open = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preenche dados com a sessao do cliente', () => {
    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue('cliente@teste.com')).toBeInTheDocument();
    expect(screen.getByText('Comprando como')).toBeInTheDocument();
  });

  it('mostra mensagem quando pagamento e recusado', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback) => {
      Promise.resolve().then(() => callback());
      return 1;
    });
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    // Roteia por URL (não por ordem): o efeito de carrinho abandonado pode
    // disparar um fetch extra a qualquer momento e não deve "roubar" a resposta
    // do create-payment/verify-payment.
    globalThis.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/create-payment')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, orderId: 'ORD-1', initPoint: 'https://sandbox.mercadopago.com/pagar' }),
        });
      }
      if (u.includes('/verify-payment')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, order: { paymentStatus: 'rejected' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ir para pagamento' }));

    await waitFor(() => {
      expect(screen.getByText(/Não conseguimos confirmar este pagamento/i)).toBeInTheDocument();
    });
  });

  it('mostra timeout quando pedido fica pendente por muito tempo', async () => {
    // O poll usa setInterval; deixar o mock auto-executar o callback e usar
    // waitFor criava corrida sob carga (os dois compartilham o setInterval
    // mockado). Aqui expomos a promise do loop e a aguardamos diretamente —
    // sem waitFor —, tornando o teste determinístico.
    let pollDone = null;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback) => {
      pollDone = (async () => {
        for (let i = 0; i < 152; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await callback();
        }
      })();
      return 1;
    });
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    // Roteia por URL (não por ordem): o efeito de carrinho abandonado dispara
    // um fetch extra que não deve "roubar" a resposta do create/verify-payment.
    globalThis.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/create-payment')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, orderId: 'ORD-2', initPoint: 'https://sandbox.mercadopago.com/pagar' }),
        });
      }
      if (u.includes('/verify-payment')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, order: { paymentStatus: 'pending' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ir para pagamento' }));

    // Aguarda o onSubmit resolver e o efeito registrar o intervalo (poll).
    // Flush por macrotask; sem waitFor para não colidir com o setInterval mock.
    for (let i = 0; i < 50 && pollDone === null; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(pollDone).not.toBeNull();

    // Deixa o poll rodar as 152 iterações (até o ramo de timeout) e o React
    // comitar o último setState.
    await pollDone;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText(/Demorou mais do que esperávamos/i)).toBeInTheDocument();
  });
});
