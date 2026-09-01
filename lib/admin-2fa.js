// ════════════════════════════════════════════════════════════════════
// SEGUNDO FATOR DO ADMIN — TOTP, PIN de emergência, e o repouso dos dois.
//
// POR QUE ESTE ARQUIVO EXISTE
// Duas razões, e a segunda é a que forçou a mão:
//
// 1. A dívida que `handlers/admin/login.js` já registrava: HOTP e base32
//    moravam dentro do handler, e `handlers/admin/settings.js` importava de lá
//    só para reautenticar. Extrair era o próximo passo anotado no código.
//
// 2. `totpSecret` e `fallbackPin` eram gravados EM CLARO no JSON de
//    `settings.adminConfig`. Quem lesse aquela linha — um dump, um backup, um
//    SELECT com a service role, o audit log antes da redação — levava junto o
//    segundo fator inteiro: com o `totpSecret` em mãos qualquer pessoa gera
//    códigos válidos indefinidamente, e o 2FA deixa de ser um segundo fator.
//
// AS DUAS CORREÇÕES SÃO DIFERENTES, E ISSO IMPORTA
//
// • `totpSecret` NÃO pode ser hasheado. O servidor precisa do segredo original
//   para recalcular o HMAC-SHA1 de cada janela; hash é irreversível por
//   definição e quebraria a verificação. O que cabe é CIFRAR EM REPOUSO
//   (AES-256-GCM), decifrando só no instante da conferência. Isso não protege
//   contra quem já tem o servidor — protege contra quem obtém uma CÓPIA DOS
//   DADOS, que é o vazamento realista aqui (backup, dump, log).
//
// • `fallbackPin` pode e deve ser hasheado. Ele só é comparado contra o que o
//   usuário digita, então nunca precisa voltar ao claro. scrypt com sal por
//   registro, e comparação em tempo constante sobre o derivado.
//
// COMPATIBILIDADE
// Toda leitura aceita o formato ANTIGO (valor em claro). Uma instalação viva
// continua funcionando depois do deploy, e o próximo "Salvar" no painel
// regrava no formato novo. Sem isso, publicar esta mudança trancaria a dona
// para fora do próprio painel.
// ════════════════════════════════════════════════════════════════════

const crypto = require('node:crypto');

const { resolveSecret } = require('./env-secret');

const TOTP_STEP_SECONDS = 30;
// window=1 → aceita o código anterior e o próximo (±30s) para tolerar relógio
// dessincronizado no celular. É o que torna um código válido por ~90s e, sem
// marcação de uso, replayável nessa janela — daí o consumo único no handler.
const TOTP_DRIFT_WINDOW = 1;

// Prefixos auto-descritivos: o formato viaja junto do valor, então ler é
// decidir por inspeção e não por adivinhação. `v1` deixa espaço para trocar de
// algoritmo sem ambiguidade.
const ENC_PREFIX = 'enc:v1:';
const PIN_PREFIX = 'scrypt:v1:';

const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;

/**
 * Chave de cifra dos segredos de 2FA.
 *
 * Segredo próprio e não o `ADMIN_SESSION_SECRET`: as duas chaves têm ciclos de
 * vida diferentes. Rotacionar o segredo de sessão é barato (derruba as sessões
 * abertas e pronto); rotacionar esta exige reescrever o `totpSecret` cifrado,
 * ou o 2FA para de abrir. Compartilhar as duas amarraria a rotação barata à
 * cara e, na prática, faria ninguém rotacionar nenhuma.
 */
function getEncryptionKey() {
  const secret = resolveSecret('ADMIN_2FA_ENC_KEY', 'dev-admin-2fa-encryption-key-change-me');
  // Aceita hex de 32 bytes ou qualquer string: o SHA-256 normaliza os dois
  // para os 32 bytes que o AES-256 exige, sem exigir formato específico de
  // quem configura a variável.
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

/**
 * Comparação em tempo constante que não vaza comprimento pelo caminho curto.
 *
 * Hash antes de comparar iguala os comprimentos sem revelar o original:
 * `timingSafeEqual` lança quando os buffers têm tamanhos diferentes, e um
 * `if (a.length !== b.length) return false` antes dele reintroduziria
 * exatamente o vazamento que ele existe para fechar.
 */
function timingSafeEqualStrings(a, b) {
  const digestA = crypto
    .createHash('sha256')
    .update(Buffer.from(String(a), 'utf8'))
    .digest();
  const digestB = crypto
    .createHash('sha256')
    .update(Buffer.from(String(b), 'utf8'))
    .digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

// ─── Cifra em repouso (totpSecret) ───────────────────────────────────

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Cifra um segredo para gravação. AES-256-GCM: além de esconder, AUTENTICA —
 * uma linha adulterada no banco falha ao decifrar em vez de virar um segredo
 * diferente e silenciosamente errado.
 */
function encryptSecret(plaintext) {
  const value = String(plaintext ?? '');
  if (!value) return '';
  // Idempotente: reencriptar um valor já cifrado produziria uma casca dupla
  // que nada sabe desfazer.
  if (isEncrypted(value)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENC_PREFIX + iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/**
 * Devolve o segredo em claro. Valor sem o prefixo é tratado como formato
 * ANTIGO e devolvido como está — é o que mantém uma instalação viva
 * funcionando entre o deploy e o primeiro "Salvar" no painel.
 *
 * Falha de decifra devolve string vazia em vez de lançar: o chamador é o
 * caminho de login, e uma exceção ali viraria 500 num fluxo que deve
 * simplesmente recusar o código.
 */
function decryptSecret(stored) {
  const value = String(stored ?? '');
  if (!value) return '';
  if (!isEncrypted(value)) return value;

  try {
    const [ivPart, tagPart, dataPart] = value.slice(ENC_PREFIX.length).split(':');
    if (!ivPart || !tagPart || !dataPart) return '';

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

// ─── Hash do PIN de emergência ───────────────────────────────────────

function isHashedPin(value) {
  return typeof value === 'string' && value.startsWith(PIN_PREFIX);
}

/** scrypt com sal por registro. Idempotente, como `encryptSecret`. */
function hashPin(plaintext) {
  const value = String(plaintext ?? '');
  if (!value) return '';
  if (isHashedPin(value)) return value;

  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derived = crypto.scryptSync(value, salt, SCRYPT_KEYLEN);

  return `${PIN_PREFIX}${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

/**
 * Confere um PIN contra o valor armazenado, nos DOIS formatos.
 *
 * Tempo constante nos dois caminhos: o PIN tem mínimo de 6 caracteres e é o
 * fator de emergência, então vazar comprimento ou prefixo por tempo de
 * resposta é exatamente o que não se quer aqui.
 */
function verifyPin(stored, candidate) {
  const guardado = String(stored ?? '');
  const tentativa = String(candidate ?? '');
  if (!guardado || !tentativa) return false;

  if (!isHashedPin(guardado)) {
    // Formato antigo: comparação direta, mas ainda em tempo constante.
    return timingSafeEqualStrings(guardado, tentativa);
  }

  try {
    const [saltPart, derivedPart] = guardado.slice(PIN_PREFIX.length).split(':');
    if (!saltPart || !derivedPart) return false;

    const salt = Buffer.from(saltPart, 'base64url');
    const esperado = Buffer.from(derivedPart, 'base64url');
    const obtido = crypto.scryptSync(tentativa, salt, esperado.length);

    return crypto.timingSafeEqual(esperado, obtido);
  } catch {
    return false;
  }
}

// ─── TOTP (RFC 6238 sobre HOTP/RFC 4226) ─────────────────────────────

function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const sanitized = String(input || '')
    .toUpperCase()
    .replaceAll(/[^A-Z2-7]/g, '');
  if (!sanitized) return null;

  let bits = '';
  for (const char of sanitized) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

function generateTotpCode(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = (hmac.at(-1) || 0) & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Devolve o CONTADOR TOTP que casou com o código, ou null.
 *
 * Não é um booleano porque o contador é a identidade do código dentro da
 * janela — é o que permite marcar "este código já foi usado" sem guardar o
 * código em lugar nenhum (ver o anti-replay em handlers/admin/login.js).
 *
 * Aceita o segredo cifrado ou em claro: decifra antes de usar.
 */
function matchTotpCounter(
  secret,
  code,
  stepSeconds = TOTP_STEP_SECONDS,
  window = TOTP_DRIFT_WINDOW,
) {
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return null;
  }

  const secretBuffer = decodeBase32(decryptSecret(secret));
  if (!secretBuffer || secretBuffer.length === 0) {
    return null;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let drift = -window; drift <= window; drift += 1) {
    const counter = currentCounter + drift;
    if (timingSafeEqualStrings(normalizedCode, generateTotpCode(secretBuffer, counter))) {
      return counter;
    }
  }

  return null;
}

// ─── Leitura da config ───────────────────────────────────────────────

function isSecondFactorRequired(adminConfig) {
  return Boolean(
    adminConfig?.requireSecondFactor || adminConfig?.require2FA || adminConfig?.twoFactorEnabled,
  );
}

function extractSecondFactorMethods(adminConfig) {
  const methods = [];
  if (String(adminConfig?.totpSecret || '').trim()) {
    methods.push('totp');
  }

  const allowPinFallback = adminConfig?.allowPinFallback !== false;
  if (allowPinFallback && String(adminConfig?.fallbackPin || '').trim()) {
    methods.push('pin');
  }

  return methods;
}

/**
 * Confere um código de 2º fator contra a config vigente, SEM efeito colateral
 * (não consome marcas de uso único). Usado por `handlers/admin/settings.js`
 * para exigir reautenticação antes de alterar campos sensíveis de segurança.
 */
function verifySecondFactorCode(adminConfig, code) {
  const methods = extractSecondFactorMethods(adminConfig);
  if (methods.length === 0) return false;

  const normalized = String(code || '').trim();
  if (!normalized) return false;

  if (methods.includes('totp') && matchTotpCounter(adminConfig?.totpSecret, normalized) !== null) {
    return true;
  }

  return methods.includes('pin') && verifyPin(adminConfig?.fallbackPin, normalized);
}

module.exports = {
  TOTP_STEP_SECONDS,
  TOTP_DRIFT_WINDOW,
  decodeBase32,
  generateTotpCode,
  matchTotpCounter,
  isSecondFactorRequired,
  extractSecondFactorMethods,
  verifySecondFactorCode,
  encryptSecret,
  decryptSecret,
  isEncrypted,
  hashPin,
  verifyPin,
  isHashedPin,
  timingSafeEqualStrings,
};
