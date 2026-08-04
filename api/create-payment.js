const crypto = require('node:crypto');
const { createPaymentPreference } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { listTableRows, insertIntoTable, updateTable }, supabaseRequest } = require('../lib/supabase');
const { recordEvent } = require('../lib/analytics-events');
const { sanitizeAttribution } = require('../lib/attribution-sanitize');
const couponHelpers = require('../lib/coupons');

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Aplica o desconto proporcionalmente APENAS aos itens elegíveis, de modo que
 * a soma final bata com (subtotal - desconto). Mercado Pago não aceita item com
 * preço negativo, então não dá pra adicionar uma "linha de desconto".
 *
 * `eligibleItemIds` = null → cupom não-restrito (todos os itens elegíveis).
 * `eligibleItemIds` = Set(ids) → só esses itens são rateados; os demais mantêm
 * o preço cheio (a semântica do cupom restrito fica correta na preference do MP).
 *
 * Drift de arredondamento é absorvido pelo último item elegível.
 */
function applyDiscountToItems(items, discount, eligibleItemIds = null) {
  if (discount <= 0) return items;
  const isEligible = (item) => eligibleItemIds === null || eligibleItemIds.has(item.id);

  const eligibleSubtotal = items.reduce(
    (sum, item) => sum + (isEligible(item) ? item.price * item.quantity : 0),
    0,
  );
  if (eligibleSubtotal <= 0) return items;

  const factor = (eligibleSubtotal - discount) / eligibleSubtotal;
  const scaled = items.map((item) => (
    isEligible(item) ? { ...item, price: round2(item.price * factor) } : { ...item }
  ));

  const newEligibleTotal = scaled.reduce(
    (sum, item) => sum + (isEligible(item) ? item.price * item.quantity : 0),
    0,
  );
  const drift = round2((eligibleSubtotal - discount) - newEligibleTotal);
  if (Math.abs(drift) > 0.001) {
    for (let i = scaled.length - 1; i >= 0; i -= 1) {
      if (isEligible(scaled[i])) {
        scaled[i].price = round2(scaled[i].price + drift / scaled[i].quantity);
        break;
      }
    }
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

    // Teto de itens: sem isto, um array gigante vira N SELECTs sequenciais (DoS).
    if (items.length > 100) {
      return res.status(400).json({ error: 'Quantidade de itens inválida.' });
    }

    if (!customer?.email) {
      return res.status(400).json({ error: 'Email do cliente é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const validatedItems = [];
    let subtotal = 0;

    // 1ª passada (sem I/O): valida o shape de cada item e coleta os ids.
    const normalizedItems = [];
    for (const item of items) {
      // productId é obrigatório: sem ele o filtro por id seria omitido e a query
      // devolveria um produto arbitrário (buildTableQuery ignora value undefined).
      if (!item || item.productId == null || String(item.productId).trim() === '') {
        return res.status(400).json({ error: 'Item inválido: productId é obrigatório.' });
      }

      // Quantidade tem que ser inteiro em 1..99 (o schema zod não roda neste path).
      const quantity = item.quantity == null ? 1 : Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: 'Quantidade inválida.' });
      }

      normalizedItems.push({ productId: String(item.productId).trim(), quantity });
    }

    // Um único SELECT em lote (id=in.(...)) em vez de 1 por item — elimina o N+1.
    const uniqueProductIds = [...new Set(normalizedItems.map((i) => i.productId))];
    const productRows = await listTableRows('products', {
      select: 'id,name,description,price,download_url,active,category_id',
      filters: [{ column: 'id', operator: 'in', value: `(${uniqueProductIds.join(',')})` }],
    });
    const productById = new Map((productRows || []).map((row) => [String(row.id), row]));

    // 2ª passada: valida cada item contra o mapa carregado (existe + active) e
    // monta os itens já com preço do banco (fonte de verdade — nunca do client).
    for (const { productId, quantity } of normalizedItems) {
      const product = productById.get(productId);

      if (!product) {
        return res.status(404).json({ error: `Produto ${productId} não encontrado` });
      }

      if (product.active === false) {
        return res.status(400).json({ error: `Produto ${product.name} não está disponível` });
      }

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
    let eligibleItemIds = null; // null = cupom não-restrito (todos elegíveis)

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
          if (restricted) {
            eligibleItemIds = new Set(eligible.map((item) => item.id));
          }
        }
      }
    }

    const totalAmount = round2(Math.max(0, subtotal - discountAmount));
    const itemsForMP = applyDiscountToItems(validatedItems, discountAmount, eligibleItemIds);

    // 128 bits de entropia (16 bytes) — torna enumeração inviável.
    const orderCode = `ORD-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const [createdOrder] = await insertIntoTable('orders', {
      order_code: orderCode,
      customer_name: customer.name || '',
      customer_email: String(customer.email).trim().toLowerCase(),
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
    // INSERT em lote (array) em vez de N INSERTs sequenciais.
    await insertIntoTable('order_items', validatedItems.map((item) => ({
      order_id: createdOrder.id,
      product_id: item.id,
      product_name: item.title,
      unit_price: item.price,
      quantity: item.quantity,
      total_price: item.price * item.quantity,
    })));

    // Incremento ATÔMICO do uso do cupom via função SECURITY DEFINER: o próprio
    // UPDATE respeita max_uses (used_count < max_uses), eliminando a corrida
    // read-modify-write que permitia furar o limite sob concorrência.
    if (appliedCouponId) {
      try {
        await supabaseRequest('rpc/increment_coupon_usage', {
          method: 'POST',
          useServiceRole: true,
          body: JSON.stringify({ p_coupon_id: appliedCouponId }),
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
