import { apiError, apiRequest } from '../utils/api';

export async function fetchTeacherDashboard() {
  const { response, data } = await apiRequest('/teacher/dashboard', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok || !data.success) {
    throw apiError(data, 'Não foi possível carregar seu painel.');
  }
  return data;
}

export async function createTeacherProduct(payload) {
  const { response, data } = await apiRequest('/teacher/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok || !data.success) {
    throw apiError(data, 'Não foi possível criar o produto.');
  }
  return data;
}

export async function setTeacherProductActive(id, active) {
  const { response, data } = await apiRequest('/teacher/products', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, active }),
  });
  if (!response.ok || !data.success) {
    throw apiError(data, 'Não foi possível atualizar o produto.');
  }
  return data;
}

// Aba "Minha conta" (handlers/teacher/account.js): vale para qualquer sessão
// de staff — professor(a), dona da loja ou admin.
export async function fetchMyAccount() {
  const { response, data } = await apiRequest('/teacher/account', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok || !data.success) {
    throw apiError(data, 'Não foi possível carregar sua conta.');
  }
  return data.account;
}

export async function updateMyAccount({ displayName }) {
  const { response, data } = await apiRequest('/teacher/account', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok || !data.success) {
    throw apiError(data, 'Não foi possível salvar sua conta.');
  }
  return data.account;
}

// Troca de senha e de e-mail da própria conta: as duas pedem a senha atual.
async function postAccountAction(payload, fallback) {
  const { response, data } = await apiRequest('/teacher/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok || !data.success) throw apiError(data, fallback);
  return data;
}

export function changeMyPassword({ currentPassword, newPassword }) {
  return postAccountAction(
    { action: 'change-password', currentPassword, newPassword },
    'Não foi possível trocar a senha.',
  );
}

export function requestMyEmailChange({ currentPassword, newEmail }) {
  return postAccountAction(
    { action: 'change-email', currentPassword, newEmail },
    'Não foi possível pedir a troca de e-mail.',
  );
}
