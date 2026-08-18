import { apiError, apiRequest, getApiBaseUrl } from '../utils/api';

// ════════════════════════════════════════════════════════════════════
// Serviços da ÁREA DE DOWNLOADS — regra C2, item P5.1.
//
// `DownloadsPage.jsx` importava `apiRequest` E `getApiBaseUrl` direto. É a tela
// da ENTREGA: se ela falha, a cliente pagou e não recebeu. Trazer as chamadas
// para cá é o que permite testá-las sem montar a página — e a página é uma das
// maiores do projeto, com polling, troca de pedido e cancelamento.
// ════════════════════════════════════════════════════════════════════

/**
 * Estado do pedido, por `orderId` + e-mail.
 *
 * `signal` é aceito e REPASSADO porque a tela troca de pedido e desmonta: sem
 * ele, a resposta de um pedido antigo chega depois e sobrescreve a do atual.
 * `apiRequest` compõe esse sinal com o timeout de 15s em vez de substituí-lo —
 * era essa substituição que fazia esta tela usar `fetch` cru (regra C1).
 *
 * Devolve `{ response, data }` porque a página distingue 401 e 429 do erro
 * comum, e o status é a única forma de fazer isso sem ramificar por texto.
 */
export async function fetchOrderStatus({ orderId, email, signal } = {}) {
  // POST com e-mail no CORPO (achado M6): na query string ele vaza para
  // access logs, histórico do navegador e header Referer.
  return apiRequest('/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, email }),
    signal,
  });
}

/**
 * Pedidos da conta logada (cookie HttpOnly de sessão de cliente).
 *
 * O 401 NÃO vira exceção: "sua sessão expirou" é um estado da tela, com texto
 * próprio e um caminho de volta para o login, não uma falha a ser jogada num
 * toast genérico.
 *
 * @returns {Promise<{ orders: Array, sessionExpired: boolean }>}
 */
export async function fetchMyOrders({ signal } = {}) {
  const { response, data } = await apiRequest('/customer-orders', {
    credentials: 'include',
    signal,
  });

  if (response.status === 401) {
    return { orders: [], sessionExpired: true };
  }

  if (!response.ok || !data.success) {
    throw apiError(data, 'Não foi possível carregar os pedidos.');
  }

  return { orders: data.orders || [], sessionExpired: false };
}

/**
 * URL de download de um token.
 *
 * É `<a href>` de propósito, e NÃO passa por `apiRequest`: o navegador precisa
 * navegar até a resposta para receber o redirect 302 para a URL assinada do
 * Storage. Buscar por `fetch` traria os bytes para dentro do JS sem entregar
 * arquivo nenhum.
 */
export function buildDownloadUrl(token) {
  return `${getApiBaseUrl()}/download?token=${encodeURIComponent(token)}`;
}
