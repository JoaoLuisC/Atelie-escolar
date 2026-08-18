import { apiRequest, apiError } from '../utils/api';

export async function loginAdmin({ username, password, factorCode, challengeToken }) {
  const { response, data } = await apiRequest('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: username, password, factorCode, challengeToken }),
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
  });

  if (!response.ok || data.success !== true) {
    throw apiError(data, 'Falha ao validar sessao admin.');
  }

  return { authenticated: data.authenticated === true };
}
