const crypto = require('node:crypto');
const { getPaymentInfo, inspectWebhookSignature } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, listTableRows, updateTable } } = require('../lib/supabase');
const { ensureCustomerAccountFromCheckout } = require('../lib/customer-account-provisioning');
const { recordEvent } = require('../lib/analytics-events');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');

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

async function loadExistingTokens(orderInternalId) {
  return listTableRows('download_tokens', {
    select: 'order_id,product_id,product_name,token',
    filters: [{ column: 'order_id', value: orderInternalId }],
    orderBy: 'created_at',
    ascending: true,
  });
}

async function createDownloadTokens(order, items) {
  // Deduplica por product_id: download_tokens tem UNIQUE(order_id, product_id)
  // (migration phase5_payment_hardening), então um pedido com o mesmo produto em
  // duas linhas fazia o INSERT em lote violar a constraint. Como o 409 é tratado
  // como "outro processo venceu a corrida", o pedido pago terminava SEM nenhum
  // token. Um token por produto é o modelo correto: ele autoriza o arquivo, não
  // a unidade comprada.
  const uniqueItems = [...new Map(
    items.filter((item) => item?.product_id).map((item) => [String(item.product_id), item]),
  ).values()];

  if (uniqueItems.length) {
    const now = Date.now();
    const payload = uniqueItems.map((item) => ({
      token: crypto.randomBytes(32).toString('hex'),
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      used: false,
      expires_at: new Date(now + 72 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    }));

    try {
      // INSERT em lote (uma única statement, atômica) em vez de N INSERTs.
      await insertIntoTable('download_tokens', payload);
    } catch (err) {
      // 409 / 23505 = corrida: outro webhook (ou o polling do verify-payment) já
      // criou os tokens deste pedido. Como este handler só chega aqui quando NÃO
      // havia nenhum token, e o lote é tudo-ou-nada, o processo vencedor cobre
      // todos os itens — tratamos a colisão como sucesso e recarregamos abaixo.
      if (err?.statusCode !== 409 && err?.details?.code !== '23505') {
        throw err;
      }
    }
  }

  // Recarrega o conjunto canônico: cobre a corrida em que outro processo inseriu
  // os tokens "vencedores" — devolvemos sempre os tokens efetivamente persistidos.
  const rows = await loadExistingTokens(order.id);
  return rows.map((token) => ({
    productId: String(token.product_id),
    productName: token.product_name,
    token: token.token,
  }));
}

// ════════════════════════════════════════════════════════════════════
// Reconciliação de valor pago × valor do pedido (achado P0-1 da revisão
// 2026-08-12 — o item de maior retorno da rodada).
//
// O QUE ESTAVA ERRADO
// A única condição para liberar o produto era `payment.status === 'approved'`
// somada a um `external_reference` que resolvesse para um pedido existente.
// `transaction_amount`, `currency_id` e `live_mode` não eram lidos em lugar
// nenhum do projeto; `total_amount` era carregado mas só alimentava analytics.
// Ou seja: o sistema confiava no gateway para dizer QUE foi pago, e nunca
// perguntava QUANTO. Um pagamento de R$ 0,01 apontando para o order_code de
// um pedido de R$ 200 transicionava o pedido para approved e emitia os
// download_tokens — entrega completa do produto digital.
//
// A REGRA
// "Confie no gateway, mas verifique o valor": o preço já vem do banco em
// create-payment.js (nunca do cliente), e `orders.total_amount` é exatamente
// o que foi enviado na preference (subtotal - desconto do cupom, arredondado
// a 2 casas). Então o valor cobrado TEM que reconciliar com ele antes de
// qualquer transição para approved.
//
// TOLERÂNCIA de 1 centavo: `applyDiscountToItems` rateia o desconto do cupom
// entre os itens com arredondamento por unidade e absorve o drift no último
// item elegível, então a soma da preference pode diferir do total do pedido
// por frações de centavo. Um centavo cobre o arredondamento e não cobre
// nenhum ataque plausível.
//
// PAGAMENTO A MAIOR não bloqueia: cobrar mais que o devido não é falha de
// segurança para a entrega (é caso de suporte/estorno), e travar a entrega
// puniria o cliente que já pagou.
//
// LIMITE CONHECIDO: a checagem assume UM pagamento por pedido, que é o que a
// preference atual produz (`installments: 1`, sem pagamento com dois cartões).
// Se um dia habilitarmos pagamento fracionado, isto precisa somar os
// pagamentos do external_reference em vez de olhar um só.
// ════════════════════════════════════════════════════════════════════
const AMOUNT_TOLERANCE = 0.01;
const EXPECTED_CURRENCY = 'BRL';

function isProductionRuntime() {
  // Mesma precedência de scripts/check-env.js: APP_ENV > VERCEL_ENV > NODE_ENV.
  // NODE_ENV sozinho não serve — a Vercel o define como 'production' também
  // nos builds de preview.
  const env = String(process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  return env === 'production';
}

/**
 * Confere se o pagamento aprovado pelo MP corresponde de fato ao pedido.
 * Fail-CLOSED: qualquer campo ausente/ilegível reprova, porque "não consegui
 * conferir o valor" nunca pode significar "libera o produto".
 *
 * @returns {{ok: boolean, reason: string|null, currency: string, paid: number, due: number}}
 */
function checkPaymentIntegrity(payment, order) {
  const currency = String(payment?.currency_id || '').trim().toUpperCase();

  // Sem a checagem de moeda, 200 unidades de uma moeda fraca satisfariam
  // "paid >= due" e comprariam um produto de R$ 200. A loja só vende em BRL.
  const toNumber = (value) => (
    value === null || value === undefined || value === '' ? Number.NaN : Number(value)
  );
  const due = toNumber(order?.total_amount);
  const paid = toNumber(payment?.transaction_amount);

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
  // aparecer: significa que o deploy está com credencial de teste (que o
  // scripts/check-env.js só consegue AVISAR, não bloquear) e, portanto, que
  // estaríamos entregando produto real contra dinheiro que não existe.
  // Deliberadamente não há env de escape: o jeito suportado de rodar em
  // sandbox é publicar com APP_ENV=preview/development, que é justamente o
  // que faz esta checagem não se aplicar.
  if (isProductionRuntime() && payment?.live_mode === false) {
    return { ok: false, reason: 'test_payment_in_production', currency, paid, due };
  }

  return { ok: true, reason: null, currency, paid, due };
}

module.exports = async function webhookHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    // `inspectWebhookSignature` agora também impõe uma janela de frescor sobre
    // o `ts` assinado (ver lib/mercadopago-config.js). O motivo entra como
    // property do evento em vez de virar um evento novo: o alerta continua
    // sendo "webhook rejeitado", mas dá para separar varredura da internet
    // (`hash_mismatch`/`missing_headers`) de replay de uma notificação real
    // (`stale_timestamp`), que é o único motivo que exige assinatura válida.
    const signature = inspectWebhookSignature(req);
    if (!signature.valid) {
      await recordSecurityEvent({
        eventName: 'webhook_invalid_signature',
        severity: 'warn',
        ip: extractClientIp(req),
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
        properties: {
          reason: signature.reason,
          has_signature_header: Boolean(req.headers['x-signature']),
          payment_id: String(req.body?.data?.id || ''),
          // Só fazem sentido no caso de idade; nulos nos demais.
          age_seconds: signature.ageSeconds,
          tolerance_seconds: signature.reason === 'stale_timestamp' ? signature.toleranceSeconds : null,
        },
      });
      // Mesmo 401 genérico de antes: a resposta não revela ao emissor QUAL das
      // checagens falhou (um atacante não deve descobrir pelo status que a
      // assinatura estava certa e só o horário estava velho).
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;
    if (type !== 'payment') {
      return res.status(200).json({ message: 'Event type not handled' });
    }

    const paymentId = data.id;
    const payment = await getPaymentInfo(paymentId);
    const orderId = payment.external_reference;

    if (!orderId) {
      return res.status(400).json({ error: 'Invalid payment data' });
    }

    const order = await loadOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (payment.status === 'approved') {
      // GATE DE DINHEIRO — roda ANTES de qualquer escrita: antes do UPDATE que
      // marca o pedido como pago e antes de qualquer download_token existir.
      // Se a reconciliação falhar, o pedido fica exatamente como estava
      // (pending), o cliente não recebe nada e o caso vira evento de segurança
      // para investigação manual.
      const integrity = checkPaymentIntegrity(payment, order);
      if (!integrity.ok) {
        await recordSecurityEvent({
          eventName: 'payment_amount_mismatch',
          severity: 'error',
          ip: extractClientIp(req),
          userAgent: req.headers['user-agent'],
          requestId: req.headers['x-request-id'],
          properties: {
            reason: integrity.reason,
            // order_code e valores NÃO são PII (o e-mail do cliente, sim — por
            // isso não entra aqui). Sem eles o evento é inútil para investigar.
            order_code: order.order_code,
            payment_id: String(payment.id ?? ''),
            currency_id: integrity.currency || null,
            transaction_amount: Number.isFinite(integrity.paid) ? integrity.paid : null,
            order_total_amount: Number.isFinite(integrity.due) ? integrity.due : null,
            live_mode: payment.live_mode === undefined ? null : Boolean(payment.live_mode),
          },
        });

        // 200, deliberadamente. O Mercado Pago reentrega qualquer resposta que
        // não seja 2xx, por horas. Divergência de valor é condição PERMANENTE
        // (o pagamento não vai mudar de valor na próxima tentativa), então
        // devolver 4xx/5xx só multiplicaria a mesma notificação, e com ela o
        // getPaymentInfo e o evento de segurança — transformando um alerta
        // legítimo em enxurrada que esconde o resto do log. O 200 aqui é
        // "recebi e decidi", não "aprovei": o corpo diz explicitamente que não
        // houve aprovação, e o registro com severity 'error' é o canal que
        // acorda alguém (SECURITY_ALERT_WEBHOOK_URL). Fica o trade-off
        // consciente: se um dia o bug for NOSSO (total_amount errado), o MP não
        // vai reinsistir — a recuperação é manual, guiada pelo evento.
        return res.status(200).json({ message: 'Payment did not reconcile with the order; not approved' });
      }

      // Transição idempotente e ATÔMICA: só a primeira notificação que muda o
      // pedido de !approved → approved "vence". Reentregas/webhooks concorrentes
      // veem 0 linhas afetadas e apenas devolvem os tokens já existentes, sem
      // sobrescrever completed_at nem re-emitir eventos.
      const transitioned = await updateTable('orders',
        { id: `eq.${order.id}`, payment_status: 'neq.approved' },
        {
          payment_status: 'approved',
          payment_id: payment.id,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      const isFirstApproval = Array.isArray(transitioned) && transitioned.length > 0;

      // Emissão dos tokens continua idempotente: só cria quando ainda não há
      // nenhum. `order_items` passou a ser carregado apenas nesse caso — numa
      // reentrega do MP não há o que criar, e a consulta era trabalho jogado
      // fora que o replay conseguia forçar de graça.
      const existingTokens = await loadExistingTokens(order.id);
      if (!existingTokens.length) {
        const orderItems = await loadOrderItems(order.id);
        await createDownloadTokens(order, orderItems);
      }

      if (isFirstApproval) {
        try {
          await ensureCustomerAccountFromCheckout({
            email: order.customer_email,
            name: order.customer_name,
          });
        } catch (provisionErr) {
          console.error('[webhook] Falha ao provisionar conta de cliente:', provisionErr.message);
        }

        await recordEvent({
          eventName: 'payment_approved',
          customerEmail: order.customer_email,
          orderId: order.id,
          properties: {
            order_code: order.order_code,
            value: Number(order.total_amount || 0),
            currency: 'BRL',
            payment_id: payment.id,
            payment_method: payment.payment_method_id || null,
          },
          source: 'webhook',
        });
      }

      // A resposta NÃO devolve mais os downloadTokens (achado P1-5).
      // O corpo do webhook não tem destinatário autenticado: quem consegue
      // emitir a requisição lê a resposta. Ecoar os tokens fazia deste endpoint
      // um leitor de credenciais de download sem sessão nenhuma — bastava
      // repetir uma notificação capturada para reler os tokens do pedido a
      // qualquer momento. A janela de frescor reduziu a janela do replay, mas o
      // conserto de verdade é não colocar segredo em resposta que qualquer um
      // provoca. Os dois consumidores legítimos continuam servidos por
      // endpoints autenticados: api/verify-payment.js (order_code + e-mail
      // conferidos em tempo constante) e api/customer-orders.js (sessão do
      // cliente). Nada no frontend lia este campo — DownloadsPage.jsx consome
      // `order.downloadTokens` daqueles dois, não do webhook.
      return res.status(200).json({ message: 'Webhook processed successfully' });
    }

    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      // Guarda de idempotência espelhando a do ramo 'approved': sem o
      // `neq.approved` no filtro, uma notificação atrasada de rejeição/
      // cancelamento (o MP reentrega por horas) rebaixava para 'failed' um
      // pedido JÁ APROVADO — mantendo os download_tokens válidos e deixando o
      // pedido pago invisível para o cliente e para o painel.
      const demoted = await updateTable('orders',
        { id: `eq.${order.id}`, payment_status: 'neq.approved' },
        {
          payment_status: payment.status,
          payment_id: payment.id,
          status: 'failed',
        });

      if (!Array.isArray(demoted) || demoted.length === 0) {
        return res.status(200).json({ message: 'Order already approved; ignoring stale notification' });
      }

      await recordEvent({
        eventName: payment.status === 'cancelled' ? 'payment_cancelled' : 'payment_rejected',
        customerEmail: order.customer_email,
        orderId: order.id,
        properties: {
          order_code: order.order_code,
          value: Number(order.total_amount || 0),
          currency: 'BRL',
          payment_id: payment.id,
          status_detail: payment.status_detail || null,
        },
        source: 'webhook',
      });
    }

    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
