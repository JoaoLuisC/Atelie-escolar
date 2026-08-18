import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/attribution-sanitize.js` — item P4.1.
//
// Sanitiza dado vindo do BROWSER que é persistido em `attribution_data` de
// pedidos, carrinhos abandonados e inscrições. É whitelist, e whitelist sem
// teste é whitelist que alguém "melhora" com um spread.
//
// O módulo existe porque as três whitelists divergiram: `referrer`,
// `landing_path` e `first_touch_at` eram descartados em silêncio em
// `abandoned_carts` e `email_subscribers`, mas gravados em `orders` (DRY-01).
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { ATTRIBUTION_FIELDS, sanitizeAttribution } = requireCjs('../attribution-sanitize.js');

describe('sanitizeAttribution', () => {
  it('cobre os NOVE campos que o cliente emite', () => {
    // A lista é o contrato com `src/utils/attribution.js`. Encolhê-la volta a
    // descartar campo em silêncio, que foi o achado original.
    expect(ATTRIBUTION_FIELDS).toEqual([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'referrer',
      'landing_path',
      'first_touch_at',
      'session_id',
    ]);
  });

  it('preserva os campos conhecidos', () => {
    const entrada = Object.fromEntries(ATTRIBUTION_FIELDS.map((campo) => [campo, `v-${campo}`]));
    expect(sanitizeAttribution(entrada)).toEqual(entrada);
  });

  it('DESCARTA qualquer campo fora da whitelist', () => {
    const resultado = sanitizeAttribution({
      utm_source: 'google',
      admin: true,
      __proto__: { poluido: true },
      senha: 'segredo',
    });

    expect(resultado).toEqual({ utm_source: 'google' });
  });

  it('trunca em 200 caracteres — o campo é entrada do cliente', () => {
    const resultado = sanitizeAttribution({ referrer: 'x'.repeat(5000) });
    expect(resultado.referrer).toHaveLength(200);
  });

  it('ignora valor que não é string, ou que é só espaço', () => {
    const resultado = sanitizeAttribution({
      utm_source: '   ',
      utm_medium: 42,
      utm_campaign: null,
      utm_content: { nested: true },
      utm_term: ['a'],
      session_id: 'sess-1',
    });

    expect(resultado).toEqual({ session_id: 'sess-1' });
  });

  it('entrada inválida vira objeto vazio, nunca exceção', () => {
    // Ela vem de `req.body`: um handler que quebrasse aqui perderia o pedido.
    expect(sanitizeAttribution(null)).toEqual({});
    expect(sanitizeAttribution(undefined)).toEqual({});
    expect(sanitizeAttribution('texto')).toEqual({});
    expect(sanitizeAttribution(7)).toEqual({});
  });
});
