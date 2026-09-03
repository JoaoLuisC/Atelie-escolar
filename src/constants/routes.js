// ════════════════════════════════════════════════════════════════════
// ROTAS DO APP — fonte única (regra C5).
//
// ── POR QUE CENTRALIZAR ─────────────────────────────────────────────
// A medição de 13/08/2026 encontrou 50 caminhos literais em `to="/…"` e
// `navigate('/…')` contra apenas 2 constantes definidas aqui. Caminho literal
// em JSX é uma rota que ninguém consegue renomear com segurança: o compilador
// não ajuda, o lint não ajuda, e o teste só pega se existir teste daquela tela.
//
// O caso que dói de verdade é o `PROFESSOR_LOGIN_PATH`. O caminho é feio de
// propósito (não é `/admin/login`) e por muito tempo a feiura era a única pista
// de que ele existia. Isso acabou: a tela de login do cliente agora oferece
// "Sou professor" e o caminho aparece no HTML público. O valor continua em UM
// lugar não mais por segredo, e sim porque ninguém consegue renomear com
// segurança um caminho que vive em duas cópias.
//
// ── COMO USAR ───────────────────────────────────────────────────────
//   import { ROUTES } from '../constants/routes';
//   <Link to={ROUTES.produtos}>…</Link>
//   navigate(ROUTES.checkout);
//   navigate(productPath(product.slug));
// ════════════════════════════════════════════════════════════════════

/**
 * Caminho do login do professor — a antiga tela de admin.
 *
 * Fica FORA de `ROUTES` de propósito, com nome próprio: quem for mexer precisa
 * ver que este é o acesso privilegiado, não mais um item da lista. O VALOR
 * segue o antigo `/painel-acesso-privado-atelie` porque a rota não mudou, só o
 * público dela; a separação de verdade entre professor e admin ainda está por
 * fazer, e é ela que vai decidir se este caminho ganha um nome legível.
 *
 * A proteção nunca foi a URL, é a sessão (`ProtectedRoute` + a sessão do
 * backend) — por isso publicá-la no login do cliente não abre nada.
 */
export const PROFESSOR_LOGIN_PATH = '/painel-acesso-privado-atelie';

export const CUSTOMER_RESET_PASSWORD_PATH = '/reset-password';

/**
 * Todas as rotas estáticas do app. As chaves espelham `src/App.jsx` — quando
 * uma rota nova entrar lá, entra aqui junto.
 */
export const ROUTES = Object.freeze({
  home: '/',
  produtos: '/produtos',
  checkout: '/checkout',
  login: '/login',
  conta: '/conta',
  downloads: '/downloads',
  resetPassword: CUSTOMER_RESET_PASSWORD_PATH,
  privacidade: '/privacidade',
  termos: '/termos',
  confirmarInscricao: '/confirmar-inscricao',
  desinscrever: '/desinscrever',
  admin: '/admin',
  professorLogin: PROFESSOR_LOGIN_PATH,
});

/**
 * Rotas com parâmetro. Função em vez de template no chamador, para que a FORMA
 * do caminho (`/produtos/:slug`) também tenha um dono.
 *
 * `encodeURIComponent` porque o slug vem do banco e pode conter caractere que
 * quebra a URL — hoje não contém, mas isso é regra de cadastro, não garantia.
 */
export function productPath(slugOrId) {
  return `${ROUTES.produtos}/${encodeURIComponent(String(slugOrId || ''))}`;
}

/**
 * Catálogo filtrado por categoria.
 */
export function categoryPath(categoryName) {
  return `${ROUTES.produtos}?categoria=${encodeURIComponent(String(categoryName || ''))}`;
}

/**
 * Aceita apenas caminho relativo à própria origem. Sem isto, `?redirect=` vira
 * open redirect: `//evil.com` e `https://evil.com` são destinos válidos para
 * `navigate()` e para o `redirect_to` do OAuth, o que permite montar um link
 * com o domínio real da loja que leva o cliente logado a um site de phishing.
 *
 * Espelha `sanitizeRelativeRedirect` em lib/customer-auth-handlers.js — os dois
 * lados precisam concordar, porque o parâmetro atravessa o fluxo OAuth.
 *
 * @param {unknown} value  valor cru vindo da query string
 * @param {string} fallback destino quando o valor não é um caminho local
 */
export function sanitizeRedirectPath(value, fallback = ROUTES.checkout) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  // `//host` é protocol-relative; `://` cobre esquema absoluto; `\` é tratado
  // como `/` por vários navegadores em URLs.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://') || raw.includes('\\')) {
    return fallback;
  }
  return raw;
}
