import { apiError, apiRequest } from '../utils/api';

// ════════════════════════════════════════════════════════════════════
// Serviços do CHECKOUT — regra C2, item P5.1.
//
// `CheckoutPage.jsx` importava `apiRequest` direto e montava as três chamadas
// dentro do JSX. Não é organização pela organização: esta é a tela do caminho
// do dinheiro, e enquanto as chamadas moravam no componente não havia onde um
// teste as pegasse sem montar a página inteira — que é o motivo de o item P4.2
// listar `src/services/` como "0 de 8 com teste".
//
// É também o que torna uma troca de contrato (regra A1) uma edição em um
// arquivo em vez de uma caçada por JSX.
// ════════════════════════════════════════════════════════════════════

/**
 * Cria a preferência de pagamento e devolve a URL para onde levar a cliente.
 *
 * @returns {Promise<{ orderId: string, paymentUrl: string }>}
 * @throws  quando a API recusa, ou quando responde sem URL de pagamento
 */
export async function createPayment(payload) {
  const { response, data } = await apiRequest('/create-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !data.success) {
    throw apiError(data, 'Erro ao criar pagamento.');
  }

  const paymentUrl = data.initPoint || data.sandboxInitPoint;
  if (!paymentUrl) {
    // Falha explícita em vez de `undefined` viajando até o `window.open`: sem
    // isto, o navegador abre uma aba em branco e a cliente conclui que o
    // pagamento falhou sem nenhum erro na tela.
    throw new Error('URL de pagamento não retornada pela API.');
  }

  return { orderId: String(data.orderId || ''), paymentUrl };
}

/**
 * Consulta o estado do pagamento (polling da tela de obrigado).
 *
 * Devolve a `response` junto do corpo de propósito: a página precisa
 * distinguir 429 — que é o servidor pedindo ritmo, não falha — para aplicar
 * backoff sem limpar o pedido pendente.
 */
export async function verifyPayment({ orderId, email }) {
  // POST com o e-mail no CORPO (achado M6): na query string ele vazaria para
  // os access logs da Vercel, para o histórico do navegador e para o Referer.
  return apiRequest('/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, email }),
  });
}

/**
 * Registra o carrinho abandonado. NUNCA joga.
 *
 * É captura de marketing disparada por debounce enquanto a pessoa digita — uma
 * falha aqui não pode aparecer na tela nem interromper o checkout. `keepalive`
 * porque a captura precisa sobreviver ao fechamento da aba.
 */
export async function captureAbandonedCart(payload) {
  try {
    await apiRequest('/abandoned-cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}
