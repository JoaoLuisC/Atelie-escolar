const crypto = require('node:crypto');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, listTableRows, updateTable },
} = require('../lib/supabase');
const { sendEmail } = require('../lib/email-sender');
const {
  abandonedCart,
  postPurchaseD3,
  postPurchaseD15,
  postPurchaseD45,
  reactivation90,
} = require('../lib/email-templates');

/**
 * Orchestrator do cron de emails (rodar de hora em hora).
 *
 * Idempotência: cada envio passa pelo `email_sent_log` via sendEmail —
 * se já existe registro `sent` com a mesma (email, kind, entity_id),
 * pula. Logs ficam por 90 dias (cleanup_old_email_logs).
 *
 * Janelas de tempo configuráveis por env:
 * - ABANDONED_CART_FIRST_HOURS   (default 1h)
 * - ABANDONED_CART_SECOND_HOURS  (default 24h)
 * - REACTIVATION_DAYS_MIN/MAX    (default 90 / 180)
 *
 * Autenticação:
 * - Cabeçalho `X-Cron-Secret` deve bater com `CRON_SECRET` env
 *   (igual ao padrão Vercel Cron) OU sessão admin válida.
 */

const ABANDONED_FIRST_H = Number(process.env.ABANDONED_CART_FIRST_HOURS || 1);
const ABANDONED_SECOND_H = Number(process.env.ABANDONED_CART_SECOND_HOURS || 24);
const REACTIVATION_MIN = Number(process.env.REACTIVATION_DAYS_MIN || 90);
const REACTIVATION_MAX = Number(process.env.REACTIVATION_DAYS_MAX || 180);

function isAuthorized(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const header = String(req.headers['x-cron-secret'] || req.query?.secret || '').trim();
  if (!header) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(header),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

async function isUnsubscribed(email) {
  if (!email) return true;
  try {
    const sub = await getTableRow('email_subscribers', {
      select: 'id,unsubscribed_at',
      filters: [{ column: 'email', value: String(email).toLowerCase() }],
    });
    // Se não está na lista, ainda assim respeita unsub explícito.
    return Boolean(sub?.unsubscribed_at);
  } catch {
    return false;
  }
}

async function getUnsubscribeToken(email) {
  try {
    const sub = await getTableRow('email_subscribers', {
      select: 'unsubscribe_token',
      filters: [{ column: 'email', value: String(email).toLowerCase() }],
    });
    return sub?.unsubscribe_token || null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════
// JOB 1: Carrinho abandonado (1h e 24h)
// ════════════════════════════════════════════════════════════════════
async function processAbandonedCarts() {
  const results = { firstReminder: 0, secondReminder: 0, skipped: 0 };

  const firstWindowStart = new Date(Date.now() - (ABANDONED_FIRST_H + 1) * 60 * 60 * 1000).toISOString();
  const firstWindowEnd = new Date(Date.now() - ABANDONED_FIRST_H * 60 * 60 * 1000).toISOString();

  // Candidatos a primeiro lembrete: criados há 1-2h, sem recovered_at,
  // sem reminder enviado, items não vazio.
  const firstCandidates = await listTableRows('abandoned_carts', {
    select: 'id,email,items,total_amount,recovered_at,reminder_sent_at,created_at,updated_at',
    filters: [
      { column: 'updated_at', operator: 'gte', value: firstWindowStart },
      { column: 'updated_at', operator: 'lt', value: firstWindowEnd },
    ],
    limit: 500,
  });

  for (const cart of firstCandidates) {
    if (cart.recovered_at || cart.reminder_sent_at) {
      results.skipped += 1;
      continue;
    }
    if (await isUnsubscribed(cart.email)) {
      results.skipped += 1;
      continue;
    }

    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) {
      results.skipped += 1;
      continue;
    }

    const unsubToken = await getUnsubscribeToken(cart.email);
    const { subject, html } = abandonedCart({ items, step: '1h' });
    const result = await sendEmail({
      to: cart.email,
      subject,
      html,
      kind: 'abandoned_cart_1h',
      entityId: String(cart.id),
      unsubscribeToken: unsubToken,
    });
    if (result.sent) {
      results.firstReminder += 1;
      await updateTable('abandoned_carts', { id: `eq.${cart.id}` }, {
        reminder_sent_at: new Date().toISOString(),
      });
    }
  }

  // Segundo lembrete: 24h+ e o primeiro já foi
  const secondWindowStart = new Date(Date.now() - (ABANDONED_SECOND_H + 1) * 60 * 60 * 1000).toISOString();
  const secondWindowEnd = new Date(Date.now() - ABANDONED_SECOND_H * 60 * 60 * 1000).toISOString();

  const secondCandidates = await listTableRows('abandoned_carts', {
    select: 'id,email,items,reminder_sent_at,recovered_at',
    filters: [
      { column: 'reminder_sent_at', operator: 'gte', value: secondWindowStart },
      { column: 'reminder_sent_at', operator: 'lt', value: secondWindowEnd },
    ],
    limit: 500,
  });

  for (const cart of secondCandidates) {
    if (cart.recovered_at) {
      results.skipped += 1;
      continue;
    }
    if (await isUnsubscribed(cart.email)) {
      results.skipped += 1;
      continue;
    }
    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) continue;

    const unsubToken = await getUnsubscribeToken(cart.email);
    const { subject, html } = abandonedCart({ items, step: '24h' });
    const result = await sendEmail({
      to: cart.email,
      subject,
      html,
      kind: 'abandoned_cart_24h',
      entityId: String(cart.id),
      unsubscribeToken: unsubToken,
    });
    if (result.sent) results.secondReminder += 1;
  }

  return results;
}

// ════════════════════════════════════════════════════════════════════
// JOB 2: Sequência pós-compra (D+3, D+15, D+45)
// ════════════════════════════════════════════════════════════════════
async function loadOrderItems(orderId) {
  const items = await listTableRows('order_items', {
    select: 'product_id,product_name,unit_price,quantity',
    filters: [{ column: 'order_id', value: orderId }],
    limit: 50,
  });
  return items.map((i) => ({
    productId: String(i.product_id),
    name: i.product_name,
    price: i.unit_price,
    quantity: i.quantity,
  }));
}

async function inferCategoryAndSuggestions(items) {
  const productIds = items.map((i) => i.productId).filter(Boolean);
  if (productIds.length === 0) return { category: null, suggestions: [] };

  const products = await listTableRows('products', {
    select: 'id,slug,category_id',
    filters: [{ column: 'id', operator: 'in', value: `(${productIds.join(',')})` }],
  });
  const categoryIds = [...new Set(products.map((p) => String(p.category_id)).filter(Boolean))];
  if (categoryIds.length === 0) return { category: null, suggestions: [] };

  const [primaryCategoryId] = categoryIds;
  const [category, suggestions] = await Promise.all([
    getTableRow('categories', {
      select: 'name,slug',
      filters: [{ column: 'id', value: primaryCategoryId }],
    }),
    listTableRows('products', {
      select: 'id,slug,name,price',
      filters: [
        { column: 'category_id', value: primaryCategoryId },
        { column: 'active', value: true },
      ],
      orderBy: 'created_at',
      ascending: false,
      limit: 12,
    }),
  ]);

  return {
    category: category?.name || null,
    categorySlug: category?.slug || null,
    suggestions: suggestions
      .filter((p) => !productIds.includes(String(p.id)))
      .slice(0, 3),
  };
}

async function processPostPurchaseStep({ daysAgo, kind, templateFn, lookbackHours = 25 }) {
  // Janela: pedidos aprovados há ~daysAgo dias, com tolerância de algumas horas
  const targetMs = daysAgo * 24 * 60 * 60 * 1000;
  const windowEnd = new Date(Date.now() - targetMs).toISOString();
  const windowStart = new Date(Date.now() - targetMs - lookbackHours * 60 * 60 * 1000).toISOString();

  const orders = await listTableRows('orders', {
    select: 'id,order_code,customer_name,customer_email,total_amount,completed_at',
    filters: [
      { column: 'payment_status', value: 'approved' },
      { column: 'completed_at', operator: 'gte', value: windowStart },
      { column: 'completed_at', operator: 'lt', value: windowEnd },
    ],
    limit: 500,
  });

  let sent = 0;
  for (const order of orders) {
    if (await isUnsubscribed(order.customer_email)) continue;

    const items = await loadOrderItems(order.id);
    const { category, suggestions } = await inferCategoryAndSuggestions(items);

    let payload;
    if (kind === 'post_purchase_d3') {
      payload = templateFn({ orderId: order.order_code, customerName: order.customer_name, items });
    } else if (kind === 'post_purchase_d15') {
      payload = templateFn({ customerName: order.customer_name, category, suggestions });
    } else if (kind === 'post_purchase_d45') {
      payload = templateFn({ customerName: order.customer_name, category, newProducts: suggestions });
    } else {
      continue;
    }

    const unsubToken = await getUnsubscribeToken(order.customer_email);
    const result = await sendEmail({
      to: order.customer_email,
      subject: payload.subject,
      html: payload.html,
      kind,
      entityId: String(order.id),
      unsubscribeToken: unsubToken,
    });
    if (result.sent) sent += 1;
  }
  return sent;
}

// ════════════════════════════════════════════════════════════════════
// JOB 3: Reativação 90 dias (regra D8 — nunca 180+)
// ════════════════════════════════════════════════════════════════════
async function processReactivation() {
  // Pega TODOS os emails distintos de pedidos aprovados. Para cada um,
  // calcula daysSince do último pedido. Envia se estiver na janela
  // [REACTIVATION_MIN, REACTIVATION_MAX).
  const recentOrders = await listTableRows('orders', {
    select: 'customer_email,customer_name,completed_at',
    filters: [{ column: 'payment_status', value: 'approved' }],
    orderBy: 'completed_at',
    ascending: false,
    limit: 5000,
  });

  // Reduz para último pedido por email
  const lastByEmail = new Map();
  for (const order of recentOrders) {
    const email = String(order.customer_email || '').toLowerCase();
    if (!email) continue;
    if (!lastByEmail.has(email)) {
      lastByEmail.set(email, order);
    }
  }

  const couponCode = String(process.env.REACTIVATION_COUPON_CODE || 'VOLTEI15');
  const discountPct = Number(process.env.REACTIVATION_COUPON_PCT || 15);
  let sent = 0;

  for (const [email, lastOrder] of lastByEmail) {
    const days = Math.floor((Date.now() - new Date(lastOrder.completed_at).getTime()) / (24 * 60 * 60 * 1000));
    if (days < REACTIVATION_MIN || days >= REACTIVATION_MAX) continue;
    if (await isUnsubscribed(email)) continue;

    const { subject, html } = reactivation90({
      customerName: lastOrder.customer_name,
      couponCode,
      discountPct,
    });
    const unsubToken = await getUnsubscribeToken(email);
    const result = await sendEmail({
      to: email,
      subject,
      html,
      kind: 'reactivation_90d',
      // entityId = bucket de janela (mês) — garante reativação só 1x por mês
      entityId: `${new Date().toISOString().slice(0, 7)}`,
      unsubscribeToken: unsubToken,
    });
    if (result.sent) sent += 1;
  }
  return sent;
}

// ════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════
module.exports = async function cronEmailJobsHandler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!getSupabaseConfig()) {
    return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
  }

  try {
    const start = Date.now();
    const abandoned = await processAbandonedCarts();
    const d3 = await processPostPurchaseStep({ daysAgo: 3, kind: 'post_purchase_d3', templateFn: postPurchaseD3 });
    const d15 = await processPostPurchaseStep({ daysAgo: 15, kind: 'post_purchase_d15', templateFn: postPurchaseD15 });
    const d45 = await processPostPurchaseStep({ daysAgo: 45, kind: 'post_purchase_d45', templateFn: postPurchaseD45 });
    const reactivation = await processReactivation();

    const elapsedMs = Date.now() - start;
    const report = {
      success: true,
      elapsedMs,
      abandoned,
      postPurchase: { d3, d15, d45 },
      reactivation,
    };
    console.log('[cron-email-jobs]', JSON.stringify(report));
    return res.status(200).json(report);
  } catch (error) {
    console.error('[cron-email-jobs] erro fatal:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
