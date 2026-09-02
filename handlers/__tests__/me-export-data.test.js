import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  expectApiError,
  installModuleMock,
  installRateLimitPassthrough,
  installSecurityLoggerMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO DE DADOS DO TITULAR (LGPD art. 18, V).
//
// O handler usa `serviceRoleHelpers`, que BYPASSA RLS por desenho: a policy
// corrigida do banco não o alcança, e o escopo tem que estar certo AQUI. Um
// erro de filtro neste arquivo não é bug de tela — é vazamento em massa, com
// o dossiê completo de outra pessoa entregue num JSON.
//
// Por isso o caso central desta suíte não é "exporta os dados": é **não
// exporta os de mais ninguém**. O banco de teste tem sempre duas clientes, e
// toda asserção positiva vem com a negativa ao lado.
//
// O segundo controle travado aqui é a ausência do VALOR do token de download.
// Ele não é dado pessoal da titular — é credencial de uso único que abre o
// arquivo pago. Um JSON exportado circula por e-mail e Drive; token vivo
// dentro dele é link de download vazado.
// ════════════════════════════════════════════════════════════════════

const TITULAR = { uid: 'uid-ana', email: 'ana@example.com', nome: 'Ana Lima' };
const OUTRA = { uid: 'uid-bruna', email: 'bruna@example.com' };

let store;
let securityEvents;

function installSupabase() {
  const state = {
    orders: [
      {
        id: 1,
        customer_id: TITULAR.uid,
        order_code: 'PED-001',
        status: 'completed',
        payment_status: 'approved',
        total_amount: 89.9,
        discount_amount: 10,
        coupon_code: 'BEMVINDO',
        created_at: '2026-08-01T10:00:00.000Z',
        completed_at: '2026-08-01T10:05:00.000Z',
      },
      // O pedido da OUTRA cliente. Nenhuma asserção positiva pode alcançá-lo.
      {
        id: 2,
        customer_id: OUTRA.uid,
        order_code: 'PED-002',
        status: 'completed',
        payment_status: 'approved',
        total_amount: 199.9,
        created_at: '2026-08-02T10:00:00.000Z',
      },
    ],
    order_items: [
      { order_id: 1, product_id: 'p1', product_name: 'Apostila', unit_price: 89.9, quantity: 1 },
      {
        order_id: 2,
        product_id: 'p9',
        product_name: 'Jogo da Bruna',
        unit_price: 199.9,
        quantity: 1,
      },
    ],
    download_tokens: [
      {
        order_id: 1,
        product_id: 'p1',
        product_name: 'Apostila',
        token: 'TOKEN-SECRETO-DA-ANA',
        used: false,
        used_at: null,
        expires_at: '2026-08-04T10:00:00.000Z',
        created_at: '2026-08-01T10:05:00.000Z',
      },
    ],
    email_subscribers: [
      {
        id: 7,
        email: TITULAR.email,
        confirmed: true,
        confirmed_at: '2026-07-01T00:00:00.000Z',
        unsubscribed_at: null,
        created_at: '2026-06-30T00:00:00.000Z',
      },
      { id: 8, email: OUTRA.email, confirmed: true, created_at: '2026-06-30T00:00:00.000Z' },
    ],
    abandoned_carts: [
      {
        email: TITULAR.email,
        items: [{ productId: 'p2', name: 'Caderno' }],
        total_amount: 30,
        recovered_at: null,
        reminder_sent_at: null,
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      },
      { email: OUTRA.email, items: [], total_amount: 99, created_at: '', updated_at: '' },
    ],
  };

  function casa(row, coluna, operador, valor) {
    if (operador === 'eq') return String(row[coluna]) === String(valor);
    if (operador === 'in') {
      return String(valor)
        .replace(/^\(|\)$/g, '')
        .split(',')
        .includes(String(row[coluna]));
    }
    throw new Error(`fake supabase: operador não suportado "${operador}"`);
  }

  const listTableRows = vi.fn(async (tabela, options = {}) =>
    (state[tabela] || [])
      .filter((row) =>
        (options.filters || []).every((f) => {
          if (!f?.column || f.value === undefined || f.value === null) return true;
          return casa(row, f.column, String(f.operator || 'eq'), f.value);
        }),
      )
      .map((row) => ({ ...row })),
  );

  const getTableRow = vi.fn(async (tabela, options = {}) => {
    const rows = await listTableRows(tabela, options);
    return rows[0] || null;
  });

  const helpers = { listTableRows, getTableRow };
  installModuleMock('../../lib/supabase', {
    getSupabaseConfig: () => ({
      url: 'https://projeto-teste.supabase.co',
      anonKey: 'anon-de-teste',
      serviceRoleKey: 'service-role-de-teste',
    }),
    serviceRoleHelpers: helpers,
    ...helpers,
  });

  return { state, helpers };
}

function installIdentidade({ sessao = TITULAR, emailConfirmado = true, usuario = TITULAR } = {}) {
  installModuleMock('../../lib/customer-session', {
    getCustomerSessionFromRequest: () => (sessao ? { ...sessao } : null),
  });

  installModuleMock('../../services/supabase-auth', {
    getAdminClient: () => ({
      auth: {
        admin: {
          getUserById: async (uid) => {
            if (!usuario || String(usuario.uid) !== String(uid)) {
              return { data: { user: null }, error: { message: 'not found' } };
            }
            return {
              data: {
                user: {
                  id: usuario.uid,
                  email: usuario.email,
                  email_confirmed_at: emailConfirmado ? '2026-06-01T00:00:00.000Z' : null,
                  created_at: '2026-06-01T00:00:00.000Z',
                  user_metadata: { name: usuario.nome || null },
                },
              },
              error: null,
            };
          },
        },
      },
    }),
  });
}

async function exportar({ method = 'GET' } = {}) {
  const res = createMockRes();
  const handler = loadHandler('../me-export-data.js');
  await handler({ method, headers: { 'user-agent': 'vitest' }, query: {}, body: {} }, res);
  return res;
}

beforeEach(() => {
  resetModuleRegistry();
  store = installSupabase();
  securityEvents = installSecurityLoggerMock();
  installRateLimitPassthrough();
  installIdentidade();
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('me-export-data · escopo', () => {
  it('devolve os pedidos do titular', async () => {
    const res = await exportar();

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pedidos).toHaveLength(1);
    expect(res.body.pedidos[0].codigo).toBe('PED-001');
    expect(res.body.pedidos[0].itens[0].produto).toBe('Apostila');
  });

  it('NÃO devolve nada da outra cliente', async () => {
    const res = await exportar();

    const serializado = JSON.stringify(res.body);
    expect(serializado).not.toContain('PED-002');
    expect(serializado).not.toContain('Jogo da Bruna');
    expect(serializado).not.toContain(OUTRA.email);
  });

  it('ancora em customer_id, não no e-mail', async () => {
    // O e-mail é atributo autodeclarado; o uid é chave forte. A asserção olha
    // o filtro que foi de fato para o PostgREST.
    await exportar();

    const chamada = store.helpers.listTableRows.mock.calls.find((args) => args[0] === 'orders');
    expect(chamada[1].filters).toEqual([{ column: 'customer_id', value: TITULAR.uid }]);
  });

  it('traz newsletter e carrinho abandonado do titular, e só dele', async () => {
    const res = await exportar();

    expect(res.body.newsletter.email).toBe(TITULAR.email);
    expect(res.body.newsletter.confirmada).toBe(true);
    expect(res.body.carrinhosAbandonados).toHaveLength(1);
    expect(res.body.carrinhosAbandonados[0].total).toBe(30);
  });
});

describe('me-export-data · o que não pode sair', () => {
  it('nunca inclui o VALOR do token de download', async () => {
    const res = await exportar();

    expect(JSON.stringify(res.body)).not.toContain('TOKEN-SECRETO-DA-ANA');
    // Mas a informação sobre o download continua lá — é o que a pessoa tem
    // direito de saber.
    expect(res.body.pedidos[0].downloads[0]).toMatchObject({
      produto: 'Apostila',
      jaUtilizado: false,
    });
  });

  it('declara no próprio arquivo o que ficou de fora', async () => {
    // Export silencioso sobre as próprias omissões é pior que export honesto
    // sobre elas.
    const res = await exportar();

    expect(res.body.naoIncluido).toMatchObject({
      tokensDeDownload: expect.any(String),
      analytics: expect.any(String),
      seguranca: expect.any(String),
    });
  });

  it('proíbe cache da resposta', async () => {
    const res = await exportar();

    expect(res.headers['Cache-Control']).toBe('no-store, max-age=0');
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
  });
});

describe('me-export-data · portas fechadas', () => {
  it('exige sessão de cliente', async () => {
    installIdentidade({ sessao: null });

    const res = await exportar();

    expectApiError(res, { status: 401, code: 'CUSTOMER_SESSION_INVALID' });
    expect(store.helpers.listTableRows).not.toHaveBeenCalled();
  });

  it('exige e-mail confirmado em auth.users', async () => {
    // Com "Confirm email" OFF, qualquer um se cadastra com o endereço da
    // vítima. `email_confirmed_at` é a única evidência de posse.
    installIdentidade({ emailConfirmado: false });

    const res = await exportar();

    expectApiError(res, { status: 401, code: 'CUSTOMER_SESSION_INVALID' });
    expect(store.helpers.listTableRows).not.toHaveBeenCalled();
  });

  it('recusa uid de sessão que não existe mais em auth.users', async () => {
    installIdentidade({ sessao: { uid: 'uid-apagado', email: 'x@y.com' }, usuario: TITULAR });

    const res = await exportar();

    expectApiError(res, { status: 401, code: 'CUSTOMER_SESSION_INVALID' });
  });

  it('responde 405 a método que não seja GET', async () => {
    const res = await exportar({ method: 'DELETE' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toContain('GET');
    expect(store.helpers.listTableRows).not.toHaveBeenCalled();
  });
});

describe('me-export-data · rastro', () => {
  it('registra o acesso sem PII no evento', async () => {
    await exportar();

    const evento = securityEvents.recordSecurityEvent.mock.calls
      .map(([entrada]) => entrada)
      .find((entrada) => entrada.eventName === 'customer_data_exported');

    expect(evento).toBeTruthy();
    expect(evento.properties).toEqual({ orders: 1, carts: 1 });
    expect(JSON.stringify(evento.properties)).not.toContain(TITULAR.email);
  });
});
