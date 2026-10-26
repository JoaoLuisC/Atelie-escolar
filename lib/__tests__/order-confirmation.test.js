import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/order-confirmation.js — a porta única do e-mail de confirmação do pedido
// (webhook, verify-payment e /api/send-confirmation-email).

const requireCjs = createRequire(import.meta.url);

function mockModule(request, exports) {
  const filename = requireCjs.resolve(request);
  requireCjs.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

const MOCKED = ['../supabase.js', '../email-sender.js'];
let sendEmail;
let listTableRows;

function load() {
  delete requireCjs.cache[requireCjs.resolve('../order-confirmation.js')];
  return requireCjs('../order-confirmation.js');
}

const ORDER = {
  id: 7,
  order_code: 'ORD-77',
  customer_email: 'cliente@exemplo.com',
  customer_name: 'Ana',
  total_amount: 25,
};

beforeEach(() => {
  sendEmail = vi.fn(async () => ({ sent: true }));
  listTableRows = vi.fn(async () => [{ product_name: 'Painel', unit_price: 25, quantity: 1 }]);
  mockModule('../supabase.js', { serviceRoleHelpers: { listTableRows } });
  mockModule('../email-sender.js', { sendEmail, getAppUrl: () => 'https://loja.test' });
  delete requireCjs.cache[requireCjs.resolve('../email-templates.js')];
});

afterEach(() => {
  for (const request of [...MOCKED, '../email-templates.js', '../order-confirmation.js']) {
    delete requireCjs.cache[requireCjs.resolve(request)];
  }
});

describe('sendOrderConfirmation', () => {
  it('envia ao e-mail do pedido, idempotente por order_code', async () => {
    const { sendOrderConfirmation } = load();

    const result = await sendOrderConfirmation({ order: ORDER });

    expect(result).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'cliente@exemplo.com',
        kind: 'order_confirmation',
        entityId: 'ORD-77',
      }),
    );
    expect(sendEmail.mock.calls[0][0].html).toContain('Painel');
  });

  it('usa os itens recebidos sem consultar o banco', async () => {
    const { sendOrderConfirmation } = load();

    await sendOrderConfirmation({
      order: ORDER,
      items: [{ product_name: 'Kit Natal', unit_price: 25 }],
    });

    expect(listTableRows).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][0].html).toContain('Kit Natal');
  });

  it('conta nova ganha o aviso de definir senha', async () => {
    const { sendOrderConfirmation } = load();

    await sendOrderConfirmation({ order: ORDER, isNewAccount: true });

    expect(sendEmail.mock.calls[0][0].html).toMatch(/definir sua senha/);
  });

  it('nunca lança: falha de envio vira { sent: false }', async () => {
    sendEmail.mockRejectedValue(new Error('smtp fora'));
    const { sendOrderConfirmation } = load();

    await expect(sendOrderConfirmation({ order: ORDER })).resolves.toEqual({
      sent: false,
      reason: 'internal_error',
    });
  });

  it('sem e-mail ou código do pedido, não envia', async () => {
    const { sendOrderConfirmation } = load();

    expect(await sendOrderConfirmation({ order: { ...ORDER, customer_email: '' } })).toEqual({
      sent: false,
      reason: 'missing_order_data',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
