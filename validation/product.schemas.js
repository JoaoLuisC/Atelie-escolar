const { z } = require('zod');

const createProductSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres.').max(140, 'Nome muito longo.'),
  description: z.string().trim().max(3000, 'Descrição muito longa.').optional().default(''),
  price: z.coerce.number().positive('Preço deve ser maior que zero.'),
  categoryId: z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]),
  image: z.string().trim().url('Imagem deve ser uma URL válida.').optional().or(z.literal('')).default(''),
  downloadUrl: z.string().trim().url('Download deve ser uma URL válida.').optional().or(z.literal('')).default(''),
  active: z.boolean().optional().default(true),
});

module.exports = {
  createProductSchema,
};
