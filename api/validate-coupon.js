const { getSupabaseConfig } = require('../lib/supabase');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const {
  normalizeCode,
  loadCoupon,
  validateCouponState,
  buildEligibleSet,
  computeDiscount,
} = require('../lib/coupons');

// Mesmo teto de itens de api/create-payment.js: um carrinho que este endpoint
// aceitaria mas o checkout recusaria não serviria para nada, e a soma abaixo
// roda sobre um array vindo direto do cliente.
const MAX_ITEMS = 100;

module.exports = async function validateCouponHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

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
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const body = req.body || {};
    const code = normalizeCode(body.code);
    if (!code) {
      return res.status(400).json({ success: false, error: 'Informe o código do cupom.' });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ success: false, error: 'Quantidade de itens inválida.' });
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0,
    );

    const coupon = await loadCoupon(code);
    const state = validateCouponState(coupon, subtotal);
    if (!state.ok) {
      // 422: cupom sintaticamente válido mas semanticamente não aplicável
      // (inexistente, expirado, esgotado, abaixo do mínimo etc.).
      return res.status(422).json({ success: false, error: state.message, code: state.code });
    }

    const { eligible, restricted } = buildEligibleSet(coupon.applies_to, items);
    const eligibleSubtotal = eligible.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0,
    );

    if (restricted && eligibleSubtotal === 0) {
      return res.status(422).json({
        success: false,
        code: 'not_eligible',
        error: 'Os itens do carrinho não são elegíveis para este cupom.',
      });
    }

    const discount = computeDiscount(coupon, subtotal, eligibleSubtotal);
    const total = Math.max(0, subtotal - discount);

    return res.status(200).json({
      success: true,
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
    console.error('[validate-coupon]', error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao validar cupom.',
    });
  }
};

// NOTA: aqui existia um `module.exports.helpers = {…}` reexportando os helpers
// de cupom. Era resíduo do acoplamento antigo, quando api/create-payment.js
// importava este handler só para pegar as funções. Hoje os dois importam
// lib/coupons.js diretamente e nada mais consumia o reexport (confirmado por
// varredura em api/, lib/, routes/, src/ e tests/). Um handler serverless que
// também é biblioteca convida exatamente o acoplamento que já foi desfeito.
