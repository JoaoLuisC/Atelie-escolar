import { apiRequest, apiError } from '../utils/api';
import { ERROR_CODES } from '../constants/error-codes';

// `cache: 'no-store'` em toda leitura do painel: dado de admin nunca pode vir
// do cache HTTP do navegador — nem depois de uma escrita, nem depois do logout
// (ADM-01/ADM-24 da validação de 2026-10-01).
export async function fetchAdminProducts() {
  const { response, data } = await apiRequest('/admin/products', {
    credentials: 'include',
    cache: 'no-store',
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

/**
 * Um produto com TODOS os campos editáveis (galeria, preço original, tipo,
 * FAQ, benefícios, depoimentos, status). É o que alimenta o wizard de edição:
 * a linha do /admin/dashboard é resumida, e editar a partir dela apagava o
 * que ela não trazia (ADM-23).
 */
export async function fetchAdminProduct(id) {
  const { response, data } = await apiRequest(`/admin/products?id=${encodeURIComponent(id)}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401) {
    throw apiError(data, 'Sessão admin expirada. Faça login novamente.', {
      defaultCode: ERROR_CODES.ADMIN_SESSION_INVALID,
    });
  }

  if (!response.ok || !data.success || !data.product) {
    throw apiError(data, 'Falha ao carregar o produto para edição.');
  }

  return data.product;
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
