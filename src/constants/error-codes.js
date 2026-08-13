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
