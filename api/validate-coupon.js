const { getSupabaseConfig } = require('../lib/supabase');
const {
  normalizeCode,
  loadCoupon,
  validateCouponState,
  buildEligibleSet,
  computeDiscount,
} = require('../lib/coupons');

module.exports = async function validateCouponHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

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

// Exportado para reuso no create-payment.js (os helpers vivem em lib/coupons.js).
module.exports.helpers = {
  loadCoupon,
  validateCouponState,
  buildEligibleSet,
  computeDiscount,
  normalizeCode,
};
