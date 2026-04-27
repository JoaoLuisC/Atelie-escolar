import { apiRequest, getApiBaseUrl } from '../utils/api';

const INVALID_CREDENTIALS_MESSAGE = 'Credenciais invalidas.';

function parseOAuthTokensFromHash() {
  if (!globalThis.window) {
    return null;
  }

  const hash = String(globalThis.window.location.hash || '').replace(/^#/, '');
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const accessToken = String(params.get('access_token') || '').trim();
  const tokenType = String(params.get('token_type') || '').trim().toLowerCase();

  if (!accessToken || tokenType !== 'bearer') {
    return null;
  }

  return { accessToken };
}

function clearOAuthHashFromUrl() {
  if (!globalThis.window) {
    return;
  }

  const cleanUrl = `${globalThis.window.location.pathname}${globalThis.window.location.search}`;
  globalThis.window.history.replaceState({}, document.title, cleanUrl);
}

function normalizeUser(user = {}) {
  const uid = String(user.uid || user.id || '').trim();
  const email = String(user.email || '').trim();
  const name = String(user.name || '').trim();

  if (!uid || !email) {
    return null;
  }

  return { uid, email, name };
}

function ensureAuthSuccess(response, data, fallbackMessage = INVALID_CREDENTIALS_MESSAGE) {
  if (!response.ok || data?.success !== true) {
    throw new Error(fallbackMessage);
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

  ensureAuthSuccess(response, data, INVALID_CREDENTIALS_MESSAGE);

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

export async function loginCustomerWithGoogle(postLoginRedirect = '/checkout') {
  if (!globalThis.window) {
    throw new TypeError('Login com Google disponivel apenas no navegador.');
  }

  const redirect = String(postLoginRedirect || '/checkout').trim() || '/checkout';
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const target = `${baseUrl}/auth/customer/google/start?redirect=${encodeURIComponent(redirect)}`;

  globalThis.window.location.assign(target);
}

export async function consumeCustomerSessionFromAuthCallback() {
  const tokenData = parseOAuthTokensFromHash();
  if (!tokenData) {
    return null;
  }

  const { response, data } = await apiRequest('/auth/customer/google/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(tokenData),
  });

  clearOAuthHashFromUrl();

  ensureAuthSuccess(response, data, INVALID_CREDENTIALS_MESSAGE);
  return normalizeUser(data.user);
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

export async function logoutCustomerSession() {
  await apiRequest('/auth/customer/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
