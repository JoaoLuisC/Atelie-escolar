const {
  serviceRoleHelpers: { getTableRow },
} = require('./supabase');
const { ERROR_CODES } = require('./http');

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .slice(0, 64);
}

function nowIso() {
  return new Date().toISOString();
}

function buildEligibleSet(appliesTo, items) {
  // appliesTo: { category_ids: [...], product_ids: [...] } | {}
  const productIds = Array.isArray(appliesTo?.product_ids) ? appliesTo.product_ids.map(String) : [];
  const categoryIds = Array.isArray(appliesTo?.category_ids)
    ? appliesTo.category_ids.map(String)
    : [];

  if (productIds.length === 0 && categoryIds.length === 0) {
    return { eligible: items, restricted: false };
  }

  const eligible = items.filter(
    (item) =>
      productIds.includes(String(item.productId)) ||
      categoryIds.includes(String(item.categoryId || '')),
  );
  return { eligible, restricted: true };
}

function computeDiscount(coupon, subtotal, eligibleSubtotal) {
  const base =
    coupon.applies_to &&
    (coupon.applies_to.product_ids?.length || coupon.applies_to.category_ids?.length)
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
    select:
      'id,code,discount_type,discount_value,valid_from,valid_until,max_uses,used_count,applies_to,min_order_amount,active',
    filters: [{ column: 'code', value: code }],
  });
}

/**
 * Estado de aplicabilidade do cupom.
 *
 * REGRA A2: o `code` sai daqui já no formato canônico SCREAMING_SNAKE do
 * catálogo em lib/http.js, e não numa grafia própria (`not_found`, `below_min`)
 * que o handler precisasse traduzir. Duas grafias para a mesma condição é
 * exatamente a divergência que a regra existe para evitar — e traduzir no
 * handler significaria que cada novo consumidor de `validateCouponState`
 * precisaria repetir a tradução.
 *
 * Seguro renomear: a varredura de 13/08/2026 confirmou que nenhum consumidor
 * (nem o frontend, nem api/create-payment.js) lia `state.code` — só `state.ok`
 * e `state.message`. O único leitor era api/validate-coupon.js, que reemitia o
 * valor cru no corpo da resposta.
 */
function validateCouponState(coupon, subtotal) {
  if (!coupon)
    return { ok: false, code: ERROR_CODES.COUPON_NOT_FOUND, message: 'Cupom não encontrado.' };
  if (coupon.active === false) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_INACTIVE,
      message: 'Este cupom não está mais ativo.',
    };
  }

  const now = nowIso();
  if (coupon.valid_from && coupon.valid_from > now) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_NOT_YET_VALID,
      message: 'Este cupom ainda não está disponível.',
    };
  }
  if (coupon.valid_until && coupon.valid_until < now) {
    return { ok: false, code: ERROR_CODES.COUPON_EXPIRED, message: 'Este cupom expirou.' };
  }
  if (coupon.max_uses != null && Number(coupon.used_count || 0) >= Number(coupon.max_uses)) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_EXHAUSTED,
      message: 'Este cupom já atingiu o limite de uso.',
    };
  }
  if (coupon.min_order_amount != null && subtotal < Number(coupon.min_order_amount)) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_MINIMUM_NOT_MET,
      message: `Pedido mínimo para este cupom é R$ ${Number(coupon.min_order_amount).toFixed(2)}.`,
    };
  }
  return { ok: true };
}

module.exports = {
  normalizeCode,
  nowIso,
  loadCoupon,
  validateCouponState,
  buildEligibleSet,
  computeDiscount,
};
