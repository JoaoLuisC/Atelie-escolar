// Mensagem de erro para a dona da loja, não para o console.
//
// Toda falha de rede do painel aparecia como "Failed to fetch" — o texto cru
// que o `fetch` do navegador lança (ADM-03/ADM-05/ADM-44/ADM-50). Erros da API
// já chegam em português pelo envelope (`error.message`); só o erro de REDE
// precisa de tradução.
const NETWORK_MESSAGES = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /network request failed/i,
];

export const NETWORK_ERROR_MESSAGE =
  'Sem conexão com o servidor. Verifique a internet e tente de novo.';

export function isNetworkError(error) {
  const message = String(error?.message || '');
  return NETWORK_MESSAGES.some((re) => re.test(message));
}

export function friendlyAdminError(error, fallback = 'Algo deu errado. Tente de novo.') {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  return String(error?.message || '').trim() || fallback;
}
