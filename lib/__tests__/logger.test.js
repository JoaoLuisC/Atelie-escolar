import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const { createLogger, sanitizeContext, LEVELS } = requireCjs('../logger.js');

// ════════════════════════════════════════════════════════════════════
// Regra F1. Dois controles importam aqui e nenhum é sobre formatação:
//
//   1. REDAÇÃO — um log é lido por mais gente, e guardado por mais tempo, que
//      o banco. Um `token` de download que vaze no log entrega o produto pago.
//   2. ESTRUTURA — objeto aninhado precisa continuar objeto. Serializar para
//      string derrota o motivo de existir log estruturado, e foi um bug real
//      da primeira versão (ver a nota em sanitizeValue).
// ════════════════════════════════════════════════════════════════════

function captureLine(spy) {
  const call = spy.mock.calls.at(-1);
  return call ? JSON.parse(String(call[0])) : null;
}

describe('createLogger', () => {
  let warnSpy;
  let errorSpy;
  let logSpy;
  const originalLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
  });

  it('emite JSON com level, event, ts e o módulo', () => {
    const log = createLogger('download');
    log.error('claim_falhou', { orderId: 42 });

    const line = captureLine(errorSpy);
    expect(line).toMatchObject({
      level: 'error',
      event: 'claim_falhou',
      module: 'download',
      orderId: 42,
    });
    expect(typeof line.ts).toBe('string');
  });

  it('separa os streams — error em stderr, warn em stderr do warn, info em stdout', () => {
    // A Vercel filtra por stream: um erro que sai em stdout não aparece no
    // filtro de erro dela.
    const log = createLogger('m');
    log.error('a');
    log.warn('b');
    log.info('c');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('respeita LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'error';
    const log = createLogger('m');
    log.warn('silenciado');
    log.error('emitido');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('NÃO se cala em ambiente de teste', () => {
    // Um logger que se comporta diferente em teste é a mesma classe de
    // divergência dev/prod que já custou caro neste projeto — e apagaria os
    // eventos que lib/__tests__/rate-limit.test.js afirma.
    process.env.NODE_ENV = 'test';
    const log = createLogger('m');
    log.warn('deve_aparecer');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('evento vazio não vira "undefined" no log', () => {
    const log = createLogger('m');
    log.info();
    expect(captureLine(logSpy).event).toBe('unknown_event');
  });
});

describe('sanitizeContext — redação', () => {
  it('redige segredo no primeiro nível', () => {
    const out = sanitizeContext({ token: 'abc', password: 'x', orderId: 1 });
    expect(out.token).toBe('[redacted]');
    expect(out.password).toBe('[redacted]');
    expect(out.orderId).toBe(1);
  });

  it('redige segredo ANINHADO', () => {
    // A primeira versão serializava o objeto inteiro depois de olhar só as
    // chaves do topo, então `{ auth: { token } }` escapava da redação.
    const out = sanitizeContext({ auth: { token: 'segredo', user: 'ana' } });
    expect(out.auth.token).toBe('[redacted]');
    expect(out.auth.user).toBe('ana');
  });

  it('redige independente da caixa da chave', () => {
    expect(sanitizeContext({ Authorization: 'Bearer x' }).Authorization).toBe('[redacted]');
    expect(sanitizeContext({ ACCESS_TOKEN: 'x' }).ACCESS_TOKEN).toBe('[redacted]');
  });
});

describe('sanitizeContext — estrutura', () => {
  it('preserva objeto aninhado como OBJETO, não como string', () => {
    const out = sanitizeContext({ properties: { bucket: 'validate-coupon', limit: 20 } });
    expect(out.properties).toEqual({ bucket: 'validate-coupon', limit: 20 });
    expect(typeof out.properties).toBe('object');
  });

  it('preserva array', () => {
    expect(sanitizeContext({ ids: [1, 2, 3] }).ids).toEqual([1, 2, 3]);
  });

  it('Error vira a mensagem', () => {
    expect(sanitizeContext({ reason: new Error('boom') }).reason).toBe('boom');
  });

  it('trunca string longa', () => {
    const out = sanitizeContext({ body: 'x'.repeat(2000) });
    expect(out.body.length).toBe(500);
  });

  it('não estoura com referência cíclica', () => {
    const cyclic = { name: 'a' };
    cyclic.self = cyclic;
    expect(() => sanitizeContext({ cyclic })).not.toThrow();
  });

  it('contexto ausente vira objeto vazio', () => {
    expect(sanitizeContext(undefined)).toEqual({});
    expect(sanitizeContext('texto')).toEqual({});
  });
});

describe('LEVELS', () => {
  it('está ordenado do menos para o mais severo', () => {
    expect(LEVELS.debug).toBeLessThan(LEVELS.info);
    expect(LEVELS.info).toBeLessThan(LEVELS.warn);
    expect(LEVELS.warn).toBeLessThan(LEVELS.error);
  });
});
