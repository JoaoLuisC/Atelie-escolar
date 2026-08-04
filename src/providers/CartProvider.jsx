import React from 'react';
import PropTypes from 'prop-types';
import { readCart, writeCart } from '../utils/cart-storage';
import { buildItemPayload, trackEvent } from '../utils/analytics';

export const CartContext = React.createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = React.useState(() => readCart());
  // Espelho síncrono do carrinho: permite checagens (exists/removed) sem prender
  // os callbacks a `cart`, mantendo-os estáveis entre renders (deps []).
  const cartRef = React.useRef(cart);

  React.useEffect(() => {
    cartRef.current = cart;
    writeCart(cart);
  }, [cart]);

  const addToCart = React.useCallback((product) => {
    const exists = cartRef.current.some((item) => String(item.id) === String(product.id));

    if (exists) {
      return { ok: false, message: 'Este produto já está no carrinho.' };
    }

    setCart((prev) => [
      ...prev,
      {
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        image: product.image || '',
        // categoryId é necessário para a elegibilidade de cupom por categoria
        // na prévia do checkout (validate-coupon). Sem ele o cupom restrito
        // sempre reporta "não elegível", divergindo da cobrança em create-payment.
        categoryId: product.categoryId ?? product.category_id ?? null,
        quantity: 1,
      },
    ]);
    trackEvent('add_to_cart', {
      currency: 'BRL',
      value: Number(product.price) || 0,
      items: [buildItemPayload(product)],
    });
    return { ok: true, message: 'Produto adicionado ao carrinho.' };
  }, []);

  const removeFromCart = React.useCallback((productId) => {
    const removed = cartRef.current.find((item) => String(item.id) === String(productId));
    setCart((prev) => prev.filter((item) => String(item.id) !== String(productId)));
    if (removed) {
      trackEvent('remove_from_cart', {
        currency: 'BRL',
        value: Number(removed.price) || 0,
        items: [{ item_id: String(removed.id), item_name: removed.name, price: Number(removed.price) || 0 }],
      });
    }
  }, []);

  const clearCart = React.useCallback(() => {
    setCart([]);
  }, []);

  const total = React.useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0),
    [cart],
  );

  const value = React.useMemo(
    () => ({
      cart,
      total,
      addToCart,
      removeFromCart,
      clearCart,
    }),
    [addToCart, cart, clearCart, removeFromCart, total],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

CartProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
