// ════════════════════════════════════════════════════════════════════
// Schemas do caminho do dinheiro — o primeiro a receber validação
// declarativa, por ser onde um campo mal lido custa uma cobrança errada.
//
// Substitui o `validation/payment.schemas.js` antigo, que existia mas NUNCA
// era executado no caminho servido em produção (só pelo middleware do Express
// de desenvolvimento). Os limites são os mesmos que handlers/create-payment.js já
// aplicava à mão em `normalizeCustomer` — a migração move a validação de lugar,
// não muda o contrato.
// ════════════════════════════════════════════════════════════════════

const { z } = require('zod');

const {
  MAX_NAME_LENGTH,
  MAX_PHONE_LENGTH,
  cleanString,
  cleanText,
  clientPrice,
  email,
  quantity,
  uuid,
} = require('./common.schemas');

// Teto de itens do carrinho. Sem ele, um array gigante vira N consultas
// sequenciais (DoS barato) e uma preferência absurda no Mercado Pago.
// handlers/validate-coupon.js usa o MESMO número de propósito: um carrinho que a
// prévia aceitasse e o checkout recusasse não serviria para nada.
const MAX_ITEMS = 100;

const CPF_DIGITS = 11;

/**
 * CPF é OPCIONAL e não autoriza nada neste fluxo (não busca pedido, não
 * entrega arquivo). Guardamos os 11 dígitos e NÃO conferimos o dígito
 * verificador: derrubar um checkout pago por um dígito digitado errado num
 * campo decorativo seria uma troca ruim. O que o banco precisa é do teto e da
 * forma grosseira.
 *
 * `null` (e não `''`) preserva a semântica de "não informado" das colunas
 * `customer_cpf` / `customer_phone`, que são nullable no schema.
 */
const cpf = z
  .unknown()
  .transform((value) => cleanText(value).replace(/\D/g, ''))
  .refine((digits) => digits === '' || digits.length === CPF_DIGITS, { error: 'CPF inválido.' })
  .transform((digits) => digits || null);

const phone = z
  .unknown()
  .transform(cleanText)
  .refine(
    (value) => {
      if (!value) return true;
      const digits = value.replace(/\D/g, '');
      // 8..15 dígitos cobre fixo local sem DDD até E.164 internacional cheio.
      return value.length <= MAX_PHONE_LENGTH && digits.length >= 8 && digits.length <= 15;
    },
    { error: 'Telefone inválido.' },
  )
  .transform((value) => value || null);

const customerSchema = z.object({
  email,
  name: cleanString({ max: MAX_NAME_LENGTH, message: 'Nome muito longo.' }).default(''),
  cpf: cpf.default(''),
  phone: phone.default(''),
});

// Mensagem própria (e não a genérica de `uuid`): este é o texto que o checkout
// já exibia, e trocá-lo na migração misturaria mudança de contrato com mudança
// de lugar. `.describe()` NÃO serve aqui — ele anota metadado e não altera a
// mensagem do issue.
const ITEM_ID_ERROR = 'Item inválido: productId é obrigatório.';

const productIdSchema = z
  .unknown()
  .transform((value) => cleanText(value))
  .refine((value) => value.length > 0, { error: ITEM_ID_ERROR })
  .refine((value) => uuid.safeParse(value).success, { error: ITEM_ID_ERROR });

const cartItemSchema = z.object({
  // productId é obrigatório: sem ele o filtro por id seria omitido e a consulta
  // devolveria um produto arbitrário (buildTableQuery ignora value undefined).
  productId: productIdSchema,
  quantity,
});

const cartItemsSchema = z
  .array(cartItemSchema, { error: 'Items são obrigatórios' })
  .min(1, { error: 'Items são obrigatórios' })
  .max(MAX_ITEMS, { error: 'Quantidade de itens inválida.' });

/**
 * POST /api/create-payment
 *
 * `attribution` fica FORA do schema estrito de propósito: ele já passa por
 * `lib/attribution-sanitize.js`, que tem regra própria (allowlist de chaves e
 * teto por valor) e é usado também por outros caminhos. Duplicar aqui criaria
 * duas fontes de verdade para a mesma sanitização — exatamente o que a regra
 * B1 quer evitar.
 */
const createPaymentSchema = z.object({
  items: cartItemsSchema,
  customer: customerSchema,
  couponCode: z
    .unknown()
    .transform((value) => cleanText(value).toUpperCase().slice(0, 40))
    .default(''),
  attribution: z.unknown().optional(),
});

/**
 * POST /api/validate-coupon
 *
 * Os itens aqui carregam PREÇO, ao contrário do checkout: esta rota só calcula
 * uma PRÉVIA e nunca cobra. O preço definitivo é relido do banco em
 * create-payment — por isso o preço do cliente é aceito, mas só como estimativa.
 */
const validateCouponSchema = z.object({
  code: z
    .unknown()
    .transform((value) => cleanText(value).toUpperCase())
    .refine((value) => value.length > 0, { error: 'Informe o código do cupom.' })
    .refine((value) => value.length <= 40, { error: 'Código de cupom inválido.' }),
  items: z
    .array(
      z.object({
        productId: z.unknown().optional(),
        id: z.unknown().optional(),
        categoryId: z.unknown().optional(),
        price: clientPrice,
        quantity,
      }),
      { error: 'Itens inválidos.' },
    )
    .max(MAX_ITEMS, { error: 'Quantidade de itens inválida.' })
    .default([]),
});

/**
 * POST /api/verify-payment (GET mantido por compatibilidade).
 *
 * O contrato do endpoint é `orderId`, mas a coluna é `order_code` e há
 * chamadas antigas com as duas grafias — as três são aceitas e normalizadas
 * para uma. O teto de 128 caracteres cobre o código de 128 bits emitido pelo
 * checkout com folga e barra corpo gigante.
 */
const orderIdentifier = z
  .unknown()
  .transform(cleanText)
  .refine((value) => value.length > 0, { error: 'orderId é obrigatório.' })
  .refine((value) => value.length <= 128, { error: 'orderId inválido.' });

/**
 * O e-mail aqui é o SEGUNDO fator do par (order_code, email) que libera a
 * consulta. Deliberadamente mais frouxo que `common.email`: quem erra o e-mail
 * precisa receber a MESMA resposta de quem informa um pedido inexistente (404),
 * e não um 400 que confirme "o pedido existe, o e-mail é que está errado".
 * Por isso aqui só se exige a forma mínima — a comparação de verdade acontece
 * no handler, em tempo constante.
 */
const verifyEmail = z
  .unknown()
  .transform((value) => cleanText(value).toLowerCase())
  .refine((value) => value.length > 0 && value.includes('@'), { error: 'email é obrigatório' })
  .refine((value) => value.length <= 254, { error: 'email é obrigatório' });

// A ORDEM DAS CHAVES importa: o zod reporta os issues na ordem do shape, e
// `parseOrFail` usa a primeira mensagem. Com os dois campos ausentes, a
// resposta precisa ser sobre o orderId — que é o campo que o cliente esquece.
const verifyPaymentSchema = z
  .object({
    orderId: z.unknown().optional(),
    order_code: z.unknown().optional(),
    orderCode: z.unknown().optional(),
    email: z.unknown().optional(),
  })
  .transform((raw) => ({
    orderId: raw.orderId ?? raw.order_code ?? raw.orderCode,
    email: raw.email,
  }))
  .pipe(z.object({ orderId: orderIdentifier, email: verifyEmail }));

module.exports = {
  MAX_ITEMS,
  cartItemSchema,
  cartItemsSchema,
  createPaymentSchema,
  customerSchema,
  validateCouponSchema,
  verifyPaymentSchema,
};
