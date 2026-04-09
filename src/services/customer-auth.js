const FIREBASE_WEB_API_KEY =
  import.meta?.env?.VITE_FIREBASE_API_KEY ||
  'AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk';

const AUTH_BASE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';

async function requestFirebaseAuth(endpoint, payload) {
  const response = await fetch(`${AUTH_BASE_URL}:${endpoint}?key=${FIREBASE_WEB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const code = data?.error?.message || 'AUTH_ERROR';
    const humanMap = {
      EMAIL_EXISTS: 'Este e-mail ja esta cadastrado.',
      INVALID_PASSWORD: 'Senha incorreta.',
      EMAIL_NOT_FOUND: 'Conta nao encontrada para este e-mail.',
      WEAK_PASSWORD: 'Senha fraca. Use pelo menos 6 caracteres.',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'Muitas tentativas. Tente novamente em alguns minutos.',
      USER_DISABLED: 'Conta desativada.',
    };

    throw new Error(humanMap[code] || 'Nao foi possivel autenticar agora.');
  }

  return data;
}

export async function loginCustomerWithEmail(email, password) {
  const data = await requestFirebaseAuth('signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });

  return {
    uid: data.localId,
    email: data.email,
    name: data.displayName || '',
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  };
}

export async function registerCustomerWithEmail(name, email, password) {
  const data = await requestFirebaseAuth('signUp', {
    email,
    password,
    returnSecureToken: true,
  });

  return {
    uid: data.localId,
    email: data.email,
    name: name || '',
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  };
}
