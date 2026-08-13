// ════════════════════════════════════════════════════════════════════
// Blocos reutilizáveis dos schemas.
//
// Todo limite aqui replica um limite que os handlers já aplicavam à mão — ver
// a nota "O QUE MUDOU EM RELAÇÃO AO SCHEMA ANTIGO" em validation/index.js.
// Quando um número for alterado, o comentário ao lado precisa explicar contra
// o que ele protege; teto sem motivo escrito vira número que ninguém ousa mexer.
// ════════════════════════════════════════════════════════════════════

const { z } = require('zod');

// `products.id` é `uuid primary key default gen_random_uuid()`
// (supabase/schema.sql). Validar o formato ANTES de o valor ser interpolado em
// `id=in.(…)` é o que impede separador do PostgREST (`,`, `)`, `"`) de chegar
// ao filtro — mesma defesa do achado B1, agora declarativa.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aceita o dígito de e-mail suficiente para barrar lixo óbvio sem bancar
// validador de RFC: quem valida o endereço de verdade é o envio da confirmação.
// Copiado de api/create-payment.js para o comportamento não mudar na migração.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// \p{C} = categoria Unicode "Other": controle (\n, \t, NUL), formatação
// invisível (ZWJ, RLO — usados para disfarçar texto) e não-atribuídos. Não
// existem em nome/telefone legítimos e, gravados no pedido, reaparecem no
// e-mail de confirmação, no painel admin e em qualquer exportação — é a
// semente clássica de CSV/log injection.
const CONTROL_CHARS_RE = /\p{C}+/gu;

// 254 = limite de endereço do RFC 5321. Escolhido em vez de um número redondo
// menor justamente para não rejeitar e-mail válido: o objetivo é ter um teto,
// não filtrar clientes.
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 30;

/** Normaliza texto vindo do cliente antes de persistir. */
function cleanText(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto já limpo, com teto de tamanho. Rejeita — nunca trunca em silêncio. */
function cleanString({ max, message, label = 'Campo' }) {
  return z
    .unknown()
    .transform(cleanText)
    .refine((value) => value.length <= max, {
      error: message || `${label} muito longo.`,
    });
}

const uuid = z
  .string({ error: 'Identificador inválido.' })
  .trim()
  .refine((value) => UUID_RE.test(value), { error: 'Identificador inválido.' });

const email = z
  .unknown()
  .transform((value) => cleanText(value).toLowerCase())
  .refine((value) => value.length > 0, { error: 'Email do cliente é obrigatório' })
  .refine((value) => value.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(value), {
    error: 'Email inválido.',
  });

/**
 * Quantidade de um item do carrinho: inteiro em 1..99.
 *
 * O teto de 99 não é sobre estoque (produto digital não tem), é sobre o total
 * do pedido: sem ele, `price * quantity` com quantidade absurda produz uma
 * preferência de valor irreal no Mercado Pago.
 */
const quantity = z.coerce
  .number({ error: 'Quantidade inválida.' })
  .int({ error: 'Quantidade inválida.' })
  .min(1, { error: 'Quantidade inválida.' })
  .max(99, { error: 'Quantidade inválida.' })
  .default(1);

/**
 * Valor monetário vindo do CLIENTE — usado apenas para prévia (validate-coupon).
 *
 * Nunca é fonte de verdade para cobrança: `api/create-payment.js` relê o preço
 * do banco. O teto existe para que a soma do subtotal não estoure em algo que
 * o handler depois compara com o total do pedido.
 */
const clientPrice = z.coerce
  .number({ error: 'Preço inválido.' })
  .min(0, { error: 'Preço inválido.' })
  .max(1_000_000, { error: 'Preço inválido.' })
  .default(0);

module.exports = {
  CONTROL_CHARS_RE,
  EMAIL_RE,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHONE_LENGTH,
  UUID_RE,
  cleanString,
  cleanText,
  clientPrice,
  email,
  quantity,
  uuid,
};
