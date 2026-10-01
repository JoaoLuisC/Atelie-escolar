import { apiRequest, errorMessageOf } from '../utils/api';

// ════════════════════════════════════════════════════════════════════
// Serviços de INSCRIÇÃO — regra C2, item P5.1.
//
// `SubscriptionPages.jsx` importava `apiRequest` direto e montava as três
// chamadas dentro do componente. Elas têm em comum uma coisa que só fica
// visível quando ficam juntas: nenhuma delas trata falha como exceção. São
// telas de confirmação por link de e-mail, onde "não deu certo" É o conteúdo
// da página — e não um toast sobre uma tela vazia.
//
// Por isso todas devolvem um resultado com `ok`, em vez de jogar. Quem chama
// pinta o estado; ninguém precisa de try/catch para o caso comum.
//
// Exceção: falha de REDE. Aí não há resposta para pintar, e o `fetch` joga um
// TypeError com o texto do navegador ("Failed to fetch") — que era o que
// aparecia sozinho em /desinscrever (LOJA-15). Ele continua jogando, mas com
// uma frase para a pessoa; a página mostra "Tentar novamente".
// ════════════════════════════════════════════════════════════════════

export const SUBSCRIPTION_NETWORK_ERROR =
  'Não conseguimos falar com a loja. Verifique sua conexão e tente novamente.';

async function subscriptionRequest(path, options) {
  try {
    return await apiRequest(path, options);
  } catch (error) {
    if (error instanceof TypeError) throw new Error(SUBSCRIPTION_NETWORK_ERROR);
    throw error;
  }
}

/** @returns {Promise<{ ok: boolean, alreadyConfirmed: boolean, message: string }>} */
export async function confirmSubscription(token) {
  const { data } = await subscriptionRequest(
    `/confirm-subscription?token=${encodeURIComponent(token)}`,
  );

  if (!data.success) {
    return {
      ok: false,
      alreadyConfirmed: false,
      message: errorMessageOf(data) || 'Token inválido ou expirado.',
    };
  }

  return {
    ok: true,
    alreadyConfirmed: data.alreadyConfirmed === true,
    message: data.alreadyConfirmed
      ? 'Você já tinha confirmado antes — está tudo certo!'
      : 'Inscrição confirmada! Você vai receber as novidades por email.',
  };
}

/** Cancelamento por LINK do e-mail: o token já prova a posse. */
export async function unsubscribeByToken(token) {
  const { data } = await subscriptionRequest(`/unsubscribe?token=${encodeURIComponent(token)}`);

  return {
    ok: data.success === true,
    message: data.message || errorMessageOf(data) || 'Algo deu errado.',
  };
}

/**
 * Cancelamento por FORMULÁRIO: não há prova de posse, então o backend responde
 * de forma neutra e envia um e-mail de confirmação.
 *
 * `confirmationRequired` é o estado "enviamos o link e NADA foi removido
 * ainda". Ele vem num corpo de SUCESSO — antes era `success: false`, o que
 * pintava de erro uma operação que deu certo e obrigava o backend a mentir no
 * envelope da regra A1 (ver item P1.5).
 *
 * @returns {Promise<{ ok: boolean, confirmationRequired: boolean, message: string }>}
 */
export async function unsubscribeByEmail(email) {
  const { data } = await subscriptionRequest('/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  return {
    ok: data.success === true && data.confirmationRequired !== true,
    confirmationRequired: data.confirmationRequired === true,
    message: data.message || errorMessageOf(data) || 'Algo deu errado.',
  };
}
