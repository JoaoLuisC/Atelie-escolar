import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmSubscription, unsubscribeByEmail, unsubscribeByToken } from '../subscription';

// ════════════════════════════════════════════════════════════════════
// `src/services/subscription.js` — regra C2, item P5.1.
//
// Estas são telas de confirmação por link de e-mail, onde "não deu certo" É o
// conteúdo da página — não um toast sobre uma tela vazia. Por isso nenhuma das
// três joga: todas devolvem um resultado com `ok`.
//
// O caso mais delicado é `confirmationRequired` (item P1.5): antes chegava
// como `success: false`, o que pintava de ERRO uma operação que deu certo — e
// obrigava o backend a mentir no envelope da regra A1.
// ════════════════════════════════════════════════════════════════════

function resposta(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('confirmSubscription', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirmação nova', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));

    await expect(confirmSubscription('tok')).resolves.toMatchObject({
      ok: true,
      alreadyConfirmed: false,
    });
  });

  it('já confirmado antes tem mensagem própria', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true, alreadyConfirmed: true }));

    const r = await confirmSubscription('tok');
    expect(r.alreadyConfirmed).toBe(true);
    expect(r.message).toMatch(/já tinha confirmado/i);
  });

  it('falha não joga — devolve `ok: false` com a mensagem do ENVELOPE', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta(
        { success: false, error: { code: 'CONFIRMATION_EXPIRED', message: 'Este link expirou.' } },
        { ok: false, status: 410 },
      ),
    );

    await expect(confirmSubscription('velho')).resolves.toEqual({
      ok: false,
      alreadyConfirmed: false,
      message: 'Este link expirou.',
    });
  });

  it('escapa o token na query string', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));
    await confirmSubscription('a/b');
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain('token=a%2Fb');
  });
});

describe('unsubscribeByToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancelamento por link do e-mail', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta({ success: true, message: 'Inscrição cancelada.' }),
    );

    await expect(unsubscribeByToken('tok')).resolves.toEqual({
      ok: true,
      message: 'Inscrição cancelada.',
    });
  });

  it('token inválido devolve ok: false, sem jogar', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta(
        { success: false, error: { code: 'NOT_FOUND', message: 'Link inválido.' } },
        { ok: false, status: 404 },
      ),
    );

    await expect(unsubscribeByToken('x')).resolves.toEqual({
      ok: false,
      message: 'Link inválido.',
    });
  });
});

describe('unsubscribeByEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('`confirmationRequired` NÃO é sucesso — nada foi removido ainda', async () => {
    // A distinção que o item P1.5 corrigiu: a operação deu certo (um e-mail de
    // confirmação saiu), mas a inscrição continua ativa. `ok: true` faria a
    // tela anunciar "Pronto, você foi removido" para quem não foi.
    globalThis.fetch = vi.fn(async () =>
      resposta({
        success: true,
        confirmationRequired: true,
        message: 'Se este e-mail estiver na lista, enviamos um link.',
      }),
    );

    await expect(unsubscribeByEmail('a@b.com')).resolves.toEqual({
      ok: false,
      confirmationRequired: true,
      message: 'Se este e-mail estiver na lista, enviamos um link.',
    });
  });

  it('remoção efetiva devolve ok: true', async () => {
    globalThis.fetch = vi.fn(async () =>
      resposta({ success: true, message: 'Inscrição cancelada.' }),
    );

    await expect(unsubscribeByEmail('a@b.com')).resolves.toMatchObject({
      ok: true,
      confirmationRequired: false,
    });
  });

  it('manda o e-mail no corpo, não na query string', async () => {
    globalThis.fetch = vi.fn(async () => resposta({ success: true }));
    await unsubscribeByEmail('cliente@exemplo.test');

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).not.toContain('cliente@exemplo.test');
    expect(JSON.parse(init.body)).toEqual({ email: 'cliente@exemplo.test' });
  });
});
