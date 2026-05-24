import { getApiBaseUrl } from '../utils/api';

export async function fetchProducts() {
  const response = await fetch(`${getApiBaseUrl()}/products`);

  if (!response.ok) {
    throw new Error(`Falha ao carregar produtos: ${response.status}`);
  }

  const payload = await response.json();
  return payload.products || [];
}

export async function fetchHomeSections() {
  const response = await fetch(`${getApiBaseUrl()}/home-sections`);

  if (!response.ok) {
    throw new Error(`Falha ao carregar vitrine: ${response.status}`);
  }

  const payload = await response.json();
  return payload.sections || [];
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
  const response = await fetch(`${getApiBaseUrl()}/product-details?${param}=${encodeURIComponent(value)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Falha ao carregar produto: ${response.status}`);
  }

  const payload = await response.json();
  return payload.product || null;
}

// Compatibilidade com chamadas legadas. Marcar como deprecated.
export const fetchProductById = fetchProductByIdentifier;
