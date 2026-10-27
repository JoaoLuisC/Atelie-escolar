import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Anti-CSRF das escritas de staff (`isSameOriginRequest`) × `CORS_ORIGINS`.
//
// A checagem só aceitava o APP_URL. Aberto pelo endereço `.vercel.app` do
// projeto, o painel carregava, mas toda escrita voltava 403 "Origem não
// permitida" — e "Encerrar sessão" dizia que a sessão continuava ativa. As
// origens explícitas de `CORS_ORIGINS` passam a valer também aqui; origem fora
// das duas listas continua barrada.

const requireCjs = createRequire(import.meta.url);
const ENV_KEYS = ['APP_URL', 'CORS_ORIGINS', 'APP_ENV', 'NODE_ENV'];
let saved;

function load() {
  for (const key of Object.keys(requireCjs.cache)) {
    if (/lib[\\/](http|admin-session)\.js$/.test(key)) {
      delete requireCjs.cache[key];
    }
  }
  return requireCjs('../admin-session.js');
}

function post(origin) {
  return { method: 'POST', headers: origin ? { origin } : {} };
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.APP_ENV = 'production';
  process.env.NODE_ENV = 'production';
  process.env.APP_URL = 'https://professoramarcia.ateliedaescola.com.br';
  process.env.CORS_ORIGINS =
    'https://professoramarcia.ateliedaescola.com.br, https://atelie-escolar.vercel.app/';
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('isSameOriginRequest · origens permitidas', () => {
  it('aceita o APP_URL', () => {
    expect(load().isSameOriginRequest(post('https://professoramarcia.ateliedaescola.com.br'))).toBe(
      true,
    );
  });

  it('aceita origem listada em CORS_ORIGINS (barra final ignorada)', () => {
    expect(load().isSameOriginRequest(post('https://atelie-escolar.vercel.app'))).toBe(true);
  });

  it('recusa origem fora das duas listas, e requisição sem Origin/Referer', () => {
    const { isSameOriginRequest } = load();
    expect(isSameOriginRequest(post('https://evil.example'))).toBe(false);
    expect(isSameOriginRequest(post(''))).toBe(false);
  });
});
