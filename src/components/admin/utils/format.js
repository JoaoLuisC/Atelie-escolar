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
 * ── O QUE MUDOU (regra A2, item P0.1) ───────────────────────────────
 * Esta função decidia isso lendo o TEXTO da mensagem de erro:
 *
 *     String(error?.message || '').toLowerCase().includes('sessao admin')
 *
 * Era o exemplo citado na regra A2, e não era hipótese: a mensagem que o
 * backend mandava era `'Sessão admin inválida ou expirada.'`, COM acento, e
 * o `includes` procurava `'sessao admin'` SEM acento. O resultado era `false`
 * sempre — `onAuthExpired()` nunca disparava e a dona da loja via um erro
 * genérico em vez de voltar para o login.
 *
 * O fallback saiu junto com a correção, como o P0.1 pede. Ele só se
 * justificava enquanto houvesse resposta antiga em cache de navegador; a
 * partir do momento em que o `code` é emitido e testado dos dois lados, ele
 * é ruído — e ruído que casa por acidente com QUALQUER mensagem que contenha
 * aquele trecho, inclusive uma que não seja de sessão.
 *
 * @param {Error & { code?: string }} error
 */
export function isSessionError(error) {
  const code = error?.code || error?.errorCode;
  return code === ERROR_CODES.ADMIN_SESSION_INVALID || code === ERROR_CODES.UNAUTHORIZED;
}
