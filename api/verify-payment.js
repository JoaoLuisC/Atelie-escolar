const crypto = require('node:crypto');
const mercadopago = require('mercadopago');
const { initializeMercadoPago } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows, updateTable } } = require('../lib/supabase');
const { ensureCustomerAccountFromCheckout } = require('../lib/customer-account-provisioning');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');

// ════════════════════════════════════════════════════════════════════
// PARIDADE COM api/webhook.js — agora ESTRUTURAL, não por disciplina.
//
// Esta é a segunda porta que aprova pedido e emite download_tokens (a outra é
// a notificação do Mercado Pago). Quando a reconciliação de valor do P0-1 foi
// implementada, ela virou DUAS cópias com rigor diferente: o webhook ficou
// fail-closed no total do pedido, e aqui a leitura era
// `Number(order?.total_amount || 0)` — fail-OPEN. Um pedido com `total_amount`
// null/ilegível fazia `due` virar 0 e qualquer pagamento de R$ 0,01 apontado
// para aquele order_code satisfazia `paid + 0.01 >= 0`: pedido aprovado,
// tokens emitidos. Um atacante não escolhe por onde a defesa é forte, então a
// proteção inteira valia o que valia a mais frouxa das duas portas.
//
// A resposta não é "manter as duas cópias iguais com atenção": é não ter duas.
// A regra e todo o raciocínio moram em lib/payment-integrity.js — inclusive o
// aperto de `due < 0` para `due <= 0`, que ficou represado justamente até esta
// extração porque apertar só um lado recriaria a assimetria.
// ════════════════════════════════════════════════════════════════════
const { checkPaymentIntegrity } = require('../lib/payment-integrity');

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
