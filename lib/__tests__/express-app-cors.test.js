import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `buildCorsConfig` — as duas propriedades que ele existe para garantir.
//
// 1. FAIL-CLOSED: fora de development/test, `CORS_ORIGINS` ausente derruba o
//    boot. O default de dev libera QUALQUER porta de localhost com
//    `credentials: true`; herdá-lo em produção por esquecimento no painel da
//    Vercel seria uma allowlist aberta por omissão, e silenciosa.
//
// 2. RECUSAR NÃO É ERRAR: origem fora da allowlist não recebe os headers de
//    CORS, mas a requisição SEGUE para o handler — onde `isSameOriginRequest`
//    responde 403. Antes o default de dev chamava `callback(new Error(...))`,
//    o que virava 500 no `errorHandler` enquanto produção respondia 403 pelo
//    mesmo pedido. Divergência dev/prod é exatamente o que o ADR 0002 proíbe.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { buildCorsConfig } = requireCjs('../express-app.js');

let originalCors;

beforeEach(() => {
  originalCors = process.env.CORS_ORIGINS;
});

afterEach(() => {
  if (originalCors === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = originalCors;
});

/** Resolve a função `origin` do middleware como um booleano. */
function decide(config, origin) {
  if (typeof config.origin !== 'function') return config.origin;
  let resultado;
  config.origin(origin, (erro, permitido) => {
    if (erro) throw erro;
    resultado = permitido;
  });
  return resultado;
}

describe('buildCorsConfig', () => {
  describe('sem CORS_ORIGINS', () => {
    beforeEach(() => {
      delete process.env.CORS_ORIGINS;
    });

    it.each(['production', 'preview', 'staging'])('derruba o boot em %s', (runtimeEnv) => {
      expect(() => buildCorsConfig({ runtimeEnv })).toThrow(/CORS_ORIGINS/);
    });

    it.each(['development', 'test'])('em %s cai no default de localhost', (runtimeEnv) => {
      const config = buildCorsConfig({ runtimeEnv });

      expect(decide(config, 'http://localhost:5173')).toBe(true);
      expect(decide(config, 'http://localhost:5174')).toBe(true);
      expect(decide(config, 'http://127.0.0.1:3000')).toBe(true);
      expect(config.credentials).toBe(true);
    });

    it('recusa origem externa SEM lançar (senão vira 500 no lugar de 403)', () => {
      const config = buildCorsConfig({ runtimeEnv: 'development' });

      expect(() => decide(config, 'https://site-malicioso.example')).not.toThrow();
      expect(decide(config, 'https://site-malicioso.example')).toBe(false);
    });

    it('permite requisição sem Origin (cliente que não é browser)', () => {
      const config = buildCorsConfig({ runtimeEnv: 'development' });
      expect(decide(config, undefined)).toBe(true);
    });
  });

  describe('com CORS_ORIGINS', () => {
    it('usa a allowlist e mantém credentials', () => {
      process.env.CORS_ORIGINS = 'https://ateliedaescola.com.br, https://www.ateliedaescola.com.br';
      const config = buildCorsConfig({ runtimeEnv: 'production' });

      expect(config.origin).toEqual([
        'https://ateliedaescola.com.br',
        'https://www.ateliedaescola.com.br',
      ]);
      expect(config.credentials).toBe(true);
    });

    it('com "*" reflete a origem e DESLIGA credentials', () => {
      // Wildcard + credentials é recusado pelo browser e exporia a API a
      // qualquer site com o cookie de sessão junto.
      process.env.CORS_ORIGINS = '*';
      const config = buildCorsConfig({ runtimeEnv: 'production' });

      expect(config.origin).toBe(true);
      expect(config.credentials).toBe(false);
    });

    it('ignora espaços e entradas vazias', () => {
      process.env.CORS_ORIGINS = ' https://a.example ,, https://b.example ,';
      const config = buildCorsConfig({ runtimeEnv: 'production' });

      expect(config.origin).toEqual(['https://a.example', 'https://b.example']);
    });
  });
});
