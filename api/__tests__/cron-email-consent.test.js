import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  installModuleMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// BASE DE ENVIO do cron de e-mails (api/cron-email-jobs.js).
//
// Este arquivo trava as DUAS pontas de um par de defeitos que se corrigem
// mutuamente — e é por isso que os casos ficam juntos, no mesmo arquivo:
//
//  • Ponta 1 (achado M1): /api/abandoned-cart é escrita PÚBLICA e sem prova de
//    posse do endereço. Sem portão, POSTar o e-mail de um terceiro fazia a loja
//    mandar marketing para ele — relay, furo no double opt-in.
//  • Ponta 2 (regressão da correção do M1): o portão de consentimento foi
//    aplicado a TODO envio do cron, inclusive à sequência pós-compra. Como
//    ninguém inscreve o comprador em `email_subscribers` no momento da compra,
//    D+3/D+15/D+45 e a reativação pararam de sair para o cliente típico.
//
// Consertar uma ponta reabrindo a outra é o modo de falha que interessa
// prevenir, então cada teste de "sai" tem um par de "não sai".
//
// Os handlers de api/ são CommonJS: a interceptação é pelo require.cache, via
// harness (ver o cabeçalho de money-path-harness.js para o porquê de não ser
// vi.mock).
// ════════════════════════════════════════════════════════════════════

const CRON_SECRET = 'segredo-de-teste-do-cron';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Instante dentro da janela D+N do job pós-compra ([N dias+25h, N dias)). */
function daysAgo(n, extraHours = 2) {
  return new Date(Date.now() - n * DAY_MS - extraHours * HOUR_MS).toISOString();
}

// ─── Fake mínimo do PostgREST ────────────────────────────────────────
// Só os operadores que o handler emite. Operador não previsto LANÇA: se o
// código passar a filtrar de outro jeito, o teste acusa alto em vez de casar
// tudo silenciosamente e afirmar sobre um filtro que não existe mais.
function matchOperator(row, column, operator, rawValue) {
  const actual = row[column];
  const value = String(rawValue);
  switch (operator) {
    case 'eq': return String(actual) === value;
    case 'gte': return String(actual) >= value;
    case 'lt': return String(actual) < value;
    case 'in': return value.replace(/^\(|\)$/g, '').split(',').includes(String(actual));
    default: throw new Error(`fake supabase: operador não suportado "${operator}"`);
  }
}

function matchFilters(row, filters = []) {
  return filters.every((filter) => {
    if (!filter?.column || filter.value === undefined || filter.value === null) return true;
    return matchOperator(row, filter.column, String(filter.operator || 'eq'), filter.value);
  });
}

function matchUpdateFilters(row, filters = {}) {
  return Object.entries(filters).every(([column, spec]) => {
    const raw = String(spec);
    const dot = raw.indexOf('.');
    if (dot < 0) throw new Error(`fake supabase: filtro sem operador "${column}=${raw}"`);
    return matchOperator(row, column, raw.slice(0, dot), raw.slice(dot + 1));
  });
}

/**
 * @param {object} initial linhas por tabela
 * @param {string[]} failReads tabelas cuja LEITURA lança — para exercitar o
 *   fail-closed (Supabase instável não pode virar licença de envio).
 */
function createStore(initial = {}, failReads = []) {
  const state = {
    email_subscribers: [],
    orders: [],
    order_items: [],
    abandoned_carts: [],
    products: [],
    categories: [],
  };
  for (const [name, rows] of Object.entries(initial)) {
    state[name] = rows.map((row) => ({ ...row }));
  }

  function table(name) {
    if (!state[name]) throw new Error(`fake supabase: tabela desconhecida "${name}"`);
    return state[name];
  }

  const listTableRows = vi.fn(async (name, options = {}) => {
    if (failReads.includes(name)) throw new Error(`falha simulada de leitura em ${name}`);
    return table(name).filter((row) => matchFilters(row, options.filters)).map((row) => ({ ...row }));
  });

  const getTableRow = vi.fn(async (name, options = {}) => {
    const rows = await listTableRows(name, options);
    return rows[0] || null;
  });

  const insertIntoTable = vi.fn(async (name, rows) => {
    const incoming = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ id: `${name}-${table(name).length + 1}`, ...row }));
    if (name === 'email_subscribers') {
      // Índice único em lower(email) (migration phase3).
      const collides = incoming.some((row) => table(name).some(
        (existing) => String(existing.email).toLowerCase() === String(row.email).toLowerCase(),
      ));
      if (collides) {
        const error = new Error('duplicate key value violates unique constraint');
        error.statusCode = 409;
        throw error;
      }
    }
    table(name).push(...incoming);
    return incoming.map((row) => ({ ...row }));
  });

  const updateTable = vi.fn(async (name, filters, payload) => {
    const affected = table(name).filter((row) => matchUpdateFilters(row, filters));
    for (const row of affected) Object.assign(row, payload);
    return affected.map((row) => ({ ...row }));
  });

  return {
    state,
    helpers: {
      getTableRow, listTableRows, insertIntoTable, updateTable,
    },
    rows: (name) => table(name).map((row) => ({ ...row })),
  };
}

let sendEmail;

/** Monta os mocks, roda o cron autenticado e devolve relatório + envios. */
async function runCron(initial = {}, failReads = []) {
  const store = createStore(initial, failReads);

  installModuleMock('../../lib/supabase', {
    getSupabaseConfig: () => ({ url: 'https://projeto-teste.supabase.co', anonKey: 'anon', serviceRoleKey: 'service' }),
    serviceRoleHelpers: store.helpers,
    ...store.helpers,
  });

  sendEmail = vi.fn(async () => ({ sent: true }));
  installModuleMock('../../lib/email-sender', { sendEmail });

  // Templates são só formatação; o que está sob teste é QUEM recebe.
  const template = (label) => vi.fn(() => ({ subject: label, html: `<p>${label}</p>` }));
  installModuleMock('../../lib/email-templates', {
    abandonedCart: template('carrinho'),
    postPurchaseD3: template('d3'),
    postPurchaseD15: template('d15'),
    postPurchaseD45: template('d45'),
    reactivation90: template('reativacao'),
  });

  const handler = loadHandler('../cron-email-jobs.js');
  const res = createMockRes();
  await handler({ method: 'POST', headers: { 'x-cron-secret': CRON_SECRET }, query: {}, body: {} }, res);

  return { res, store, report: res.body, recipients: sendEmail.mock.calls.map(([args]) => args) };
}

function sentTo(recipients, kind) {
  return recipients.filter((call) => call.kind === kind).map((call) => call.to);
}

beforeEach(() => {
  resetModuleRegistry();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetModuleRegistry();
  vi.restoreAllMocks();
});

// ─── Pós-compra: base é o CONTRATO, não o opt-in de newsletter ───────
describe('sequência pós-compra (base contratual)', () => {
  const buyerOrder = {
    id: 'ord-1',
    order_code: 'AE-1',
    customer_name: 'Marcia',
    customer_email: 'compradora@exemplo.com',
    total_amount: 50,
    payment_status: 'approved',
    completed_at: daysAgo(3),
  };

  it('envia D+3 para quem comprou e NUNCA se inscreveu na newsletter', async () => {
    // A regressão: sem registro em `email_subscribers`, o portão de
    // consentimento matava a sequência inteira do comprador típico.
    const { report, recipients } = await runCron({ orders: [buyerOrder] });

    expect(report.success).toBe(true);
    expect(sentTo(recipients, 'post_purchase_d3')).toEqual(['compradora@exemplo.com']);
    expect(report.postPurchase.d3.sent).toBe(1);
  });

  it('cria o registro de contato com confirmed=false e manda token de descadastro real', async () => {
    // O e-mail precisa ter saída funcional (regra D2) e o cliente precisa ter
    // ONDE registrar oposição — mas isso não pode virar inscrição na
    // newsletter: `confirmed` continua false, então este contato nunca passa
    // pelo portão de consentimento.
    const { store, recipients } = await runCron({ orders: [buyerOrder] });

    const [contato] = store.rows('email_subscribers');
    expect(contato.email).toBe('compradora@exemplo.com');
    expect(contato.confirmed).toBe(false);
    expect(contato.source).toBe('post_purchase');
    expect(contato.unsubscribe_token).toBeTruthy();

    const [envio] = recipients.filter((call) => call.kind === 'post_purchase_d3');
    expect(envio.unsubscribeToken).toBe(contato.unsubscribe_token);
  });

  it('reusa o token do assinante existente em vez de criar linha duplicada', async () => {
    const { store, recipients } = await runCron({
      orders: [buyerOrder],
      email_subscribers: [{
        id: 'sub-1',
        email: 'compradora@exemplo.com',
        confirmed: true,
        unsubscribed_at: null,
        unsubscribe_token: 'token-existente',
      }],
    });

    expect(store.rows('email_subscribers')).toHaveLength(1);
    expect(recipients.filter((c) => c.kind === 'post_purchase_d3')[0].unsubscribeToken).toBe('token-existente');
  });

  it('NÃO envia para quem pediu para sair, mesmo tendo comprado', async () => {
    // Oposição do titular é bloqueio absoluto: vale contra a base contratual
    // exatamente como vale contra o consentimento.
    const { report, recipients } = await runCron({
      orders: [buyerOrder],
      email_subscribers: [{
        id: 'sub-1',
        email: 'compradora@exemplo.com',
        confirmed: true,
        unsubscribed_at: new Date().toISOString(),
        unsubscribe_token: 'token-existente',
      }],
    });

    expect(sentTo(recipients, 'post_purchase_d3')).toEqual([]);
    expect(report.postPurchase.d3.blocked).toEqual({ unsubscribed: 1 });
  });

  it('fail-closed: leitura de email_subscribers falhando não vira licença de envio', async () => {
    const { report, recipients } = await runCron({ orders: [buyerOrder] }, ['email_subscribers']);

    expect(recipients).toHaveLength(0);
    expect(report.postPurchase.d3.blocked).toEqual({ lookup_failed: 1 });
  });
});

// ─── Carrinho abandonado: o vetor do abuso (achado M1) ───────────────
describe('carrinho abandonado (opt-in OU pedido aprovado)', () => {
  const cart = (email) => ({
    id: `cart-${email}`,
    email,
    items: [{ productId: 'p1', name: 'Apostila', price: 30, quantity: 1 }],
    total_amount: 30,
    recovered_at: null,
    reminder_sent_at: null,
    created_at: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    updated_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  });

  it('NÃO envia para e-mail injetado por terceiro (sem opt-in e sem pedido)', async () => {
    // O relay do M1: qualquer um POSTa { email, items } em /api/abandoned-cart.
    const { report, recipients } = await runCron({ abandoned_carts: [cart('vitima@terceiro.com')] });

    expect(recipients).toHaveLength(0);
    expect(report.abandoned.firstReminder).toBe(0);
    expect(report.abandoned.blocked).toEqual({ not_subscribed: 1 });
  });

  it('NÃO envia para inscrito que ainda não confirmou o double opt-in', async () => {
    const { report, recipients } = await runCron({
      abandoned_carts: [cart('pendente@exemplo.com')],
      email_subscribers: [{
        id: 'sub-1', email: 'pendente@exemplo.com', confirmed: false, unsubscribed_at: null, unsubscribe_token: 't1',
      }],
    });

    expect(recipients).toHaveLength(0);
    expect(report.abandoned.blocked).toEqual({ not_confirmed: 1 });
  });

  it('envia para quem tem opt-in confirmado', async () => {
    const { report, recipients } = await runCron({
      abandoned_carts: [cart('optin@exemplo.com')],
      email_subscribers: [{
        id: 'sub-1', email: 'optin@exemplo.com', confirmed: true, unsubscribed_at: null, unsubscribe_token: 't1',
      }],
    });

    expect(sentTo(recipients, 'abandoned_cart_1h')).toEqual(['optin@exemplo.com']);
    expect(report.abandoned.firstReminder).toBe(1);
  });

  it('envia para cliente com pedido aprovado mesmo sem opt-in', async () => {
    // Prova de que o endereço é de um cliente real, e não de uma vítima cujo
    // e-mail o atacante digitou no formulário público.
    const { recipients } = await runCron({
      abandoned_carts: [cart('cliente@exemplo.com')],
      orders: [{
        id: 'ord-9',
        customer_email: 'cliente@exemplo.com',
        customer_name: 'Cliente',
        payment_status: 'approved',
        completed_at: daysAgo(200),
      }],
    });

    expect(sentTo(recipients, 'abandoned_cart_1h')).toEqual(['cliente@exemplo.com']);
  });

  it('pedido NÃO aprovado não serve de prova', async () => {
    const { report, recipients } = await runCron({
      abandoned_carts: [cart('pendente-pgto@exemplo.com')],
      orders: [{
        id: 'ord-9',
        customer_email: 'pendente-pgto@exemplo.com',
        payment_status: 'pending',
        completed_at: daysAgo(200),
      }],
    });

    expect(recipients).toHaveLength(0);
    expect(report.abandoned.blocked).toEqual({ not_subscribed: 1 });
  });

  it('descadastrado não recebe nem tendo pedido aprovado', async () => {
    const { report, recipients } = await runCron({
      abandoned_carts: [cart('saiu@exemplo.com')],
      orders: [{
        id: 'ord-9',
        customer_email: 'saiu@exemplo.com',
        payment_status: 'approved',
        completed_at: daysAgo(200),
      }],
      email_subscribers: [{
        id: 'sub-1',
        email: 'saiu@exemplo.com',
        confirmed: true,
        unsubscribed_at: new Date().toISOString(),
        unsubscribe_token: 't1',
      }],
    });

    expect(recipients).toHaveLength(0);
    expect(report.abandoned.blocked).toEqual({ unsubscribed: 1 });
  });
});

// ─── Reativação 90d: só alcança quem COMPROU ─────────────────────────
describe('reativação 90 dias', () => {
  it('envia para comprador inativo sem opt-in de newsletter', async () => {
    const { report, recipients } = await runCron({
      orders: [{
        id: 'ord-antigo',
        customer_email: 'sumiu@exemplo.com',
        customer_name: 'Sumida',
        payment_status: 'approved',
        completed_at: daysAgo(120, 0),
      }],
    });

    expect(sentTo(recipients, 'reactivation_90d')).toEqual(['sumiu@exemplo.com']);
    expect(report.reactivation.sent).toBe(1);
  });

  it('não envia para comprador inativo que se descadastrou', async () => {
    const { report, recipients } = await runCron({
      orders: [{
        id: 'ord-antigo',
        customer_email: 'sumiu@exemplo.com',
        customer_name: 'Sumida',
        payment_status: 'approved',
        completed_at: daysAgo(120, 0),
      }],
      email_subscribers: [{
        id: 'sub-1',
        email: 'sumiu@exemplo.com',
        confirmed: true,
        unsubscribed_at: new Date().toISOString(),
        unsubscribe_token: 't1',
      }],
    });

    expect(recipients).toHaveLength(0);
    expect(report.reactivation.blocked).toEqual({ unsubscribed: 1 });
  });
});
