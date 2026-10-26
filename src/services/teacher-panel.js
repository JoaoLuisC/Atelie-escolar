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
