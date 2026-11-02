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

const PASSWORD_RULE_MESSAGE =
  'A senha precisa ter ao menos 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.';

/**
 * 8+ caracteres, com minúscula, maiúscula, número e caractere especial
 * (qualquer coisa que não seja letra ASCII, dígito ou espaço).
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
    /[^A-Za-z0-9\s]/.test(value)
  );
}

module.exports = { PASSWORD_RULE_MESSAGE, isStrongPassword };
