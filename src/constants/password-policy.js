// Política de senha das telas (cadastro, checkout, redefinição). Espelha
// lib/password-policy.js — o teste lib/__tests__/password-policy.test.js
// garante que as duas regex são idênticas.
//
// "Caractere especial" é UM DOS símbolos que o Supabase Auth aceita
// (scripts/configure-auth.js grava a mesma lista): acento, ç ou espaço não
// contam — senão a tela aprovava `Márcia2026` e o Supabase recusava.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_SPECIAL_CHAR = /[!@#$%^&*()_+=[\]{};'\\:"|<>?,./`~-]/;
export const PASSWORD_SYMBOLS_HINT = '! @ # $ % & * ( ) - _ = + ? . , ; :';

/** Itens da regra, na ordem da lista de requisitos do cadastro. */
export function passwordChecks(password) {
  const value = String(password || '');
  return [
    [value.length >= PASSWORD_MIN_LENGTH, 'Pelo menos 8 caracteres'],
    [/[A-Z]/.test(value), 'Uma letra maiúscula'],
    [/[a-z]/.test(value), 'Uma letra minúscula'],
    [/\d/.test(value), 'Um número'],
    [PASSWORD_SPECIAL_CHAR.test(value), `Um símbolo (${PASSWORD_SYMBOLS_HINT})`],
  ];
}

export function isStrongPassword(password) {
  return passwordChecks(password).every(([met]) => met);
}
