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
    // O cookie de sessão vai junto (LOJA-40): logado, o backend usa o e-mail
    // da CONTA, não o do formulário. Em dev a API é outra origem (porta 3000),
    // e sem `include` o cookie não atravessaria.
    credentials: 'include',
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
 * Preço ATUAL de cada item do carrinho, lido do banco (CROSS-03).
 *
 * O carrinho guarda o preço do momento em que o item entrou; o create-payment
 * cobra o preço de agora. Sem esta consulta, depois de uma mudança de preço no
 * painel a tela mostrava um total e o Mercado Pago cobrava outro. Usa o modo
 * cotação de /validate-coupon (`quote: true`) — o mesmo cálculo da prévia de
 * cupom, sem cupom.
 *
 * @returns {Promise<Array<{ productId: string, name: string|null, price: number,
 *   categoryId: string|null, available: boolean }>>}
 * @throws  quando a API falha — quem chama decide se segue com o preço guardado
 */
export async function quoteCart(cart = []) {
  const { response, data } = await apiRequest('/validate-coupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quote: true,
      items: (Array.isArray(cart) ? cart : []).map((item) => ({
        productId: String(item.id),
        quantity: Number(item.quantity || 1),
      })),
    }),
  });

  if (!response.ok || !data.success || !Array.isArray(data.items)) {
    throw apiError(data, 'Não foi possível atualizar os preços do carrinho.');
  }

  return data.items;
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
