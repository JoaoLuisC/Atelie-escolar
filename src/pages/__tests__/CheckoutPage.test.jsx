import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CheckoutPage } from '../CheckoutPage';

// Estado mutável dos mocks: cada teste ajusta o que precisa e o beforeEach
// devolve ao padrão (cliente logado, carrinho com 1 item, sem mudança de preço).
const cartState = {};
const authState = {};

function resetMockState() {
  Object.assign(cartState, {
    cart: [{ id: 1, name: 'Produto Teste', price: 10, quantity: 1 }],
    total: 10,
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    applyQuote: undefined,
    revalidateCart: undefined,
    priceNotice: null,
    dismissPriceNotice: vi.fn(),
  });
  Object.assign(authState, {
    customerSession: { email: 'cliente@teste.com', name: 'Cliente Teste' },
    setCustomerSession: vi.fn(),
    logoutCustomer: vi.fn(),
  });
}
resetMockState();

vi.mock('../../hooks/useCart', () => ({
  useCart: () => cartState,
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    pushToast: vi.fn(),
  }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

function renderAt(url = '/checkout') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CheckoutPage />
    </MemoryRouter>,
  );
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    resetMockState();
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
          json: async () => ({
            success: true,
            orderId: 'ORD-1',
            initPoint: 'https://sandbox.mercadopago.com/pagar',
          }),
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
          json: async () => ({
            success: true,
            orderId: 'ORD-2',
            initPoint: 'https://sandbox.mercadopago.com/pagar',
          }),
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
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(pollDone).not.toBeNull();

    // Deixa o poll rodar as 152 iterações (até o ramo de timeout) e o React
    // comitar o último setState.
    await pollDone;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText(/Demorou mais do que esperávamos/i)).toBeInTheDocument();
  });
  it('logado, o e-mail é o da conta e não é editável (LOJA-40)', () => {
    renderAt();
    const email = screen.getByLabelText('E-mail');
    expect(email).toHaveValue('cliente@teste.com');
    expect(email).toHaveAttribute('readonly');
    expect(screen.getByText(/O pedido fica na sua conta/)).toBeInTheDocument();
  });

  it('convidado digita o e-mail normalmente', () => {
    authState.customerSession = null;
    renderAt();
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('readonly');
  });

  it('volta do Mercado Pago com ?status=failure avisa a recusa (LOJA-38)', () => {
    renderAt('/checkout?status=failure&order=ORD-9');
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('O pagamento não foi concluído');
    expect(alerta).toHaveTextContent('ORD-9');
  });

  it('volta do Mercado Pago com ?status=pending avisa a análise e aponta o pedido (LOJA-38)', () => {
    renderAt('/checkout?status=pending&order=ORD-9');
    expect(screen.getByText('Pagamento em análise')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Acompanhar pedido/ });
    expect(link.getAttribute('href')).toContain('/downloads?order=ORD-9');
  });

  it('checkout normal não mostra aviso de retorno', () => {
    renderAt('/checkout');
    expect(screen.queryByText(/O pagamento não foi concluído/)).toBeNull();
    expect(screen.queryByText('Pagamento em análise')).toBeNull();
  });

  it('revalida o carrinho ao abrir (CROSS-03)', () => {
    cartState.revalidateCart = vi.fn(async () => ({
      ok: true,
      cart: cartState.cart,
      changed: [],
      removed: [],
    }));
    renderAt();
    expect(cartState.revalidateCart).toHaveBeenCalledTimes(1);
  });

  it('preço mudou no servidor: a cobrança NÃO sai e o aviso aparece (CROSS-03)', async () => {
    const novoCarrinho = [{ id: 1, name: 'Produto Teste', price: 12.9, quantity: 1 }];
    cartState.priceNotice = {
      changed: [{ id: 1, name: 'Produto Teste', oldPrice: 10, newPrice: 12.9 }],
      removed: [],
    };
    cartState.revalidateCart = vi.fn(async () => ({
      ok: true,
      cart: novoCarrinho,
      changed: cartState.priceNotice.changed,
      removed: [],
    }));
    globalThis.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true }) }),
    );

    renderAt();
    expect(screen.getByText('Seu carrinho foi atualizado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ir para pagamento' }));

    await waitFor(() => {
      expect(screen.getByText(/Confira o novo total/)).toBeInTheDocument();
    });
    const chamadas = globalThis.fetch.mock.calls.map(([url]) => String(url));
    expect(chamadas.some((url) => url.includes('/create-payment'))).toBe(false);
  });

  it('logado, o create-payment leva o e-mail da conta e o cookie', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (String(url).includes('/create-payment')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, orderId: 'ORD-3', initPoint: 'https://mp/pagar' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });

    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para pagamento' }));

    await waitFor(() => {
      const chamada = globalThis.fetch.mock.calls.find(([url]) =>
        String(url).includes('/create-payment'),
      );
      expect(chamada).toBeTruthy();
      expect(chamada[1].credentials).toBe('include');
      expect(JSON.parse(chamada[1].body).customer.email).toBe('cliente@teste.com');
    });
  });
});
