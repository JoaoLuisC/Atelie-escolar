import { apiRequest } from '../utils/api';

export async function fetchProducts() {
  const { response, data } = await apiRequest('/products');

  if (!response.ok) {
    throw new Error(`Falha ao carregar produtos: ${response.status}`);
  }

  return data.products || [];
}

export async function fetchHomeSections() {
  const { response, data } = await apiRequest('/home-sections');

  if (!response.ok) {
    throw new Error(`Falha ao carregar vitrine: ${response.status}`);
  }

  return data.sections || [];
}

/**
 * Busca um produto por slug OU id legado. O backend decide qual coluna
 * usar (id se for numérico puro, slug caso contrário).
 */
export async function fetchProductByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  const isNumeric = /^\d+$/.test(value);
  const param = isNumeric ? 'id' : 'slug';
  const { response, data } = await apiRequest(
    `/product-details?${param}=${encodeURIComponent(value)}`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Falha ao carregar produto: ${response.status}`);
  }

  return data.product || null;
}

/**
 * Produtos relacionados ao que está sendo visto (regra C2).
 *
 * `signal` é aceito porque a seção monta dentro de um `useEffect` que precisa
 * cancelar ao trocar de produto — sem isso, a resposta de um produto antigo
 * pode chegar depois e sobrescrever a lista do produto atual.
 *
 * Nunca joga: cross-sell é enfeite. Uma falha aqui não pode derrubar a página
 * de produto, então o erro vira lista vazia e a seção some.
 */
export async function fetchCrossSell(productId, { signal } = {}) {
  const value = String(productId || '').trim();
  if (!value) return [];

  try {
    const { data } = await apiRequest(`/cross-sell?productId=${encodeURIComponent(value)}`, {
      signal,
    });
    return Array.isArray(data?.products) ? data.products : [];
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return [];
  }
}

// Compatibilidade com chamadas legadas. Marcar como deprecated.
export const fetchProductById = fetchProductByIdentifier;
