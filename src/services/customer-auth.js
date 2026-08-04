import { apiRequest } from '../utils/api';
import { buildOAuthRedirectUrl, getSupabaseBrowserClient } from './supabase-browser';

const INVALID_CREDENTIALS_MESSAGE = 'Credenciais inválidas.';

function normalizeUser(user = {}) {
  const uid = String(user.uid || user.id || '').trim();
  const email = String(user.email || '').trim();
  const name = String(user.name || '').trim();
  const role = String(user.role || '').trim().toLowerCase();

  if (!uid || !email) {
    return null;
  }

  return { uid, email, name, role };
}

function ensureAuthSuccess(response, data, fallbackMessage = INVALID_CREDENTIALS_MESSAGE) {
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || fallbackMessage);
  }
}

export async function loginCustomerWithEmail(email, password) {
  const { response, data } = await apiRequest('/auth/customer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  ensureAuthSuccess(response, data, INVALID_CREDENTIALS_MESSAGE);

  const user = normalizeUser(data.user);
  if (!user) {
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
  }

  return user;
}

export async function registerCustomerWithEmail(name, email, password) {
  const { response, data } = await apiRequest('/auth/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, email, password }),
  });

  ensureAuthSuccess(response, data, data?.error || 'Não foi possível criar a conta.');

  if (data.verificationRequired) {
    return {
      verificationRequired: true,
      user: null,
    };
  }

  return {
    verificationRequired: false,
    user: normalizeUser(data.user),
  };
}

/**
 * Inicia o fluxo Google OAuth.
 * Usa o Supabase JS Client direto (PKCE) para evitar bugs do fluxo
 * implícito legado. O cliente armazena o `code_verifier` no
 * localStorage e troca o `code` por sessão automaticamente quando
 * o usuário volta para `/login?oauth=google&code=...`.
 */
export async function loginCustomerWithGoogle(postLoginRedirect = '/checkout') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error('Configuração do Supabase ausente no frontend.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: buildOAuthRedirectUrl(postLoginRedirect),
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha ao iniciar login com Google.');
  }
}

/**
 * Detecta retorno do callback OAuth do Google e sincroniza com o
 * backend (cria cookie HttpOnly de sessão do cliente).
 * Roda no mount do AuthProvider.
 */
export async function consumeCustomerSessionFromAuthCallback() {
  if (!globalThis.window) return null;

  const url = new URL(globalThis.window.location.href);
  const hasOAuthMarker = url.searchParams.get('oauth') === 'google'
    || url.searchParams.has('code')
    || url.hash.includes('access_token=');

  if (!hasOAuthMarker) return null;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  // O cliente já detecta automaticamente (detectSessionInUrl: true).
  // Esperamos a sessão estar disponível.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    cleanOAuthParamsFromUrl();
    return null;
  }

  const accessToken = sessionData.session.access_token;

  const { response, data } = await apiRequest('/auth/customer/google/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ accessToken }),
  });

  cleanOAuthParamsFromUrl();

  if (!response.ok || data?.success !== true) {
    return null;
  }

  // A sessão agora vive no cookie HttpOnly emitido pelo backend. Removemos
  // os tokens do Supabase (access/refresh) do localStorage para reduzir a
  // superfície de exfiltração por XSS — não dependemos mais deles no app.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

  return normalizeUser(data.user);
}

function cleanOAuthParamsFromUrl() {
  if (!globalThis.window) return;
  const url = new URL(globalThis.window.location.href);
  url.searchParams.delete('oauth');
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.hash = '';
  globalThis.window.history.replaceState({}, document.title, url.toString());
}

export async function fetchCustomerSession() {
  const { response, data } = await apiRequest('/auth/customer/session', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok || data?.success !== true || data?.authenticated !== true) {
    return null;
  }

  return normalizeUser(data.user);
}

/**
 * LGPD (§3.8) — passo 1: pede a exclusão da conta. O backend envia um
 * e-mail com link de confirmação. Requer sessão de cliente ativa.
 */
export async function requestAccountDeletion() {
  const { response, data } = await apiRequest('/me-delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });

  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || 'Não foi possível solicitar a exclusão da conta.');
  }

  return data;
}

/**
 * LGPD (§3.8) — passo 2: confirma a exclusão usando o token do e-mail.
 * O token é a autorização; não exige sessão.
 */
export async function confirmAccountDeletion(token) {
  const { response, data } = await apiRequest('/me-delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });

  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || 'Não foi possível concluir a exclusão da conta.');
  }

  return data;
}

export async function logoutCustomerSession() {
  // Limpa sessão do Supabase no browser (PKCE state, localStorage)
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
  // Limpa cookie HttpOnly do backend
  await apiRequest('/auth/customer/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
