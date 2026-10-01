const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows },
} = require('../lib/supabase');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { parseOrFail } = require('../validation');
const { UUID_RE } = require('../validation/common.schemas');
const { validateCouponSchema } = require('../validation/payment.schemas');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { sumItemsCents, toCentsOrZero, toReais } = require('../lib/money');
const { createLogger } = require('../lib/logger');

const log = createLogger('validate-coupon');
const {
  loadCoupon,
  validateCouponState,
  buildEligibleSet,
  computeDiscount,
} = require('../lib/coupons');

// Modo COTAÇÃO (`{ quote: true, items }`): o mesmo carrinho, sem cupom. Existe
// para a tela mostrar o preço que o create-payment VAI cobrar (CROSS-03): o
// carrinho guarda o preço do momento em que o item entrou, e o admin pode ter
// mudado o preço — ou pausado o produto — desde então. O schema é o MESMO da
// prévia, só sem o `code` (regra B1: o teto de itens não é redigitado aqui).
const quoteSchema = validateCouponSchema.omit({ code: true });

/**
 * Relê preço, nome, categoria e disponibilidade de cada item NO BANCO.
 *
 * ── POR QUE NÃO CONFIAR NO `price`/`categoryId` DO NAVEGADOR (CROSS-03/08) ──
 * A prévia somava o preço que o carrinho tinha guardado no localStorage. Depois
 * de o admin mudar o preço, a tela mostrava R$ 35,82 com o cupom enquanto o
 * create-payment — que sempre releu o banco — cobraria R$ 38,52. O mesmo valia
 * para cupom restrito por categoria: a elegibilidade era decidida pelo
 * `categoryId` que o cliente mandasse. Agora a prévia e a cobrança leem a
 * mesma fonte, e a divergência deixa de existir por construção.
 *
 * Item com id fora do formato UUID nem vai ao banco (o valor é interpolado em
 * `id=in.(…)` — achado B1): vira "indisponível", como um produto apagado.
 *
 * @returns {Promise<Array<{ productId, name, price, categoryId, quantity, available }>>}
 *   na MESMA ordem dos itens recebidos.
 */
async function loadServerPricedItems(items) {
  const idOf = (item) => String(item.productId ?? item.id ?? '').trim();
  const uniqueIds = [...new Set(items.map(idOf).filter((id) => UUID_RE.test(id)))];

  const rows = uniqueIds.length
    ? await listTableRows('products', {
        select: 'id,name,price,active,category_id',
        filters: [{ column: 'id', operator: 'in', value: `(${uniqueIds.join(',')})` }],
      })
    : [];
  const productById = new Map((rows || []).map((row) => [String(row.id), row]));

  return items.map((item) => {
    const productId = idOf(item);
    const product = productById.get(productId);
    const available = Boolean(product) && product.active !== false;
    return {
      productId,
      name: product?.name || null,
      price: available ? toReais(toCentsOrZero(product.price)) : 0,
      categoryId: product?.category_id ? String(product.category_id) : null,
      quantity: item.quantity,
      available,
    };
  });
}

module.exports = async function validateCouponHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  const isQuote = req.body?.quote === true;

  // Rate limit ANTES de qualquer consulta (achado P1-3). A prévia de cupom é
  // um ORÁCULO: a diferença entre 422 `not_found` e 200 revela se um código
  // existe, então sem contador ele enumera o catálogo inteiro de cupons a força
  // bruta. 20/min por IP replica exatamente o validateCouponLimiter que só
  // existia no Express de desenvolvimento (routes/api-compat.routes.js:150-156).
  //
  // A cotação NÃO revela nada sobre cupom (é o preço público do catálogo) e é
  // chamada ao abrir o carrinho e o checkout — sob o teto de 20/min, uma escola
  // atrás do mesmo IP esgotaria a prévia de cupom de todo mundo. Por isso ela
  // usa o balde de leitura de catálogo.
  const gate = await enforceRateLimit(
    req,
    res,
    isQuote ? RATE_LIMITS.catalog : RATE_LIMITS.validateCoupon,
  );
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    // Regra B1: o schema aplica o MESMO teto de itens de handlers/create-payment.js
    // (importado de validation/payment.schemas.js, não redigitado aqui).
    const parsed = parseOrFail(res, isQuote ? quoteSchema : validateCouponSchema, req.body || {});
    if (!parsed.ok) return;
    const { code, items: rawItems } = parsed.data;

    const pricedItems = await loadServerPricedItems(rawItems);
    // Só o que o create-payment aceitaria entra na conta: um item pausado ou
    // apagado faz o checkout recusar o pedido inteiro, então a tela o tira do
    // carrinho (ver CartProvider) e o desconto é calculado sem ele.
    const items = pricedItems.filter((item) => item.available);
    // Regra E3: soma em centavos inteiros, como no create-payment.
    const subtotal = toReais(sumItemsCents(items));

    if (isQuote) {
      return ok(res, { items: pricedItems, subtotal });
    }

    // CROSS-05: com o carrinho vazio, o cupom "aplicava" −R$ 0,00. Não há o
    // que descontar — e o 200 fazia a tela anunciar um cupom aplicado.
    if (items.length === 0) {
      return fail(res, {
        status: 422,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Adicione produtos ao carrinho antes de aplicar o cupom.',
      });
    }

    const coupon = await loadCoupon(code);
    const state = validateCouponState(coupon, subtotal);
    if (!state.ok) {
      // 422: cupom sintaticamente válido mas semanticamente não aplicável
      // (inexistente, expirado, esgotado, abaixo do mínimo etc.). O `code` já
      // vem canônico de lib/coupons.js — ver a nota da regra A2 lá.
      return fail(res, { status: 422, code: state.code, message: state.message });
    }

    const { eligible, restricted } = buildEligibleSet(coupon.applies_to, items);
    const eligibleSubtotal = toReais(sumItemsCents(eligible));

    if (restricted && eligibleSubtotal === 0) {
      return fail(res, {
        status: 422,
        code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
        message: 'Os itens do carrinho não são elegíveis para este cupom.',
      });
    }

    const discount = computeDiscount(coupon, subtotal, eligibleSubtotal);
    const total = toReais(Math.max(0, toCentsOrZero(subtotal) - toCentsOrZero(discount)));

    return ok(res, {
      coupon: {
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: Number(coupon.discount_value),
      },
      // Os preços sobre os quais o desconto foi calculado. A tela usa para
      // atualizar o carrinho quando eles divergem do que estava guardado.
      items: pricedItems,
      subtotal,
      discount,
      total,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: isQuote ? 'Erro ao atualizar os preços do carrinho.' : 'Erro ao validar cupom.',
    });
  }
};

// NOTA: aqui existia um `module.exports.helpers = {…}` reexportando os helpers
// de cupom. Era resíduo do acoplamento antigo, quando handlers/create-payment.js
// importava este handler só para pegar as funções. Hoje os dois importam
// lib/coupons.js diretamente e nada mais consumia o reexport (confirmado por
// varredura em api/, lib/, routes/, src/ e tests/). Um handler serverless que
// também é biblioteca convida exatamente o acoplamento que já foi desfeito.
