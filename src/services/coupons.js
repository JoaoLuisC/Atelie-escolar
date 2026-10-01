import { apiRequest, errorMessageOf } from '../utils/api';

/**
 * Prévia de desconto para o carrinho (regra C2 — componente não fala com a API).
 *
 * Só vão `productId` e `quantity`: o backend relê preço e categoria de cada
 * item no banco (CROSS-03/CROSS-08), como o create-payment. Antes iam o
 * `price` e o `categoryId` guardados no carrinho, e a prévia calculava o
 * desconto sobre um preço que o checkout não cobraria mais.
 *
 * @param {string} code           código digitado pelo cliente
 * @param {Array}  cart           itens do carrinho (formato do CartProvider)
 * @returns {Promise<{ok: true, coupon, items, subtotal, discount, total} | {ok: false, message: string, code: string|null}>}
 *   `items` são os preços do servidor usados no cálculo (formato de `quoteCart`).
 */
export async function validateCoupon(code, cart = []) {
  const { data } = await apiRequest('/validate-coupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: String(code || '').trim(),
      items: (Array.isArray(cart) ? cart : []).map((item) => ({
        productId: String(item.id),
        quantity: Number(item.quantity || 1),
      })),
    }),
  });

  if (!data.success) {
    return {
      ok: false,
      message: errorMessageOf(data) || 'Cupom inválido.',
      // O `code` vem do envelope da regra A1/A2 (COUPON_EXPIRED,
      // COUPON_MINIMUM_NOT_MET…). É por ele que a tela deve ramificar quando
      // precisar de tratamento diferente por motivo — nunca pelo texto.
      code: data.error?.code || null,
    };
  }

  return {
    ok: true,
    coupon: data.coupon,
    items: Array.isArray(data.items) ? data.items : [],
    subtotal: data.subtotal,
    discount: data.discount,
    total: data.total,
  };
}
