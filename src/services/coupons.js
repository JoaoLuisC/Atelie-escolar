import { apiRequest } from '../utils/api';

/**
 * Prévia de desconto para o carrinho (regra C2 — componente não fala com a API).
 *
 * A montagem do payload mora aqui, e não em `CouponField`, porque o backend
 * exige `categoryId` em cada item para decidir elegibilidade de cupom restrito.
 * Enquanto isso vivia dentro do componente, qualquer nova tela que aplicasse
 * cupom teria de redescobrir o formato — e um item sem `categoryId` faz o
 * cupom restrito reportar "não elegível", divergindo da cobrança real em
 * `create-payment`.
 *
 * @param {string} code           código digitado pelo cliente
 * @param {Array}  cart           itens do carrinho (formato do CartProvider)
 * @returns {Promise<{ok: true, coupon, subtotal, discount, total} | {ok: false, message: string, code: string|null}>}
 */
export async function validateCoupon(code, cart = []) {
  const { data } = await apiRequest('/validate-coupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: String(code || '').trim(),
      items: (Array.isArray(cart) ? cart : []).map((item) => ({
        productId: String(item.id),
        categoryId: item.categoryId || null,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
      })),
    }),
  });

  if (!data.success) {
    return {
      ok: false,
      message: data.error || 'Cupom inválido.',
      // `errorCode` vem do envelope da regra A1/A2 (COUPON_EXPIRED,
      // COUPON_MINIMUM_NOT_MET…). É por ele que a tela deve ramificar quando
      // precisar de tratamento diferente por motivo — nunca pelo texto.
      code: data.errorCode || null,
    };
  }

  return {
    ok: true,
    coupon: data.coupon,
    subtotal: data.subtotal,
    discount: data.discount,
    total: data.total,
  };
}
