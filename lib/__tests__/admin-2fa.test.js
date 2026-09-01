import { createRequire } from 'node:module';
import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/admin-2fa.js` — o segundo fator do admin e o repouso dos segredos.
//
// O QUE ESTÁ TRAVADO AQUI
//
// 1. **Nada de segredo em texto puro.** `totpSecret` sai cifrado, `fallbackPin`
//    sai hasheado. A asserção é sobre o VALOR GRAVADO não conter o segredo —
//    é o que um dump da tabela `settings` revelaria.
//
// 2. **Compatibilidade com o formato antigo.** Uma instalação viva tem os dois
//    campos em claro. Se a leitura não aceitasse isso, o deploy trancaria a
//    dona para fora do próprio painel — por isso cada caminho de leitura é
//    testado nos DOIS formatos.
//
// 3. **A distinção que o desenho depende.** TOTP é cifrado (reversível, porque
//    o servidor precisa recalcular o HMAC) e PIN é hasheado (irreversível,
//    porque só é comparado). Trocar um pelo outro quebraria o login ou
//    enfraqueceria o repouso, e é o tipo de troca que parece inofensiva num
//    refactor.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);

const {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  hashPin,
  verifyPin,
  isHashedPin,
  matchTotpCounter,
  generateTotpCode,
  decodeBase32,
  extractSecondFactorMethods,
  isSecondFactorRequired,
  verifySecondFactorCode,
  timingSafeEqualStrings,
  TOTP_STEP_SECONDS,
} = requireCjs('../admin-2fa.js');

// Segredo base32 de exemplo (o mesmo que os apps autenticadores exportam).
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const PIN = 'pin-de-emergencia-9731';

let originalEnv;

beforeEach(() => {
  originalEnv = process.env.ADMIN_2FA_ENC_KEY;
  process.env.ADMIN_2FA_ENC_KEY = crypto.randomBytes(32).toString('hex');
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.ADMIN_2FA_ENC_KEY;
  else process.env.ADMIN_2FA_ENC_KEY = originalEnv;
});

/** Código válido para a janela corrente, calculado como o app faria. */
function codigoAtual(secret = TOTP_SECRET) {
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  return generateTotpCode(decodeBase32(secret), counter);
}

describe('cifra do totpSecret', () => {
  it('o valor gravado não contém o segredo', () => {
    const guardado = encryptSecret(TOTP_SECRET);

    expect(guardado).not.toContain(TOTP_SECRET);
    expect(isEncrypted(guardado)).toBe(true);
  });

  it('round-trip devolve o segredo original', () => {
    expect(decryptSecret(encryptSecret(TOTP_SECRET))).toBe(TOTP_SECRET);
  });

  it('duas cifras do mesmo segredo são diferentes (IV aleatório)', () => {
    // Cifra determinística vazaria "estes dois admins usam o mesmo segredo".
    expect(encryptSecret(TOTP_SECRET)).not.toBe(encryptSecret(TOTP_SECRET));
  });

  it('é idempotente — cifrar de novo não cria casca dupla', () => {
    const uma = encryptSecret(TOTP_SECRET);
    expect(encryptSecret(uma)).toBe(uma);
  });

  it('valor em claro (formato antigo) atravessa sem alteração', () => {
    expect(decryptSecret(TOTP_SECRET)).toBe(TOTP_SECRET);
  });

  it('adulteração no banco falha ao decifrar em vez de virar outro segredo', () => {
    // AES-GCM autentica: byte trocado invalida a tag.
    const guardado = encryptSecret(TOTP_SECRET);
    const corrompido = guardado.slice(0, -4) + 'AAAA';

    expect(decryptSecret(corrompido)).toBe('');
  });

  it('com a chave errada não decifra — e não lança', () => {
    const guardado = encryptSecret(TOTP_SECRET);
    process.env.ADMIN_2FA_ENC_KEY = crypto.randomBytes(32).toString('hex');

    expect(() => decryptSecret(guardado)).not.toThrow();
    expect(decryptSecret(guardado)).toBe('');
  });

  it('string vazia continua vazia', () => {
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret('')).toBe('');
  });
});

describe('hash do fallbackPin', () => {
  it('o valor gravado não contém o PIN', () => {
    const guardado = hashPin(PIN);

    expect(guardado).not.toContain(PIN);
    expect(isHashedPin(guardado)).toBe(true);
  });

  it('confere o PIN correto e recusa o errado', () => {
    const guardado = hashPin(PIN);

    expect(verifyPin(guardado, PIN)).toBe(true);
    expect(verifyPin(guardado, PIN + 'x')).toBe(false);
    expect(verifyPin(guardado, '')).toBe(false);
  });

  it('dois hashes do mesmo PIN são diferentes (sal por registro)', () => {
    expect(hashPin(PIN)).not.toBe(hashPin(PIN));
  });

  it('é irreversível — nem a chave de cifra o recupera', () => {
    // A diferença de desenho em relação ao totpSecret: aqui não existe volta.
    const guardado = hashPin(PIN);
    expect(decryptSecret(guardado)).toBe(guardado);
    expect(guardado).not.toContain(PIN);
  });

  it('é idempotente', () => {
    const uma = hashPin(PIN);
    expect(hashPin(uma)).toBe(uma);
  });

  it('aceita PIN em claro no banco (formato antigo)', () => {
    expect(verifyPin(PIN, PIN)).toBe(true);
    expect(verifyPin(PIN, 'outro')).toBe(false);
  });

  it('valor guardado ilegível recusa em vez de lançar', () => {
    expect(verifyPin('scrypt:v1:lixo', PIN)).toBe(false);
  });
});

describe('matchTotpCounter', () => {
  it('aceita o código da janela corrente e devolve o contador', () => {
    const counter = matchTotpCounter(TOTP_SECRET, codigoAtual());

    expect(counter).toBe(Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS));
  });

  it('funciona com o segredo CIFRADO — é o caminho normal depois da migração', () => {
    expect(matchTotpCounter(encryptSecret(TOTP_SECRET), codigoAtual())).not.toBeNull();
  });

  it('aceita o código da janela anterior e da próxima (drift de ±1)', () => {
    const agora = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    const buffer = decodeBase32(TOTP_SECRET);

    expect(matchTotpCounter(TOTP_SECRET, generateTotpCode(buffer, agora - 1))).toBe(agora - 1);
    expect(matchTotpCounter(TOTP_SECRET, generateTotpCode(buffer, agora + 1))).toBe(agora + 1);
  });

  it('recusa código fora da janela de drift', () => {
    const agora = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    const distante = generateTotpCode(decodeBase32(TOTP_SECRET), agora + 5);

    expect(matchTotpCounter(TOTP_SECRET, distante)).toBeNull();
  });

  it('recusa o que não for exatamente 6 dígitos', () => {
    for (const invalido of ['', '12345', '1234567', 'abcdef', '12 34 56', null, undefined]) {
      expect(matchTotpCounter(TOTP_SECRET, invalido)).toBeNull();
    }
  });

  it('recusa quando o segredo é ilegível ou vazio', () => {
    expect(matchTotpCounter('', codigoAtual())).toBeNull();
    expect(matchTotpCounter('1890!!!', '123456')).toBeNull();
    // Cifrado com outra chave: decifra para vazio, não pode virar "válido".
    const deOutraChave = encryptSecret(TOTP_SECRET);
    process.env.ADMIN_2FA_ENC_KEY = crypto.randomBytes(32).toString('hex');
    expect(matchTotpCounter(deOutraChave, codigoAtual())).toBeNull();
  });
});

describe('leitura da config', () => {
  it('isSecondFactorRequired aceita os três nomes de flag em uso', () => {
    expect(isSecondFactorRequired({ requireSecondFactor: true })).toBe(true);
    expect(isSecondFactorRequired({ require2FA: true })).toBe(true);
    expect(isSecondFactorRequired({ twoFactorEnabled: true })).toBe(true);
    expect(isSecondFactorRequired({})).toBe(false);
  });

  it('extractSecondFactorMethods lista só o que está configurado', () => {
    expect(extractSecondFactorMethods({ totpSecret: encryptSecret(TOTP_SECRET) })).toEqual([
      'totp',
    ]);
    expect(extractSecondFactorMethods({ fallbackPin: hashPin(PIN) })).toEqual(['pin']);
    expect(extractSecondFactorMethods({})).toEqual([]);
  });

  it('allowPinFallback === false remove o PIN dos métodos', () => {
    const config = { fallbackPin: hashPin(PIN), allowPinFallback: false };
    expect(extractSecondFactorMethods(config)).toEqual([]);
  });

  it('verifySecondFactorCode aceita TOTP e PIN, nos dois formatos', () => {
    const novo = { totpSecret: encryptSecret(TOTP_SECRET), fallbackPin: hashPin(PIN) };
    const antigo = { totpSecret: TOTP_SECRET, fallbackPin: PIN };

    for (const config of [novo, antigo]) {
      expect(verifySecondFactorCode(config, codigoAtual())).toBe(true);
      expect(verifySecondFactorCode(config, PIN)).toBe(true);
      expect(verifySecondFactorCode(config, '000000')).toBe(false);
      expect(verifySecondFactorCode(config, '')).toBe(false);
    }
  });

  it('sem método configurado, nenhum código passa', () => {
    expect(verifySecondFactorCode({}, codigoAtual())).toBe(false);
    expect(verifySecondFactorCode({}, PIN)).toBe(false);
  });
});

describe('timingSafeEqualStrings', () => {
  it('compara conteúdo e não referência', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false);
  });

  it('não lança com comprimentos diferentes', () => {
    // `crypto.timingSafeEqual` cru lança nesse caso; um guard de comprimento
    // antes dele reintroduziria o vazamento que a função existe para fechar.
    expect(() => timingSafeEqualStrings('a', 'abcdefgh')).not.toThrow();
    expect(timingSafeEqualStrings('a', 'abcdefgh')).toBe(false);
  });
});
