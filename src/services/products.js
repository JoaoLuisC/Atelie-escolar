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

export async function fetchProductById(productId) {
  const response = await fetch(`${getApiBaseUrl()}/product-details?id=${encodeURIComponent(productId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Falha ao carregar produto: ${response.status}`);
  }

  const payload = await response.json();
  return payload.product || null;
}
