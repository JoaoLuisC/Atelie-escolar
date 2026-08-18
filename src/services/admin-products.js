import { apiRequest, apiError } from '../utils/api';
import { ERROR_CODES } from '../constants/error-codes';

export async function fetchAdminProducts() {
  const { response, data } = await apiRequest('/admin/products', {
    credentials: 'include',
  });

  if (response.status === 401) {
    throw apiError(data, 'Sessão admin expirada. Faça login novamente.', {
      defaultCode: ERROR_CODES.ADMIN_SESSION_INVALID,
    });
  }

  if (!response.ok || !data.success) {
    throw apiError(data, 'Falha ao carregar produtos do admin.');
  }

  return data.products || [];
}

export async function createAdminProduct(payload) {
  const { response, data } = await apiRequest('/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok || !data.success) {
    throw apiError(data, 'Falha ao criar produto.');
  }

  return data;
}

export async function updateAdminProduct(payload) {
  const { response, data } = await apiRequest('/admin/products', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok || !data.success) {
    throw apiError(data, 'Falha ao atualizar produto.');
  }

  return data;
}

export async function deleteAdminProduct(id) {
  const { response, data } = await apiRequest(`/admin/products?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok || !data.success) {
    throw apiError(data, 'Falha ao remover produto.');
  }

  return data;
}
