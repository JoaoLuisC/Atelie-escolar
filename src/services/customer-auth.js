const SUPABASE_URL = String(import.meta?.env?.VITE_SUPABASE_URL || import.meta?.env?.SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(import.meta?.env?.VITE_SUPABASE_ANON_KEY || import.meta?.env?.SUPABASE_ANON_KEY || '').trim();

function assertSupabaseAuthConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase Auth nao configurado. Defina VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ou SUPABASE_URL/SUPABASE_ANON_KEY.');
  }
}

function mapAuthErrorMessage(data = {}) {
  const code = String(data?.error_code || data?.code || '').trim().toLowerCase();
  const text = String(data?.msg || data?.message || data?.error_description || data?.error || '').trim();
  const full = `${code} ${text}`.toLowerCase();

  if (full.includes('invalid login credentials')) return 'E-mail ou senha invalidos.';
  if (full.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (full.includes('user already registered')) return 'Este e-mail ja esta cadastrado.';
  if (full.includes('password should be at least')) return 'Senha fraca. Use pelo menos 6 caracteres.';
  if (full.includes('provider is not enabled')) return 'Login com Google nao esta habilitado no Supabase.';
  if (full.includes('signup is disabled')) return 'Cadastro desabilitado no momento.';

  return text || 'Nao foi possivel autenticar agora.';
}

function toCustomerSession(payload = {}, fallbackName = '') {
  const user = payload?.user || {};
  const metadata = user?.user_metadata || {};
  return {
    uid: String(user.id || '').trim(),
    email: String(user.email || '').trim(),
    name: String(metadata.full_name || metadata.name || fallbackName || '').trim(),
    idToken: String(payload.access_token || '').trim(),
    refreshToken: String(payload.refresh_token || '').trim(),
  };
}

async function requestSupabaseAuth(pathname, options = {}) {
  assertSupabaseAuthConfig();

  const requestHeaders = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (options.headers) {
    Object.assign(requestHeaders, options.headers);
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/${String(pathname || '').replace(/^\/+/, '')}`, {
    ...options,
    headers: requestHeaders,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : { message: await response.text() };

  if (!response.ok) {
    throw new Error(mapAuthErrorMessage(data));
  }

  return data;
}

function persistCallbackSessionFromUrl() {
  if (!globalThis.window) {
    return null;
  }

  const hash = String(globalThis.window.location.hash || '').replace(/^#/, '');
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const accessToken = String(params.get('access_token') || '').trim();
  const refreshToken = String(params.get('refresh_token') || '').trim();
  const tokenType = String(params.get('token_type') || '').trim().toLowerCase();

  if (!accessToken || !refreshToken || tokenType !== 'bearer') {
    return null;
  }

  const cleanUrl = `${globalThis.window.location.pathname}${globalThis.window.location.search}`;
  globalThis.window.history.replaceState({}, document.title, cleanUrl);

  return { accessToken, refreshToken };
}

export async function loginCustomerWithEmail(email, password) {
  const data = await requestSupabaseAuth('token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  return toCustomerSession(data);
}

export async function registerCustomerWithEmail(name, email, password) {
  const data = await requestSupabaseAuth('signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      data: { name, full_name: name },
    }),
  });

  if (!data?.access_token) {
    // Supabase can require e-mail confirmation and not return immediate session.
    return {
      uid: String(data?.user?.id || '').trim(),
      email: String(data?.user?.email || email || '').trim(),
      name: String(name || '').trim(),
      idToken: '',
      refreshToken: '',
    };
  }

  return toCustomerSession(data, name || '');
}

export async function loginCustomerWithGoogle(postLoginRedirect = '/checkout') {
  assertSupabaseAuthConfig();

  if (!globalThis.window) {
    throw new TypeError('Login com Google disponivel apenas no navegador.');
  }

  const callbackUrl = new URL('/login', globalThis.window.location.origin);
  callbackUrl.searchParams.set('redirect', postLoginRedirect || '/checkout');

  const authorizeUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('redirect_to', callbackUrl.toString());

  globalThis.window.location.assign(authorizeUrl.toString());
}

export async function consumeCustomerSessionFromAuthCallback() {
  const tokenData = persistCallbackSessionFromUrl();
  if (!tokenData) {
    return null;
  }

  const data = await requestSupabaseAuth('user', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return toCustomerSession(
    {
      user: data,
      access_token: tokenData.accessToken,
      refresh_token: tokenData.refreshToken,
    },
  );
}

export async function logoutCustomerFromSupabase(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) {
    return;
  }

  try {
    await requestSupabaseAuth('logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Logout local always continues even if remote token is expired/revoked.
  }
}
