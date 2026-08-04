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
 *   (comparação timing-safe). Não há fallback por sessão admin nem por
 *   query string — o segredo só é aceito via header.
 */

const ABANDONED_FIRST_H = Number(process.env.ABANDONED_CART_FIRST_HOURS || 1);
const ABANDONED_SECOND_H = Number(process.env.ABANDONED_CART_SECOND_HOURS || 24);
const REACTIVATION_MIN = Number(process.env.REACTIVATION_DAYS_MIN || 90);
const REACTIVATION_MAX = Number(process.env.REACTIVATION_DAYS_MAX || 180);

// Teto de candidatos processados por execução, por sub-job. O cron roda de hora
// em hora e cada envio é idempotente (email_sent_log), então execuções sucessivas
// drenam a fila sem risco de reenvio — mantendo o job dentro do timeout da função.
const MAX_PER_RUN = 100;

function isAuthorized(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  // Segredo APENAS via header. Aceitar via query string vazaria o CRON_SECRET
  // em logs de acesso, histórico e cabeçalho Referer dos e-mails enviados.
  const header = String(req.headers['x-cron-secret'] || '').trim();
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

// Uma única leitura da linha do subscriber traz o status de descadastro e o token
// juntos. Antes eram duas queries (isUnsubscribed + getUnsubscribeToken) batendo
// na mesma linha da mesma tabela por destinatário.
async function loadSubscriberState(email) {
  if (!email) return { unsubscribed: true, token: null };
  try {
    const sub = await getTableRow('email_subscribers', {
      select: 'unsubscribed_at,unsubscribe_token',
      filters: [{ column: 'email', value: String(email).toLowerCase() }],
    });
    // Se não está na lista, ainda assim respeita unsub explícito.
    return {
      unsubscribed: Boolean(sub?.unsubscribed_at),
      token: sub?.unsubscribe_token || null,
    };
  } catch {
    // Falha de leitura não bloqueia o envio (comportamento anterior), sem token.
    return { unsubscribed: false, token: null };
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
    orderBy: 'updated_at',
    ascending: true,
    limit: MAX_PER_RUN,
  });

  for (const cart of firstCandidates) {
    if (cart.recovered_at || cart.reminder_sent_at) {
      results.skipped += 1;
      continue;
    }
    const sub = await loadSubscriberState(cart.email);
    if (sub.unsubscribed) {
      results.skipped += 1;
      continue;
    }

    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) {
      results.skipped += 1;
      continue;
    }

    const unsubToken = sub.token;
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
    orderBy: 'reminder_sent_at',
    ascending: true,
    limit: MAX_PER_RUN,
  });

  for (const cart of secondCandidates) {
    if (cart.recovered_at) {
      results.skipped += 1;
      continue;
    }
    const sub = await loadSubscriberState(cart.email);
    if (sub.unsubscribed) {
      results.skipped += 1;
      continue;
    }
    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) continue;

    const unsubToken = sub.token;
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
    orderBy: 'completed_at',
    ascending: true,
    limit: MAX_PER_RUN,
  });

  let sent = 0;
  for (const order of orders) {
    const sub = await loadSubscriberState(order.customer_email);
    if (sub.unsubscribed) continue;

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

    const unsubToken = sub.token;
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
  let processed = 0;

  for (const [email, lastOrder] of lastByEmail) {
    const days = Math.floor((Date.now() - new Date(lastOrder.completed_at).getTime()) / (24 * 60 * 60 * 1000));
    if (days < REACTIVATION_MIN || days >= REACTIVATION_MAX) continue;
    // Teto de trabalho por execução: como o entityId é o bucket mensal, quem
    // ficar de fora é reprocessado na próxima hora dentro do mesmo mês (idempotente).
    if (processed >= MAX_PER_RUN) break;
    processed += 1;
    const sub = await loadSubscriberState(email);
    if (sub.unsubscribed) continue;

    const { subject, html } = reactivation90({
      customerName: lastOrder.customer_name,
      couponCode,
      discountPct,
    });
    const unsubToken = sub.token;
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
    // Detalhe só no log server-side; ao cliente vai mensagem genérica para não
    // vazar mensagens internas do Supabase/PostgREST (nomes de tabela/coluna etc.).
    console.error('[cron-email-jobs] erro fatal:', error.message);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};

// Best-effort: pede à Vercel até 60s de execução. O teto real depende do plano
// (Hobby costuma limitar a 10s), por isso o processamento é BOUNDED por MAX_PER_RUN
// e idempotente — execuções horárias drenam a fila com segurança.
module.exports.config = { maxDuration: 60 };
