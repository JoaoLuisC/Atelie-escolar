// ════════════════════════════════════════════════════════════════════
// Regras da aba Segurança, fora do JSX — mesma razão de
// `product-wizard-form.js`: o que decide se o 2FA pode ser salvo é puro, e
// precisa de teste sem montar componente. O servidor (handlers/admin/settings.js)
// aplica as mesmas travas; aqui elas existem para a mensagem chegar ANTES do
// envio, em português e no lugar certo da tela.
// ════════════════════════════════════════════════════════════════════

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Configs antigas guardaram flags como string ("true"); o login aceita as duas. */
export function isFlagOn(value) {
  return (
    value === true ||
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

/**
 * Por que o salvamento NÃO pode seguir, ou `null` quando pode.
 *
 * @param {object} estado
 * @param {boolean} estado.enabled           checkbox "Exigir 2FA" marcado
 * @param {boolean} estado.requiredNow       2FA exigido na config gravada
 * @param {boolean} estado.enforcedNow       exigido E com método funcionando
 * @param {boolean} estado.has2FA            já há segredo TOTP gravado
 * @param {boolean} estado.hasPin            já há PIN gravado
 * @param {boolean} estado.pinAllowed        `allowPinFallback !== false`
 * @param {string}  estado.nextTotp          segredo TOTP novo digitado
 * @param {string}  estado.nextPin           PIN novo digitado
 * @param {string}  estado.totpVerificationCode  código do app para o segredo novo
 * @param {string}  estado.confirmationCode  código do fator vigente
 * @returns {string|null}
 */
export function securitySaveProblem({
  enabled,
  requiredNow = false,
  enforcedNow = false,
  has2FA = false,
  hasPin = false,
  pinAllowed = true,
  nextTotp = '',
  nextPin = '',
  totpVerificationCode = '',
  confirmationCode = '',
}) {
  const totpNovo = String(nextTotp || '').trim();
  const pinNovo = String(nextPin || '').trim();

  // ADM-38: exigir 2FA sem nenhum método tranca o admin fora.
  const temTotp = has2FA || Boolean(totpNovo);
  const temPin = pinAllowed && (hasPin || Boolean(pinNovo));
  if (enabled && !temTotp && !temPin) {
    return 'Para exigir 2FA, cadastre antes o segredo TOTP ou o PIN de recuperação — sem nenhum dos dois, o login ficaria impossível.';
  }

  if (totpNovo && !/^\d{6}$/.test(String(totpVerificationCode || '').trim())) {
    return 'Digite o código de 6 dígitos que o app autenticador gerou com o novo segredo.';
  }

  // Com o 2FA em vigor, o servidor recusa (403) qualquer mudança de segurança
  // sem o código atual. Avisar antes poupa uma tentativa do limite de 5/10 min.
  const mudouAlgo = enabled !== requiredNow || Boolean(totpNovo) || Boolean(pinNovo);
  if (enforcedNow && mudouAlgo && !String(confirmationCode || '').trim()) {
    return 'Com o 2FA em vigor, informe o código atual do app (ou o PIN de recuperação) para confirmar a alteração.';
  }

  return null;
}

/**
 * Segredo TOTP novo: 20 bytes aleatórios (160 bits, o tamanho da RFC 4226)
 * em Base32 — 32 caracteres, acima do mínimo de 16 do servidor.
 */
export function generateTotpSecret(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let secret = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += BASE32_ALPHABET[Number.parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
}

function defaultRandomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
