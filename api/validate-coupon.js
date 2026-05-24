const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow },
} = require('../lib/supabase');

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().slice(0, 64);
}

function nowIso() {
  return new Date().toISOString();
}

function buildEligibleSet(appliesTo, items) {
  // appliesTo: { category_ids: [...], product_ids: [...] } | {}
  const productIds = Array.isArray(appliesTo?.product_ids)
    ? appliesTo.product_ids.map(String)
    : [];
  const categoryIds = Array.isArray(appliesTo?.category_ids)
    ? appliesTo.category_ids.map(String)
    : [];

  if (productIds.length === 0 && categoryIds.length === 0) {
    return { eligible: items, restricted: false };
  }

  const eligible = items.filter((item) => (
    productIds.includes(String(item.productId))
    || categoryIds.includes(String(item.categoryId || ''))
  ));
  return { eligible, restricted: true };
}

function computeDiscount(coupon, subtotal, eligibleSubtotal) {
  const base = coupon.applies_to && (coupon.applies_to.product_ids?.length || coupon.applies_to.category_ids?.length)
    ? eligibleSubtotal
    : subtotal;

  if (base <= 0) return 0;

  if (coupon.discount_type === 'percent') {
    const pct = Math.max(0, Math.min(100, Number(coupon.discount_value)));
    return Math.round(base * (pct / 100) * 100) / 100;
  }

  const fixed = Math.max(0, Number(coupon.discount_value));
  return Math.min(fixed, base);
}

async function loadCoupon(code) {
  return getTableRow('coupons', {
    select: 'id,code,discount_type,discount_value,valid_from,valid_until,max_uses,used_count,applies_to,min_order_amount,active',
    filters: [{ column: 'code', value: code }],
  });
}

function validateCouponState(coupon, subtotal) {
  if (!coupon) return { ok: false, code: 'not_found', message: 'Cupom não encontrado.' };
  if (coupon.active === false) return { ok: false, code: 'inactive', message: 'Este cupom não está mais ativo.' };

  const now = nowIso();
  if (coupon.valid_from && coupon.valid_from > now) {
    return { ok: false, code: 'not_yet_valid', message: 'Este cupom ainda não está disponível.' };
  }
  if (coupon.valid_until && coupon.valid_until < now) {
    return { ok: false, code: 'expired', message: 'Este cupom expirou.' };
  }
  if (coupon.max_uses != null && Number(coupon.used_count || 0) >= Number(coupon.max_uses)) {
    return { ok: false, code: 'exhausted', message: 'Este cupom já atingiu o limite de uso.' };
  }
  if (coupon.min_order_amount != null && subtotal < Number(coupon.min_order_amount)) {
    return {
      ok: false,
      code: 'below_min',
      message: `Pedido mínimo para este cupom é R$ ${Number(coupon.min_order_amount).toFixed(2)}.`,
    };
  }
  return { ok: true };
}

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
      return res.status(200).json({ success: false, error: state.message, code: state.code });
    }

    const { eligible, restricted } = buildEligibleSet(coupon.applies_to, items);
    const eligibleSubtotal = eligible.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0,
    );

    if (restricted && eligibleSubtotal === 0) {
      return res.status(200).json({
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

// Exportado para reuso no create-payment.js
module.exports.helpers = {
  loadCoupon,
  validateCouponState,
  buildEligibleSet,
  computeDiscount,
  normalizeCode,
};
