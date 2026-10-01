import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { CART_KEY, applyQuoteToCart, readCart, writeCart } from '../utils/cart-storage';
import { buildItemPayload, trackEvent } from '../utils/analytics';
import { quoteCart } from '../services/checkout';

export const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => readCart());
  // Aviso de preço/disponibilidade da última revalidação (CROSS-03/CROSS-04):
  // { changed: [{ id, name, oldPrice, newPrice }], removed: [{ id, name }] }.
  // Fica até a pessoa dispensar — ela precisa VER que o total mudou.
  const [priceNotice, setPriceNotice] = useState(null);
  // Espelho síncrono do carrinho: permite checagens (exists/removed) sem prender
  // os callbacks a `cart`, mantendo-os estáveis entre renders (deps []).
  const cartRef = useRef(cart);
  // Revalidação em andamento: o drawer e o checkout podem pedir ao mesmo tempo.
  const quoteInFlightRef = useRef(null);

  useEffect(() => {
    cartRef.current = cart;
    // writeCart engole cota cheia / storage bloqueado (LOJA-01): o carrinho
    // segue em memória até o fim da visita.
    writeCart(cart);
  }, [cart]);

  // Outra aba mudou o carrinho (ou o limpou): acompanha, em vez de a próxima
  // gravação desta aba ressuscitar o estado antigo (CROSS-15, parte do carrinho).
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== null && event.key !== CART_KEY) return;
      const next = readCart();
      cartRef.current = next;
      setCart(next);
    };
    globalThis.window?.addEventListener('storage', onStorage);
    return () => globalThis.window?.removeEventListener('storage', onStorage);
  }, []);

  const commitCart = useCallback((next) => {
    // Atualiza o espelho JÁ, e não só no efeito: quem chamou (o checkout, logo
    // antes de criar o pagamento) lê o carrinho novo na mesma tarefa.
    cartRef.current = next;
    setCart(next);
  }, []);

  const addToCart = useCallback((product) => {
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

  const removeFromCart = useCallback((productId) => {
    const removed = cartRef.current.find((item) => String(item.id) === String(productId));
    setCart((prev) => prev.filter((item) => String(item.id) !== String(productId)));
    if (removed) {
      trackEvent('remove_from_cart', {
        currency: 'BRL',
        value: Number(removed.price) || 0,
        items: [
          {
            item_id: String(removed.id),
            item_name: removed.name,
            price: Number(removed.price) || 0,
          },
        ],
      });
    }
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setPriceNotice(null);
  }, []);

  /**
   * Aplica uma cotação já obtida (a prévia do cupom devolve os preços que usou).
   * Síncrono: devolve o carrinho resultante para quem precisa dele na hora.
   */
  const applyQuote = useCallback(
    (quoteItems) => {
      const result = applyQuoteToCart(cartRef.current, quoteItems);
      if (result.cart !== cartRef.current) commitCart(result.cart);
      if (result.changed.length || result.removed.length) {
        setPriceNotice({ changed: result.changed, removed: result.removed });
      }
      return result;
    },
    [commitCart],
  );

  /**
   * Relê no servidor o preço e a disponibilidade de cada item (CROSS-03).
   *
   * O carrinho guardava o preço do momento do "Adicionar", e o create-payment
   * cobra o preço de agora: depois de uma mudança no painel, a tela mostrava um
   * total e o Mercado Pago cobrava outro. NUNCA joga — sem rede, `ok: false` e
   * o carrinho fica como está (o servidor continua sendo quem cobra).
   *
   * @returns {Promise<{ ok: boolean, cart: Array, changed: Array, removed: Array }>}
   */
  const revalidateCart = useCallback(async () => {
    if (cartRef.current.length === 0) {
      return { ok: true, cart: cartRef.current, changed: [], removed: [] };
    }
    if (quoteInFlightRef.current) return quoteInFlightRef.current;

    const run = (async () => {
      try {
        const quoteItems = await quoteCart(cartRef.current);
        return { ok: true, ...applyQuote(quoteItems) };
      } catch {
        return { ok: false, cart: cartRef.current, changed: [], removed: [] };
      } finally {
        quoteInFlightRef.current = null;
      }
    })();
    quoteInFlightRef.current = run;
    return run;
  }, [applyQuote]);

  const dismissPriceNotice = useCallback(() => setPriceNotice(null), []);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0),
    [cart],
  );

  const value = useMemo(
    () => ({
      cart,
      total,
      addToCart,
      removeFromCart,
      clearCart,
      applyQuote,
      revalidateCart,
      priceNotice,
      dismissPriceNotice,
    }),
    [
      addToCart,
      applyQuote,
      cart,
      clearCart,
      dismissPriceNotice,
      priceNotice,
      removeFromCart,
      revalidateCart,
      total,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

CartProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
