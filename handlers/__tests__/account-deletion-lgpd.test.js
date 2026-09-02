import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  installModuleMock,
  installRateLimitPassthrough,
  installSecurityLoggerMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// EXCLUSÃO DE CONTA — o que sobra depois do "sua conta foi excluída".
//
// O fluxo cobria orders (anonimização), download_tokens (delete),
// auth.users (cascade em profiles/user_products) e email_subscribers
// (unsubscribe). Faltava `abandoned_carts`, e é a tabela mais fácil de
// esquecer justamente porque ela NÃO pendura em `customer_id`: a âncora é o
// e-mail digitado no checkout, então nenhum cascade a alcança.
//
// Consequência antes desta suíte: quem exercia o direito ao esquecimento
// continuava com e-mail e conteúdo do carrinho gravados por tempo
// indeterminado — a migration que criou a tabela promete limpeza "após 7
// dias", mas nenhuma função de purga foi escrita.
//
// O teste percorre os DOIS passos do fluxo real (pedido → e-mail com token →
// confirmação), em vez de chamar `executeDeletion` direto. O token é a
// autorização da operação irreversível; um teste que o fabricasse por dentro
// deixaria de exercitar justamente a porta.
// ════════════════════════════════════════════════════════════════════

const UID = 'uid-da-titular';
const EMAIL = 'ana.lima@example.com';

let store;
let emails;

/** Duplo de lib/supabase.js com as tabelas que o fluxo toca. */
function installSupabase() {
  const state = {
    orders: [
      { id: 11, customer_id: UID, customer_email: EMAIL, customer_name: 'Ana', customer_cpf: '1' },
    ],
    download_tokens: [{ order_id: 11, token: 'tok-1' }],
    abandoned_carts: [
      { id: 5, email: EMAIL, session_id: 's1' },
      // Carrinho de OUTRA pessoa: a exclusão não pode levá-lo junto.
      { id: 6, email: 'outra@example.com', session_id: 's2' },
    ],
    email_subscribers: [{ id: 9, email: EMAIL, unsubscribed_at: null }],
    analytics_events: [
      { id: 1, event_name: 'purchase', customer_email: EMAIL, order_id: 11 },
      // Evento de OUTRA pessoa: a limpeza não pode alcançá-lo.
      { id: 2, event_name: 'purchase', customer_email: 'outra@example.com', order_id: 99 },
    ],
  };

  // Operador não previsto LANÇA em vez de ser ignorado, como no harness do
  // caminho do dinheiro: um filtro silenciosamente descartado faria o teste
  // afirmar sobre um recorte que a produção não usa.
  function casa(row, coluna, operador, valor) {
    if (operador === 'eq') return String(row[coluna]) === String(valor);
    if (operador === 'neq') return String(row[coluna]) !== String(valor);
    if (operador === 'is') {
      if (valor === 'null') return row[coluna] === null || row[coluna] === undefined;
      if (valor === 'true') return row[coluna] === true;
      if (valor === 'false') return row[coluna] === false;
      throw new Error(`fake supabase: valor não suportado em is.${valor}`);
    }
    if (operador === 'in') {
      return String(valor)
        .replace(/^\(|\)$/g, '')
        .split(',')
        .includes(String(row[coluna]));
    }
    throw new Error(`fake supabase: operador não suportado "${operador}"`);
  }

  /** Filtros de updateTable/deleteFromTable: { coluna: 'op.valor' }. */
  function aplicaFiltro(rows, filters) {
    return rows.filter((row) =>
      Object.entries(filters || {}).every(([coluna, spec]) => {
        const bruto = String(spec);
        const corte = bruto.indexOf('.');
        if (corte < 0) throw new Error(`fake supabase: filtro sem operador "${coluna}=${bruto}"`);
        return casa(row, coluna, bruto.slice(0, corte), bruto.slice(corte + 1));
      }),
    );
  }

  const helpers = {
    /** Filtros de listTableRows/getTableRow: [{ column, operator, value }]. */
    listTableRows: vi.fn(async (tabela, options = {}) =>
      (state[tabela] || [])
        .filter((row) =>
          (options.filters || []).every((f) => {
            if (!f?.column || f.value === undefined || f.value === null) return true;
            return casa(row, f.column, String(f.operator || 'eq'), f.value);
          }),
        )
        .map((row) => ({ ...row })),
    ),
    getTableRow: vi.fn(async (tabela, options = {}) => {
      const rows = await helpers.listTableRows(tabela, options);
      return rows[0] || null;
    }),
    updateTable: vi.fn(async (tabela, filters, payload) => {
      const afetadas = aplicaFiltro(state[tabela] || [], filters);
      for (const row of afetadas) Object.assign(row, payload);
      return afetadas.map((row) => ({ ...row }));
    }),
    deleteFromTable: vi.fn(async (tabela, filters) => {
      const alvo = aplicaFiltro(state[tabela] || [], filters);
      state[tabela] = (state[tabela] || []).filter((row) => !alvo.includes(row));
      return alvo;
    }),
    insertIntoTable: vi.fn(async () => []),
  };

  installModuleMock('../../lib/supabase', {
    getSupabaseConfig: () => ({
      url: 'https://projeto-teste.supabase.co',
      anonKey: 'anon-de-teste',
      serviceRoleKey: 'service-role-de-teste',
    }),
    serviceRoleHelpers: helpers,
    ...helpers,
    supabaseRequest: vi.fn(async () => ({})),
  });

  return { state, helpers };
}

function installSuporte() {
  emails = [];

  installModuleMock('../../lib/customer-session', {
    getCustomerSessionFromRequest: () => ({ uid: UID, email: EMAIL, name: 'Ana' }),
    clearCustomerSessionCookie: () => {},
  });

  const deleteUser = vi.fn(async () => ({ error: null }));
  installModuleMock('../../services/supabase-auth', {
    getAdminClient: () => ({
      auth: {
        admin: {
          getUserById: async () => ({
            data: {
              user: { id: UID, email: EMAIL, email_confirmed_at: new Date().toISOString() },
            },
            error: null,
          }),
          deleteUser,
        },
      },
    }),
  });

  installModuleMock('../../lib/email-sender', {
    sendEmail: vi.fn(async (entry) => {
      emails.push(entry);
      return { sent: true };
    }),
    getAppUrl: () => 'http://localhost:5173',
  });

  installSecurityLoggerMock();
  installRateLimitPassthrough();

  return { deleteUser };
}

async function post(body) {
  const res = createMockRes();
  const handler = loadHandler('../me-delete-account.js');
  await handler({ method: 'POST', headers: { 'user-agent': 'vitest' }, body }, res);
  return res;
}

/** Passo 1 → token; passo 2 → exclusão. É o caminho que a cliente percorre. */
async function excluirConta() {
  const pedido = await post({});
  expect(pedido.statusCode).toBe(200);

  // `devConfirmUrl` só existe em dev/test, e é o próprio handler que decide
  // isso — usá-lo aqui mantém o formato do token fora do teste.
  const url = pedido.body?.devConfirmUrl;
  expect(url, 'devConfirmUrl ausente: o passo 1 não emitiu token').toBeTruthy();
  const token = decodeURIComponent(new URL(url).searchParams.get('delete_token') || '');
  expect(token).toBeTruthy();

  return post({ token });
}

let suporte;

beforeEach(() => {
  resetModuleRegistry();
  store = installSupabase();
  suporte = installSuporte();
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('me-delete-account · o que a exclusão precisa levar junto', () => {
  it('conclui os dois passos do fluxo', async () => {
    const res = await excluirConta();

    expect(res.statusCode).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(emails.map((e) => e.kind)).toContain('account_deletion_confirmation');
    expect(suporte.deleteUser).toHaveBeenCalledWith(UID);
  });

  it('apaga o carrinho abandonado do titular', async () => {
    await excluirConta();

    const restantes = store.state.abandoned_carts.map((row) => row.email);
    expect(restantes).not.toContain(EMAIL);
  });

  it('não toca no carrinho de outra pessoa', async () => {
    // O filtro é por `eq` no e-mail já normalizado. Com `ilike`, um `_` no
    // endereço viraria coringa e levaria carrinho alheio — o mesmo IDOR
    // silencioso que customer-orders.js já pagou.
    await excluirConta();

    expect(store.state.abandoned_carts.map((row) => row.email)).toEqual(['outra@example.com']);
  });

  it('anonimiza o pedido e apaga o token de download', async () => {
    // Trava o resto do fluxo junto: sem isto, uma regressão no passo 2 faria
    // o teste do carrinho passar sozinho e esconder o estrago maior.
    await excluirConta();

    expect(store.state.orders[0].customer_email).toMatch(/@anonimizado\.local$/);
    expect(store.state.orders[0].customer_cpf).toBeNull();
    expect(store.state.download_tokens).toEqual([]);
  });

  it('marca unsubscribe na newsletter', async () => {
    await excluirConta();

    expect(store.state.email_subscribers[0].unsubscribed_at).toBeTruthy();
  });

  it('limpa o e-mail que ficou em analytics_events', async () => {
    // A coluna deixou de ser escrita, mas as linhas gravadas ANTES disso
    // ficariam até a purga de 180 dias. Para quem pede exclusão hoje, 180
    // dias de espera não é exclusão.
    await excluirConta();

    const daTitular = store.state.analytics_events.find((linha) => linha.id === 1);
    expect(daTitular.customer_email).toBeNull();
    // O vínculo analítico sobrevive: o pedido continua apontado, e ele já
    // foi anonimizado no passo anterior.
    expect(daTitular.order_id).toBe(11);
  });

  it('não toca no evento de outra pessoa', async () => {
    await excluirConta();

    const daOutra = store.state.analytics_events.find((linha) => linha.id === 2);
    expect(daOutra.customer_email).toBe('outra@example.com');
  });

  it('não executa exclusão nenhuma sem token válido', async () => {
    const res = await post({ token: 'token-forjado' });

    expect(res.statusCode).toBe(400);
    expect(suporte.deleteUser).not.toHaveBeenCalled();
    expect(store.state.abandoned_carts).toHaveLength(2);
  });
});
