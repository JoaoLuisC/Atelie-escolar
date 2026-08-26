const crypto = require('node:crypto');
const { createPaymentPreference } = require('../lib/mercadopago-config');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows, insertIntoTable, updateTable },
  supabaseRequest,
} = require('../lib/supabase');
const { recordEvent } = require('../lib/analytics-events');
const { sanitizeAttribution } = require('../lib/attribution-sanitize');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const couponHelpers = require('../lib/coupons');
const { parseOrFail } = require('../validation');
const { createPaymentSchema } = require('../validation/payment.schemas');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { allocateDiscountCents, sumItemsCents, toCentsOrZero, toReais } = require('../lib/money');
const { createLogger } = require('../lib/logger');

const log = createLogger('create-payment');

// ─── Limites de PII gravada por escrita PÚBLICA (achado M5) ──────────
// Este é o único endpoint ANÔNIMO que INSERE em `orders` e `order_items`, e
// insere com service role (RLS bypassada). Até aqui só `customer.email` era
// exigido: `customer_name`, `customer_cpf` e `customer_phone` iam para o banco
// do tamanho que a Vercel aceitasse no corpo da requisição.
//
// Os tetos (nome 120, e-mail 254 do RFC 5321, telefone 8..15 dígitos, CPF 11,
// quantidade 1..99, 100 itens) e as defesas de forma (UUID antes de interpolar
// em `id=in.(…)` — achado B1; remoção de caracteres de controle antes de
// persistir — CSV/log injection) NÃO sumiram: viraram schema declarativo em
// validation/payment.schemas.js, aplicado no topo do handler (regra B1).
//
// O comentário que ficava aqui dizia que os `max()` do zod "NUNCA valeram
// neste caminho", porque o schema antigo só rodava no middleware do Express de
// desenvolvimento, que não é implantado. Agora valem: o schema roda no mesmo
// módulo que a Vercel publica como função.

/**
 * Reserva um uso do cupom de forma atômica. A RPC devolve o novo `used_count`,
 * ou null quando o cupom já bateu `max_uses` (ou não existe).
 *
 * @returns {Promise<boolean>} true se o uso foi efetivamente reservado.
 *   Fail-closed: qualquer erro de rede/RPC devolve false (sem desconto), em vez
 *   de conceder desconto sem contabilizar.
 */
async function claimCouponUsage(couponId) {
  try {
    const result = await supabaseRequest('rpc/increment_coupon_usage', {
      method: 'POST',
      useServiceRole: true,
      body: JSON.stringify({ p_coupon_id: couponId }),
    });

    // PostgREST devolve o escalar da função (ou null). Alguns proxies embrulham
    // em array de uma posição — normalizamos os dois formatos.
    const value = Array.isArray(result) ? result[0] : result;
    return Number.isFinite(Number(value));
  } catch (err) {
    log.warn('falha_ao_reservar_uso_do_cupom', { reason: err.message });
    return false;
  }
}

/**
 * Aplica o desconto aos itens elegíveis e devolve os itens da preference JUNTO
 * com o total efetivamente cobrado.
 *
 * ── POR QUE DEVOLVE O TOTAL, E NÃO SÓ OS ITENS (regra E3) ───────────
 * A versão anterior escalava o preço por um fator fracionário e depois empurrava
 * a sobra para o último item elegível. Duas consequências:
 *
 *   1. `orders.total_amount` era calculado À PARTE (`subtotal - desconto`), sem
 *      relação com a soma dos itens enviados ao Mercado Pago. Os dois batiam por
 *      aproximação, não por construção;
 *   2. a diferença entre eles é exatamente o drift que obrigou
 *      `lib/payment-integrity.js` a tolerar 1 centavo na conferência do valor
 *      pago — uma margem de erro aceita na porta que entrega o produto pago.
 *
 * Agora o caminho é o inverso: o rateio acontece em centavos inteiros, o preço
 * unitário é fechado ao centavo, e o total do pedido é **derivado da soma real
 * dos itens cobrados**. O que o cliente paga e o que o pedido registra passam a
 * ser o mesmo número por definição, não por arredondamento feliz.
 *
 * O rateio por unidade (e não por item) importa: o Mercado Pago cobra
 * `unit_price × quantity`, então o desconto de um item precisa ser múltiplo da
 * sua quantidade para não gerar fração de centavo. Ratear sobre as UNIDADES
 * resolve isso — cada unidade recebe um número inteiro de centavos.
 *
 * `eligibleItemIds` = null → cupom não-restrito (todos os itens elegíveis).
 * `eligibleItemIds` = Set(ids) → só esses são rateados; os demais mantêm o preço
 * cheio (a semântica do cupom restrito fica correta na preference do MP).
 *
 * @returns {{ items: Array, chargedCents: number, discountCents: number }}
 */
function applyDiscountToItems(items, discountCents, eligibleItemIds = null) {
  const isEligible = (item) => eligibleItemIds === null || eligibleItemIds.has(item.id);

  // Uma entrada por UNIDADE de item elegível. `index` aponta de volta para o
  // item, para reagrupar depois.
  const units = [];
  items.forEach((item, index) => {
    if (!isEligible(item)) return;
    const unitCents = toCentsOrZero(item.price);
    for (let i = 0; i < item.quantity; i += 1) units.push({ index, unitCents });
  });

  const eligibleCents = units.reduce((sum, u) => sum + u.unitCents, 0);
  const target = Math.max(0, Math.min(Math.trunc(discountCents) || 0, eligibleCents));

  // Desconto por unidade, somando EXATAMENTE `target` (método de maior resto).
  const perUnit =
    target > 0 && eligibleCents > 0
      ? allocateDiscountCents(
          units.map((u) => u.unitCents),
          target,
        )
      : units.map(() => 0);

  // Reagrupa: todas as unidades de um item precisam sair com o MESMO preço,
  // porque a preference tem um único `unit_price` por linha. Somamos o desconto
  // das unidades daquele item e dividimos — a divisão é exata quando todas as
  // unidades recebem o mesmo valor, e quando não é, o resto vira um centavo a
  // menos de desconto (nunca a mais), o que é o lado seguro.
  const discountByIndex = new Map();
  units.forEach((unit, i) => {
    discountByIndex.set(unit.index, (discountByIndex.get(unit.index) || 0) + perUnit[i]);
  });

  let chargedCents = 0;
  const finalItems = items.map((item, index) => {
    const unitCents = toCentsOrZero(item.price);
    const itemDiscount = discountByIndex.get(index) || 0;
    const newUnitCents = Math.max(0, unitCents - Math.floor(itemDiscount / item.quantity));
    chargedCents += newUnitCents * item.quantity;
    return { ...item, price: toReais(newUnitCents) };
  });

  return {
    items: finalItems,
    chargedCents,
    // O desconto REAL concedido, que é o que vai para `orders.discount_amount`.
    // Pode ser alguns centavos menor que o pedido, pelo arredondamento por
    // unidade acima — registrar o valor pedido em vez do concedido faria a
    // conta do pedido não fechar.
    discountCents: Math.max(
      0,
      items.reduce((sum, i) => sum + toCentsOrZero(i.price) * i.quantity, 0) - chargedCents,
    ),
  };
}

module.exports = async function createPaymentHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // Rate limit ANTES de qualquer trabalho (achado P1-3). Este handler grava em
  // duas tabelas e cria uma preferência no Mercado Pago — é a requisição mais
  // cara e mais suja que um anônimo consegue disparar aqui. Os limiters de
  // express-rate-limit (routes/api-compat.routes.js) só existem no Express de
  // desenvolvimento; em produção, até aqui, não havia contador nenhum.
  // Fail-open é deliberado dentro de lib/rate-limit.js: se o Postgres não
  // responde, o checkout também não funcionaria adiante — ver o comentário lá.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.createPayment);
  if (gate.blocked) return;

  try {
    // ── VALIDAÇÃO NA BORDA (regra B1) ─────────────────────────────────
    // Um schema no lugar de ~45 linhas de checagem manual. Os limites são os
    // MESMOS de antes (e-mail 254 do RFC 5321, nome 120, CPF 11 dígitos,
    // telefone 8..15, quantidade 1..99, 100 itens) — só mudaram de lugar, para
    // validation/payment.schemas.js. O que muda de verdade:
    //
    //   • o antigo `validation/payment.schemas.js` existia mas NUNCA rodava
    //     neste caminho (só no middleware do Express de dev, que não é
    //     implantado). Era o buraco que o comentário no topo deste arquivo
    //     documentava. Agora o schema roda no handler que a Vercel publica.
    //   • a rejeição continua acontecendo ANTES de qualquer I/O (achado M5):
    //     recusar um payload não pode custar uma ida ao banco.
    //   • daqui para baixo o handler CONFIA no tipo (regra B2). `items` já vem
    //     com productId em UUID e quantity inteiro em 1..99; `customer` já vem
    //     normalizado, com cpf/phone em null quando ausentes.
    //
    // `req.body` pode ser `undefined` num POST sem corpo (o body parser da
    // Vercel deixa assim); o schema trata isso como objeto vazio e devolve 400.
    const parsed = parseOrFail(res, createPaymentSchema, req.body || {});
    if (!parsed.ok) return;

    const { items: normalizedItems, customer: customerData, couponCode, attribution } = parsed.data;
    const attributionData = sanitizeAttribution(attribution);

    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado',
      });
    }

    const validatedItems = [];
    // Regra E3: acumula em centavos inteiros. Somar floats aqui é onde o drift
    // nascia — e é este subtotal que decide se o cupom atinge o mínimo.
    let subtotalCents = 0;

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
        return fail(res, {
          status: 404,
          code: ERROR_CODES.NOT_FOUND,
          message: `Produto ${productId} não encontrado`,
        });
      }

      if (product.active === false) {
        return fail(res, {
          status: 400,
          code: ERROR_CODES.VALIDATION_FAILED,
          message: `Produto ${product.name} não está disponível`,
        });
      }

      const price = Number(product.price || 0);
      subtotalCents += toCentsOrZero(price) * quantity;

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
    let eligibleItemIds = null; // null = cupom não-restrito (todos elegíveis)

    if (couponCode) {
      const normalizedCode = couponHelpers.normalizeCode(couponCode);
      const coupon = await couponHelpers.loadCoupon(normalizedCode);
      const state = couponHelpers.validateCouponState(coupon, toReais(subtotalCents));

      if (state.ok) {
        const { eligible, restricted } = couponHelpers.buildEligibleSet(
          coupon.applies_to,
          validatedItems,
        );
        const eligibleSubtotalCents = sumItemsCents(eligible);
        const eligibleSubtotal = toReais(eligibleSubtotalCents);

        // RESERVA o uso ANTES de aplicar o desconto. O UPDATE dentro de
        // increment_coupon_usage é o que respeita max_uses de forma atômica; ele
        // devolve o novo used_count, ou null se o cupom já estava esgotado.
        // Antes esta chamada acontecia DEPOIS de criar o pedido e o retorno era
        // descartado num catch — então um cupom esgotado seguia concedendo
        // desconto indefinidamente (max_uses era decorativo sob concorrência).
        // Se o pedido falhar mais adiante, perdemos um uso do cupom: erramos
        // para o lado de contar demais, nunca de conceder de graça.
        if (!restricted || eligibleSubtotalCents > 0) {
          const usageClaimed = await claimCouponUsage(coupon.id);
          if (usageClaimed) {
            discountAmount = couponHelpers.computeDiscount(
              coupon,
              toReais(subtotalCents),
              eligibleSubtotal,
            );
            appliedCouponCode = coupon.code;
            if (restricted) {
              eligibleItemIds = new Set(eligible.map((item) => item.id));
            }
          }
        }
      }
    }

    // Regra E3: o total do pedido é DERIVADO da soma real dos itens cobrados,
    // não calculado à parte. Ver a nota em applyDiscountToItems.
    const {
      items: itemsForMP,
      chargedCents,
      discountCents: appliedDiscountCents,
    } = applyDiscountToItems(validatedItems, toCentsOrZero(discountAmount), eligibleItemIds);

    const totalAmount = toReais(chargedCents);
    const discountAmountApplied = toReais(appliedDiscountCents);

    // 128 bits de entropia (16 bytes) — torna enumeração inviável.
    const orderCode = `ORD-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const [createdOrder] = await insertIntoTable('orders', {
      order_code: orderCode,
      // Todos já validados/normalizados por normalizeCustomer (achado M5):
      // sem caracteres de controle e dentro dos tetos de tamanho.
      customer_name: customerData.name,
      customer_email: customerData.email,
      customer_cpf: customerData.cpf,
      customer_phone: customerData.phone,
      total_amount: totalAmount,
      status: 'pending',
      payment_status: 'pending',
      attribution_data: attributionData,
      coupon_code: appliedCouponCode,
      discount_amount: discountAmountApplied,
    });

    // Gravamos os items com o preço **original** (sem o desconto rateado).
    // O total do pedido (`orders.total_amount`) já reflete o desconto.
    // Isso preserva o histórico para Curva ABC e relatórios por produto.
    // INSERT em lote (array) em vez de N INSERTs sequenciais.
    await insertIntoTable(
      'order_items',
      validatedItems.map((item) => ({
        order_id: createdOrder.id,
        product_id: item.id,
        product_name: item.title,
        unit_price: item.price,
        quantity: item.quantity,
        total_price: item.price * item.quantity,
      })),
    );

    // O uso do cupom já foi reservado atomicamente antes de o desconto ser
    // aplicado (ver claimCouponUsage acima) — não há incremento aqui.

    const preference = await createPaymentPreference(itemsForMP, orderCode, customerData.email);

    await updateTable(
      'orders',
      { id: `eq.${createdOrder.id}` },
      {
        preference_id: preference.id,
        payment_status: 'pending',
        status: 'pending',
      },
    );

    await recordEvent({
      eventName: 'checkout_initiated',
      sessionId: attributionData.session_id || '',
      customerEmail: customerData.email,
      orderId: createdOrder.id,
      properties: {
        order_code: orderCode,
        value: totalAmount,
        subtotal: toReais(subtotalCents),
        discount: discountAmountApplied,
        coupon: appliedCouponCode,
        currency: 'BRL',
        items_count: validatedItems.length,
        utm_source: attributionData.utm_source || null,
        utm_medium: attributionData.utm_medium || null,
        utm_campaign: attributionData.utm_campaign || null,
      },
      source: 'server',
    });

    return ok(res, {
      success: true,
      orderId: orderCode,
      orderInternalId: createdOrder.id,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      subtotal: toReais(subtotalCents),
      discount: discountAmountApplied,
      total: totalAmount,
      couponApplied: appliedCouponCode,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    // Item P1.3: este era o ÚNICO dos quatro sites deste arquivo que não
    // passava por `fail()` — e é o `catch` do endpoint que cria o pagamento,
    // ou seja, o erro que a cliente vê quando o checkout falha. Sem `success`
    // e sem `code`, no caminho do dinheiro.
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return fail(res, {
      status,
      code: status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_FAILED,
      message: 'Erro ao criar pagamento',
    });
  }
};
