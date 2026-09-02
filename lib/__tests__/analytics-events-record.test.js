import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installModuleMock,
  loadHandler,
  resetModuleRegistry,
} from '../../handlers/__tests__/money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// O QUE `recordEvent` GRAVA — e, principalmente, o que ele não grava.
//
// `analytics_events` tem uma coluna `customer_email`, e dois handlers a
// preenchiam. Ninguém a lia: o único leitor da tabela é
// handlers/admin/funnel.js, que seleciona `event_name, session_id,
// created_at`. Era PII retida sem consumidor.
//
// E ela sobrevivia à exclusão de conta — `orders.customer_email` é anonimizado
// no fluxo do art. 18, e esta cópia ficava até a purga de 180 dias. O e-mail
// de quem pediu para ser esquecido continuava gravado num lugar que ninguém
// lembrava de olhar.
//
// O teste afirma sobre o PAYLOAD que sai para o banco, não sobre a assinatura
// da função: um chamador antigo que ainda passe `customerEmail` não pode
// conseguir gravá-lo de volta por acidente.
// ════════════════════════════════════════════════════════════════════

let inseridos;

beforeEach(() => {
  resetModuleRegistry();
  inseridos = [];
  installModuleMock('../../lib/supabase', {
    getSupabaseConfig: () => ({
      url: 'https://projeto-teste.supabase.co',
      anonKey: 'anon-de-teste',
      serviceRoleKey: 'service-role-de-teste',
    }),
    serviceRoleHelpers: {
      insertIntoTable: vi.fn(async (tabela, payload) => {
        inseridos.push({ tabela, payload });
        return [payload];
      }),
    },
  });
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

function carregar() {
  return loadHandler('../../lib/analytics-events.js');
}

describe('recordEvent · payload gravado', () => {
  it('grava o evento com sessão, pedido e propriedades', async () => {
    const { recordEvent } = carregar();

    await recordEvent({
      eventName: 'payment_approved',
      sessionId: 'sess-1',
      orderId: 'order-1',
      properties: { value: 89.9, currency: 'BRL' },
    });

    expect(inseridos).toHaveLength(1);
    expect(inseridos[0].tabela).toBe('analytics_events');
    expect(inseridos[0].payload).toMatchObject({
      event_name: 'payment_approved',
      session_id: 'sess-1',
      order_id: 'order-1',
      properties: { value: 89.9, currency: 'BRL' },
    });
  });

  it('NUNCA grava customer_email, nem quando o chamador insiste', async () => {
    const { recordEvent } = carregar();

    await recordEvent({
      eventName: 'checkout_initiated',
      orderId: 'order-1',
      // Um chamador antigo (ou copiado de um commit velho) ainda pode mandar
      // isto. A propriedade tem que morrer aqui, não no banco.
      customerEmail: 'ana@example.com',
    });

    const payload = inseridos[0].payload;
    expect(payload).not.toHaveProperty('customer_email');
    expect(JSON.stringify(payload)).not.toContain('ana@example.com');
  });

  it('continua removendo PII de dentro de `properties`', async () => {
    // A defesa antiga, que segue valendo: o e-mail podia entrar pela porta
    // dos fundos, dentro do objeto livre de propriedades.
    const { recordEvent } = carregar();

    await recordEvent({
      eventName: 'purchase',
      orderId: 'order-1',
      properties: { value: 10, email: 'ana@example.com', cpf: '12345678900' },
    });

    const { properties } = inseridos[0].payload;
    expect(properties).toEqual({ value: 10 });
  });

  it('o vínculo com a pessoa continua existindo por order_id', async () => {
    // É o que torna a remoção do e-mail uma minimização e não uma perda: o
    // pedido aponta para a identidade, e é ele que a exclusão anonimiza.
    const { recordEvent } = carregar();

    await recordEvent({ eventName: 'payment_approved', orderId: 'order-42' });

    expect(inseridos[0].payload.order_id).toBe('order-42');
  });
});
