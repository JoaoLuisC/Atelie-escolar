import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const validateCoupon = vi.fn();
vi.mock('../../services/coupons', () => ({
  validateCoupon: (...args) => validateCoupon(...args),
}));

import { CouponField } from '../CouponField';

const CART = [{ id: 'p1', name: 'Banner', price: 29.9, quantity: 1 }];

function abrirPainel() {
  fireEvent.click(screen.getByRole('button', { name: /Tem um cupom/ }));
}

describe('CouponField', () => {
  it('carrinho vazio não aplica cupom (CROSS-05)', () => {
    render(<CouponField cart={[]} applied={null} onApply={vi.fn()} />);
    abrirPainel();
    fireEvent.change(screen.getByLabelText('Código do cupom'), { target: { value: 'BEM10' } });
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
  });

  it('o campo respeita o teto de 40 caracteres do backend (LOJA-51)', () => {
    render(<CouponField cart={CART} applied={null} onApply={vi.fn()} />);
    abrirPainel();
    expect(screen.getByLabelText('Código do cupom')).toHaveAttribute('maxLength', '40');
  });

  it('repassa os preços do servidor ao aplicar (CROSS-03)', async () => {
    const items = [{ productId: 'p1', price: 32.9, available: true }];
    validateCoupon.mockResolvedValue({
      ok: true,
      coupon: { code: 'BEM10' },
      items,
      subtotal: 32.9,
      discount: 3.29,
      total: 29.61,
    });
    const onApply = vi.fn();
    render(<CouponField cart={CART} applied={null} onApply={onApply} />);
    abrirPainel();
    fireEvent.change(screen.getByLabelText('Código do cupom'), { target: { value: 'bem10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0]).toMatchObject({ code: 'BEM10', discount: 3.29, items });
  });

  it('cupom retirado pelo carrinho NÃO deixa "Desconto aplicado" velho na tela (CROSS-06)', async () => {
    validateCoupon.mockResolvedValue({
      ok: true,
      coupon: { code: 'BEM10' },
      items: [],
      subtotal: 29.9,
      discount: 2.99,
      total: 26.91,
    });
    const { rerender } = render(<CouponField cart={CART} applied={null} onApply={vi.fn()} />);
    abrirPainel();
    fireEvent.change(screen.getByLabelText('Código do cupom'), { target: { value: 'BEM10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await screen.findByText(/Desconto aplicado/);

    // O pai aplica o cupom e depois o retira (item removido do carrinho).
    rerender(<CouponField cart={CART} applied={{ code: 'BEM10', discount: 2.99 }} />);
    rerender(<CouponField cart={[]} applied={null} />);

    expect(screen.queryByText(/Desconto aplicado/)).toBeNull();
    expect(screen.getByText(/O carrinho mudou/)).toBeInTheDocument();
  });
});
