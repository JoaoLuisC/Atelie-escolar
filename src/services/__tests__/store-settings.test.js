import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O setup global (src/test/setupTests.js) substitui este módulo por um mock
// para as telas; aqui o alvo é o módulo real.
const { fetchStoreSettings } = await vi.importActual('../store-settings');

function respond(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

describe('fetchStoreSettings', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve o conteúdo da resposta boa', async () => {
    globalThis.fetch.mockReturnValueOnce(
      respond(200, { success: true, content: { navigation: { title: 'Loja' } } }),
    );
    await expect(fetchStoreSettings()).resolves.toEqual({ navigation: { title: 'Loja' } });
  });

  it('HTTP 200 com success:false é erro, com a mensagem e o código do envelope', async () => {
    globalThis.fetch.mockReturnValueOnce(
      respond(200, {
        success: false,
        error: { code: 'CONFIG_READ_FAILED', message: 'Sem config.' },
      }),
    );
    await expect(fetchStoreSettings()).rejects.toMatchObject({
      message: 'Sem config.',
      code: 'CONFIG_READ_FAILED',
    });
  });

  it('HTTP de erro sem envelope usa a mensagem padrão', async () => {
    globalThis.fetch.mockReturnValueOnce(respond(500, {}));
    await expect(fetchStoreSettings()).rejects.toThrow(
      'Não foi possível carregar as configurações da loja.',
    );
  });
});
