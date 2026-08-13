import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  createSupabaseStore,
  installPartialMock,
  installSecurityLoggerMock,
  installSupabaseMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// USO ÚNICO DO TOKEN DE DOWNLOAD (api/download.js).
//
// O token é a credencial que entrega o produto pago, e viaja em query string
// de um link clicado a partir de e-mails já enviados (exceção deliberada ao
// padrão do projeto, documentada no próprio handler). O que contém o risco
// desse link vazar em log/Referer/histórico é o CLAIM ATÔMICO: o token é
// queimado no primeiro uso por um UPDATE condicional `used=false → true`, e
// só quem a linha afetada pertence prossegue.
//
// Um `if (token.used) return 401` seguido de um UPDATE incondicional passaria
// em qualquer teste de chamada única e ainda assim permitiria download duplo
// sob concorrência — a janela entre o SELECT e o UPDATE. Por isso os testes
// abaixo afirmam sobre o FILTRO do UPDATE e sobre o caso em que ele afeta 0
// linhas, e não apenas sobre o status code.
//
// A ordem das operações também é controle: o claim vem DEPOIS de validar o
// produto (para não queimar o token do comprador por erro de cadastro) e
// ANTES de gerar a signed URL (para não haver janela em que a URL exista sem
// o token estar queimado).
// ════════════════════════════════════════════════════════════════════

const TOKEN = 'a'.repeat(64);
const ORDER_ID = 10;
const PRODUCT_ID = 'p1';
const SIGNED_URL = 'https://projeto-teste.supabase.co/storage/v1/object/sign/product_files/kit.pdf?token=assinatura';

function tokenRow(overrides = {}) {
  return {
    token: TOKEN,
    order_id: ORDER_ID,
    product_id: PRODUCT_ID,
    product_name: 'Kit de Atividades',
    used: false,
    used_at: null,
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    created_at: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function productRow(overrides = {}) {
  return {
    id: PRODUCT_ID,
    name: 'Kit de Atividades',
    download_url: 'product_files/kit.pdf',
    ...overrides,
  };
}

function arrange({ tokens = [tokenRow()], products = [productRow()], signedUrl = SIGNED_URL } = {}) {
  const store = createSupabaseStore({ download_tokens: tokens, products });
  installSupabaseMock(store);
  const security = installSecurityLoggerMock();

  // parseStorageRef entra o REAL: é função pura, é ela que decide se o
  // download_url cadastrado é do Storage (o gate fail-closed), e trocá-la por
  // um stub apagaria justamente o controle. Só a chamada de rede que assina a
  // URL vira duplo.
  const createSignedDownloadUrl = vi.fn(async () => signedUrl);
  installPartialMock('../../lib/storage-signed-url', { createSignedDownloadUrl });

  return { store, security, createSignedDownloadUrl, handler: loadHandler('../download.js') };
}

function downloadRequest(token = TOKEN) {
  return {
    method: 'GET',
    query: { token },
    headers: { 'user-agent': 'Mozilla/5.0 (comprador)' },
    connection: { remoteAddress: '203.0.113.7' },
  };
}

describe('download — uso único do token', () => {
  const originalEnv = {};

  beforeEach(() => {
    for (const key of ['APP_ENV', 'NODE_ENV', 'SUPABASE_STORAGE_BUCKET']) {
      originalEnv[key] = process.env[key];
    }
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    resetModuleRegistry();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetModuleRegistry();
    vi.restoreAllMocks();
  });

  it('entrega pelo Storage assinado, queima o token e registra o download', async () => {
    const { handler, store, createSignedDownloadUrl } = arrange();
    const res = createMockRes();

    await handler(downloadRequest(), res);

    // Redireciona para a URL ASSINADA e temporária, nunca para o download_url cru.
    expect(res.redirect).toHaveBeenCalledTimes(1);
    expect(res.redirectedTo).toBe(SIGNED_URL);
    expect(res.headers['X-Download-Mode']).toBe('signed-storage');
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers['Cache-Control']).toBe('no-store, max-age=0');

    // O claim é um UPDATE CONDICIONAL: sem o `used: 'is.false'` no filtro,
    // dois consumidores simultâneos afetariam a linha os dois e baixariam os dois.
    const [tabela, filtros, payload] = store.spies.updateTable.mock.calls[0];
    expect(tabela).toBe('download_tokens');
    expect(filtros).toEqual({ token: `eq.${TOKEN}`, used: 'is.false' });
    expect(payload.used).toBe(true);
    expect(payload.used_at).toEqual(expect.any(String));

    // …e vem ANTES de gerar a URL: nunca deve existir uma signed URL válida
    // enquanto o token ainda está por queimar.
    expect(store.spies.updateTable.mock.invocationCallOrder[0])
      .toBeLessThan(createSignedDownloadUrl.mock.invocationCallOrder[0]);

    expect(store.rows('download_tokens')[0].used).toBe(true);

    // O log é montado com dados do tokenRecord (servidor), não da query.
    const [log] = store.rows('download_logs');
    expect(log).toMatchObject({
      order_id: ORDER_ID,
      product_id: PRODUCT_ID,
      token: TOKEN,
      ip_address: '203.0.113.7',
      user_agent: 'Mozilla/5.0 (comprador)',
    });
  });

  it('token já utilizado não gera signed URL, não é re-reivindicado e não vira log', async () => {
    const { handler, store, createSignedDownloadUrl } = arrange({
      tokens: [tokenRow({ used: true, used_at: '2026-08-12T12:00:00.000Z' })],
    });
    const res = createMockRes();

    await handler(downloadRequest(), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token já utilizado' });
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
    expect(store.spies.updateTable).not.toHaveBeenCalled();
    expect(store.rows('download_logs')).toHaveLength(0);
    expect(res.redirect).not.toHaveBeenCalled();
    // used_at do primeiro uso permanece — a segunda tentativa não reescreve nada.
    expect(store.rows('download_tokens')[0].used_at).toBe('2026-08-12T12:00:00.000Z');
  });

  it('o claim que afeta 0 linhas barra o segundo consumidor concorrente', async () => {
    const { handler, store, createSignedDownloadUrl } = arrange();

    // Modela a CORRIDA real: este request leu a linha com used=false, e entre
    // o SELECT e o UPDATE um outro consumidor (outra invocação serverless, com
    // o mesmo link) queimou o token. É a janela que um `if (used) …` sozinho
    // não fecha e que só o UPDATE condicional cobre.
    const leituraOriginal = store.spies.getTableRow.getMockImplementation();
    store.spies.getTableRow.mockImplementation(async (tabela, options) => {
      const linha = await leituraOriginal(tabela, options);
      if (tabela === 'download_tokens' && linha) {
        const alvo = store.state.download_tokens.find((row) => row.token === linha.token);
        alvo.used = true;
        alvo.used_at = '2026-08-12T12:00:00.000Z';
      }
      return linha;
    });

    const res = createMockRes();
    await handler(downloadRequest(), res);

    // O UPDATE saiu, com o filtro condicional, e voltou vazio.
    expect(store.spies.updateTable).toHaveBeenCalledTimes(1);
    expect(store.spies.updateTable.mock.calls[0][1]).toEqual({ token: `eq.${TOKEN}`, used: 'is.false' });
    expect(await store.spies.updateTable.mock.results[0].value).toEqual([]);

    // 0 linhas afetadas ⇒ perdeu a corrida ⇒ nada é entregue.
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token já utilizado' });
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(store.rows('download_logs')).toHaveLength(0);
  });

  it('duas requisições com o mesmo link entregam o arquivo uma única vez', async () => {
    const { handler, store, createSignedDownloadUrl } = arrange();

    const primeira = createMockRes();
    await handler(downloadRequest(), primeira);
    const segunda = createMockRes();
    await handler(downloadRequest(), segunda);

    expect(primeira.redirectedTo).toBe(SIGNED_URL);
    expect(segunda.statusCode).toBe(401);
    expect(segunda.redirect).not.toHaveBeenCalled();
    // Uma assinatura, um log: o link vazado já foi queimado no primeiro uso.
    expect(createSignedDownloadUrl).toHaveBeenCalledTimes(1);
    expect(store.rows('download_logs')).toHaveLength(1);
  });

  it('token expirado é recusado sem consumir o claim', async () => {
    const { handler, store, createSignedDownloadUrl } = arrange({
      tokens: [tokenRow({ expires_at: new Date(Date.now() - 3600_000).toISOString() })],
    });
    const res = createMockRes();

    await handler(downloadRequest(), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token expirado' });
    expect(store.spies.updateTable).not.toHaveBeenCalled();
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('token inexistente devolve 401 sem tocar em produtos nem no Storage', async () => {
    const { handler, store, createSignedDownloadUrl } = arrange({ tokens: [] });
    const res = createMockRes();

    await handler(downloadRequest('token-que-nao-existe'), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token inválido' });
    expect(store.callsFor(store.spies.getTableRow, 'products')).toHaveLength(0);
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('download_url fora do Storage falha fechado e NÃO queima o token do comprador', async () => {
    const { handler, store, security, createSignedDownloadUrl } = arrange({
      products: [productRow({ download_url: 'https://drive.google.com/file/d/abc' })],
    });
    const res = createMockRes();

    await handler(downloadRequest(), res);

    // Redirecionar cru para uma URL externa entregaria o produto pago sem
    // assinatura e sem expiração. É erro de cadastro, não modo de entrega.
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/suporte/i);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();

    // A checagem vem ANTES do claim: o comprador não pode perder o token por
    // um dado errado no painel.
    expect(store.spies.updateTable).not.toHaveBeenCalled();
    expect(store.rows('download_tokens')[0].used).toBe(false);

    expect(security.recordSecurityEvent.mock.calls[0][0].eventName).toBe('download_url_not_storage');
  });

  it('falha ao assinar devolve o claim para o comprador poder repetir', async () => {
    const { handler, store, createSignedDownloadUrl } = arrange({ signedUrl: null });
    const res = createMockRes();

    await handler(downloadRequest(), res);

    expect(createSignedDownloadUrl).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(502);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(store.rows('download_logs')).toHaveLength(0);

    // Falha de infra (rede/Storage) ≠ token gasto: o rollback é seguro porque
    // só quem VENCEU o claim chega até aqui.
    expect(store.spies.updateTable).toHaveBeenCalledTimes(2);
    expect(store.spies.updateTable.mock.calls[1][2]).toEqual({ used: false, used_at: null });
    expect(store.rows('download_tokens')[0].used).toBe(false);
  });

  it('aplica os headers de privacidade também nas respostas de erro', async () => {
    const { handler } = arrange();
    const res = createMockRes();

    await handler({ ...downloadRequest(), query: {} }, res);

    // Qualquer resposta desta rota carrega o token na URL — inclusive os 4xx.
    expect(res.statusCode).toBe(400);
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers['Cache-Control']).toBe('no-store, max-age=0');
  });
});
