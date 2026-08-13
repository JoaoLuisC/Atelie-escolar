import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runtimeEnv,
  isLocalDevOrTest,
  resolveSecret,
  shouldUseSecureCookie,
} from '../env-secret.js';

// Nome de variável dedicado a estes testes para não colidir com segredos
// reais (ADMIN_SESSION_SECRET etc.) que outros módulos possam ler.
const VAR = 'ENV_SECRET_TEST_VALUE';
const FALLBACK = 'dev-fallback-value';

describe('env-secret (política fail-closed de segredos)', () => {
  let original;

  beforeEach(() => {
    original = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      [VAR]: process.env[VAR],
    };
    delete process.env[VAR];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('runtimeEnv', () => {
    it('prioriza APP_ENV sobre NODE_ENV e normaliza (trim + lowercase)', () => {
      process.env.APP_ENV = '  Production ';
      process.env.NODE_ENV = 'development';
      expect(runtimeEnv()).toBe('production');
    });

    it('cai para NODE_ENV quando APP_ENV está ausente', () => {
      delete process.env.APP_ENV;
      process.env.NODE_ENV = 'Staging';
      expect(runtimeEnv()).toBe('staging');
    });

    it('retorna string vazia quando nenhum dos dois está definido', () => {
      delete process.env.APP_ENV;
      delete process.env.NODE_ENV;
      expect(runtimeEnv()).toBe('');
    });
  });

  describe('isLocalDevOrTest', () => {
    it.each(['development', 'test', ' Development ', 'TEST'])(
      'reconhece "%s" como ambiente local dev/test',
      (env) => {
        process.env.APP_ENV = env;
        expect(isLocalDevOrTest()).toBe(true);
      },
    );

    it.each(['production', 'preview', 'staging'])(
      'trata "%s" como ambiente implantado (não dev/test)',
      (env) => {
        process.env.APP_ENV = env;
        process.env.NODE_ENV = env;
        expect(isLocalDevOrTest()).toBe(false);
      },
    );

    it('trata ambiente vazio (sem APP_ENV nem NODE_ENV) como implantado', () => {
      delete process.env.APP_ENV;
      process.env.NODE_ENV = '';
      expect(runtimeEnv()).toBe('');
      expect(isLocalDevOrTest()).toBe(false);
    });
  });

  describe('resolveSecret', () => {
    it('resolve o valor da env quando presente (mesmo em produção), com trim', () => {
      process.env.APP_ENV = 'production';
      process.env[VAR] = '  super-secret  ';
      expect(resolveSecret(VAR, FALLBACK)).toBe('super-secret');
    });

    it('prefere o valor real da env ao fallback mesmo em dev', () => {
      process.env.APP_ENV = 'development';
      process.env[VAR] = 'real-dev-secret';
      expect(resolveSecret(VAR, FALLBACK)).toBe('real-dev-secret');
    });

    it('devolve o fallback em desenvolvimento quando a env está ausente', () => {
      process.env.APP_ENV = 'development';
      expect(resolveSecret(VAR, FALLBACK)).toBe(FALLBACK);
    });

    it('devolve o fallback em teste quando a env está ausente', () => {
      delete process.env.APP_ENV;
      process.env.NODE_ENV = 'test';
      expect(resolveSecret(VAR, FALLBACK)).toBe(FALLBACK);
    });

    it('lança (fail-closed) quando a env está ausente em produção', () => {
      process.env.APP_ENV = 'production';
      expect(() => resolveSecret(VAR, FALLBACK)).toThrow(/obrigatório/i);
      expect(() => resolveSecret(VAR, FALLBACK)).toThrow(VAR);
    });

    it.each(['preview', 'staging'])(
      'lança em ambiente implantado não-produção (%s) — não vaza fallback',
      (env) => {
        process.env.APP_ENV = env;
        expect(() => resolveSecret(VAR, FALLBACK)).toThrow();
      },
    );

    it('trata env só com espaços como ausente (fail-closed em produção)', () => {
      process.env.APP_ENV = 'production';
      process.env[VAR] = '    ';
      expect(() => resolveSecret(VAR, FALLBACK)).toThrow();
    });
  });

  describe('shouldUseSecureCookie', () => {
    it.each(['production', 'preview', 'staging'])(
      'exige Secure em ambiente implantado (%s)',
      (env) => {
        process.env.APP_ENV = env;
        expect(shouldUseSecureCookie()).toBe(true);
      },
    );

    it.each(['development', 'test'])('dispensa Secure em ambiente local (%s)', (env) => {
      process.env.APP_ENV = env;
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('é sempre o inverso de isLocalDevOrTest', () => {
      process.env.APP_ENV = 'production';
      expect(shouldUseSecureCookie()).toBe(!isLocalDevOrTest());
      process.env.APP_ENV = 'development';
      expect(shouldUseSecureCookie()).toBe(!isLocalDevOrTest());
    });
  });
});
