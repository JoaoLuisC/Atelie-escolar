import { ERROR_CODES } from '../../../constants/error-codes';

// As funções de data que moravam aqui (`toDateSafe`, `formatDateTime`,
// `formatToday`) foram para `src/utils/date.js` pela regra C4: nenhuma delas
// tem qualquer relação com o painel, e utilitário genérico escondido dentro da
// pasta de um componente é utilitário que a próxima tela reescreve.
//
// Sobra aqui o que É específico do admin.

/**
 * A sessão do admin expirou?
 *
 * ── O QUE MUDOU (regra A2) ──────────────────────────────────────────
 * Esta função decidia isso lendo o TEXTO da mensagem de erro:
 *
 *     String(error?.message || '').toLowerCase().includes('sessao admin')
 *
 * Era o exemplo citado na regra A2, e o problema não é estilo: reescrever a
 * frase em português no backend — trocar "sessao admin" por "sessão de
 * administrador", por exemplo — quebrava o fluxo de re-login em silêncio, sem
 * nenhum teste que pegasse. E o `includes` casava por acaso com qualquer outra
 * mensagem que contivesse aquele trecho.
 *
 * Agora o backend devolve `error.code` estável e `src/utils/api.js` o expõe
 * como `errorCode`. O texto continua aceito como FALLBACK apenas enquanto
 * houver resposta antiga em cache no navegador de alguém; pode sair depois.
 *
 * @param {Error & { code?: string }} error
 */
export function isSessionError(error) {
  const code = error?.code || error?.errorCode;
  if (code === ERROR_CODES.ADMIN_SESSION_INVALID || code === ERROR_CODES.UNAUTHORIZED) {
    return true;
  }

  return String(error?.message || '')
    .toLowerCase()
    .includes('sessao admin');
}
