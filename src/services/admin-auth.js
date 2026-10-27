import { apiRequest, apiError } from '../utils/api';
import {
  buildStaffOAuthRedirectUrl,
  getSupabaseBrowserClient,
  STAFF_OAUTH_MARKER,
} from './supabase-browser';

// `sendEmailCode: true` pede ao servidor um código por e-mail para o desafio
// atual (2º fator); a resposta traz um desafio novo, com o código selado.
export async function loginAdmin({
  username,
  password,
  factorCode,
  challengeToken,
  sendEmailCode,
}) {
  const { response, data } = await apiRequest('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: username,
      password,
      factorCode,
      challengeToken,
      ...(sendEmailCode ? { sendEmailCode: true } : {}),
    }),
  });

  if (response.ok && data.requiresSecondFactor === true) {
    return data;
  }

  if (!response.ok || !data.success) {
    throw apiError(data, 'Falha no login admin.');
  }

  return data;
}

export async function logoutAdmin() {
  const { response, data } = await apiRequest('/admin/logout', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok || !data.success) {
    throw apiError(data, 'Falha ao encerrar sessao admin.');
  }

  return data;
}

export async function getAdminSession() {
  const { response, data } = await apiRequest('/admin/session', {
    method: 'GET',
    credentials: 'include',
    // A resposta decide se o painel aparece: nunca do cache (ADM-41).
    cache: 'no-store',
  });

  if (!response.ok || data.success !== true) {
    throw apiError(data, 'Falha ao validar sessao admin.');
  }

  return {
    authenticated: data.authenticated === true,
    email: typeof data.email === 'string' ? data.email : '',
    role: typeof data.role === 'string' ? data.role.toLowerCase() : '',
    userId: typeof data.userId === 'string' ? data.userId : '',
  };
}

/**
 * Login de professor(a) com Google, ida: abre a escolha de conta do Google
 * pelo OAuth do Supabase (PKCE) e volta para `/admin?oauth=staff`.
 */
export async function startStaffGoogleLogin() {
  const supabase = await getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error('Configuração do Supabase ausente no frontend.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: buildStaffOAuthRedirectUrl(),
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) {
    throw new Error(error.message || 'Falha ao iniciar login com Google.');
  }
}

/**
 * Volta do Google: troca o token do Supabase pela sessão de staff
 * (`POST /admin/login-google`). Devolve `null` quando a URL não é a volta do
 * login de professor(a); lança com a mensagem do servidor quando a conta não
 * é de professor(a).
 */
export async function completeStaffGoogleLogin() {
  if (!globalThis.window) return null;
  const url = new URL(globalThis.window.location.href);
  if (url.searchParams.get('oauth') !== STAFF_OAUTH_MARKER) return null;

  const supabase = await getSupabaseBrowserClient();
  const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: null };
  const accessToken = sessionData?.session?.access_token;

  // Limpa `oauth`/`code` da URL já: um F5 não pode repetir a troca.
  url.searchParams.delete('oauth');
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  const oauthError = url.searchParams.get('error');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  url.hash = '';
  globalThis.window.history.replaceState({}, document.title, url.toString());

  if (!accessToken) {
    throw new Error(
      oauthError === 'access_denied'
        ? 'O login com Google foi cancelado.'
        : 'Não foi possível entrar com Google. Tente de novo.',
    );
  }

  try {
    const { response, data } = await apiRequest('/admin/login-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ accessToken }),
    });
    if (!response.ok || !data.success) {
      throw apiError(data, 'Falha no login com Google.');
    }
    return data;
  } finally {
    // A sessão vive no cookie HttpOnly; os tokens do Supabase saem do
    // localStorage (mesmo motivo do login do cliente: superfície de XSS).
    await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}
