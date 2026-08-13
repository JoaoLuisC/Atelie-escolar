import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installModuleMock, loadHandler, resetModuleRegistry } from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// Regressões de AUTORIZAÇÃO nas queries enviadas ao PostgREST.
//
// Estes testes afirmam sobre a URL REAL que sai para o Supabase, e não sobre
// o retorno do handler. É a única forma de travar o COLUNA/OPERADOR de
// escopo, que é onde os defeitos estiveram — um handler pode devolver 200
// com a lista certa nos dados de teste e ainda assim estar consultando pela
// coluna errada. Por isso lib/supabase.js entra de verdade e o duplo é o
// `fetch` global.
//
// ── HISTÓRICO DO QUE ESTÁ TRAVADO AQUI ───────────────────────────────
//
// 1. `ilike` no lugar de `eq` (auditoria 2026-08-12). No PostgREST o valor de
//    `ilike` entra direto no padrão LIKE, e `_`/`%` são metacaracteres. Como
//    `_` é caractere legal e corriqueiro em e-mail, `ana_lima@x.com` casava
//    `ana.lima@x.com` e o endpoint entregava pedidos — e download_tokens — de
//    terceiros. IDOR sem sequer haver um atacante.
//
// 2. `/api/products` projetava `download_url`, o localizador do arquivo pago,
//    num endpoint público.
//
// 3. **Âncora de escopo (P1-1, revisão 2026-08-12).** Trocar `ilike` por `eq`
//    consertou o curinga mas não o modelo: o escopo continuava sendo o E-MAIL
//    da sessão. A migration wave1 já havia tirado a policy de `orders` do
//    claim `email` e passado para `customer_id = auth.uid()`, com a
//    justificativa de que o claim `email` NÃO prova posse do endereço — mas
//    este handler usa `serviceRoleHelpers`, que bypassa RLS, então a policy
//    corrigida não o alcançava. Com "Confirm email" OFF, bastava registrar-se
//    com o e-mail da vítima para receber uma sessão carregando aquele e-mail
//    e ler os pedidos (e os tokens de download VÁLIDOS) dela.
//    A âncora agora é `orders.customer_id = session.uid` — o `sub` do usuário
//    no Supabase Auth, chave forte e não um atributo autodeclarado.
//
// O caso 1 continua coberto: nenhuma URL emitida pode conter `ilike`. O que
// mudou é que o e-mail não pode aparecer no caminho de LEITURA nem com `eq`.
// ════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://projeto-teste.supabase.co';
// UUID de verdade: o Supabase Auth valida o formato do uid, e um placeholder
// como 'uid-1' faria a resolução de identidade falhar por motivo errado.
const SESSION_UID = '3f4b1c9e-0d2a-4a7b-9c11-8e5f6a2b3c4d';
// E-mail com underscore — o caractere que transformava o filtro em curinga.
const SESSION_EMAIL = 'ana_lima@gmail.com';
const ORDER_INTERNAL_ID = '11111111-1111-1111-1111-111111111111';

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader: vi.fn((key, value) => { res.headers[key] = value; }),
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((payload) => { res.body = payload; return res; }),
    end: vi.fn(() => res),
    redirect: vi.fn(() => res),
  };
  return res;
}

/** Requisições capturadas do fetch global, na ordem em que o handler as emitiu. */
let requests = [];

/**
 * `route({ url, method })` devolve o payload da resposta. O MÉTODO importa:
 * a leitura (GET) e a adoção de pedidos órfãos (PATCH) batem na mesma tabela
 * e precisam ser distinguidas nas asserções.
 */
function stubFetch(route = () => []) {
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const entry = {
      url: String(url),
      method: String(options.method || 'GET').toUpperCase(),
      body: options.body,
    };
    requests.push(entry);
    return jsonResponse(route(entry) ?? []);
  });
}

function urlFor(fragment, method = 'GET') {
  return requests.find((entry) => entry.url.includes(fragment) && entry.method === method)?.url;
}

function allUrls() {
  return requests.map((entry) => decodeURIComponent(entry.url));
}

const ORDER_ROW = {
  id: ORDER_INTERNAL_ID,
  order_code: 'ORD-1',
  total_amount: 10,
  status: 'completed',
  payment_status: 'approved',
  created_at: '2026-01-01T00:00:00Z',
};

/**
 * Duplo da identidade do Supabase Auth. `user: null` ⇒ sem cliente admin, que
 * é o caminho em que a reconciliação de pedidos de convidado não roda.
 */
function installIdentity(user) {
  installModuleMock('../../services/supabase-auth', {
    getAnonClient: () => null,
    getProfileRoleByUserId: async () => '',
    getProfileRoleByEmail: async () => '',
    getAdminClient: () => (user ? {
      auth: {
        admin: {
          getUserById: async (uid) => ({
            data: { user: { id: uid, email: user.email, email_confirmed_at: '2026-01-01T00:00:00Z' } },
            error: null,
          }),
        },
      },
    } : null),
  });
}

function sessionCookie(user) {
  const { setCustomerSessionCookie } = loadHandler('../../lib/customer-session');
  const holder = createMockRes();
  setCustomerSessionCookie(holder, user);
  return String(holder.headers['Set-Cookie']).split(';')[0];
}

describe('regressões de autorização nas queries PostgREST', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    requests = [];
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = 'anon-key-de-teste';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-de-teste';
    process.env.CUSTOMER_SESSION_SECRET = 'segredo-de-sessao-fixo-para-teste';
    resetModuleRegistry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    resetModuleRegistry();
  });

  it('customer-orders escopa a leitura pelo uid da sessão, nunca pelo e-mail', async () => {
    installIdentity(null);
    stubFetch(({ url }) => (url.includes('orders?') ? [ORDER_ROW] : []));

    const cookie = sessionCookie({ uid: SESSION_UID, email: SESSION_EMAIL, name: 'Ana', role: 'customer' });
    const handler = loadHandler('../customer-orders.js');
    const res = createMockRes();

    await handler({ method: 'GET', headers: { cookie }, query: {} }, res);

    expect(res.statusCode).toBe(200);

    // A âncora é a chave forte do Supabase Auth, não um atributo autodeclarado.
    const ordersUrl = urlFor('orders?');
    expect(ordersUrl).toBeDefined();
    expect(decodeURIComponent(ordersUrl)).toContain(`customer_id=eq.${SESSION_UID}`);
    expect(ordersUrl).not.toContain('customer_email');

    // Itens e tokens saem por id de pedido, restritos ao que o filtro acima
    // retornou — nunca por e-mail.
    for (const fragment of ['order_items?', 'download_tokens?']) {
      const url = urlFor(fragment);
      expect(url, `${fragment} deveria ter sido consultado`).toBeDefined();
      expect(decodeURIComponent(url)).toContain(`order_id=in.(${ORDER_INTERNAL_ID})`);
      expect(url).not.toContain('customer_email');
    }

    // Regressão do curinga: `ilike` não pode reaparecer em NENHUMA query…
    for (const url of allUrls()) {
      expect(url).not.toContain('ilike');
    }
    // …e, com o e-mail fora do caminho de autorização, ele não deve sequer
    // aparecer na leitura (sem cliente admin, não há adoção de órfãos).
    expect(allUrls().join('\n')).not.toContain(SESSION_EMAIL);
  });

  it('customer-orders exige sessão de cliente', async () => {
    installIdentity(null);
    stubFetch();

    const handler = loadHandler('../customer-orders.js');
    const res = createMockRes();

    await handler({ method: 'GET', headers: {}, query: {} }, res);

    expect(res.statusCode).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('customer-orders recusa sessão ASSINADA mas sem uid (cookie do modelo antigo)', async () => {
    installIdentity(null);
    stubFetch(() => [ORDER_ROW]);

    // Cookie legítimo, emitido pelo nosso próprio HMAC, carregando só o
    // e-mail — a forma que a sessão tinha quando o escopo era por e-mail.
    // Depois do P1-1 ele não é mais uma credencial de leitura: sem uid não há
    // âncora, e o handler tem de fechar em vez de cair para o e-mail.
    const cookie = sessionCookie({ email: SESSION_EMAIL, name: 'Ana', role: 'customer' });
    const handler = loadHandler('../customer-orders.js');
    const res = createMockRes();

    await handler({ method: 'GET', headers: { cookie }, query: {} }, res);

    expect(res.statusCode).toBe(401);
    // Fecha ANTES de qualquer consulta: nada é lido com escopo indefinido.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('a adoção de pedidos de convidado só alcança pedidos ÓRFÃOS (customer_id is.null)', async () => {
    installIdentity({ email: SESSION_EMAIL });
    stubFetch(({ url, method }) => {
      if (url.includes('orders?') && method === 'PATCH') return [{ id: ORDER_INTERNAL_ID }];
      if (url.includes('orders?')) return [ORDER_ROW];
      return [];
    });

    const cookie = sessionCookie({ uid: SESSION_UID, email: SESSION_EMAIL, name: 'Ana', role: 'customer' });
    const handler = loadHandler('../customer-orders.js');
    const res = createMockRes();

    await handler({ method: 'GET', headers: { cookie }, query: {} }, res);

    expect(res.statusCode).toBe(200);

    const patchUrl = urlFor('orders?', 'PATCH');
    expect(patchUrl, 'a adoção de órfãos deveria ter sido tentada').toBeDefined();

    const decoded = decodeURIComponent(patchUrl);
    // O e-mail aqui NÃO autoriza leitura: ele só casa órfão com dono, e vem de
    // auth.users (uid → e-mail), não do cookie cru.
    expect(decoded).toContain(`customer_email=eq.${SESSION_EMAIL}`);
    // Este é o predicado de segurança: sem ele, o PATCH reivindicaria pedidos
    // JÁ VINCULADOS a outro uid — roubo de pedido de cliente recorrente.
    expect(decoded).toContain('customer_id=is.null');
    expect(patchUrl).not.toContain('ilike');

    // Adotou ⇒ relê, e a releitura continua escopada pelo uid.
    const leiturasDeOrders = requests.filter((entry) => entry.url.includes('orders?') && entry.method === 'GET');
    expect(leiturasDeOrders).toHaveLength(2);
    for (const entry of leiturasDeOrders) {
      expect(decodeURIComponent(entry.url)).toContain(`customer_id=eq.${SESSION_UID}`);
    }
  });

  it('products (endpoint público) não projeta download_url', async () => {
    stubFetch();

    const handler = loadHandler('../products.js');
    const res = createMockRes();

    await handler({ method: 'GET', headers: {}, query: {} }, res);

    expect(res.statusCode).toBe(200);

    const productsUrl = urlFor('products?');
    expect(productsUrl).toBeDefined();
    expect(decodeURIComponent(productsUrl)).not.toContain('download_url');
    expect(JSON.stringify(res.body)).not.toContain('download_url');
  });
});
