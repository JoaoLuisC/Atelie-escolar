import React from 'react';
import PropTypes from 'prop-types';
import { readCart, writeCart } from '../utils/cart-storage';
import { buildItemPayload, trackEvent } from '../utils/analytics';

export const CartContext = React.createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = React.useState(() => readCart());

  React.useEffect(() => {
    writeCart(cart);
  }, [cart]);

  const addToCart = React.useCallback((product) => {
    const exists = cart.some((item) => String(item.id) === String(product.id));

    if (exists) {
      return { ok: false, message: 'Este produto ja esta no carrinho.' };
    }

    const next = [
      ...cart,
      {
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        image: product.image || '',
        quantity: 1,
      },
    ];

    setCart(next);
    trackEvent('add_to_cart', {
      currency: 'BRL',
      value: Number(product.price) || 0,
      items: [buildItemPayload(product)],
    });
    return { ok: true, message: 'Produto adicionado ao carrinho.' };
  }, [cart]);

  const removeFromCart = React.useCallback((productId) => {
    const removed = cart.find((item) => String(item.id) === String(productId));
    const nextCart = cart.filter((item) => String(item.id) !== String(productId));
    setCart(nextCart);
    if (removed) {
      trackEvent('remove_from_cart', {
        currency: 'BRL',
        value: Number(removed.price) || 0,
        items: [{ item_id: String(removed.id), item_name: removed.name, price: Number(removed.price) || 0 }],
      });
    }
  }, [cart]);

  const clearCart = React.useCallback(() => {
    setCart([]);
  }, []);

  const total = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0);

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
