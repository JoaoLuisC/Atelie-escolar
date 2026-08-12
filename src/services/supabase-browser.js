import { createClient } from '@supabase/supabase-js';
import { CUSTOMER_RESET_PASSWORD_PATH, sanitizeRedirectPath } from '../constants/routes';

let supabaseBrowserClient = null;

function getSupabaseBrowserConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function getSupabaseBrowserClient() {
  if (supabaseBrowserClient) {
    return supabaseBrowserClient;
  }

  const config = getSupabaseBrowserConfig();
  if (!config) {
    return null;
  }

  supabaseBrowserClient = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  return supabaseBrowserClient;
}

export function buildPasswordResetRedirectUrl(postResetRedirect = '/checkout') {
  if (!globalThis.window) {
    throw new Error('Recuperacao de senha disponivel apenas no navegador.');
  }

  const safeRedirect = postResetRedirect === '/downloads' ? '/downloads' : '/checkout';
  const url = new URL(CUSTOMER_RESET_PASSWORD_PATH, globalThis.window.location.origin);
  url.searchParams.set('redirect', safeRedirect);

  return url.toString();
}

export function buildOAuthRedirectUrl(postLoginRedirect = '/checkout') {
  if (!globalThis.window) {
    throw new Error('Login com Google disponivel apenas no navegador.');
  }

  // Defesa em profundidade: o parâmetro atravessa o Google e volta em /login,
  // que é quem chama navigate(). Sanitizar aqui também impede que um destino
  // absoluto sobreviva à ida e volta do OAuth.
  const safeRedirect = sanitizeRedirectPath(postLoginRedirect);
  const url = new URL('/login', globalThis.window.location.origin);
  url.searchParams.set('oauth', 'google');
  url.searchParams.set('redirect', safeRedirect);
  return url.toString();
}
