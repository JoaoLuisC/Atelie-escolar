const {
  serviceRoleHelpers: { getTableRow, listTableRows },
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

// Mesmo formato de src/utils/currency.js (Intl pt-BR). O Intl separa "R$" do
// número com espaço não separável; trocamos por espaço comum para a mensagem
// não depender de fonte nem de comparação exata em teste.
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function formatBrl(value) {
  return BRL.format(Number(value) || 0).replace(/\s/g, ' ');
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
      'id,code,discount_type,discount_value,valid_from,valid_until,max_uses,max_uses_per_customer,used_count,applies_to,min_order_amount,audience,eligible_emails,purchases_required,active',
    filters: [{ column: 'code', value: code }],
  });
}

async function validateCouponAudience(coupon, identity = {}) {
  const audience = coupon?.audience || 'all';
  if (audience === 'all') return { ok: true };

  const email = String(identity.email || '')
    .trim()
    .toLowerCase();
  if (!email) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
      message: 'Entre na sua conta para usar este cupom.',
    };
  }
  if (audience === 'emails') {
    const allowed = (coupon.eligible_emails || []).map((value) => String(value).toLowerCase());
    return allowed.includes(email)
      ? { ok: true }
      : {
          ok: false,
          code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
          message: 'Este cupom não está disponível para esta conta.',
        };
  }
  if (audience === 'customers') return { ok: true };

  if (audience === 'purchase_milestone') {
    const uid = String(identity.uid || '').trim();
    if (!uid)
      return {
        ok: false,
        code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
        message: 'Entre na sua conta para usar a recompensa.',
      };
    const approved = await listTableRows('orders', {
      select: 'id',
      filters: [
        { column: 'customer_id', value: uid },
        { column: 'payment_status', value: 'approved' },
      ],
    });
    const required = Math.max(1, Number(coupon.purchases_required || 1));
    const earned = Math.floor(approved.length / required);
    const usage = await getTableRow('coupon_customer_usage', {
      select: 'used_count',
      filters: [
        { column: 'coupon_id', value: coupon.id },
        { column: 'customer_key', value: `user:${uid}` },
      ],
    });
    return Number(usage?.used_count || 0) < earned
      ? { ok: true }
      : {
          ok: false,
          code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
          message: `Faça ${required} compra(s) aprovada(s) para liberar sua próxima recompensa.`,
        };
  }

  // Pela conta (customer_id) e pelo e-mail SEM caixa: pedido antigo gravado
  // como "Ana@Ex.com" não pode fazer a cliente parecer nova.
  const uid = String(identity.uid || '').trim();
  const byAccount = uid
    ? await listTableRows('orders', {
        select: 'id',
        filters: [
          { column: 'customer_id', value: uid },
          { column: 'payment_status', value: 'approved' },
        ],
        limit: 1,
      })
    : [];
  const byEmail = byAccount.length
    ? []
    : await listTableRows('orders', {
        select: 'id',
        filters: [
          // Curinga do ilike (% e _) escapado: o e-mail é comparado literalmente.
          {
            column: 'customer_email',
            operator: 'ilike',
            value: email.replaceAll(/[%_\\]/g, '\\$&'),
          },
          { column: 'payment_status', value: 'approved' },
        ],
        limit: 1,
      });
  const hasPurchase = byAccount.length > 0 || byEmail.length > 0;
  if (audience === 'new_customers' && hasPurchase) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
      message: 'Este cupom é exclusivo para a primeira compra.',
    };
  }
  if (audience === 'returning_customers' && !hasPurchase) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
      message: 'Este cupom é exclusivo para quem já comprou.',
    };
  }
  return { ok: true };
}

async function validateCouponCustomerLimit(coupon, customerKey) {
  if (coupon?.max_uses_per_customer == null) return { ok: true };
  if (!customerKey) {
    return {
      ok: false,
      code: ERROR_CODES.COUPON_NOT_ELIGIBLE,
      message: 'Entre na sua conta para usar este cupom.',
    };
  }
  const usage = await getTableRow('coupon_customer_usage', {
    select: 'used_count',
    filters: [
      { column: 'coupon_id', value: coupon.id },
      { column: 'customer_key', value: customerKey },
    ],
  });
  return Number(usage?.used_count || 0) < Number(coupon.max_uses_per_customer)
    ? { ok: true }
    : {
        ok: false,
        code: ERROR_CODES.COUPON_EXHAUSTED,
        message: 'Você já atingiu o limite de uso deste cupom.',
      };
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
 * (nem o frontend, nem handlers/create-payment.js) lia `state.code` — só `state.ok`
 * e `state.message`. O único leitor era handlers/validate-coupon.js, que reemitia o
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
      // Formato brasileiro (CROSS-05): `toFixed(2)` mostrava "R$ 1000.00" na
      // loja enquanto o painel mostrava "R$ 1.000,00" para o mesmo cupom.
      message: `Pedido mínimo para este cupom é ${formatBrl(coupon.min_order_amount)}.`,
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
  validateCouponAudience,
  validateCouponCustomerLimit,
};
