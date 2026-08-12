export const ADMIN_LOGIN_PATH = '/painel-acesso-privado-atelie';
export const CUSTOMER_RESET_PASSWORD_PATH = '/reset-password';

/**
 * Aceita apenas caminho relativo à própria origem. Sem isto, `?redirect=` vira
 * open redirect: `//evil.com` e `https://evil.com` são destinos válidos para
 * `navigate()` e para o `redirect_to` do OAuth, o que permite montar um link
 * com o domínio real da loja que leva o cliente logado a um site de phishing.
 *
 * Espelha `sanitizeRelativeRedirect` em lib/customer-auth-handlers.js — os dois
 * lados precisam concordar, porque o parâmetro atravessa o fluxo OAuth.
 *
 * @param {unknown} value  valor cru vindo da query string
 * @param {string} fallback destino quando o valor não é um caminho local
 */
export function sanitizeRedirectPath(value, fallback = '/checkout') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  // `//host` é protocol-relative; `://` cobre esquema absoluto; `\` é tratado
  // como `/` por vários navegadores em URLs.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://') || raw.includes('\\')) {
    return fallback;
  }
  return raw;
}
