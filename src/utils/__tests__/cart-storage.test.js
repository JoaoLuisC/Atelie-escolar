import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyQuoteToCart, cartSignatureOf, readCart, writeCart } from '../cart-storage';

// ════════════════════════════════════════════════════════════════════
// LOJA-01: um `cart` corrompido no localStorage derrubava o site inteiro em
// "Algo deu errado" (cart.reduce is not a function), e "Recarregar" não
// resolvia. CROSS-03/04: o carrinho guardava o preço do "Adicionar" e nunca
// o conferia com o servidor.
// ════════════════════════════════════════════════════════════════════

describe('readCart — dado guardado não é confiável', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each([
    ['objeto em vez de array', '{}'],
    ['JSON quebrado', '[{"id":'],
    ['número', '42'],
    ['string', '"carrinho"'],
    ['null', 'null'],
  ])('%s vira carrinho vazio', (_caso, raw) => {
    localStorage.setItem('cart', raw);
    expect(readCart()).toEqual([]);
  });

  it('descarta itens sem forma de item e normaliza os campos', () => {
    localStorage.setItem(
      'cart',
      JSON.stringify([
        null,
        'texto',
        { name: 'sem id' },
        { id: 'a', name: 'Ok', price: '9.9', quantity: 0 },
        { id: 'b', name: 'Preço ruim', price: 'abc' },
      ]),
    );
    const cart = readCart();
    expect(cart.map((item) => item.id)).toEqual(['a', 'b']);
    expect(cart[0]).toMatchObject({ price: 9.9, quantity: 1, image: '' });
    expect(cart[1].price).toBe(0);
    // O total do CartProvider passa a funcionar.
    expect(cart.reduce((sum, item) => sum + item.price * item.quantity, 0)).toBeCloseTo(9.9);
  });

  it('remove produto repetido', () => {
    localStorage.setItem(
      'cart',
      JSON.stringify([
        { id: 'a', name: 'A', price: 1 },
        { id: 'a', name: 'A de novo', price: 1 },
      ]),
    );
    expect(readCart()).toHaveLength(1);
  });
});

describe('writeCart — nunca joga', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cota cheia devolve false em vez de derrubar a árvore', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cota', 'QuotaExceededError');
    });
    expect(() => writeCart([{ id: 'a' }])).not.toThrow();
    expect(writeCart([{ id: 'a' }])).toBe(false);
  });
});

describe('applyQuoteToCart', () => {
  const cart = [
    { id: 'p1', name: 'Banner', price: 9.9, quantity: 1, categoryId: 'c1' },
    { id: 'p2', name: 'Quadrilha', price: 29.9, quantity: 1, categoryId: 'c2' },
  ];

  it('preço mudado no painel vira o preço do servidor e é reportado', () => {
    const result = applyQuoteToCart(cart, [
      { productId: 'p1', name: 'Banner', price: 12.9, categoryId: 'c1', available: true },
      { productId: 'p2', name: 'Quadrilha', price: 29.9, categoryId: 'c2', available: true },
    ]);
    expect(result.cart.map((item) => item.price)).toEqual([12.9, 29.9]);
    expect(result.changed).toEqual([{ id: 'p1', name: 'Banner', oldPrice: 9.9, newPrice: 12.9 }]);
    expect(result.removed).toEqual([]);
  });

  it('produto pausado sai do carrinho (CROSS-04)', () => {
    const result = applyQuoteToCart(cart, [
      { productId: 'p1', price: 0, available: false },
      { productId: 'p2', name: 'Quadrilha', price: 29.9, categoryId: 'c2', available: true },
    ]);
    expect(result.cart.map((item) => item.id)).toEqual(['p2']);
    expect(result.removed).toEqual([{ id: 'p1', name: 'Banner' }]);
  });

  it('sem mudança devolve o MESMO array', () => {
    const result = applyQuoteToCart(cart, [
      { productId: 'p1', name: 'Banner', price: 9.9, categoryId: 'c1', available: true },
    ]);
    expect(result.cart).toBe(cart);
    expect(result.changed).toEqual([]);
  });

  it('a assinatura muda com o preço — o cupom calculado antes deixa de valer', () => {
    const { cart: atualizado } = applyQuoteToCart(cart, [
      { productId: 'p1', name: 'Banner', price: 12.9, categoryId: 'c1', available: true },
    ]);
    expect(cartSignatureOf(atualizado)).not.toBe(cartSignatureOf(cart));
  });
});
