import { useContext, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CartContext } from '../providers/CartProvider';
import { useToast } from '../hooks/useToast';
import { CartDrawer } from './CartDrawer';
import { NewsletterSignup } from './NewsletterSignup';
import { ROUTES } from '../constants/routes';

function navLinkClass({ isActive }) {
  return `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-700 hover:bg-slate-100 hover:text-brand-700'
  }`;
}

function staticLinkClass() {
  return 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-brand-700';
}

// Menu mobile (regra B9): toque >= 44px (min-h-[44px]) e hierarquia visual
// reduzida — links primários em peso cheio, secundários (âncoras da home)
// atenuados sob um rótulo de seção.
function mobileNavLinkClass({ isActive }) {
  return `flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-[15px] font-medium transition ${
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-800 hover:bg-slate-100 hover:text-brand-700'
  }`;
}

function mobileSecondaryLinkClass() {
  return 'flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700';
}

// ── Contatos e redes do rodapé (LOJA-13) ─────────────────────────────
// Facebook e Pinterest apontavam para a página inicial genérica de cada rede,
// e o WhatsApp era o número fictício (11) 99999-9999. Endereço de contato é
// decisão da dona da loja — não se inventa. Valor VAZIO esconde o item; para
// exibir, basta preencher aqui com o endereço real.
const SOCIAL_LINKS = [
  {
    label: 'Instagram',
    icon: 'instagram',
    href: 'https://instagram.com/profamarciarcardoso',
  },
  { label: 'Facebook', icon: 'facebook', href: '' },
  { label: 'Pinterest', icon: 'pinterest', href: '' },
].filter((social) => social.href);

// Ex.: { href: 'https://wa.me/55DDDNUMERO', label: '(DDD) NÚMERO' }.
const WHATSAPP_CONTACT = { href: '', label: '' };

const CONTACT_EMAIL = 'contato@profamarciarcardoso.com.br';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export function Shell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerSession, logoutCustomer } = useAuth();
  const cartContext = useContext(CartContext);
  const cartCount = Array.isArray(cartContext?.cart) ? cartContext.cart.length : 0;
  const { pushToast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const navRef = useRef(null);

  const isAdminRole = ['admin', 'master'].includes(
    String(customerSession?.role || '').toLowerCase(),
  );

  // LOJA-09: as âncoras eram <a href="/#…">, que recarregam a SPA inteira; e
  // como a home é carregada sob demanda, a seção ainda não existia quando o
  // navegador procurava a âncora. Com <Link>, a navegação é interna e o
  // ScrollToTop (src/components/ScrollToTop.jsx) espera a seção aparecer.
  const comoFuncionaTo = { pathname: ROUTES.home, hash: '#como-funciona' };
  // "Contato" é o rodapé, que existe em TODA página: rola até ele sem sair de
  // onde a pessoa está (mantendo inclusive os filtros da URL).
  const contatoTo = { pathname: location.pathname, search: location.search, hash: '#contato' };

  // LOJA-28: Esc e clique fora fecham o menu mobile; e ele fecha sozinho ao
  // alargar a janela para o layout de desktop (antes, voltar a estreitar
  // reabria o menu que tinha ficado aberto "por baixo").
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    const onPointerDown = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) setMobileMenuOpen(false);
    };
    const desktop = globalThis.matchMedia?.(DESKTOP_MEDIA_QUERY);
    const onDesktopChange = (event) => {
      if (event.matches) setMobileMenuOpen(false);
    };

    globalThis.addEventListener?.('keydown', onKeyDown);
    globalThis.document?.addEventListener('pointerdown', onPointerDown);
    desktop?.addEventListener?.('change', onDesktopChange);
    return () => {
      globalThis.removeEventListener?.('keydown', onKeyDown);
      globalThis.document?.removeEventListener('pointerdown', onPointerDown);
      desktop?.removeEventListener?.('change', onDesktopChange);
    };
  }, [mobileMenuOpen]);

  // LOJA-39: `logoutCustomer` só limpa a sessão local depois que o servidor
  // confirma, e LANÇA se falhar. O toast de "Sessão encerrada." antes saía
  // mesmo quando o cookie de sessão continuava válido.
  async function handleCustomerLogout() {
    setMobileMenuOpen(false);
    try {
      await logoutCustomer();
      pushToast('Sessão encerrada.', 'info');
    } catch (error) {
      pushToast(error?.message || 'Não foi possível sair da conta. Tente novamente.', 'error');
    }
  }

  function openCart() {
    // LOJA-28: o menu não fica aberto por baixo do carrinho.
    setMobileMenuOpen(false);
    setCartDrawerOpen(true);
  }

  function closeCart() {
    setCartDrawerOpen(false);
  }

  function goToCheckout() {
    navigate(ROUTES.checkout);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* LOJA-30: atalho de teclado para pular o cabeçalho. Invisível até
          receber foco (primeiro Tab da página). */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-700 focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <nav
        ref={navRef}
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Link to={ROUTES.home} className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand">
              <OwlLogo width={28} height={28} />
            </span>
            <span className="hidden font-display text-base font-bold uppercase tracking-wide text-slate-800 sm:inline">
              Profa. Marciar Cardoso
            </span>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            <li>
              <NavLink to={ROUTES.home} end className={navLinkClass}>
                Início
              </NavLink>
            </li>
            <li>
              <Link to={comoFuncionaTo} className={staticLinkClass()}>
                Como Funciona
              </Link>
            </li>
            <li>
              <Link to={contatoTo} className={staticLinkClass()}>
                Contato
              </Link>
            </li>
            <li>
              <NavLink to={ROUTES.produtos} className={navLinkClass}>
                Produtos
              </NavLink>
            </li>
            {customerSession?.email && !isAdminRole ? (
              <li>
                <NavLink to={ROUTES.downloads} className={navLinkClass}>
                  <i className="bi bi-bag-heart" /> Meus produtos
                </NavLink>
              </li>
            ) : null}
            {isAdminRole ? (
              <li>
                <NavLink
                  to={ROUTES.admin}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`
                  }
                >
                  <i className="bi bi-shield-lock" /> Painel admin
                </NavLink>
              </li>
            ) : null}
          </ul>

          <div className="flex items-center gap-1">
            {/* CROSS-15: o carrinho ficava escondido para o perfil admin, mas o
                "Adicionar" dos cards continuava gravando itens — sem caminho
                para vê-los ou removê-los. O botão agora existe para todos. */}
            <button
              type="button"
              onClick={openCart}
              aria-label={
                cartCount > 0
                  ? `Abrir carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`
                  : 'Abrir carrinho'
              }
              aria-haspopup="dialog"
              aria-expanded={cartDrawerOpen}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 hover:text-brand-700"
            >
              <i className="bi bi-cart3 text-xl" aria-hidden="true" />
              {cartCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              ) : null}
            </button>

            <NavLink
              to={ROUTES.login}
              className={({ isActive }) =>
                `hidden lg:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-brand-700'
                }`
              }
            >
              <i className="bi bi-person-circle" /> {customerSession?.email ? 'Conta' : 'Entrar'}
            </NavLink>

            {customerSession?.email ? (
              <button
                type="button"
                onClick={handleCustomerLogout}
                className="hidden lg:inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Sair
              </button>
            ) : null}

            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="menu-mobile"
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              <i
                className={`bi text-xl ${mobileMenuOpen ? 'bi-x-lg' : 'bi-list'}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div id="menu-mobile" className="border-t border-slate-200 bg-white lg:hidden">
            <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              <li>
                <NavLink
                  to={ROUTES.home}
                  end
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  Início
                </NavLink>
              </li>
              <li>
                <NavLink
                  to={ROUTES.produtos}
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  Produtos
                </NavLink>
              </li>
              {customerSession?.email && !isAdminRole ? (
                <li>
                  <NavLink
                    to={ROUTES.downloads}
                    onClick={() => setMobileMenuOpen(false)}
                    className={mobileNavLinkClass}
                  >
                    <i className="bi bi-bag-heart" aria-hidden="true" /> Meus produtos
                  </NavLink>
                </li>
              ) : null}
              {isAdminRole ? (
                <li>
                  <NavLink
                    to={ROUTES.admin}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-[15px] font-semibold transition ${
                        isActive
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      }`
                    }
                  >
                    <i className="bi bi-shield-lock" aria-hidden="true" /> Painel admin
                  </NavLink>
                </li>
              ) : null}

              <li className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Navegar
              </li>
              <li>
                <Link
                  to={comoFuncionaTo}
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileSecondaryLinkClass()}
                >
                  Como Funciona
                </Link>
              </li>
              <li>
                <Link
                  to={contatoTo}
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileSecondaryLinkClass()}
                >
                  Contato
                </Link>
              </li>

              <li className="mt-2 border-t border-slate-100 pt-2">
                <NavLink
                  to={ROUTES.login}
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  <i className="bi bi-person-circle" aria-hidden="true" />{' '}
                  {customerSession?.email ? 'Conta' : 'Entrar'}
                </NavLink>
              </li>
              {customerSession?.email ? (
                <li>
                  <button
                    type="button"
                    onClick={handleCustomerLogout}
                    className="flex min-h-[44px] w-full items-center rounded-lg bg-rose-50 px-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Sair
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </nav>

      <main id="conteudo" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>

      <footer id="contato" className="border-t border-slate-800 bg-slate-950 text-slate-300">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2 md:pr-8">
              <Link to={ROUTES.home} className="inline-flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800">
                  <OwlLogo width={22} height={22} />
                </span>
                <span className="font-display text-sm font-semibold uppercase tracking-wider text-white">
                  Profa. Marciar Cardoso
                </span>
              </Link>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
                Materiais gráficos digitais profissionais e editáveis para festas, eventos e
                decoração escolar. Download instantâneo após a aprovação do pagamento.
              </p>
              {SOCIAL_LINKS.length ? (
                <div className="mt-5 flex gap-2">
                  {SOCIAL_LINKS.map((social) => (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white"
                    >
                      <i className={`bi bi-${social.icon}`} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Navegação
              </h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link to={ROUTES.home} className="text-slate-400 transition hover:text-white">
                    Início
                  </Link>
                </li>
                <li>
                  <Link to={ROUTES.produtos} className="text-slate-400 transition hover:text-white">
                    Produtos
                  </Link>
                </li>
                <li>
                  <Link to={comoFuncionaTo} className="text-slate-400 transition hover:text-white">
                    Como funciona
                  </Link>
                </li>
                <li>
                  <Link to={ROUTES.login} className="text-slate-400 transition hover:text-white">
                    Minha conta
                  </Link>
                </li>
                <li>
                  <Link
                    to={ROUTES.downloads}
                    className="text-slate-400 transition hover:text-white"
                  >
                    {/* LOJA-49: mesmo nome do cabeçalho e do h1 de /downloads. */}
                    Meus produtos
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Contato
              </h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="flex items-center gap-2 text-slate-400 transition hover:text-white"
                  >
                    <i className="bi bi-envelope" aria-hidden="true" />
                    {CONTACT_EMAIL}
                  </a>
                </li>
                {WHATSAPP_CONTACT.href ? (
                  <li>
                    <a
                      href={WHATSAPP_CONTACT.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-slate-400 transition hover:text-white"
                    >
                      <i className="bi bi-whatsapp" aria-hidden="true" />
                      {WHATSAPP_CONTACT.label}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-slate-800 pt-8">
            <NewsletterSignup source="footer" className="mx-auto max-w-md" />
          </div>

          {/* LOJA-36: slate-500 sobre slate-950 dava ~4,2:1 em texto de 12 px
              (abaixo dos 4,5:1 do WCAG AA); slate-400 passa com folga. */}
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-400 sm:flex-row">
            <p>&copy; 2026 Profa. Marciar Cardoso. Todos os direitos reservados.</p>
            <div className="flex items-center gap-4">
              <Link to={ROUTES.privacidade} className="transition hover:text-white">
                Privacidade
              </Link>
              <Link to={ROUTES.termos} className="transition hover:text-white">
                Termos
              </Link>
              {/* A revogação do consentimento (LGPD art. 8º §5º) só era
                  alcançável lendo a política até o meio. */}
              <Link
                to={{ pathname: ROUTES.privacidade, hash: '#cookies' }}
                className="transition hover:text-white"
              >
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </footer>

      <CartDrawer isOpen={cartDrawerOpen} onClose={closeCart} onCheckout={goToCheckout} />
    </div>
  );
}

function OwlLogo({ width, height }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="18" cy="24" rx="11" ry="10" fill="#9B5DE5" />
      <ellipse cx="18" cy="13" rx="9" ry="9" fill="#9B5DE5" />
      <polygon points="10,8 12,2 14,8" fill="#7A3DC0" />
      <polygon points="22,8 24,2 26,8" fill="#7A3DC0" />
      <circle cx="13.5" cy="13" r="4" fill="#FEE440" />
      <circle cx="13.5" cy="13" r="2" fill="#1a0030" />
      <circle cx="14.5" cy="11.5" r=".8" fill="rgba(255,255,255,0.7)" />
      <circle cx="22.5" cy="13" r="4" fill="#FEE440" />
      <circle cx="22.5" cy="13" r="2" fill="#1a0030" />
      <circle cx="23.5" cy="11.5" r=".8" fill="rgba(255,255,255,0.7)" />
      <polygon points="16,16 20,16 18,18.5" fill="#FEE440" />
      <path
        d="M8,22 Q12,17 14,25"
        stroke="#7A3DC0"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M28,22 Q24,17 22,25"
        stroke="#7A3DC0"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

OwlLogo.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
};

Shell.propTypes = {
  children: PropTypes.node.isRequired,
};
