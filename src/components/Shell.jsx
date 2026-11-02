import { useContext, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { OwlLogo } from './OwlLogo';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CartContext } from '../providers/CartProvider';
import { useToast } from '../hooks/useToast';
import { CartDrawer } from './CartDrawer';
import { NewsletterSignup } from './NewsletterSignup';
import { ROUTES } from '../constants/routes';
import { SELLER } from '../constants/seller';
import { DEFAULT_HOME_CONTENT, mergeHomeContent } from '../constants/home-content';
import { fetchStoreSettings } from '../services/store-settings';
import { EditableText } from './EditableText';

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
// O mesmo canal dos Termos e da Política de Privacidade (src/constants/seller.js).
const CONTACT_EMAIL = SELLER.email;

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

// Três alturas de barra de verdade: a altura do logo e o tamanho do nome
// mudam junto com o espaçamento — só o padding não dava para notar.
const NAV_SIZES = {
  small: { pad: 'py-1', logo: 30, box: 'h-9 w-9', text: 'text-sm' },
  medium: { pad: 'py-3', logo: 34, box: 'h-10 w-10', text: 'text-base' },
  large: { pad: 'py-5', logo: 46, box: 'h-14 w-14', text: 'text-lg' },
};

/** Logo da loja: a imagem enviada no painel ou a coruja padrão. */
function BrandLogo({ url, size }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return <OwlLogo size={size} />;
}

BrandLogo.propTypes = {
  url: PropTypes.string,
  size: PropTypes.number.isRequired,
};

/**
 * @param {object} [props.storeContent] conteúdo vindo da prévia do painel; com
 *   ele o Shell não busca as configurações e mostra o rascunho.
 */
export function Shell({ children, storeContent: previewContent = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerSession, logoutCustomer } = useAuth();
  const cartContext = useContext(CartContext);
  const cartCount = Array.isArray(cartContext?.cart) ? cartContext.cart.length : 0;
  const { pushToast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [fetchedContent, setFetchedContent] = useState(DEFAULT_HOME_CONTENT);
  const navRef = useRef(null);

  useEffect(() => {
    if (previewContent) return undefined;
    let active = true;
    fetchStoreSettings()
      .then((content) => {
        if (active) setFetchedContent(mergeHomeContent(content));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [previewContent]);

  const storeContent = previewContent || fetchedContent;
  const { navigation, footer } = storeContent;
  const navSize = NAV_SIZES[navigation.size] || NAV_SIZES.medium;
  const footerLogoUrl = footer.logoUrl || navigation.logoUrl;
  const contactEmail = footer.contactEmail || CONTACT_EMAIL;
  const socialLinks = [
    { label: 'Instagram', icon: 'instagram', href: footer.instagramUrl },
    { label: 'Facebook', icon: 'facebook', href: footer.facebookUrl },
    { label: 'Pinterest', icon: 'pinterest', href: footer.pinterestUrl },
  ].filter((social) => social.href);
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
        <div
          className={`mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 lg:px-6 ${navSize.pad}`}
        >
          <Link to={ROUTES.home} className="flex items-center gap-2.5">
            <span
              className={`flex ${navSize.box} items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-brand-100`}
            >
              <BrandLogo url={navigation.logoUrl} size={navSize.logo} />
            </span>
            {navigation.showTitle !== false ? (
              <EditableText
                path="navigation.title"
                value={navigation.title}
                className={`hidden font-display ${navSize.text} font-bold uppercase tracking-wide text-slate-800 sm:inline`}
              >
                {navigation.title}
              </EditableText>
            ) : null}
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
              <i className="bi bi-person-circle" />{' '}
              {customerSession?.email
                ? customerSession.name?.trim().split(/\s+/)[0] || customerSession.email
                : 'Entrar'}
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
                  {customerSession?.email
                    ? customerSession.name?.trim().split(/\s+/)[0] || customerSession.email
                    : 'Entrar'}
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
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
                  <BrandLogo url={footerLogoUrl} size={30} />
                </span>
                <EditableText
                  path="footer.title"
                  value={footer.title}
                  className="font-display text-sm font-semibold uppercase tracking-wider text-white"
                >
                  {footer.title}
                </EditableText>
              </Link>
              <EditableText
                path="footer.description"
                value={footer.description}
                as="p"
                className="mt-4 max-w-md text-sm leading-relaxed text-slate-400"
              >
                {footer.description}
              </EditableText>
              {socialLinks.length ? (
                <div className="mt-5 flex gap-2">
                  {socialLinks.map((social) => (
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
              <EditableText
                path="footer.navigationTitle"
                value={footer.navigationTitle}
                as="h4"
                className="text-xs font-semibold uppercase tracking-widest text-slate-400"
              >
                {footer.navigationTitle}
              </EditableText>
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
              <EditableText
                path="footer.contactTitle"
                value={footer.contactTitle}
                as="h4"
                className="text-xs font-semibold uppercase tracking-widest text-slate-400"
              >
                {footer.contactTitle}
              </EditableText>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a
                    href={`mailto:${contactEmail}`}
                    className="flex items-center gap-2 text-slate-400 transition hover:text-white"
                  >
                    <i className="bi bi-envelope" aria-hidden="true" />
                    {/* break-all: a 768 px a coluna é estreita e o endereço vazava, criando rolagem horizontal. */}
                    <span className="min-w-0 break-all">{contactEmail}</span>
                  </a>
                </li>
                {footer.whatsappUrl ? (
                  <li>
                    <a
                      href={footer.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-slate-400 transition hover:text-white"
                    >
                      <i className="bi bi-whatsapp" aria-hidden="true" />
                      {footer.whatsappLabel || 'WhatsApp'}
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
            <div className="text-center sm:text-left">
              <EditableText path="footer.copyright" value={footer.copyright} as="p">
                {footer.copyright}
              </EditableText>
              {/* Decreto 7.962/2013: identificação de quem vende, visível em toda página. */}
              <p className="mt-1">
                {SELLER.name} · CNPJ {SELLER.cnpj} · {SELLER.city}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link to={ROUTES.privacidade} className="transition hover:text-white">
                Privacidade
              </Link>
              <Link to={ROUTES.termos} className="transition hover:text-white">
                Termos
              </Link>
              <Link
                to={{ pathname: ROUTES.termos, hash: '#licenca' }}
                className="transition hover:text-white"
              >
                Licença de uso
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

Shell.propTypes = {
  children: PropTypes.node.isRequired,
  storeContent: PropTypes.object,
};
