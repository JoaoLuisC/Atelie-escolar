import { apiRequest } from '../utils/api';

// LOJA-15: sem rede, o `fetch` joga um TypeError com o texto do navegador
// ("Failed to fetch", "Load failed", "NetworkError…"), e era ESSE texto que
// aparecia cru na home, no catálogo e na página de produto. Aqui ele vira uma
// frase para a pessoa; a tela oferece "Tentar novamente".
export const NETWORK_ERROR_MESSAGE =
  'Não conseguimos falar com a loja. Verifique sua conexão e tente novamente.';

async function catalogRequest(path) {
  try {
    return await apiRequest(path);
  } catch (error) {
    if (error instanceof TypeError) throw new Error(NETWORK_ERROR_MESSAGE);
    throw error;
  }
}

export async function fetchProducts() {
  const { response, data } = await catalogRequest('/products');

  if (!response.ok) {
    throw new Error(`Não foi possível carregar os produtos agora (erro ${response.status}).`);
  }

  return data.products || [];
}

export async function fetchHomeSections() {
  const { response, data } = await catalogRequest('/home-sections');

  if (!response.ok) {
    throw new Error(`Não foi possível carregar a vitrine agora (erro ${response.status}).`);
  }

  return data.sections || [];
}

// `products.id` é UUID. Só esse formato vai como `id`; todo o resto (inclusive
// número puro, que a regra antiga mandava como id bigint e a API respondia 500
// — LOJA-05) é slug.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Busca um produto por slug OU id (UUID). Devolve `null` quando não existe.
 */
export async function fetchProductByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  const param = UUID_RE.test(value) ? 'id' : 'slug';
  const { response, data } = await catalogRequest(
    `/product-details?${param}=${encodeURIComponent(value)}`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Não foi possível carregar o produto agora (erro ${response.status}).`);
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
  const { products } = await fetchCrossSellSuggestions(productId, { signal });
  return products;
}

/**
 * Igual a `fetchCrossSell`, mas devolve também a `strategy` da API
 * (`co_occurrence` | `same_category`). LOJA-21: o título "Quem comprou este
 * levou também" só é verdade na primeira; na segunda são só produtos da mesma
 * categoria.
 *
 * @returns {Promise<{ products: object[], strategy: string }>}
 */
export async function fetchCrossSellSuggestions(productId, { signal } = {}) {
  const value = String(productId || '').trim();
  if (!value) return { products: [], strategy: '' };

  try {
    const { data } = await apiRequest(`/cross-sell?productId=${encodeURIComponent(value)}`, {
      signal,
    });
    return {
      products: Array.isArray(data?.products) ? data.products : [],
      strategy: typeof data?.strategy === 'string' ? data.strategy : '',
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { products: [], strategy: '' };
  }
}

// Compatibilidade com chamadas legadas. Marcar como deprecated.
export const fetchProductById = fetchProductByIdentifier;
