import { apiRequest } from '../utils/api';

export async function fetchAdminProducts() {
  const { response, data } = await apiRequest('/admin/products', {
    credentials: 'include',
  });

  if (response.status === 401) {
    throw new Error('Sessão admin expirada. Faça login novamente.');
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Falha ao carregar produtos do admin.');
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
    throw new Error(data.error || 'Falha ao criar produto.');
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
    throw new Error(data.error || 'Falha ao atualizar produto.');
  }

  return data;
}

export async function deleteAdminProduct(id) {
  const { response, data } = await apiRequest(`/admin/products?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Falha ao remover produto.');
  }

  return data;
}
