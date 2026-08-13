const crypto = require('node:crypto');
const mercadopago = require('mercadopago');
const { initializeMercadoPago } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows, updateTable } } = require('../lib/supabase');
const { ensureCustomerAccountFromCheckout } = require('../lib/customer-account-provisioning');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');

// Moeda única do catálogo. Um pagamento em outra moeda não é comparável com
// orders.total_amount (que é sempre BRL): 50 USD "≥" 200 BRL passaria numa
// comparação numérica crua e entregaria o produto por uma fração do preço.
const EXPECTED_CURRENCY = 'BRL';
// Tolerância de 1 centavo: o total do pedido é somado em ponto flutuante e o
// Mercado Pago arredonda a preferência em 2 casas. Sem a folga, um pedido de
// R$ 89,90 pago como 89.899999… seria recusado como divergência.
// MESMO valor de api/webhook.js — ver o bloco "PARIDADE" abaixo.
const AMOUNT_TOLERANCE = 0.01;

function isProductionRuntime() {
  // Cópia literal de api/webhook.js: precedência APP_ENV > VERCEL_ENV > NODE_ENV
  // (mesma de scripts/check-env.js). NODE_ENV sozinho não serve — a Vercel o
  // define como 'production' também nos builds de preview.
  const env = String(process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  return env === 'production';
}

// ════════════════════════════════════════════════════════════════════
// PARIDADE COM api/webhook.js — regressão da rodada de correção do P0-1.
//
// O QUE ESTAVA ERRADO (depois da correção, não antes)
// A reconciliação de valor do P0-1 foi implementada nas DUAS portas que
// aprovam pedido e emitem download_tokens — o webhook do Mercado Pago e este
// endpoint de polling — mas com rigor DIFERENTE. O webhook é fail-closed no
// total do pedido (`order_total_unusable`); aqui a leitura era
// `Number(order?.total_amount || 0)`, ou seja, fail-OPEN: um pedido com
// `total_amount` null/0/ilegível (linha corrompida, migration parcial, insert
// que não gravou o total) fazia `due` virar 0, e então QUALQUER pagamento
// aprovado de R$ 0,01 apontado para aquele order_code satisfazia
// `paid + 0.01 >= 0` — o pedido era aprovado e os tokens emitidos.
//
// POR QUE ISSO ANULA A CORREÇÃO INTEIRA
// Um atacante não escolhe por onde a defesa é forte; ele escolhe a porta mais
// fraca. Como as duas portas são funcionalmente equivalentes (ambas aprovam o
// pedido e entregam o produto), a proteção do P0-1 valia exatamente o que
// valia a mais frouxa das duas — que era nada, no caso do total ilegível.
//
// A REGRA
// As duas portas têm que ser LITERALMENTE equivalentes: mesmos motivos de
// recusa, mesmas tolerâncias, mesmo nome de evento de segurança. Qualquer
// divergência entre elas é, por construção, um bypass. `checkPaymentIntegrity`
// abaixo é a réplica exata de webhook.js:136-177 (incluindo os ramos
// `payment_amount_unusable`, `amount_below_order_total` e
// `test_payment_in_production`, que aqui simplesmente não existiam).
//
// PRÓXIMO PASSO recomendado: extrair para lib/payment-integrity.js e fazer as
// duas portas importarem — duas cópias que precisam concordar são duas cópias
// que vão divergir de novo na próxima edição.
//
// LIMITE CONHECIDO, COMPARTILHADO COM O WEBHOOK (deliberado, não esquecimento):
// `total_amount === 0` continua passando nas DUAS portas — o teste é
// `due < 0`, não `due <= 0`. Um pedido de R$ 0,00 é anômalo (nem o cupom de
// 100% chega aqui: o MP recusa preference de valor zero), então provavelmente
// deveria reprovar. Mas apertar SÓ este arquivo recriaria exatamente a
// assimetria que esta correção existe para eliminar: o MP notifica o webhook
// automaticamente em todo pagamento, então a porta frouxa aprovaria de
// qualquer jeito e o único efeito líquido seria uma nova divergência. O aperto
// certo é `due <= 0` nas duas ao mesmo tempo, na extração para
// lib/payment-integrity.js.
// ════════════════════════════════════════════════════════════════════

/**
 * Reconciliação SERVER-SIDE do valor pago (achado P0-1).
 *
 * O gateway diz apenas "este pagamento foi aprovado"; ele não sabe (nem tem
 * como saber) quanto o pedido vale para nós. Como `external_reference` é um
 * campo escolhido por quem cria a cobrança, aprovar só por
 * `status === 'approved' && external_reference === orderId` significa que
 * QUALQUER pagamento de valor arbitrário (R$ 0,01) apontado para um pedido de
 * R$ 200 transicionava o pedido para approved e emitia os download_tokens.
 *
 * Fail-CLOSED em todos os ramos: qualquer campo ausente/ilegível — do
 * pagamento OU do pedido — reprova, porque "não consegui conferir o valor"
 * nunca pode significar "libera o produto".
 *
 * @returns {{ok: boolean, reason: string|null, currency: string, paid: number, due: number}}
 */
function checkPaymentIntegrity(payment, order) {
  const currency = String(payment?.currency_id || '').trim().toUpperCase();

  // Number('') e Number(null) são 0, não NaN — é exatamente esse coerce que
  // transformava total ausente em "pedido de R$ 0,00, qualquer coisa paga".
  const toNumber = (value) => (
    value === null || value === undefined || value === '' ? Number.NaN : Number(value)
  );
  const due = toNumber(order?.total_amount);
  const paid = toNumber(payment?.transaction_amount);

  // Sem a checagem de moeda, 200 unidades de uma moeda fraca satisfariam
  // "paid >= due" e comprariam um produto de R$ 200. A loja só vende em BRL.
  if (currency !== EXPECTED_CURRENCY) {
    return { ok: false, reason: 'currency_mismatch', currency, paid, due };
  }

  // total_amount nulo/negativo é linha corrompida de `orders`: não sabemos
  // quanto o pedido vale, então não temos como afirmar que foi pago.
  if (!Number.isFinite(due) || due < 0) {
    return { ok: false, reason: 'order_total_unusable', currency, paid, due };
  }

  if (!Number.isFinite(paid) || paid < 0) {
    return { ok: false, reason: 'payment_amount_unusable', currency, paid, due };
  }

  if (paid + AMOUNT_TOLERANCE < due) {
    return { ok: false, reason: 'amount_below_order_total', currency, paid, due };
  }

  // live_mode=false é pagamento de SANDBOX. Em produção ele nunca deveria
  // aparecer: significa que o deploy está com credencial de teste e que
  // estaríamos entregando produto real contra dinheiro que não existe. Esta
  // porta faltava aqui inteiramente: o webhook recusava o pagamento de teste e
  // o polling do frontend, chamando a MESMA busca no MP, aprovava.
  if (isProductionRuntime() && payment?.live_mode === false) {
    return { ok: false, reason: 'test_payment_in_production', currency, paid, due };
  }

  return { ok: true, reason: null, currency, paid, due };
}

async function fetchApprovedPayments(orderId) {
  const mpClient = initializeMercadoPago();
  const paymentApi = new mercadopago.Payment(mpClient);

  const searchResult = await paymentApi.search({
    options: { external_reference: orderId, sort: 'date_created', criteria: 'desc', limit: 5 },
  });

  return (searchResult.results || []).filter(
    (payment) => payment.status === 'approved' && payment.external_reference === orderId
  );
}

async function loadOrder(orderId) {
  return getTableRow('orders', {
    select: 'id,order_code,customer_name,customer_email,status,payment_status,total_amount,created_at,completed_at',
    filters: [{ column: 'order_code', value: orderId }],
  });
}

async function loadOrderItems(orderInternalId) {
  return listTableRows('order_items', {
    select: 'order_id,product_id,product_name,unit_price,quantity',
    filters: [{ column: 'order_id', value: orderInternalId }],
    orderBy: 'id',
    ascending: true,
  });
}

async function loadDownloadTokens(orderInternalId) {
  return listTableRows('download_tokens', {
    select: 'order_id,product_id,product_name,token,used,expires_at',
    filters: [{ column: 'order_id', value: orderInternalId }],
    orderBy: 'created_at',
    ascending: true,
  });
}

// PRÉ-CONDIÇÃO: só pode ser chamada depois de checkPaymentIntegrity() devolver
// `ok: true` para o pagamento. Esta função emite os tokens de download e aprova
// o pedido — não existe checagem de valor aqui dentro.
async function createTokensForOrder(order, items, paymentId) {
  for (const item of items) {
    const token = crypto.randomBytes(32).toString('hex');
    try {
      await insertIntoTable('download_tokens', {
        token,
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.product_name,
        used: false,
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      // 409 / 23505 = corrida com o webhook (ou outra chamada de verify): a
      // constraint UNIQUE(order_id, product_id) garante 1 token por par.
      if (err?.statusCode !== 409 && err?.details?.code !== '23505') {
        throw err;
      }
    }
  }

  // Transição idempotente: só marca completed quem ainda não estava approved.
  await updateTable('orders',
    { id: `eq.${order.id}`, payment_status: 'neq.approved' },
    {
      payment_status: 'approved',
      status: 'completed',
      payment_id: paymentId,
      completed_at: new Date().toISOString(),
    });

  try {
    await ensureCustomerAccountFromCheckout({
      email: order.customer_email,
      name: order.customer_name,
    });
  } catch (provisionErr) {
    console.error('[verify-payment] Falha ao provisionar conta de cliente:', provisionErr.message);
  }

  // Devolve o conjunto canônico efetivamente persistido (cobre a corrida).
  return mapTokenRows(await loadDownloadTokens(order.id));
}

function mapTokenRows(rows) {
  return rows.map((token) => ({
    productId: String(token.product_id),
    productName: token.product_name,
    token: token.token,
  }));
}

function mapOrderItems(rows) {
  return rows.map((item) => ({
    id: String(item.product_id),
    title: item.product_name,
    quantity: item.quantity,
    price: item.unit_price,
  }));
}

async function refreshApprovedOrderData(order, orderId, req) {
  if (order.payment_status === 'approved' || order.status === 'completed') {
    return order;
  }

  try {
    const approvedPayments = await fetchApprovedPayments(orderId);
    if (!approvedPayments.length) {
      return order;
    }

    // GATE DE DINHEIRO — roda ANTES de qualquer escrita: antes do UPDATE que
    // marca o pedido como pago e antes de qualquer download_token existir.
    //
    // Avalia CADA candidato e escolhe o primeiro que reconcilia, em vez de
    // pegar o mais recente e checar depois: senão um pagamento forjado de
    // R$ 0,01 apontado para o pedido (mais novo, vem primeiro na busca
    // ordenada por date_created desc) bloquearia para sempre a aprovação do
    // pagamento legítimo — negação de serviço contra o próprio comprador,
    // feita de graça por qualquer um que conheça o order_code.
    const evaluated = approvedPayments.map((payment) => ({
      payment,
      integrity: checkPaymentIntegrity(payment, order),
    }));
    const reconciled = evaluated.find((entry) => entry.integrity.ok);

    if (!reconciled) {
      // Existe pagamento aprovado, mas NENHUM passa no gate. Não aprova o
      // pedido, não emite token. O cliente continua vendo "pending" — o motivo
      // fica só no log de segurança, para não ensinar ao atacante qual dos
      // campos ele precisa ajustar.
      //
      // O `reason` do PRIMEIRO candidato entra no evento com o mesmo
      // vocabulário do webhook (currency_mismatch / order_total_unusable /
      // payment_amount_unusable / amount_below_order_total /
      // test_payment_in_production). Sem ele, `order_total_unusable` — que é
      // bug NOSSO na linha de `orders`, não ataque — chegava ao operador
      // indistinguível de uma tentativa de fraude.
      const [suspect] = evaluated;
      const integrity = suspect?.integrity || {};
      await recordSecurityEvent({
        eventName: 'payment_amount_mismatch',
        severity: 'error',
        ip: extractClientIp(req),
        userAgent: req?.headers?.['user-agent'],
        properties: {
          source: 'verify-payment',
          reason: integrity.reason || null,
          // order_code fica truncado (ao contrário do webhook, que loga
          // inteiro): este endpoint é público e o `orderId` aqui é o que o
          // CHAMADOR enviou, então o campo é entrada não confiável e serve só
          // para correlacionar varredura — não é a identidade do pedido.
          order_code_prefix: String(orderId).slice(0, 12),
          payment_id: String(suspect?.payment?.id || ''),
          // Mesmos nomes de campo do webhook, e `null` em vez de `0` quando o
          // valor é ilegível: logar `due_amount: 0` para um total corrompido
          // fabricava um número plausível justamente no caso em que o problema
          // É não haver número.
          currency_id: integrity.currency || null,
          transaction_amount: Number.isFinite(integrity.paid) ? integrity.paid : null,
          order_total_amount: Number.isFinite(integrity.due) ? integrity.due : null,
          live_mode: suspect?.payment?.live_mode === undefined
            ? null
            : Boolean(suspect.payment.live_mode),
          approved_candidates: approvedPayments.length,
        },
      });
      return order;
    }

    const approvedPayment = reconciled.payment;

    const orderItems = await loadOrderItems(order.id);
    const existingTokens = await loadDownloadTokens(order.id);
    const downloadTokens = existingTokens.length
      ? mapTokenRows(existingTokens)
      : await createTokensForOrder(order, orderItems, approvedPayment.id);

    return {
      ...order,
      payment_status: 'approved',
      status: 'completed',
      payment_id: approvedPayment.id,
      completed_at: new Date().toISOString(),
      downloadTokens,
      // Reaproveitado no handler para não recarregar order_items na mesma chamada.
      orderItems,
    };
  } catch (mpErr) {
    console.error('[verify-payment] Erro ao consultar MercadoPago:', mpErr.message);
    return order;
  }
}

/**
 * Lê `orderId`/`email` do lugar certo conforme o método.
 *
 * POST (preferencial) lê SÓ do corpo. GET continua lendo da query string, mas
 * é caminho DEPRECIADO: o e-mail do comprador é PII e, na query, vaza para os
 * access logs da Vercel, para o histórico do navegador e para o header Referer
 * de qualquer recurso externo carregado na página. O projeto já adotou a
 * política oposta em api/me-delete-account.js:258-260 ("token aceito SOMENTE no
 * corpo POST"); aqui ela passa a valer também.
 */
function readVerifyPayload(req) {
  if (req.method === 'POST') {
    return req.body || {};
  }
  return req.query || {};
}

module.exports = async function verifyPaymentHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // GET mantido por compatibilidade: há polling em produção e possivelmente
  // links antigos apontando para a forma com query string. DEPRECIADO — ver
  // readVerifyPayload(). Novos clientes devem usar POST com { orderId, email }.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // P1-3: o limiter de 60/min por IP só existia no Express de dev
    // (routes/api-compat.routes.js:161-168), que não é implantado. Sem este
    // contador no Postgres, em produção o endpoint permite varredura de
    // order_code — e a resposta carrega PII (nome, e-mail, tokens de download).
    // Vem antes de qualquer consulta ao banco, que é o que revela existência.
    const gate = await enforceRateLimit(req, res, RATE_LIMITS.verifyPayment);
    if (gate.blocked) return;

    const payload = readVerifyPayload(req);
    const orderId = String(payload.orderId || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'email é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const order = await loadOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Defesa contra enumeração: order_code + email têm que bater (timing-safe).
    const expectedEmail = String(order.customer_email || '').trim().toLowerCase();
    const expectedBuf = Buffer.from(expectedEmail);
    const providedBuf = Buffer.from(email);
    const emailMatches = expectedBuf.length === providedBuf.length
      && crypto.timingSafeEqual(expectedBuf, providedBuf);
    if (!emailMatches) {
      await recordSecurityEvent({
        eventName: 'verify_payment_email_mismatch',
        severity: 'warn',
        ip: extractClientIp(req),
        userAgent: req.headers['user-agent'],
        properties: {
          order_code_prefix: orderId.slice(0, 12),
          provided_email_hash: crypto.createHash('sha256').update(email).digest('hex').slice(0, 16),
        },
      });
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const orderData = await refreshApprovedOrderData(order, orderId, req);
    const downloadTokens = orderData.downloadTokens || mapTokenRows(await loadDownloadTokens(order.id));

    // Reaproveita os itens já carregados no refresh (quando houve); só recarrega
    // se a chamada não passou pelo caminho que os buscou.
    const items = orderData.orderItems || await loadOrderItems(order.id);

    return res.status(200).json({
      success: true,
      order: {
        orderId: orderData.order_code,
        status: orderData.status,
        paymentStatus: orderData.payment_status,
        totalAmount: orderData.total_amount,
        downloadTokens,
        createdAt: orderData.created_at,
        items: mapOrderItems(items),
      },
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({ error: 'Erro ao verificar pagamento' });
  }
};
