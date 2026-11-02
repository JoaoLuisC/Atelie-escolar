import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import * as telas from '../../src/constants/password-policy.js';

const requireCjs = createRequire(import.meta.url);
const servidor = requireCjs('../password-policy.js');

describe('política de senha', () => {
  it('tela e servidor usam a mesma regex de símbolo', () => {
    expect(telas.PASSWORD_SPECIAL_CHAR.source).toBe(servidor.SPECIAL_CHAR.source);
  });

  it('aceita cada símbolo da lista do Supabase Auth (scripts/configure-auth.js)', () => {
    const lista = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';
    for (const simbolo of lista) {
      expect(servidor.isStrongPassword(`Senha1${simbolo}x`), simbolo).toBe(true);
      expect(telas.isStrongPassword(`Senha1${simbolo}x`), simbolo).toBe(true);
    }
  });

  it('acento, ç e espaço não contam como símbolo (o Supabase recusaria)', () => {
    for (const senha of ['Márcia2026', 'Atenção2026', 'Senha 2026x']) {
      expect(servidor.isStrongPassword(senha), senha).toBe(false);
      expect(telas.isStrongPassword(senha), senha).toBe(false);
    }
    expect(servidor.isStrongPassword('Márcia2026!')).toBe(true);
  });
});
