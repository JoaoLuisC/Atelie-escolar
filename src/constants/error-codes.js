// ════════════════════════════════════════════════════════════════════
// Espelho dos códigos de erro da API (regra A2), para o browser.
//
// ── POR QUE É UMA CÓPIA, E NÃO UM IMPORT ────────────────────────────
// O catálogo canônico vive em `lib/http.js`, que é CommonJS e roda em Node —
// importá-lo aqui arrastaria o módulo (e o que ele exige) para o bundle do
// browser. A duplicação é deliberada, mas NÃO é livre: o teste em
// `src/constants/__tests__/error-codes.test.js` falha se qualquer código deste
// arquivo deixar de existir no catálogo do backend.
//
// Ou seja: divergir é permitido no sentido "o front não precisa conhecer todos
// os códigos", e proibido no sentido "o front inventar um código que o backend
// nunca emite" — que é o erro que produziria um `if` morto para sempre.
//
// Só entram aqui os códigos em que o CLIENTE realmente ramifica. Mensagem para
// a pessoa vem do backend, em `error.message`; código é para a máquina.
// ════════════════════════════════════════════════════════════════════

export const ERROR_CODES = Object.freeze({
  // Sessão — disparam re-login.
  UNAUTHORIZED: 'UNAUTHORIZED',
  ADMIN_SESSION_INVALID: 'ADMIN_SESSION_INVALID',
  CUSTOMER_SESSION_INVALID: 'CUSTOMER_SESSION_INVALID',

  // Cupom — a tela mostra tratamento diferente por motivo.
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_EXHAUSTED: 'COUPON_EXHAUSTED',
  COUPON_MINIMUM_NOT_MET: 'COUPON_MINIMUM_NOT_MET',
  COUPON_NOT_ELIGIBLE: 'COUPON_NOT_ELIGIBLE',

  // Download — distinguir "link errado" de "já usei" de "passou do prazo".
  DOWNLOAD_TOKEN_INVALID: 'DOWNLOAD_TOKEN_INVALID',
  DOWNLOAD_TOKEN_USED: 'DOWNLOAD_TOKEN_USED',
  DOWNLOAD_TOKEN_EXPIRED: 'DOWNLOAD_TOKEN_EXPIRED',

  // Inscrição.
  CONFIRMATION_EXPIRED: 'CONFIRMATION_EXPIRED',

  // Genéricos úteis para o cliente.
  NOT_FOUND: 'NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
});

/**
 * A sessão do admin expirou?
 *
 * ── POR QUE MORA AQUI (regra C4, item P5.3) ─────────────────────────
 * Estava em `src/components/admin/utils/format.js`, um arquivo que exportava
 * ESTA ÚNICA função — que não formata nada, classifica erro. O nome do arquivo
 * dizia uma coisa e o conteúdo fazia outra, e a pasta sugeria "utilitário de
 * formatação do admin" onde havia lógica de sessão.
 *
 * Mora junto do catálogo de códigos porque é DELE que vem o dado em que ela
 * ramifica: quem acrescentar um código de sessão ao catálogo vê, na linha
 * seguinte, a função que precisa conhecê-lo.
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
  const code = error?.code;
  return code === ERROR_CODES.ADMIN_SESSION_INVALID || code === ERROR_CODES.UNAUTHORIZED;
}
