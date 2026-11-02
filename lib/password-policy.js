// ════════════════════════════════════════════════════════════════════
// POLÍTICA DE SENHA — um lugar só.
//
// A mesma regra vale no cadastro de cliente (lib/customer-auth-handlers.js),
// na troca de senha da equipe pela aba "Minha conta" (lib/staff-account.js)
// e na tradução do "weak_password" que o Supabase Auth devolve — e espelha o
// `password_requirements` de supabase/config.toml. Antes eram três cópias da
// regex e duas redações da mensagem; uma mudança num lugar deixava as outras
// dizendo ao cliente uma regra que o servidor já não aplicava.
// ════════════════════════════════════════════════════════════════════

const MIN_LENGTH = 8;

// Os símbolos que o Supabase Auth aceita (scripts/configure-auth.js grava a
// mesma lista). Acento, ç e espaço NÃO contam: com "qualquer não alfanumérico"
// a regra local aprovava `Márcia2026` e o Supabase recusava. A cópia das telas
// é src/constants/password-policy.js (o teste compara as duas).
const SPECIAL_CHAR = /[!@#$%^&*()_+=[\]{};'\\:"|<>?,./`~-]/;

const PASSWORD_RULE_MESSAGE =
  'A senha precisa ter ao menos 8 caracteres, com letra maiúscula, minúscula, número e caractere especial (! @ # $ % & * e outros; acento não conta).';

/**
 * 8+ caracteres, com minúscula, maiúscula, número e um dos símbolos aceitos
 * pelo Supabase Auth (SPECIAL_CHAR).
 *
 * @param {unknown} password
 * @returns {boolean}
 */
function isStrongPassword(password) {
  const value = String(password || '');
  return (
    value.length >= MIN_LENGTH &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    SPECIAL_CHAR.test(value)
  );
}

module.exports = { PASSWORD_RULE_MESSAGE, SPECIAL_CHAR, isStrongPassword };
