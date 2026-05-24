import { describe, expect, it } from 'vitest';
import { processPaymentSchema } from '../payment.schemas.js';
import { createProductSchema } from '../product.schemas.js';

const validPayment = {
  items: [{ id: 'prod-1', title: 'Painel', price: 19.9, quantity: 1 }],
  customer: { email: 'cliente@exemplo.com' },
};

const validProduct = {
  name: 'Painel Tropical',
  description: 'Painel decorativo para festas',
  price: 19.9,
  categoryId: 1,
  image: 'https://example.com/img.jpg',
  downloadUrl: 'https://example.com/file.pdf',
  active: true,
};

describe('processPaymentSchema (fuzz)', () => {
  it('aceita payload válido', () => {
    expect(processPaymentSchema.safeParse(validPayment).success).toBe(true);
  });

  it.each([
    ['itens vazios', { ...validPayment, items: [] }],
    ['mais de 100 itens', { ...validPayment, items: Array(101).fill(validPayment.items[0]) }],
    ['quantidade > 99', { ...validPayment, items: [{ ...validPayment.items[0], quantity: 100 }] }],
    ['quantidade < 1', { ...validPayment, items: [{ ...validPayment.items[0], quantity: 0 }] }],
    ['quantidade fracionária', { ...validPayment, items: [{ ...validPayment.items[0], quantity: 1.5 }] }],
    ['preço negativo', { ...validPayment, items: [{ ...validPayment.items[0], price: -1 }] }],
    ['preço zero', { ...validPayment, items: [{ ...validPayment.items[0], price: 0 }] }],
    ['title vazio', { ...validPayment, items: [{ ...validPayment.items[0], title: '   ' }] }],
    ['title gigante', { ...validPayment, items: [{ ...validPayment.items[0], title: 'a'.repeat(500) }] }],
    ['id vazio', { ...validPayment, items: [{ ...validPayment.items[0], id: '' }] }],
    ['email inválido', { ...validPayment, customer: { email: 'nao-eh-email' } }],
    ['email vazio', { ...validPayment, customer: { email: '' } }],
    ['nome > 120', { ...validPayment, customer: { email: 'a@b.co', firstName: 'a'.repeat(200) } }],
    ['address gigante', { ...validPayment, customer: { email: 'a@b.co', address: 'a'.repeat(500) } }],
    ['externalReference gigante', { ...validPayment, externalReference: 'a'.repeat(300) }],
    ['items não-array', { ...validPayment, items: { id: 'x' } }],
    ['customer ausente', { items: validPayment.items }],
    ['payload string', 'not-an-object'],
    ['payload null', null],
    ['payload undefined', undefined],
    ['payload array', []],
    ['injeção __proto__', { __proto__: { malicious: true }, ...validPayment, items: [] }],
  ])('rejeita: %s', (_label, payload) => {
    expect(processPaymentSchema.safeParse(payload).success).toBe(false);
  });
});

describe('createProductSchema (fuzz)', () => {
  it('aceita payload válido', () => {
    expect(createProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it.each([
    ['nome < 3 chars', { ...validProduct, name: 'ab' }],
    ['nome > 140 chars', { ...validProduct, name: 'a'.repeat(141) }],
    ['descrição > 3000 chars', { ...validProduct, description: 'a'.repeat(3001) }],
    ['preço negativo', { ...validProduct, price: -5 }],
    ['preço zero', { ...validProduct, price: 0 }],
    ['imagem com URL inválida', { ...validProduct, image: 'nao-eh-url' }],
    ['downloadUrl javascript:', { ...validProduct, downloadUrl: 'javascript:alert(1)' }],
    ['categoryId negativo', { ...validProduct, categoryId: -3 }],
    ['payload null', null],
    ['payload sem campos obrigatórios', { active: true }],
    ['payload com price como objeto', { ...validProduct, price: { value: 10 } }],
  ])('rejeita: %s', (_label, payload) => {
    expect(createProductSchema.safeParse(payload).success).toBe(false);
  });

  it('aceita imagem e downloadUrl vazios como opcionais', () => {
    const out = createProductSchema.safeParse({ ...validProduct, image: '', downloadUrl: '' });
    expect(out.success).toBe(true);
  });
});
