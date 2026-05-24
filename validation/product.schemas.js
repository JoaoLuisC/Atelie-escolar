const { z } = require('zod');

// z.url() aceita esquemas perigosos (javascript:, data:, file:, vbscript:).
// Esse schema só libera http/https — bloqueia XSS via URL armazenada.
const httpUrlSchema = z
  .string()
  .trim()
  .url('URL inválida.')
  .refine((value) => /^https?:\/\//i.test(value), 'URL deve usar http ou https.');

const createProductSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres.').max(140, 'Nome muito longo.'),
  description: z.string().trim().max(3000, 'Descrição muito longa.').optional().default(''),
  price: z.coerce.number().positive('Preço deve ser maior que zero.'),
  categoryId: z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]),
  image: httpUrlSchema.optional().or(z.literal('')).default(''),
  downloadUrl: httpUrlSchema.optional().or(z.literal('')).default(''),
  active: z.boolean().optional().default(true),
});

module.exports = {
  createProductSchema,
};
