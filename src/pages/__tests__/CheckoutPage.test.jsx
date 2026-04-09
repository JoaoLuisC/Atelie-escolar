import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          orderId: 'ORD-1',
          initPoint: 'https://sandbox.mercadopago.com/pagar',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          order: { paymentStatus: 'rejected' },
        }),
      });

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ir para pagamento' }));

    await waitFor(() => {
      expect(screen.getByText('Pagamento nao aprovado. Tente novamente.')).toBeInTheDocument();
    });
  });

  it('mostra timeout quando pedido fica pendente por muito tempo', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback) => {
      (async () => {
        for (let i = 0; i < 152; i += 1) {
          await callback();
        }
      })();
      return 1;
    });
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          orderId: 'ORD-2',
          initPoint: 'https://sandbox.mercadopago.com/pagar',
        }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          order: { paymentStatus: 'pending' },
        }),
      });

    render(
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ir para pagamento' }));

    await waitFor(() => {
      expect(screen.getByText('Tempo de espera excedido. Voce pode verificar mais tarde em Downloads.')).toBeInTheDocument();
    });
  });
});
