// ════════════════════════════════════════════════════════════════════
// Harness dos testes do CAMINHO DO DINHEIRO (handlers/webhook.js,
// handlers/verify-payment.js, handlers/download.js).
//
// Não é um arquivo de teste — o `include` padrão do Vitest só coleta
// `*.test.js`, então este módulo é apenas importado pelos três.
//
// ── POR QUE NÃO É `vi.mock` ──────────────────────────────────────────
// Os handlers de `api/` e as libs de `lib/` são CommonJS e se resolvem por
// `require`. Dentro do Vitest, um `await import('../webhook.js')` de um
// módulo CJS é delegado ao carregador nativo do Node, e TODO o grafo
// (`handlers/webhook.js` → `lib/supabase.js` → …) é carregado por fora do module
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
// É a técnica de `handlers/__tests__/query-authz-regression.test.js`, e continua
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
import { expect, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Módulos injetados nesta rodada, para o afterEach devolver os reais. */
const installedMocks = new Set();

/**
 * Descarta do cache do Node todo módulo do PRÓPRIO projeto (node_modules
 * fica intacto — recarregar o SDK do MP a cada teste seria caro e inútil).
 *
 * Precisa rodar ANTES de instalar os mocks: `handlers/webhook.js` captura suas
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

/**
 * Afirma o ENVELOPE DE ERRO da regra A1 — `{ success:false, error:{code,message} }`.
 *
 * Existe para que a forma do envelope seja afirmada num lugar só. Antes, cada
 * suíte escrevia `expect(res.body).toEqual({ error: 'texto' })`, o que fixava
 * DUAS coisas ao mesmo tempo: a forma da resposta e a redação da mensagem.
 * Resultado: reescrever uma frase em português quebrava testes de segurança que
 * nada tinham a ver com a frase, e a forma do envelope nunca era conferida de
 * propósito — ela só era conferida por acidente.
 *
 * Aqui as duas coisas ficam separadas: `code` é o contrato (afirmado sempre),
 * `message` é opcional e aceita RegExp para quando só o assunto importa.
 *
 * @param {object} res              duplo de createMockRes()
 * @param {object} expected
 * @param {number} expected.status
 * @param {string} expected.code
 * @param {string|RegExp} [expected.message]
 */
export function expectApiError(res, { status, code, message } = {}) {
  expect(res.statusCode).toBe(status);
  expect(res.body?.success).toBe(false);
  expect(res.body?.error?.code).toBe(code);

  if (message instanceof RegExp) {
    expect(res.body?.error?.message).toMatch(message);
  } else if (typeof message === 'string') {
    expect(res.body?.error?.message).toBe(message);
  }
}

export function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    redirectedTo: undefined,
    setHeader: vi.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload) => {
      res.body = payload;
      return res;
    }),
    end: vi.fn(() => res),
    redirect: vi.fn((url) => {
      res.redirectedTo = url;
      return res;
    }),
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
      return value
        .replace(/^\(|\)$/g, '')
        .split(',')
        .includes(String(actual));
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
    orders: [],
    order_items: [],
    download_tokens: [],
    products: [],
    download_logs: [],
    // Tabelas extras declaradas pelo teste (ex.: `coupons` no checkout).
    //
    // A lista era FIXA, e o efeito colateral foi caro: um handler que tocasse
    // qualquer outra tabela estourava "tabela desconhecida" dentro do try/catch
    // do handler, virava um 500 genérico, e um teste que tolerasse "pedido não
    // gravado" passava sem exercitar nada. Foi exatamente o que aconteceu em
    // handlers/__tests__/checkout-money.test.js antes do assert duro.
    ...Object.fromEntries(
      Object.entries(initial).map(([name, rows]) => [
        name,
        (Array.isArray(rows) ? rows : []).map((row) => ({ ...row })),
      ]),
    ),
  };

  function table(name) {
    if (!state[name]) throw new Error(`fake supabase: tabela desconhecida "${name}"`);
    return state[name];
  }

  const listTableRows = vi.fn(async (name, options = {}) =>
    table(name)
      .filter((row) => matchListFilters(row, options.filters))
      .map((row) => ({ ...row })),
  );

  const getTableRow = vi.fn(async (name, options = {}) => {
    const rows = await listTableRows(name, options);
    return rows[0] || null;
  });

  const insertIntoTable = vi.fn(async (name, rows) => {
    const incoming = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row }));

    if (name === 'download_tokens') {
      const collides = incoming.some((row) =>
        table(name).some(
          (existing) =>
            String(existing.order_id) === String(row.order_id) &&
            String(existing.product_id) === String(row.product_id),
        ),
      );
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

  /**
   * `upsert` com a semântica REAL do PostgREST, incluindo a diferença entre
   * `merge-duplicates` e `ignore-duplicates` (§2.3.a).
   *
   * A distinção não é cosmética em `download_tokens`: com `merge`, um segundo
   * verify-payment reescreveria o `token` de um link já enviado por e-mail E
   * devolveria `used: false` para um token já consumido, reabrindo o produto
   * pago. É por isso que o harness modela os dois — um stub que sempre insere
   * deixaria essa regressão passar sem barulho.
   */
  const upsertIntoTable = vi.fn(async (name, rows, onConflict, options = {}) => {
    const resolution = options.resolution || 'merge-duplicates';
    const chaves = String(onConflict || '')
      .split(',')
      .map((coluna) => coluna.trim())
      .filter(Boolean);
    const incoming = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row }));
    const persistidas = [];

    for (const row of incoming) {
      const existente = chaves.length
        ? table(name).find((linha) =>
            chaves.every((coluna) => String(linha[coluna]) === String(row[coluna])),
          )
        : undefined;

      if (!existente) {
        table(name).push(row);
        persistidas.push({ ...row });
        continue;
      }

      if (resolution === 'merge-duplicates') {
        Object.assign(existente, row);
      }
      persistidas.push({ ...existente });
    }

    return persistidas;
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
    serviceRoleHelpers: {
      getTableRow,
      listTableRows,
      insertIntoTable,
      updateTable,
      upsertIntoTable,
    },
    spies: { getTableRow, listTableRows, insertIntoTable, updateTable, upsertIntoTable },
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
    constructor(client) {
      this.client = client;
    }
    get(args) {
      return get(args);
    }
    search(args) {
      return search(args);
    }
  }

  installModuleMock('mercadopago', {
    MercadoPagoConfig: class FakeConfig {
      constructor(options) {
        this.options = options;
      }
    },
    Payment: FakePayment,
    Preference: class FakePreference {},
  });

  return { get, search };
}

/**
 * Rate limit sempre liberado: o gate tem testes próprios em lib/__tests__.
 *
 * PARCIAL, e não um módulo inventado: o `RATE_LIMITS` real continua valendo.
 * A versão anterior devolvia um objeto com um único preset escrito à mão
 * (`verifyPayment`), então um handler que lesse qualquer outro recebia
 * `undefined` — o mock passava mesmo assim, porque o duplo ignora os
 * argumentos. Resultado: um preset com nome errado passava despercebido no
 * teste e só falharia em produção, onde `enforceRateLimit(req, res, undefined)`
 * cai no bucket 'default'. Com o módulo real, o preset citado pelo handler
 * precisa existir de verdade.
 */
export function installRateLimitPassthrough() {
  const enforceRateLimit = vi.fn(async () => ({ blocked: false, failOpen: false }));
  installPartialMock('../../lib/rate-limit', { enforceRateLimit });
  return enforceRateLimit;
}
