import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { ERROR_CODES as FRONT_CODES } from '../error-codes';

// `lib/http.js` é CommonJS e roda em Node; aqui ele é carregado só para o
// teste, nunca pelo bundle do browser (ver a nota em src/constants/error-codes.js).
const requireCjs = createRequire(import.meta.url);
const { ERROR_CODES: BACK_CODES } = requireCjs('../../../lib/http.js');

// ════════════════════════════════════════════════════════════════════
// O CONTRATO DA REGRA A2 É EXECUTÁVEL.
//
// O código de erro só vale como contrato de máquina se as duas pontas
// concordarem sobre quais códigos existem. Como o catálogo do browser é uma
// CÓPIA (por restrição de bundle, não por escolha), a sincronia precisa de um
// teste — senão a cópia envelhece em silêncio e o `if` do cliente vira código
// morto que ninguém percebe, exatamente o problema que a regra A2 resolve.
//
// A direção da checagem é deliberada:
//   • todo código do FRONT precisa existir no BACK  → senão é `if` morto;
//   • o inverso NÃO é exigido → o backend tem códigos internos (INTERNAL_ERROR,
//     SERVICE_UNAVAILABLE) em que nenhuma tela ramifica, e obrigar o espelho a
//     listar tudo só criaria ruído para manter.
// ════════════════════════════════════════════════════════════════════
describe('catálogo de códigos de erro (regra A2)', () => {
  it('todo código conhecido pelo browser existe no catálogo do backend', () => {
    const ausentes = Object.values(FRONT_CODES).filter((code) => !BACK_CODES[code]);
    expect(ausentes).toEqual([]);
  });

  it('chave e valor coincidem nos dois lados', () => {
    for (const [key, value] of Object.entries(FRONT_CODES)) {
      expect(value).toBe(key);
      expect(BACK_CODES[key]).toBe(value);
    }
  });

  it('todo código do backend é SCREAMING_SNAKE', () => {
    for (const value of Object.values(BACK_CODES)) {
      expect(value).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});
