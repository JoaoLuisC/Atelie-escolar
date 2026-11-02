// Schemas das rotas do CLIENTE logado (regra B1: endpoint novo entra com schema).
// Os tetos são os mesmos das colunas em supabase/migrations/20261031000000 e
// 20261101000000 (reason ≤ 2000, phone ≤ 40) e de `profiles.display_name`.
const { z } = require('zod');
const { cleanText } = require('./common.schemas');

const REFUND_CATEGORIES = ['desistencia', 'nao_abre', 'defeito', 'diferente_do_anunciado', 'outro'];

// Telefone é opcional; preenchido, só dígitos e a pontuação de um número.
const PHONE_RE = /^[\d\s()+.-]{8,40}$/;

// `cleanText` junta tudo numa linha; o motivo da devolução pode ter parágrafos.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function cleanMultiline(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .trim();
}

const refundRequestSchema = z.object({
  orderId: z
    .unknown()
    .transform((value) => cleanText(value))
    .refine((value) => value.length > 0 && value.length <= 100, {
      error: 'Informe o número do pedido.',
    }),
  reasonCategory: z
    .unknown()
    .transform((value) => cleanText(value))
    .refine((value) => value === '' || REFUND_CATEGORIES.includes(value), {
      error: 'Motivo inválido.',
    })
    .default(''),
  reason: z
    .unknown()
    .transform((value) => cleanMultiline(value))
    .refine((value) => value.length <= 2000, { error: 'O motivo pode ter até 2000 caracteres.' })
    .default(''),
  phone: z
    .unknown()
    .transform((value) => cleanText(value))
    .refine((value) => value === '' || PHONE_RE.test(value), { error: 'Telefone inválido.' })
    .default(''),
});

const profileUpdateSchema = z.object({
  name: z
    .unknown()
    .transform((value) => cleanText(value).replaceAll(/\s+/g, ' '))
    .refine((value) => value.length >= 2 && value.length <= 120, {
      error: 'Informe um nome entre 2 e 120 caracteres.',
    }),
});

module.exports = { REFUND_CATEGORIES, refundRequestSchema, profileUpdateSchema };
