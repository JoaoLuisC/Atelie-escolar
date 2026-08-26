const { getSupabaseConfig } = require('../lib/supabase');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { parseOrFail } = require('../validation');
const { validateCouponSchema } = require('../validation/payment.schemas');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('validate-coupon');
const {
  loadCoupon,
  validateCouponState,
  buildEligibleSet,
  computeDiscount,
} = require('../lib/coupons');

module.exports = async function validateCouponHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // Rate limit ANTES de qualquer consulta (achado P1-3). Este endpoint é um
  // ORÁCULO: a diferença entre 422 `not_found` e 200 revela se um código existe,
  // então sem contador ele enumera o catálogo inteiro de cupons a força bruta.
  // 20/min por IP replica exatamente o validateCouponLimiter que só existia no
  // Express de desenvolvimento (routes/api-compat.routes.js:150-156) — a
  // divergência dev/prod era a causa raiz do achado.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.validateCoupon);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    // Regra B1: o schema aplica o MESMO teto de itens de api/create-payment.js
    // (importado de validation/payment.schemas.js, não redigitado aqui) e já
    // devolve `price`/`quantity` numéricos — por isso as somas abaixo não
    // precisam mais de `Number(item.price || 0)`, que era a coerção defensiva
    // que a regra B2 proíbe.
    const parsed = parseOrFail(res, validateCouponSchema, req.body || {});
    if (!parsed.ok) return;
    const { code, items } = parsed.data;

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const coupon = await loadCoupon(code);
    const state = validateCouponState(coupon, subtotal);
    if (!state.ok) {
      // 422: cupom sintaticamente válido mas semanticamente não aplicável
      // (inexistente, expirado, esgotado, abaixo do mínimo etc.). O `code` já
      // vem canônico de lib/coupons.js — ver a nota da regra A2 lá.
      return fail(res, { status: 422, code: state.code, message: state.message });
    }

    const { eligible, restricted } = buildEligibleSet(coupon.applies_to, items);
    const eligibleSubtotal = eligible.reduce((sum, item) => sum + item.price * item.quantity, 0);

    if (restricted && eligibleSubtotal === 0) {
      return fail(res, {
        status: 422,
        code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
        message: 'Os itens do carrinho não são elegíveis para este cupom.',
      });
    }

    const discount = computeDiscount(coupon, subtotal, eligibleSubtotal);
    const total = Math.max(0, subtotal - discount);

    return ok(res, {
      coupon: {
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: Number(coupon.discount_value),
      },
      subtotal,
      discount,
      total,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao validar cupom.',
    });
  }
};

// NOTA: aqui existia um `module.exports.helpers = {…}` reexportando os helpers
// de cupom. Era resíduo do acoplamento antigo, quando api/create-payment.js
// importava este handler só para pegar as funções. Hoje os dois importam
// lib/coupons.js diretamente e nada mais consumia o reexport (confirmado por
// varredura em api/, lib/, routes/, src/ e tests/). Um handler serverless que
// também é biblioteca convida exatamente o acoplamento que já foi desfeito.
