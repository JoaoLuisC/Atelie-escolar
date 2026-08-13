const crypto = require('node:crypto');
const mercadopago = require('mercadopago');
const { initializeMercadoPago } = require('../lib/mercadopago-config');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows, updateTable },
} = require('../lib/supabase');
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
const { parseOrFail } = require('../validation');
const { verifyPaymentSchema } = require('../validation/payment.schemas');
const { ERROR_CODES, fail, methodNotAllowed, ok, preflight } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('verify-payment');

// A busca traz os pagamentos MAIS RECENTES primeiro, e avaliamos todos até
// achar um que reconcilie (ver refreshApprovedOrderData). Com uma janela curta,
// porém, essa defesa tem fundo falso: bastam `limit` pagamentos aprovados mais
// novos para EXPULSAR o legítimo da página, e aí nenhum candidato reconcilia —
// exatamente a negação de serviço contra o próprio comprador que a avaliação
// multi-candidato existe para impedir. Passamos de 5 para o teto da API (o MP
// limita a busca de pagamentos a 30 por página), o que torna o ataque bem mais
// caro sem paginar.
//
// Deliberadamente NÃO paginamos: isto roda no caminho de polling do checkout,
// varrer páginas daria ao atacante um jeito de multiplicar nossas chamadas ao
// MP. Em vez disso, sinalizamos o truncamento (ver `truncated`) para que o caso
// apareça no evento de segurança em vez de virar "pedido travado" silencioso —
// e o backstop continua sendo o webhook, que busca o pagamento POR ID e por
// isso não depende de janela nenhuma.
const APPROVED_SEARCH_LIMIT = 30;

async function fetchApprovedPayments(orderId) {
  const mpClient = initializeMercadoPago();
  const paymentApi = new mercadopago.Payment(mpClient);

  const searchResult = await paymentApi.search({
    options: {
      external_reference: orderId,
      sort: 'date_created',
      criteria: 'desc',
      limit: APPROVED_SEARCH_LIMIT,
    },
  });

  const results = searchResult.results || [];
  return {
    approved: results.filter(
      (payment) => payment.status === 'approved' && payment.external_reference === orderId,
    ),
    // Página cheia = pode haver pagamento legítimo fora da janela.
    truncated: results.length >= APPROVED_SEARCH_LIMIT,
  };
}

async function loadOrder(orderId) {
  return getTableRow('orders', {
    select:
      'id,order_code,customer_name,customer_email,status,payment_status,total_amount,created_at,completed_at',
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

// ════════════════════════════════════════════════════════════════════
// TRANSIÇÃO E EMISSÃO SÃO INDEPENDENTES — e por que isso é um conserto.
//
// Antes, o UPDATE de `orders` morava DENTRO da função que criava os tokens, e
// ela só era chamada quando ainda não existia nenhum token. Isso acoplava duas
// condições que não são a mesma: "faltam tokens" e "o pedido ainda não está
// aprovado". Basta um poll morrer no meio (o INSERT dos tokens passou, o UPDATE
// levou 504) para elas divergirem — e a partir daí:
//   • o poll seguinte via `existingTokens.length > 0`, pulava a criação, e com
//     ela pulava o ÚNICO ponto que escrevia em `orders`;
//   • ainda assim devolvia ao cliente `payment_status: 'approved'` montado em
//     memória. O comprador via "aprovado" e baixava os arquivos;
//   • no banco o pedido ficava `pending` PARA SEMPRE. Some do painel, não entra
//     no faturamento, e a sequência pós-compra (que filtra
//     `payment_status = 'approved'`) nunca dispara. Venda entregue e invisível.
//
// Agora cada efeito tem sua própria guarda, exatamente como em api/webhook.js:
// a transição é sempre TENTADA quando o pagamento reconcilia (condicionada em
// `neq.approved`, então é idempotente e barata), os tokens são criados só se não
// houver nenhum, e o provisionamento só na primeira aprovação. É a mesma
// disciplina que o webhook já seguia — mais uma assimetria entre as duas portas
// que deixa de existir.
// ════════════════════════════════════════════════════════════════════

/**
 * Transição idempotente para approved. Devolve as linhas AFETADAS: array vazio
 * significa "outro processo (webhook ou outro poll) já aprovou este pedido".
 *
 * PRÉ-CONDIÇÃO: só pode ser chamada depois de checkPaymentIntegrity() devolver
 * `ok: true` — não existe checagem de valor aqui dentro.
 */
async function markOrderApproved(order, paymentId) {
  return updateTable(
    'orders',
    { id: `eq.${order.id}`, payment_status: 'neq.approved' },
    {
      payment_status: 'approved',
      status: 'completed',
      payment_id: paymentId,
      completed_at: new Date().toISOString(),
    },
  );
}

async function createTokensForOrder(order, items) {
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
    const { approved: approvedPayments, truncated } = await fetchApprovedPayments(orderId);
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
          live_mode:
            suspect?.payment?.live_mode === undefined ? null : Boolean(suspect.payment.live_mode),
          approved_candidates: approvedPayments.length,
          // `true` = a página da busca veio cheia, então PODE existir um
          // pagamento legítimo fora dela. Distingue "recusei o que vi" de "pode
          // ser que eu não tenha visto o certo" — sem isso, um pedido travado
          // por saturação da janela seria indistinguível de fraude comum.
          candidates_truncated: truncated,
        },
      });
      return order;
    }

    const approvedPayment = reconciled.payment;

    // 1. TRANSIÇÃO — sempre tentada, e antes de qualquer outra escrita. É ela
    //    que define a verdade no banco; o resto da função só monta a resposta.
    const transitioned = await markOrderApproved(order, approvedPayment.id);
    const isFirstApproval = Array.isArray(transitioned) && transitioned.length > 0;

    // 2. TOKENS — só cria se ainda não houver nenhum (o webhook ou outro poll
    //    pode ter vencido a corrida). Emitir de novo seria credencial extra.
    const orderItems = await loadOrderItems(order.id);
    const existingTokens = await loadDownloadTokens(order.id);
    const downloadTokens = existingTokens.length
      ? mapTokenRows(existingTokens)
      : await createTokensForOrder(order, orderItems);

    // 3. PROVISIONAMENTO — só na primeira aprovação, igual ao webhook. Antes
    //    era disparado sempre que os tokens fossem criados, o que é condição
    //    diferente: numa corrida em que o webhook aprovou e este poll criou os
    //    tokens, o comprador recebia o convite de senha duas vezes.
    if (isFirstApproval) {
      try {
        await ensureCustomerAccountFromCheckout({
          email: order.customer_email,
          name: order.customer_name,
        });
      } catch (provisionErr) {
        log.error('falha_ao_provisionar_conta_de_cliente', { reason: provisionErr.message });
      }
    }

    // A resposta reflete o que foi PERSISTIDO. Quando o UPDATE afetou a linha,
    // ela é a fonte da verdade (inclusive `completed_at` real, não um carimbo
    // novo a cada poll); quando não afetou, outro processo já aprovou e relemos
    // para não inventar estado — é essa releitura que impede o pedido de ficar
    // `pending` no banco enquanto o cliente vê "aprovado" na tela.
    const persisted = transitioned?.[0] || (await loadOrder(orderId)) || order;

    return {
      ...order,
      ...persisted,
      downloadTokens,
      // Reaproveitado no handler para não recarregar order_items na mesma chamada.
      orderItems,
    };
  } catch (mpErr) {
    log.error('erro_ao_consultar_mercadopago', { reason: mpErr.message });
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
    return preflight(res);
  }

  // GET mantido por compatibilidade: há polling em produção e possivelmente
  // links antigos apontando para a forma com query string. DEPRECIADO — ver
  // readVerifyPayload(). Novos clientes devem usar POST com { orderId, email }.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(res, ['GET', 'POST', 'OPTIONS']);
  }

  try {
    // P1-3: o limiter de 60/min por IP só existia no Express de dev
    // (routes/api-compat.routes.js:161-168), que não é implantado. Sem este
    // contador no Postgres, em produção o endpoint permite varredura de
    // order_code — e a resposta carrega PII (nome, e-mail, tokens de download).
    // Vem antes de qualquer consulta ao banco, que é o que revela existência.
    const gate = await enforceRateLimit(req, res, RATE_LIMITS.verifyPayment);
    if (gate.blocked) return;

    // Regra B1: o schema decide a forma; daqui para baixo o handler confia no
    // tipo. `orderId` já vem aparado e `email` já vem em minúsculas — a
    // normalização que estava espalhada em três `String(...).trim()` agora
    // acontece num lugar só, o mesmo que lib/rate-limit.js usa como escopo.
    const parsed = parseOrFail(res, verifyPaymentSchema, readVerifyPayload(req));
    if (!parsed.ok) return;
    const { orderId, email } = parsed.data;

    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado',
      });
    }

    const order = await loadOrder(orderId);
    if (!order) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Pedido não encontrado',
      });
    }

    // Defesa contra enumeração: order_code + email têm que bater (timing-safe).
    const expectedEmail = String(order.customer_email || '')
      .trim()
      .toLowerCase();
    const expectedBuf = Buffer.from(expectedEmail);
    const providedBuf = Buffer.from(email);
    const emailMatches =
      expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
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
      return fail(res, {
        status: 404,
        code: ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Pedido não encontrado',
      });
    }

    const orderData = await refreshApprovedOrderData(order, orderId, req);
    const downloadTokens =
      orderData.downloadTokens || mapTokenRows(await loadDownloadTokens(order.id));

    // Reaproveita os itens já carregados no refresh (quando houve); só recarrega
    // se a chamada não passou pelo caminho que os buscou.
    const items = orderData.orderItems || (await loadOrderItems(order.id));

    return ok(res, {
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
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao verificar pagamento',
    });
  }
};
