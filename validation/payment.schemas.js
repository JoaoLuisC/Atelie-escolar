const { z } = require('zod');

const paymentItemSchema = z.object({
  id: z.union([z.string().trim().min(1), z.coerce.number().int().positive()]),
  title: z.string().trim().min(1, 'Título do item é obrigatório.').max(200, 'Título muito longo.'),
  price: z.coerce.number().positive('Preço do item deve ser maior que zero.'),
  quantity: z.coerce.number().int().min(1, 'Quantidade mínima é 1.').max(99, 'Quantidade inválida.'),
});

const paymentCustomerSchema = z.object({
  email: z.email('Email inválido.'),
  firstName: z.string().trim().min(2, 'Nome muito curto.').max(120, 'Nome muito longo.').optional().default(''),
  lastName: z.string().trim().max(120, 'Sobrenome muito longo.').optional().default(''),
  phone: z.string().trim().max(30, 'Telefone inválido.').optional().default(''),
  address: z.string().trim().max(200, 'Endereço muito longo.').optional().default(''),
  city: z.string().trim().max(100, 'Cidade muito longa.').optional().default(''),
  zipCode: z.string().trim().max(20, 'CEP inválido.').optional().default(''),
  state: z.string().trim().max(60, 'Estado inválido.').optional().default(''),
});

const processPaymentSchema = z.object({
  items: z.array(paymentItemSchema).min(1, 'Pelo menos 1 item é obrigatório.').max(100, 'Quantidade de itens inválida.'),
  customer: paymentCustomerSchema,
  externalReference: z.string().trim().max(120, 'Referência externa muito longa.').optional(),
});

module.exports = {
  processPaymentSchema,
};
