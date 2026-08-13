// ════════════════════════════════════════════════════════════════════
// Harness dos testes do CAMINHO DO DINHEIRO (api/webhook.js,
// api/verify-payment.js, api/download.js).
//
// Não é um arquivo de teste — o `include` padrão do Vitest só coleta
// `*.test.js`, então este módulo é apenas importado pelos três.
//
// ── POR QUE NÃO É `vi.mock` ──────────────────────────────────────────
// Os handlers de `api/` e as libs de `lib/` são CommonJS e se resolvem por
// `require`. Dentro do Vitest, um `await import('../webhook.js')` de um
// módulo CJS é delegado ao carregador nativo do Node, e TODO o grafo
// (`api/webhook.js` → `lib/supabase.js` → …) é carregado por fora do module
// runner do Vitest. Consequência medida neste repo: `vi.mock('../../lib/supabase')`
// é silenciosamente ignorado — o handler continua falando com o módulo real.
// (A nota em `lib/__tests__/rate-limit.test.js:5-11` registra o mesmo achado.)
//
// Um mock silenciosamente ignorado é PIOR que mock nenhum: o teste vira
// verde/vermelho por motivo diferente do declarado. Por isso a interceptação
// acontece na única camada que o Node de fato consulta — o `require.cache`.
// É semântica documentada do CommonJS, não monkey-patch de runtime, e não
// exige dependência nova nem mudar o código de produção só para testá-lo.
//
// ── POR QUE NÃO STUBAR SÓ O `fetch` GLOBAL ───────────────────────────
// É a técnica de `api/__tests__/query-authz-regression.test.js`, e continua
// certa lá: aquele arquivo afirma sobre a URL REAL enviada ao PostgREST, que
// é justamente o controle sob teste. Aqui ela não serve por dois motivos:
//   1. o SDK do Mercado Pago usa `node-fetch` (`node_modules/mercadopago/
//      dist/utils/restClient/index.js:32`), não o `fetch` global — stubar o
//      global deixaria `getPaymentInfo` batendo na rede de verdade;
//   2. estes testes precisam afirmar sobre EFEITO (o pedido foi aprovado? o
//      token foi emitido? o e-mail disparou?), não sobre a forma da query.
//      Um fake de tabela expressa isso direto; emular respostas HTTP do
//      PostgREST só acrescentaria uma camada de tradução para errar.
// ════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Módulos injetados nesta rodada, para o afterEach devolver os reais. */
const installedMocks = new Set();

/**
 * Descarta do cache do Node todo módulo do PRÓPRIO projeto (node_modules
 * fica intacto — recarregar o SDK do MP a cada teste seria caro e inútil).
 *
 * Precisa rodar ANTES de instalar os mocks: `api/webhook.js` captura suas
 * dependências no topo do arquivo, então só um require novo enxerga o que
 * foi injetado. Como efeito colateral desejável, zera também o estado de
 * módulo das libs (ex.: o `mpClient` memoizado em lib/mercadopago-config.js),
 * dando isolamento real entre testes.
 */
export function resetModuleRegistry() {
  for (const filename of Object.keys(requireCjs.cache)) {
    if (filename.startsWith(PROJECT_ROOT) && !filename.includes('node_modules')) {
      delete requireCjs.cache[filename];
    }
  }
  for (const filename of installedMocks) {
    delete requireCjs.cache[filename];
  }
  installedMocks.clear();
}

/** Substitui um módulo inteiro. `request` é relativo A ESTE arquivo. */
export function installModuleMock(request, exports) {
  const filename = requireCjs.resolve(request);
  installedMocks.add(filename);
  requireCjs.cache[filename] = {
    id: filename,
    filename,
    path: path.dirname(filename),
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
  return filename;
}

/**
 * Mantém o módulo REAL e troca só os membros indicados. Usado quando parte do
 * módulo é a lógica sob teste e parte é I/O — ex.: em lib/storage-signed-url.js
 * `parseStorageRef` é função pura (queremos a de verdade) e
 * `createSignedDownloadUrl` fala com o Storage (precisa ser stub).
 */
export function installPartialMock(request, overrides) {
  const real = requireCjs(request);
  return installModuleMock(request, { ...real, ...overrides });
}

/** Carrega o handler CommonJS já enxergando os mocks instalados. */
export function loadHandler(request) {
  return requireCjs(request);
}

// ─── Duplos de resposta/requisição ───────────────────────────────────

export function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    redirectedTo: undefined,
    setHeader: vi.fn((key, value) => { res.headers[key] = value; }),
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((payload) => { res.body = payload; return res; }),
    end: vi.fn(() => res),
    redirect: vi.fn((url) => { res.redirectedTo = url; return res; }),
  };
  return res;
}

/**
 * Assinatura HMAC no formato do Mercado Pago.
 *
 * `tsSeconds` é parâmetro porque a janela de frescor (P1-5) só pode ser
 * testada escolhendo o instante assinado: uma notificação REPLAYADA é
 * exatamente isto — assinatura criptograficamente válida com `ts` antigo.
 */
export function buildSignedWebhookHeaders({
  paymentId,
  requestId = 'req-teste',
  secret,
  tsSeconds = Math.floor(Date.now() / 1000),
}) {
  const ts = String(tsSeconds);
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${hash}`, 'x-request-id': requestId };
}

// ─── Fake de tabelas do Supabase ─────────────────────────────────────
// Implementa os operadores do PostgREST que o código realmente usa. Um
// operador não previsto LANÇA em vez de ser ignorado: se um handler passar a
// filtrar de outro jeito, o teste quebra alto em vez de continuar verde
// afirmando sobre um filtro que o fake silenciosamente descartou.

function matchOperator(row, column, operator, rawValue) {
  const value = String(rawValue);
  const actual = row[column];

  switch (operator) {
    case 'eq':
      return String(actual) === value;
    case 'neq':
      return String(actual) !== value;
    case 'is':
      if (value === 'null') return actual === null || actual === undefined;
      if (value === 'false') return actual === false;
      if (value === 'true') return actual === true;
      throw new Error(`fake supabase: valor não suportado em is.${value}`);
    case 'in':
      return value.replace(/^\(|\)$/g, '').split(',').includes(String(actual));
    default:
      throw new Error(`fake supabase: operador não suportado "${operator}"`);
  }
}

/** Filtros de listTableRows/getTableRow: [{ column, operator, value }]. */
function matchListFilters(row, filters = []) {
  return filters.every((filter) => {
    if (!filter?.column || filter.value === undefined || filter.value === null) return true;
    return matchOperator(row, filter.column, String(filter.operator || 'eq'), filter.value);
  });
}

/** Filtros de updateTable: objeto plano { coluna: 'op.valor' }. */
function matchUpdateFilters(row, filters = {}) {
  return Object.entries(filters).every(([column, spec]) => {
    const raw = String(spec);
    const separator = raw.indexOf('.');
    if (separator < 0) throw new Error(`fake supabase: filtro sem operador "${column}=${raw}"`);
    return matchOperator(row, column, raw.slice(0, separator), raw.slice(separator + 1));
  });
}

/**
 * Banco em memória com as poucas tabelas do caminho do dinheiro.
 *
 * Reproduz três comportamentos do Postgres que SÃO o controle sob teste:
 *  • UPDATE condicional devolve as linhas AFETADAS (`Prefer: return=representation`),
 *    então 0 linhas ⇒ "outro processo venceu a corrida" — é assim que
 *    webhook.js decide `isFirstApproval` e download.js decide o uso único;
 *  • `download_tokens` tem UNIQUE(order_id, product_id) (migration
 *    phase5_payment_hardening) e viola com 23505/409;
 *  • o filtro é aplicado de verdade, então um handler que "esquecer" o
 *    `neq.approved` passa a sobrescrever o pedido e o teste acusa.
 */
export function createSupabaseStore(initial = {}) {
  const state = {
    orders: (initial.orders || []).map((row) => ({ ...row })),
    order_items: (initial.order_items || []).map((row) => ({ ...row })),
    download_tokens: (initial.download_tokens || []).map((row) => ({ ...row })),
    products: (initial.products || []).map((row) => ({ ...row })),
    download_logs: [],
  };

  function table(name) {
    if (!state[name]) throw new Error(`fake supabase: tabela desconhecida "${name}"`);
    return state[name];
  }

  const listTableRows = vi.fn(async (name, options = {}) => (
    table(name).filter((row) => matchListFilters(row, options.filters)).map((row) => ({ ...row }))
  ));

  const getTableRow = vi.fn(async (name, options = {}) => {
    const rows = await listTableRows(name, options);
    return rows[0] || null;
  });

  const insertIntoTable = vi.fn(async (name, rows) => {
    const incoming = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row }));

    if (name === 'download_tokens') {
      const collides = incoming.some((row) => table(name).some(
        (existing) => String(existing.order_id) === String(row.order_id)
          && String(existing.product_id) === String(row.product_id),
      ));
      if (collides) {
        // Mesma forma do erro que lib/supabase.js constrói a partir do 409 do
        // PostgREST — é nela que webhook.js/verify-payment.js decidem tratar a
        // colisão como "corrida vencida por outro processo".
        const error = new Error('duplicate key value violates unique constraint');
        error.statusCode = 409;
        error.details = { code: '23505' };
        throw error;
      }
    }

    table(name).push(...incoming);
    return incoming;
  });

  const updateTable = vi.fn(async (name, filters, payload) => {
    const affected = table(name).filter((row) => matchUpdateFilters(row, filters));
    for (const row of affected) Object.assign(row, payload);
    return affected.map((row) => ({ ...row }));
  });

  return {
    state,
    // Formato de `serviceRoleHelpers` — é o namespace que os handlers do
    // caminho do dinheiro importam (bypassa RLS por desenho).
    serviceRoleHelpers: { getTableRow, listTableRows, insertIntoTable, updateTable },
    spies: { getTableRow, listTableRows, insertIntoTable, updateTable },
    /** Linhas de uma tabela, cópia — para afirmar sobre o estado final. */
    rows: (name) => table(name).map((row) => ({ ...row })),
    /** Chamadas de um spy restritas a uma tabela. */
    callsFor(spy, name) {
      return spy.mock.calls.filter((args) => args[0] === name);
    },
  };
}

/** Mock de lib/supabase.js apoiado num store — configurado, nunca vazio. */
export function installSupabaseMock(store) {
  return installModuleMock('../../lib/supabase', {
    getSupabaseConfig: () => ({
      url: 'https://projeto-teste.supabase.co',
      anonKey: 'anon-de-teste',
      serviceRoleKey: 'service-role-de-teste',
      storageBucket: '',
    }),
    serviceRoleHelpers: store.serviceRoleHelpers,
    ...store.serviceRoleHelpers,
  });
}

/** Mock de lib/security-logger.js; devolve os spies para asserção. */
export function installSecurityLoggerMock() {
  const recordSecurityEvent = vi.fn(async () => {});
  const extractClientIp = vi.fn(() => '203.0.113.7');
  installModuleMock('../../lib/security-logger', { recordSecurityEvent, extractClientIp });
  return { recordSecurityEvent, extractClientIp };
}

/**
 * Duplo do pacote `mercadopago`.
 *
 * Injetado no lugar do SDK real para que lib/mercadopago-config.js continue
 * sendo o módulo VERDADEIRO nos testes de webhook — é lá que moram o HMAC e a
 * janela de frescor (P1-5), que são controles sob teste e não podem ser
 * substituídos por um `() => true`.
 */
export function installMercadoPagoSdkMock({ payment = null, searchResults = [] } = {}) {
  const get = vi.fn(async () => payment);
  const search = vi.fn(async () => ({ results: searchResults }));

  class FakePayment {
    constructor(client) { this.client = client; }
    get(args) { return get(args); }
    search(args) { return search(args); }
  }

  installModuleMock('mercadopago', {
    MercadoPagoConfig: class FakeConfig { constructor(options) { this.options = options; } },
    Payment: FakePayment,
    Preference: class FakePreference {},
  });

  return { get, search };
}

/** Rate limit sempre liberado: o gate tem testes próprios em lib/__tests__. */
export function installRateLimitPassthrough() {
  const enforceRateLimit = vi.fn(async () => ({ blocked: false, failOpen: false }));
  installModuleMock('../../lib/rate-limit', {
    enforceRateLimit,
    RATE_LIMITS: { verifyPayment: { bucket: 'verify-payment', limit: 60, windowSeconds: 60 } },
    resolveIdentifier: () => 'ip-de-teste',
  });
  return enforceRateLimit;
}
