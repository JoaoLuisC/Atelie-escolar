import { apiRequest } from '../utils/api';

// Cabeçalho e rodapé são compartilhados por todas as páginas da loja.
export async function fetchStoreSettings() {
  const { response, data } = await apiRequest('/home-content');
  if (!response.ok) throw new Error('Não foi possível carregar as configurações da loja.');
  return data.content || {};
}
