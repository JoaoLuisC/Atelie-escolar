const crypto = require('node:crypto');
const { createPaymentPreference } = require('../lib/mercadopago-config');
const { getSupabaseConfig, serviceRoleHelpers: { listTableRows, insertIntoTable, updateTable }, supabaseRequest } = require('../lib/supabase');
const { recordEvent } = require('../lib/analytics-events');
const { sanitizeAttribution } = require('../lib/attribution-sanitize');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const couponHelpers = require('../lib/coupons');

// ─── Limites de PII gravada por escrita PÚBLICA (achado M5) ──────────
// Este é o único endpoint ANÔNIMO que INSERE em `orders` e `order_items`, e
// insere com service role (RLS bypassada). Até aqui só `customer.email` era
// exigido: `customer_name`, `customer_cpf` e `customer_phone` iam para o banco
// do tamanho que a Vercel aceitasse no corpo da requisição.
//
// Os `max()` do zod em validation/payment.schemas.js NUNCA valeram neste
// caminho: aquele schema só era aplicado pelo middleware do Express de
// desenvolvimento, que não é implantado (e o arquivo está sendo removido por
// ser código morto). Os números abaixo replicam deliberadamente os de lá, para
// que a validação que passa a existir seja a MESMA que o projeto já
// documentava — não um contrato novo que quebre um checkout legítimo.
const MAX_NAME_LENGTH = 120;
// 254 = limite de endereço do RFC 5321. Escolhido em vez de um número redondo
// menor justamente para não rejeitar e-mail válido: o objetivo aqui é ter um
// teto, não filtrar clientes.
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 30;
const CPF_DIGITS = 11;

// `products.id` é `uuid primary key default gen_random_uuid()`
// (supabase/schema.sql:48) — todo id que trafega no carrinho foi emitido pelo
// próprio banco. Validar contra este formato ANTES de interpolar em
// `id=in.(…)` fecha o padrão do achado B1: hoje a exploração está contida
// (buildTableQuery usa URLSearchParams.set, que escapa o valor, e há
// revalidação posterior contra `productById`), mas montar filtro PostgREST por
// template string com entrada do usuário é exatamente a classe de falha já
// corrigida em outros handlers — a contenção é acidental, não intencional.
// Com o regex, vírgula/parêntese/aspas jamais chegam ao filtro.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aceita o dígito de e-mail suficiente para barrar lixo óbvio sem bancar
// validador de RFC: quem valida o endereço de verdade é o envio da confirmação.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// \p{C} = categoria Unicode "Other": controle (\n, \t, NUL), formatação
// invisível (ZWJ, RLO — usados para disfarçar texto) e não-atribuídos.
// Escrito como property escape (e não como faixa numérica) para não deixar
// bytes de controle literais no fonte deste arquivo.
const CONTROL_CHARS_RE = /\p{C}+/gu;

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Normaliza texto vindo do cliente antes de persistir.
 *
 * Remove caracteres de controle (inclusive quebras de linha e tabs): eles não
 * existem em nome/telefone legítimos e, gravados no pedido, reaparecem no
 * template de e-mail de confirmação, no painel admin e em qualquer exportação
 * — é a semente clássica de CSV/log injection.
 */
function cleanText(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Valida e normaliza os campos do cliente contra os tetos acima.
 *
 * Rejeita (400) em vez de truncar silenciosamente: um nome ou telefone cortado
 * pela metade vai para a nota do pedido e para o e-mail do cliente, e ninguém
 * fica sabendo. Um 400 explícito é honesto — e nenhum dos limites é alcançável
 * por um preenchimento humano real do checkout.
 *
 * @returns {{ error: string } | { value: {name,email,cpf,phone} }}
 */
function normalizeCustomer(rawCustomer) {
  const customer = rawCustomer && typeof rawCustomer === 'object' ? rawCustomer : {};

  const email = cleanText(customer.email).toLowerCase();
  if (!email) {
    return { error: 'Email do cliente é obrigatório' };
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { error: 'Email inválido.' };
  }

  const name = cleanText(customer.name);
  if (name.length > MAX_NAME_LENGTH) {
    return { error: 'Nome muito longo.' };
  }

  // CPF é opcional e não autoriza NADA neste fluxo (não é usado para buscar
  // pedido, nem para entrega). Por isso guardamos só os 11 dígitos e NÃO
  // conferimos o dígito verificador: derrubar um checkout pago por causa de um
  // dígito digitado errado num campo decorativo seria uma troca ruim. O que o
  // banco precisa é do teto de tamanho e da forma grosseira.
  const cpfDigits = cleanText(customer.cpf).replace(/\D/g, '');
  if (cpfDigits && cpfDigits.length !== CPF_DIGITS) {
    return { error: 'CPF inválido.' };
  }

  const phone = cleanText(customer.phone);
  if (phone) {
    const phoneDigits = phone.replace(/\D/g, '');
    // 8..15 dígitos cobre fixo local sem DDD até E.164 internacional cheio.
    if (phone.length > MAX_PHONE_LENGTH || phoneDigits.length < 8 || phoneDigits.length > 15) {
      return { error: 'Telefone inválido.' };
    }
  }

  return {
    value: {
      name,
      email,
      // null (e não '') mantém a semântica de "não informado" das colunas
      // `customer_cpf`/`customer_phone`, que são nullable no schema.
      cpf: cpfDigits || null,
      phone: phone || null,
    },
  };
}

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
    console.warn('[create-payment] falha ao reservar uso do cupom:', err.message);
    return false;
  }
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
    // `req.body || {}`: em produção o body parser da Vercel deixa `undefined`
    // num POST sem corpo, e desestruturar undefined viraria 500 em vez de 400.
    const { items, customer, attribution, couponCode } = req.body || {};
    const attributionData = sanitizeAttribution(attribution);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items são obrigatórios' });
    }

    // Teto de itens: sem isto, um array gigante vira N SELECTs sequenciais (DoS).
    if (items.length > 100) {
      return res.status(400).json({ error: 'Quantidade de itens inválida.' });
    }

    // Achado M5: tudo que vai para as colunas de PII de `orders` passa por aqui
    // ANTES de qualquer I/O — a rejeição não deve custar uma ida ao banco.
    const customerCheck = normalizeCustomer(customer);
    if (customerCheck.error) {
      return res.status(400).json({ error: customerCheck.error });
    }
    const customerData = customerCheck.value;

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

      // Achado B1: o id só é aceito se for um UUID. Isso acontece ANTES de o
      // valor ser interpolado no filtro `id=in.(…)` logo abaixo — nenhum
      // separador (`,`, `)`, `"`) do PostgREST sobrevive a este teste.
      const productId = String(item.productId).trim();
      if (!UUID_RE.test(productId)) {
        return res.status(400).json({ error: 'Item inválido: productId é obrigatório.' });
      }

      // Quantidade tem que ser inteiro em 1..99 (o schema zod não roda neste path).
      const quantity = item.quantity == null ? 1 : Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: 'Quantidade inválida.' });
      }

      normalizedItems.push({ productId, quantity });
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

        // RESERVA o uso ANTES de aplicar o desconto. O UPDATE dentro de
        // increment_coupon_usage é o que respeita max_uses de forma atômica; ele
        // devolve o novo used_count, ou null se o cupom já estava esgotado.
        // Antes esta chamada acontecia DEPOIS de criar o pedido e o retorno era
        // descartado num catch — então um cupom esgotado seguia concedendo
        // desconto indefinidamente (max_uses era decorativo sob concorrência).
        // Se o pedido falhar mais adiante, perdemos um uso do cupom: erramos
        // para o lado de contar demais, nunca de conceder de graça.
        if (!restricted || eligibleSubtotal > 0) {
          const usageClaimed = await claimCouponUsage(coupon.id);
          if (usageClaimed) {
            discountAmount = couponHelpers.computeDiscount(coupon, subtotal, eligibleSubtotal);
            appliedCouponCode = coupon.code;
            if (restricted) {
              eligibleItemIds = new Set(eligible.map((item) => item.id));
            }
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

    // O uso do cupom já foi reservado atomicamente antes de o desconto ser
    // aplicado (ver claimCouponUsage acima) — não há incremento aqui.

    const preference = await createPaymentPreference(itemsForMP, orderCode, customerData.email);

    await updateTable('orders', { id: `eq.${createdOrder.id}` }, {
      preference_id: preference.id,
      payment_status: 'pending',
      status: 'pending',
    });

    await recordEvent({
      eventName: 'checkout_initiated',
      sessionId: attributionData.session_id || '',
      customerEmail: customerData.email,
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
