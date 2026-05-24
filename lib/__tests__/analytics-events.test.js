import { describe, expect, it } from 'vitest';
import {
  CLIENT_ALLOWED_EVENTS,
  SERVER_ALLOWED_EVENTS,
  isClientEventAllowed,
  isServerEventAllowed,
  sanitizeProperties,
} from '../analytics-events.js';

describe('analytics-events.isClientEventAllowed', () => {
  it('aceita eventos canônicos do funil enviados pelo cliente', () => {
    for (const event of ['view_item', 'add_to_cart', 'begin_checkout', 'view_catalog']) {
      expect(isClientEventAllowed(event)).toBe(true);
    }
  });

  it('rejeita eventos só-backend vindos do cliente', () => {
    expect(isClientEventAllowed('payment_approved')).toBe(false);
    expect(isClientEventAllowed('checkout_initiated')).toBe(false);
  });

  it('rejeita strings vazias e eventos arbitrários', () => {
    expect(isClientEventAllowed('')).toBe(false);
    expect(isClientEventAllowed('admin_login')).toBe(false);
    expect(isClientEventAllowed('drop_table')).toBe(false);
  });
});

describe('analytics-events.isServerEventAllowed', () => {
  it('aceita eventos de backend', () => {
    expect(isServerEventAllowed('payment_approved')).toBe(true);
    expect(isServerEventAllowed('webhook_received')).toBe(true);
  });

  it('rejeita eventos de cliente (separação rigorosa)', () => {
    expect(isServerEventAllowed('view_item')).toBe(false);
    expect(isServerEventAllowed('add_to_cart')).toBe(false);
  });
});

describe('analytics-events.sanitizeProperties', () => {
  it('remove chaves de PII (regra A5 — sem dados pessoais em eventos)', () => {
    const input = {
      email: 'cliente@teste.com',
      customer_email: 'outro@teste.com',
      cpf: '123.456.789-09',
      phone: '11999999999',
      password: 'secret',
      value: 49.9,
    };
    const out = sanitizeProperties(input);
    expect(out).toEqual({ value: 49.9 });
    expect(out.email).toBeUndefined();
    expect(out.cpf).toBeUndefined();
    expect(out.password).toBeUndefined();
  });

  it('trunca strings longas a 500 chars', () => {
    const long = 'x'.repeat(2000);
    const out = sanitizeProperties({ description: long });
    expect(out.description).toHaveLength(500);
  });

  it('preserva números, booleanos e objetos serializáveis', () => {
    const out = sanitizeProperties({
      count: 3,
      featured: true,
      items: [{ id: '1', price: 10 }],
    });
    expect(out.count).toBe(3);
    expect(out.featured).toBe(true);
    expect(out.items).toEqual([{ id: '1', price: 10 }]);
  });

  it('descarta valores null, undefined e funções', () => {
    const out = sanitizeProperties({
      a: null,
      b: undefined,
      c: () => 1,
      d: 'ok',
    });
    expect(out).toEqual({ d: 'ok' });
  });

  it('retorna objeto vazio para inputs inválidos', () => {
    expect(sanitizeProperties(null)).toEqual({});
    expect(sanitizeProperties(undefined)).toEqual({});
    expect(sanitizeProperties('string')).toEqual({});
    expect(sanitizeProperties([1, 2, 3])).toEqual({});
  });
});

describe('analytics-events whitelists — coerência', () => {
  it('não tem evento em ambas as whitelists (separação rígida)', () => {
    for (const event of CLIENT_ALLOWED_EVENTS) {
      expect(SERVER_ALLOWED_EVENTS.has(event)).toBe(false);
    }
  });
});
