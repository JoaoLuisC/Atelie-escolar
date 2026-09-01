const crypto = require('node:crypto');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows, updateTable },
} = require('../lib/supabase');
const { sendEmail } = require('../lib/email-sender');
const { forEachWithConcurrency } = require('../lib/concurrency');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('cron-email-jobs');
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
 *
 * Base para envio: NENHUM e-mail sai sem passar por um dos portões do bloco
 * "BASES DE ENVIO" abaixo — opt-in confirmado (prospecção) ou relação
 * contratual comprovada (pós-compra). Os dois são fail-closed e os dois tratam
 * `unsubscribed_at` como bloqueio absoluto. O relatório devolve, por sub-job,
 * quantos destinatários foram BLOQUEADOS e por qual motivo, para que o portão
 * nunca falhe em silêncio.
 */

const ABANDONED_FIRST_H = Number(process.env.ABANDONED_CART_FIRST_HOURS || 1);
const ABANDONED_SECOND_H = Number(process.env.ABANDONED_CART_SECOND_HOURS || 24);
const REACTIVATION_MIN = Number(process.env.REACTIVATION_DAYS_MIN || 90);
const REACTIVATION_MAX = Number(process.env.REACTIVATION_DAYS_MAX || 180);

// Teto de candidatos processados por execução, por sub-job. O cron roda de hora
// em hora e cada envio é idempotente (email_sent_log), então execuções sucessivas
// drenam a fila sem risco de reenvio — mantendo o job dentro do timeout da função.
const MAX_PER_RUN = 100;

// Envios simultâneos por laço (§2.2). Casado com o `maxConnections: 3` do pool
// de `lib/email-sender.js`: uma folga pequena acima do número de conexões
// mantém o pool ocupado sem enfileirar mensagem demais dentro do processo.
// NÃO subir sem confirmar o limite de conexões simultâneas do provedor —
// estourá-lo troca "lento" por "bloqueado".
const EMAIL_CONCURRENCY = Number(process.env.EMAIL_SEND_CONCURRENCY) || 5;

function isAuthorized(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  // Segredo APENAS via header. Aceitar via query string vazaria o CRON_SECRET
  // em logs de acesso, histórico e cabeçalho Referer dos e-mails enviados.
  const header = String(req.headers['x-cron-secret'] || '').trim();
  if (!header) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
// BASES DE ENVIO — DUAS, E ELAS NÃO SÃO INTERCAMBIÁVEIS
//
// Todos os kinds enviados aqui estão em MARKETING_KINDS (lib/email-sender.js),
// o que só decide FORMATO: rodapé com link de descadastro + cabeçalho
// List-Unsubscribe. Não decide a BASE LEGAL, que é diferente por classe de
// e-mail (LGPD art. 7º) e é o que estes portões resolvem:
//
//   1. CONSENTIMENTO (art. 7º, I) — prospecção pura: falar com um endereço
//      com quem a loja não tem relação nenhuma. Exige opt-in POSITIVO e
//      confirmado (double opt-in de /api/subscribe + /api/confirm-subscription).
//      É o portão do achado M1, em loadMarketingConsent(), e ele continua
//      exatamente como estava — ver o bloco de histórico abaixo.
//
//   2. EXECUÇÃO DE CONTRATO (art. 7º, V) — relacionamento com quem JÁ COMPROU:
//      D+3 (como usar o produto), D+15/D+45 (sugestões) e a reativação de
//      quem comprou. A licença aqui não vem do formulário de newsletter, vem
//      da compra: o titular entregou o endereço à loja para executar aquele
//      pedido e espera continuidade sobre ele. Exigir opt-in de newsletter
//      para isso não é "mais seguro", é errado: mata uma comunicação legítima
//      e ainda embute a ideia falsa de que consentimento é a única base legal.
//
// O QUE MOTIVOU ESTA SEPARAÇÃO (regressão da correção M1): o portão de
// consentimento foi aplicado uniformemente a TODO envio do cron, inclusive à
// sequência pós-compra. Como nenhum ponto do código inscreve o comprador em
// `email_subscribers` no momento da compra (api/create-payment.js e
// api/webhook.js não tocam nessa tabela), o comprador típico — que recebeu a
// confirmação transacional e nunca preencheu o formulário do rodapé — caía em
// `not_subscribed` e a sequência inteira parava. Marketing sem base legal foi
// corrigido criando um bug igualmente sério do outro lado: relacionamento
// contratual legítimo bloqueado por uma base legal que não é a aplicável.
//
// O QUE **NÃO** MUDA, EM NENHUMA DAS DUAS BASES:
//   • `unsubscribed_at` é bloqueio ABSOLUTO. Oposição do titular (art. 18, §2º)
//     vale contra qualquer base, inclusive contrato. Quem pediu para sair, sai.
//   • Fail-closed: leitura que falha, linha ausente onde deveria haver, coluna
//     vazia ⇒ NÃO ENVIA. E-mail enviado não tem rollback.
//   • Todo envio sai com `unsubscribe_token` real (regra D2). O fallback
//     `?email=` do rodapé deixou de descadastrar sozinho na correção M2, então
//     enviar sem token entregaria um e-mail sem saída funcional.
// ════════════════════════════════════════════════════════════════════

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function deny(reason, token = null) {
  return { allowed: false, token, reason };
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Sentinela de `confirmation_sent_at` nas linhas de contato criadas por este
// cron — ver ensureContractContactRow() para o porquê.
const CONTRACT_CONTACT_SENTINEL = '9999-12-31T00:00:00.000Z';

/**
 * Estado do endereço em `email_subscribers`, sem julgar nada.
 * `ok: false` = leitura falhou; quem chama trata como bloqueio (fail-closed).
 */
async function loadSubscriberState(email) {
  try {
    const sub = await getTableRow('email_subscribers', {
      select: 'confirmed,unsubscribed_at,unsubscribe_token',
      filters: [{ column: 'email', value: email }],
    });
    if (!sub) {
      return { ok: true, found: false, confirmed: false, unsubscribedAt: null, token: null };
    }
    return {
      ok: true,
      found: true,
      confirmed: sub.confirmed === true,
      unsubscribedAt: sub.unsubscribed_at || null,
      token: sub.unsubscribe_token || null,
    };
  } catch {
    return { ok: false, found: false, confirmed: false, unsubscribedAt: null, token: null };
  }
}

// ── PORTÃO 1: CONSENTIMENTO (achado M1) — intocado ───────────────────
//
// O QUE ESTAVA ERRADO: a guarda original só olhava `unsubscribed_at`. Quando
// o endereço não existia em `email_subscribers`, `sub` era null,
// `unsubscribed` virava false — e o e-mail SAÍA. Combinado com
// /api/abandoned-cart, que é uma escrita PÚBLICA e sem prova de posse do
// endereço (qualquer um POSTa { email, items } arbitrários), isso dava um
// relay: o atacante cadastra o endereço de um terceiro e a loja manda
// marketing para ele. Fura por inteiro o double opt-in de /api/subscribe e
// queima a reputação do domínio de envio.
//
// A REGRA: só passa aqui o endereço que (1) exista na lista, (2) tenha
// `confirmed = true` — clicou no link do double opt-in, (3) não tenha
// `unsubscribed_at` e (4) tenha `unsubscribe_token`. Um endereço arbitrário
// injetado por atacante não satisfaz (1) nem (2), e é isso que fecha o relay.
async function loadMarketingConsent(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return deny('no_email');

  const state = await loadSubscriberState(normalized);
  if (!state.ok) return deny('lookup_failed');
  if (!state.found) return deny('not_subscribed');
  if (state.unsubscribedAt) return deny('unsubscribed', state.token);
  if (!state.confirmed) return deny('not_confirmed', state.token);
  if (!state.token) return deny('no_unsubscribe_token');

  return { allowed: true, token: state.token, reason: 'confirmed' };
}

/**
 * Existe pedido APROVADO para este endereço? É a prova de relação contratual.
 *
 * `eq` e não `ilike`: no PostgREST o valor de `ilike` entra no padrão LIKE e
 * `_` é metacaractere legal em e-mail — `ana_lima@x.com` casaria
 * `ana.lima@x.com` e a "prova de cliente" seria o pedido de OUTRA pessoa
 * (mesmo defeito corrigido em api/customer-orders.js). Comparar em minúsculas
 * é suficiente porque `orders.customer_email` é gravado já normalizado
 * (api/create-payment.js normaliza antes de inserir).
 */
async function hasApprovedOrder(email) {
  try {
    const order = await getTableRow('orders', {
      select: 'id',
      filters: [
        { column: 'customer_email', value: email },
        { column: 'payment_status', value: 'approved' },
      ],
    });
    return { ok: true, exists: Boolean(order) };
  } catch {
    return { ok: false, exists: false };
  }
}

/**
 * Cria a linha de CONTATO do cliente em `email_subscribers`.
 *
 * POR QUE PRECISA EXISTIR UMA LINHA: sem ela não há `unsubscribe_token`, e sem
 * token o e-mail sai com um rodapé que não descadastra ninguém (o caminho
 * `?email=` virou "pedimos confirmação por e-mail" na correção M2, e esse
 * fluxo só responde a quem já está na tabela). Pior: sem linha não existe onde
 * gravar `unsubscribed_at` — o cliente não teria como se opor NUNCA, e a
 * oposição é justamente o contrapeso obrigatório da base contratual. A linha é
 * o registro de SUPRESSÃO, não um cadastro de newsletter.
 *
 * `confirmed: false` é deliberado e não é um detalhe: esta linha NUNCA passa
 * pelo portão 1. Ou seja, criar o contato do comprador não o inscreve na
 * newsletter nem o torna alvo de prospecção — ele segue fora de qualquer envio
 * cuja base seja consentimento. `source: 'post_purchase'` deixa a origem
 * auditável e distinta de 'footer'/'checkout'.
 *
 * `confirmation_sent_at` recebe uma sentinela no futuro porque
 * purge_stale_email_subscribers() (migration phase6) apaga
 * `confirmed = false and confirmation_sent_at < now() - 30 dias` — regra feita
 * para varrer double opt-in abandonado. Se ela alcançasse esta linha, um
 * cliente que se descadastrou em D+3 teria o registro apagado antes de D+45 e
 * voltaria a receber e-mail: a purga de higiene desfazendo uma oposição do
 * titular. Com a sentinela, sobra a segunda cláusula da purga
 * (`unsubscribed_at` + 90 dias), que é a retenção correta. Se o cliente depois
 * se inscrever de verdade, /api/subscribe sobrescreve `confirmation_sent_at`
 * com now() e a linha volta ao ciclo normal.
 */
async function ensureContractContactRow(email) {
  const unsubscribeToken = newToken();
  try {
    const [created] = await insertIntoTable('email_subscribers', {
      email,
      confirmed: false,
      // NOT NULL no schema. É um token aleatório que ninguém recebe — só passa
      // a valer se /api/subscribe o reenviar num opt-in de verdade.
      confirmation_token: newToken(),
      confirmation_sent_at: CONTRACT_CONTACT_SENTINEL,
      unsubscribe_token: unsubscribeToken,
      source: 'post_purchase',
    });
    return {
      token: created?.unsubscribe_token || unsubscribeToken,
      reason: 'contract_contact_created',
    };
  } catch {
    // Corrida com /api/subscribe (índice único em lower(email)) ou falha real.
    // Relê: se a linha passou a existir, usa o token DELA — e se ela vier
    // descadastrada, não envia. Qualquer outra falha é fail-closed.
    const state = await loadSubscriberState(email);
    if (!state.ok) return { token: null, reason: 'lookup_failed' };
    if (state.unsubscribedAt) return { token: null, reason: 'unsubscribed' };
    if (!state.token) return { token: null, reason: 'contact_row_failed' };
    return { token: state.token, reason: 'contract_contact_existing' };
  }
}

// ── PORTÃO 2: RELAÇÃO CONTRATUAL ─────────────────────────────────────
// Só deve ser chamado quando o pedido aprovado JÁ está provado pelo contexto
// (ver os call sites). Aqui se resolve o resto: oposição do titular e link de
// descadastro funcional.
async function resolveContractRecipient(email) {
  const state = await loadSubscriberState(email);
  if (!state.ok) return deny('lookup_failed');
  // Oposição vale contra a base contratual também — este é o bloqueio absoluto.
  if (state.unsubscribedAt) return deny('unsubscribed', state.token);

  if (state.found) {
    if (!state.token) return deny('no_unsubscribe_token');
    return {
      allowed: true,
      token: state.token,
      reason: state.confirmed ? 'confirmed' : 'contract',
    };
  }

  const ensured = await ensureContractContactRow(email);
  if (!ensured.token) return deny(ensured.reason);
  return { allowed: true, token: ensured.token, reason: 'contract' };
}

/** Pós-compra e reativação de comprador: base contratual. */
async function loadContractRecipient(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return deny('no_email');
  return resolveContractRecipient(normalized);
}

/**
 * Carrinho abandonado: o caso híbrido, e o mais delicado — o endereço entrou
 * na tabela por /api/abandoned-cart, endpoint PÚBLICO e sem prova de posse.
 *
 * Aceita duas licenças, nesta ordem:
 *   (a) opt-in confirmado (portão 1, sem relaxamento nenhum); ou
 *   (b) pedido aprovado com aquele endereço — é cliente de verdade, e lembrar
 *       um carrinho de quem já comprou cabe no relacionamento existente.
 *
 * Um endereço arbitrário que o atacante POSTe não satisfaz nenhuma das duas:
 * não está na lista confirmada e não tem pedido pago. O relay do M1 continua
 * fechado — só deixou de arrastar junto os clientes reais da loja.
 */
async function loadAbandonedCartRecipient(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return deny('no_email');

  const consent = await loadMarketingConsent(normalized);
  if (consent.allowed) return consent;
  // Saída explícita e leitura falhando não admitem segunda via: a oposição é
  // absoluta e a dúvida é fail-closed.
  if (consent.reason === 'unsubscribed' || consent.reason === 'lookup_failed') return consent;

  const order = await hasApprovedOrder(normalized);
  if (!order.ok) return deny('order_lookup_failed');
  // Sem pedido: devolve o motivo do portão de consentimento (not_subscribed /
  // not_confirmed) para o relatório apontar a causa real.
  if (!order.exists) return consent;

  // Relê o estado do assinante (uma leitura a mais, só neste ramo raro: sem
  // opt-in E com pedido aprovado) para reaproveitar a resolução de token.
  return resolveContractRecipient(normalized);
}

// Contador de bloqueios por motivo, agregado por execução. Existe para que os
// portões fail-closed NÃO sejam silenciosos: sem isso, "a sequência pós-compra
// parou de sair" e "não havia ninguém na janela" ficam idênticos na saída do
// cron — foi exatamente assim que a regressão do M1 passou despercebida.
// Vocabulário de motivos: no_email, not_subscribed, not_confirmed,
// unsubscribed, no_unsubscribe_token, lookup_failed, order_lookup_failed,
// contact_row_failed.
function newBlockTally() {
  return {};
}

function tallyBlock(tally, reason) {
  tally[reason] = (tally[reason] || 0) + 1;
}

// ════════════════════════════════════════════════════════════════════
// JOB 1: Carrinho abandonado (1h e 24h)
// ════════════════════════════════════════════════════════════════════
async function processAbandonedCarts() {
  // `blocked` separa "não enviei porque não há licença para falar com este
  // endereço" de "não enviei porque o carrinho já foi recuperado / está vazio".
  // São diagnósticos diferentes: o primeiro é o portão do M1 funcionando
  // (inclusive contra abuso do endpoint público), o segundo é o fluxo normal.
  const results = { firstReminder: 0, secondReminder: 0, skipped: 0, blocked: newBlockTally() };

  const firstWindowStart = new Date(
    Date.now() - (ABANDONED_FIRST_H + 1) * 60 * 60 * 1000,
  ).toISOString();
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

  await forEachWithConcurrency(firstCandidates, EMAIL_CONCURRENCY, async (cart) => {
    if (cart.recovered_at || cart.reminder_sent_at) {
      results.skipped += 1;
      return;
    }
    // Descartes baratos ANTES do portão: um carrinho sem itens não gera e-mail
    // nenhum, então não vale gastar consulta de pedido — nem criar registro de
    // contato — para um destinatário que não seria contatado de todo jeito.
    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) {
      results.skipped += 1;
      return;
    }

    // O e-mail deste carrinho veio de uma escrita PÚBLICA (/api/abandoned-cart),
    // sem nenhuma prova de posse. É justamente aqui que a licença precisa ser
    // provada: opt-in confirmado OU pedido aprovado com o mesmo endereço.
    const consent = await loadAbandonedCartRecipient(cart.email);
    if (!consent.allowed) {
      tallyBlock(results.blocked, consent.reason);
      return;
    }

    const unsubToken = consent.token;
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
      await updateTable(
        'abandoned_carts',
        { id: `eq.${cart.id}` },
        {
          reminder_sent_at: new Date().toISOString(),
        },
      );
    }
  });

  // Segundo lembrete: 24h+ e o primeiro já foi
  const secondWindowStart = new Date(
    Date.now() - (ABANDONED_SECOND_H + 1) * 60 * 60 * 1000,
  ).toISOString();
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

  await forEachWithConcurrency(secondCandidates, EMAIL_CONCURRENCY, async (cart) => {
    if (cart.recovered_at) {
      results.skipped += 1;
      return;
    }
    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) {
      results.skipped += 1;
      return;
    }
    const consent = await loadAbandonedCartRecipient(cart.email);
    if (!consent.allowed) {
      tallyBlock(results.blocked, consent.reason);
      return;
    }

    const unsubToken = consent.token;
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
  });

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
    suggestions: suggestions.filter((p) => !productIds.includes(String(p.id))).slice(0, 3),
  };
}

async function processPostPurchaseStep({ daysAgo, kind, templateFn, lookbackHours = 25 }) {
  // Janela: pedidos aprovados há ~daysAgo dias, com tolerância de algumas horas
  const targetMs = daysAgo * 24 * 60 * 60 * 1000;
  const windowEnd = new Date(Date.now() - targetMs).toISOString();
  const windowStart = new Date(
    Date.now() - targetMs - lookbackHours * 60 * 60 * 1000,
  ).toISOString();

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
  const blocked = newBlockTally();
  await forEachWithConcurrency(orders, EMAIL_CONCURRENCY, async (order) => {
    // BASE CONTRATUAL, e ela já está provada aqui: a query acima filtra
    // `payment_status = 'approved'`, então todo `order` deste laço É um pedido
    // pago daquele endereço. Não há segunda consulta a `orders` — o portão só
    // precisa resolver oposição do titular e token de descadastro.
    // Exigir opt-in de newsletter neste ponto foi o que matou a sequência
    // inteira: ninguém inscreve o comprador em `email_subscribers` na compra.
    const consent = await loadContractRecipient(order.customer_email);
    if (!consent.allowed) {
      tallyBlock(blocked, consent.reason);
      return;
    }

    const items = await loadOrderItems(order.id);
    const { category, suggestions } = await inferCategoryAndSuggestions(items);

    let payload;
    if (kind === 'post_purchase_d3') {
      payload = templateFn({ orderId: order.order_code, customerName: order.customer_name, items });
    } else if (kind === 'post_purchase_d15') {
      payload = templateFn({ customerName: order.customer_name, category, suggestions });
    } else if (kind === 'post_purchase_d45') {
      payload = templateFn({
        customerName: order.customer_name,
        category,
        newProducts: suggestions,
      });
    } else {
      return;
    }

    const unsubToken = consent.token;
    const result = await sendEmail({
      to: order.customer_email,
      subject: payload.subject,
      html: payload.html,
      kind,
      entityId: String(order.id),
      unsubscribeToken: unsubToken,
    });
    if (result.sent) sent += 1;
  });
  return { sent, blocked };
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
  const blocked = newBlockTally();

  // O `break` por `processed >= MAX_PER_RUN` que existia aqui era construção de
  // laço sequencial: sob concorrência ele cortaria um número imprevisível.
  // O teto passa a ser aplicado ANTES do lote, por recorte da lista — mesmo
  // efeito e determinístico. Como o entityId é o bucket mensal, quem ficar de
  // fora é reprocessado na próxima hora dentro do mesmo mês (idempotente).
  const elegiveis = [...lastByEmail]
    .filter(([, lastOrder]) => {
      const days = Math.floor(
        (Date.now() - new Date(lastOrder.completed_at).getTime()) / (24 * 60 * 60 * 1000),
      );
      return days >= REACTIVATION_MIN && days < REACTIVATION_MAX;
    })
    .slice(0, MAX_PER_RUN);

  await forEachWithConcurrency(elegiveis, EMAIL_CONCURRENCY, async ([email, lastOrder]) => {
    // Também base contratual: `lastByEmail` é construído SÓ com pedidos
    // `payment_status = 'approved'`, então todo endereço deste laço comprou.
    // Reativação de quem se inscreveu na newsletter e nunca comprou é outra
    // coisa (prospecção, exige opt-in) e não passa por aqui — não há pedido,
    // logo o e-mail nem entra em `lastByEmail`.
    const consent = await loadContractRecipient(email);
    if (!consent.allowed) {
      tallyBlock(blocked, consent.reason);
      return;
    }

    const { subject, html } = reactivation90({
      customerName: lastOrder.customer_name,
      couponCode,
      discountPct,
    });
    const unsubToken = consent.token;
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
  });
  return { sent, blocked };
}

// ════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════
module.exports = async function cronEmailJobsHandler(req, res) {
  if (guardMethod(req, res, ['POST', 'GET'])) return;

  if (!isAuthorized(req)) {
    return fail(res, { status: 401, code: ERROR_CODES.UNAUTHORIZED, message: 'Unauthorized' });
  }

  if (!getSupabaseConfig()) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Supabase não configurado.',
    });
  }

  try {
    const start = Date.now();
    const abandoned = await processAbandonedCarts();
    const d3 = await processPostPurchaseStep({
      daysAgo: 3,
      kind: 'post_purchase_d3',
      templateFn: postPurchaseD3,
    });
    const d15 = await processPostPurchaseStep({
      daysAgo: 15,
      kind: 'post_purchase_d15',
      templateFn: postPurchaseD15,
    });
    const d45 = await processPostPurchaseStep({
      daysAgo: 45,
      kind: 'post_purchase_d45',
      templateFn: postPurchaseD45,
    });
    const reactivation = await processReactivation();

    const elapsedMs = Date.now() - start;
    // d3/d15/d45/reactivation passaram de número para { sent, blocked }. Nada
    // consome este corpo programaticamente (o workflow email-cron.yml só
    // imprime e checa o status), e o detalhe de bloqueio é o que torna o portão
    // de consentimento auditável na saída do cron.
    const report = {
      success: true,
      elapsedMs,
      abandoned,
      postPurchase: { d3, d15, d45 },
      reactivation,
    };
    // O relatório JÁ é o contexto: emitir os campos soltos (e não uma string
    // com JSON dentro) é o que permite filtrar "rodadas em que reactivation > 0"
    // sem reparsear a linha.
    log.info('rodada_concluida', report);
    return ok(res, report);
  } catch (error) {
    // Detalhe só no log server-side; ao cliente vai mensagem genérica para não
    // vazar mensagens internas do Supabase/PostgREST (nomes de tabela/coluna etc.).
    log.error('rodada_falhou', { reason: error.message });
    return fail(res, { status: 500, code: ERROR_CODES.INTERNAL_ERROR, message: 'Erro interno.' });
  }
};

// O `module.exports.config = { maxDuration: 60 }` que ficava aqui foi REMOVIDO:
// desde o 660fe74 este arquivo não é mais uma Serverless Function — a Vercel só
// lê `config` de módulos dentro de `api/`, e a única função publicada é
// `api/index.js`. O limite continua existindo, no lugar onde de fato vale:
// o bloco `functions` do `vercel.json`. Deixar a linha aqui não aumentava
// timeout nenhum; só afirmava um limite por endpoint que não existe mais.
//
// O teto real ainda depende do plano (Hobby costuma limitar a 10s), e é por
// isso que o processamento é BOUNDED por MAX_PER_RUN e idempotente —
// execuções horárias drenam a fila com segurança mesmo com corte antes do fim.
