const crypto = require('node:crypto');
const { createPaymentPreference } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable } } = require('../lib/supabase');
const { recordEvent } = require('../lib/analytics-events');
const { helpers: couponHelpers } = require('./validate-coupon');

const ATTRIBUTION_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'landing_path', 'first_touch_at', 'session_id'];

function sanitizeAttribution(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const field of ATTRIBUTION_FIELDS) {
    const value = input[field];
    if (typeof value === 'string' && value.trim()) {
      out[field] = value.slice(0, 200);
    }
  }
  return out;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Aplica desconto proporcionalmente a cada item para que a soma final
 * bata com (subtotal - desconto). Mercado Pago não aceita item com preço
 * negativo, então não dá pra adicionar uma "linha de desconto".
 *
 * Drift de arredondamento é absorvido pelo último item.
 */
function applyDiscountToItems(items, subtotal, discount) {
  if (discount <= 0 || subtotal <= 0) return items;
  const factor = (subtotal - discount) / subtotal;
  const scaled = items.map((item) => ({ ...item, price: round2(item.price * factor) }));
  const newTotal = scaled.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const drift = round2((subtotal - discount) - newTotal);
  if (Math.abs(drift) > 0.001 && scaled.length > 0) {
    const last = scaled[scaled.length - 1];
    last.price = round2(last.price + drift / last.quantity);
  }
  return scaled;
}

module.exports = async function createPaymentHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, customer, attribution, couponCode } = req.body;
    const attributionData = sanitizeAttribution(attribution);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items são obrigatórios' });
    }

    if (!customer?.email) {
      return res.status(400).json({ error: 'Email do cliente é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const validatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await getTableRow('products', {
        select: 'id,name,description,price,download_url,active,category_id',
        filters: [{ column: 'id', value: item.productId }],
      });

      if (!product) {
        return res.status(404).json({ error: `Produto ${item.productId} não encontrado` });
      }

      if (product.active === false) {
        return res.status(400).json({ error: `Produto ${product.name} não está disponível` });
      }

      const quantity = Number(item.quantity || 1);
      const price = Number(product.price || 0);
      subtotal += price * quantity;

      validatedItems.push({
        id: String(product.id),
        title: product.name,
        description: product.description || '',
        price,
        quantity,
        fileUrl: product.download_url || null,
        productId: String(product.id),
        categoryId: product.category_id ? String(product.category_id) : null,
      });
    }

    // Validação server-side de cupom (regra G6 — nunca confiar no client).
    let appliedCouponCode = null;
    let discountAmount = 0;
    let appliedCouponId = null;

    if (couponCode) {
      const normalizedCode = couponHelpers.normalizeCode(couponCode);
      const coupon = await couponHelpers.loadCoupon(normalizedCode);
      const state = couponHelpers.validateCouponState(coupon, subtotal);

      if (state.ok) {
        const { eligible, restricted } = couponHelpers.buildEligibleSet(
          coupon.applies_to,
          validatedItems,
        );
        const eligibleSubtotal = eligible.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        );

        if (!restricted || eligibleSubtotal > 0) {
          discountAmount = couponHelpers.computeDiscount(coupon, subtotal, eligibleSubtotal);
          appliedCouponCode = coupon.code;
          appliedCouponId = coupon.id;
        }
      }
    }

    const totalAmount = round2(Math.max(0, subtotal - discountAmount));
    const itemsForMP = applyDiscountToItems(validatedItems, subtotal, discountAmount);

    // 128 bits de entropia (16 bytes) — torna enumeração inviável.
    const orderCode = `ORD-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const [createdOrder] = await insertIntoTable('orders', {
      order_code: orderCode,
      customer_name: customer.name || '',
      customer_email: customer.email,
      customer_cpf: customer.cpf || null,
      customer_phone: customer.phone || null,
      total_amount: totalAmount,
      status: 'pending',
      payment_status: 'pending',
      attribution_data: attributionData,
      coupon_code: appliedCouponCode,
      discount_amount: discountAmount,
    });

    // Gravamos os items com o preço **original** (sem o desconto rateado).
    // O total do pedido (`orders.total_amount`) já reflete o desconto.
    // Isso preserva o histórico para Curva ABC e relatórios por produto.
    for (const item of validatedItems) {
      await insertIntoTable('order_items', {
        order_id: createdOrder.id,
        product_id: item.id,
        product_name: item.title,
        unit_price: item.price,
        quantity: item.quantity,
        total_price: item.price * item.quantity,
      });
    }

    // Incrementa o uso do cupom (best-effort; race condition tolerável
    // porque o limite é apenas indicativo, validação real é o estado).
    if (appliedCouponId) {
      try {
        const fresh = await getTableRow('coupons', {
          select: 'used_count',
          filters: [{ column: 'id', value: appliedCouponId }],
        });
        await updateTable('coupons', { id: `eq.${appliedCouponId}` }, {
          used_count: Number(fresh?.used_count || 0) + 1,
        });
      } catch (couponErr) {
        console.warn('[create-payment] falha ao incrementar cupom:', couponErr.message);
      }
    }

    const preference = await createPaymentPreference(itemsForMP, orderCode, customer.email);

    await updateTable('orders', { id: `eq.${createdOrder.id}` }, {
      preference_id: preference.id,
      payment_status: 'pending',
      status: 'pending',
    });

    await recordEvent({
      eventName: 'checkout_initiated',
      sessionId: attributionData.session_id || '',
      customerEmail: customer.email,
      orderId: createdOrder.id,
      properties: {
        order_code: orderCode,
        value: totalAmount,
        subtotal,
        discount: discountAmount,
        coupon: appliedCouponCode,
        currency: 'BRL',
        items_count: validatedItems.length,
        utm_source: attributionData.utm_source || null,
        utm_medium: attributionData.utm_medium || null,
        utm_campaign: attributionData.utm_campaign || null,
      },
      source: 'server',
    });

    return res.status(200).json({
      success: true,
      orderId: orderCode,
      orderInternalId: createdOrder.id,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      subtotal,
      discount: discountAmount,
      total: totalAmount,
      couponApplied: appliedCouponCode,
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    return res.status(error.statusCode || 500).json({ error: 'Erro ao criar pagamento' });
  }
};
