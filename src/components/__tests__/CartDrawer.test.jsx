import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CartDrawer } from '../CartDrawer';
import { CartContext } from '../../providers/CartProvider';

function renderDrawer(ctx) {
  return render(
    <MemoryRouter>
      <CartContext.Provider value={ctx}>
        <CartDrawer isOpen onClose={vi.fn()} />
      </CartContext.Provider>
    </MemoryRouter>,
  );
}

const DOIS_ITENS = [
  { id: 'p1', name: 'Banner', price: 12.9, quantity: 1 },
  { id: 'p2', name: 'Quadrilha', price: 29.9, quantity: 1 },
];

describe('CartDrawer', () => {
  it('plural em português (LOJA-18)', () => {
    renderDrawer({ cart: DOIS_ITENS, total: 42.8 });
    expect(screen.getByRole('heading', { name: '2 itens' })).toBeInTheDocument();
  });

  it('ao abrir, revalida os preços e mostra o que mudou (CROSS-03)', () => {
    const revalidateCart = vi.fn();
    renderDrawer({
      cart: DOIS_ITENS,
      total: 42.8,
      revalidateCart,
      priceNotice: {
        changed: [{ id: 'p1', name: 'Banner', oldPrice: 9.9, newPrice: 12.9 }],
        removed: [{ id: 'p3', name: 'Pausado' }],
      },
      dismissPriceNotice: vi.fn(),
    });

    expect(revalidateCart).toHaveBeenCalledTimes(1);
    const aviso = screen.getByText('Seu carrinho foi atualizado').closest('[role="status"]');
    expect(aviso).toHaveTextContent('R$ 9,90');
    expect(aviso).toHaveTextContent('R$ 12,90');
    expect(aviso).toHaveTextContent('Pausado não está mais disponível');
  });

  it('fica acima do banner de cookies (z-50) no mobile (LOJA-04)', () => {
    renderDrawer({ cart: DOIS_ITENS, total: 42.8 });
    expect(screen.getByRole('dialog').className).toContain('z-[60]');
  });
});
