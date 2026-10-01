import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const quoteCart = vi.fn();
vi.mock('../../services/checkout', () => ({
  quoteCart: (...args) => quoteCart(...args),
}));
vi.mock('../../utils/analytics', () => ({
  buildItemPayload: () => ({}),
  trackEvent: vi.fn(),
}));

import { CartProvider } from '../CartProvider';
import { useCart } from '../../hooks/useCart';

function Sonda({ onCtx }) {
  const ctx = useCart();
  onCtx(ctx);
  return <span data-testid="total">{ctx.total}</span>;
}

function montar() {
  const ctx = { atual: null };
  render(
    <CartProvider>
      <Sonda onCtx={(value) => (ctx.atual = value)} />
    </CartProvider>,
  );
  return ctx;
}

describe('CartProvider', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    quoteCart.mockReset();
  });

  it('carrinho corrompido no storage NÃO derruba a árvore (LOJA-01)', () => {
    localStorage.setItem('cart', '{}');
    montar();
    expect(screen.getByTestId('total').textContent).toBe('0');
    // A próxima gravação substitui o valor ruim: um F5 já não cai de novo.
    expect(localStorage.getItem('cart')).toBe('[]');
  });

  it('storage sem cota: adicionar não derruba a árvore (LOJA-01)', () => {
    const ctx = montar();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cota', 'QuotaExceededError');
    });
    act(() => {
      ctx.atual.addToCart({ id: 'p1', name: 'Banner', price: 9.9 });
    });
    expect(screen.getByTestId('total').textContent).toBe('9.9');
  });

  it('revalidateCart aplica o preço do servidor e avisa (CROSS-03)', async () => {
    localStorage.setItem('cart', JSON.stringify([{ id: 'p1', name: 'Banner', price: 9.9 }]));
    quoteCart.mockResolvedValue([
      { productId: 'p1', name: 'Banner', price: 12.9, categoryId: 'c1', available: true },
    ]);
    const ctx = montar();

    let result;
    await act(async () => {
      result = await ctx.atual.revalidateCart();
    });

    expect(result.ok).toBe(true);
    expect(result.cart[0].price).toBe(12.9);
    expect(screen.getByTestId('total').textContent).toBe('12.9');
    expect(ctx.atual.priceNotice.changed).toEqual([
      { id: 'p1', name: 'Banner', oldPrice: 9.9, newPrice: 12.9 },
    ]);
  });

  it('sem rede, revalidateCart não joga e mantém o carrinho', async () => {
    localStorage.setItem('cart', JSON.stringify([{ id: 'p1', name: 'Banner', price: 9.9 }]));
    quoteCart.mockRejectedValue(new Error('Failed to fetch'));
    const ctx = montar();

    let result;
    await act(async () => {
      result = await ctx.atual.revalidateCart();
    });

    expect(result.ok).toBe(false);
    expect(screen.getByTestId('total').textContent).toBe('9.9');
    expect(ctx.atual.priceNotice).toBeNull();
  });
});
