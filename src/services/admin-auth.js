import { apiRequest, apiError } from '../utils/api';

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
  };
}
