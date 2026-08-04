import { useContext, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CartContext } from '../providers/CartProvider';
import { useToast } from '../hooks/useToast';
import { CartDrawer } from './CartDrawer';
import { NewsletterSignup } from './NewsletterSignup';

function navLinkClass({ isActive }) {
  return `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100 hover:text-brand-700'
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
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-800 hover:bg-slate-100 hover:text-brand-700'
  }`;
}

function mobileSecondaryLinkClass() {
  return 'flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700';
}

export function Shell({ children }) {
  const navigate = useNavigate();
  const { customerSession, logoutCustomer } = useAuth();
  const cartContext = useContext(CartContext);
  const cartCount = Array.isArray(cartContext?.cart) ? cartContext.cart.length : 0;
  const { pushToast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  const isAdminRole = ['admin', 'master'].includes(String(customerSession?.role || '').toLowerCase());

  function handleCustomerLogout() {
    logoutCustomer();
    pushToast('Sessão encerrada.', 'info');
    setMobileMenuOpen(false);
  }

  function openCart() {
    setCartDrawerOpen(true);
  }

  function closeCart() {
    setCartDrawerOpen(false);
  }

  function goToCheckout() {
    navigate('/checkout');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand">
              <OwlLogo width={28} height={28} />
            </span>
            <span className="hidden font-display text-base font-bold uppercase tracking-wide text-slate-800 sm:inline">
              Profa. Marciar Cardoso
            </span>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            <li>
              <NavLink to="/" end className={navLinkClass}>Início</NavLink>
            </li>
            <li>
              <a href="/#como-funciona" className={staticLinkClass()}>Como Funciona</a>
            </li>
            <li>
              <a href="/#contato" className={staticLinkClass()}>Contato</a>
            </li>
            <li>
              <NavLink to="/produtos" className={navLinkClass}>Produtos</NavLink>
            </li>
            {customerSession?.email && !isAdminRole ? (
              <li>
                <NavLink to="/downloads" className={navLinkClass}>
                  <i className="bi bi-bag-heart" /> Meus produtos
                </NavLink>
              </li>
            ) : null}
            {isAdminRole ? (
              <li>
                <NavLink
                  to="/admin"
                  className={({ isActive }) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  <i className="bi bi-shield-lock" /> Painel admin
                </NavLink>
              </li>
            ) : null}
          </ul>

          <div className="flex items-center gap-1">
            {!isAdminRole ? (
              <button
                type="button"
                onClick={openCart}
                aria-label={cartCount > 0 ? `Abrir carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}` : 'Abrir carrinho'}
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
            ) : null}

            <NavLink
              to="/login"
              className={({ isActive }) => `hidden lg:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100 hover:text-brand-700'
              }`}
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
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              <i className={`bi text-xl ${mobileMenuOpen ? 'bi-x-lg' : 'bi-list'}`} />
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="border-t border-slate-200 bg-white lg:hidden">
            <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              <li><NavLink to="/" end onClick={() => setMobileMenuOpen(false)} className={mobileNavLinkClass}>Início</NavLink></li>
              <li><NavLink to="/produtos" onClick={() => setMobileMenuOpen(false)} className={mobileNavLinkClass}>Produtos</NavLink></li>
              {customerSession?.email && !isAdminRole ? (
                <li><NavLink to="/downloads" onClick={() => setMobileMenuOpen(false)} className={mobileNavLinkClass}><i className="bi bi-bag-heart" aria-hidden="true" /> Meus produtos</NavLink></li>
              ) : null}
              {isAdminRole ? (
                <li>
                  <NavLink
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) => `flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-[15px] font-semibold transition ${
                      isActive ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <i className="bi bi-shield-lock" aria-hidden="true" /> Painel admin
                  </NavLink>
                </li>
              ) : null}

              <li className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Navegar</li>
              <li><a href="/#como-funciona" onClick={() => setMobileMenuOpen(false)} className={mobileSecondaryLinkClass()}>Como Funciona</a></li>
              <li><a href="/#contato" onClick={() => setMobileMenuOpen(false)} className={mobileSecondaryLinkClass()}>Contato</a></li>

              <li className="mt-2 border-t border-slate-100 pt-2">
                <NavLink to="/login" onClick={() => setMobileMenuOpen(false)} className={mobileNavLinkClass}><i className="bi bi-person-circle" aria-hidden="true" /> {customerSession?.email ? 'Conta' : 'Entrar'}</NavLink>
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

      <main className="flex-1">{children}</main>

      <footer id="contato" className="border-t border-slate-800 bg-slate-950 text-slate-300">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-6">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2 md:pr-8">
              <Link to="/" className="inline-flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800">
                  <OwlLogo width={22} height={22} />
                </span>
                <span className="font-display text-sm font-semibold uppercase tracking-wider text-white">
                  Profa. Marciar Cardoso
                </span>
              </Link>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
                Materiais gráficos digitais profissionais e editáveis para festas, eventos e decoração escolar.
                Download instantâneo após a aprovação do pagamento.
              </p>
              <div className="mt-5 flex gap-2">
                <a href="https://instagram.com/profamarciarcardoso" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white">
                  <i className="bi bi-instagram" />
                </a>
                <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white">
                  <i className="bi bi-facebook" />
                </a>
                <a href="https://www.pinterest.com" target="_blank" rel="noopener noreferrer" aria-label="Pinterest" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white">
                  <i className="bi bi-pinterest" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Navegação</h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link to="/" className="text-slate-400 transition hover:text-white">Início</Link></li>
                <li><Link to="/produtos" className="text-slate-400 transition hover:text-white">Produtos</Link></li>
                <li><a href="/#como-funciona" className="text-slate-400 transition hover:text-white">Como funciona</a></li>
                <li><Link to="/login" className="text-slate-400 transition hover:text-white">Minha conta</Link></li>
                <li><Link to="/downloads" className="text-slate-400 transition hover:text-white">Downloads</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Contato</h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a href="mailto:contato@profamarciarcardoso.com.br" className="flex items-center gap-2 text-slate-400 transition hover:text-white">
                    <i className="bi bi-envelope" aria-hidden="true" />
                    contato@profamarciarcardoso.com.br
                  </a>
                </li>
                <li>
                  <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-400 transition hover:text-white">
                    <i className="bi bi-whatsapp" aria-hidden="true" />
                    (11) 99999-9999
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-slate-800 pt-8">
            <NewsletterSignup source="footer" className="mx-auto max-w-md" />
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row">
            <p>&copy; 2026 Profa. Marciar Cardoso. Todos os direitos reservados.</p>
            <div className="flex items-center gap-4">
              <Link to="/privacidade" className="transition hover:text-slate-300">Privacidade</Link>
              <Link to="/termos" className="transition hover:text-slate-300">Termos</Link>
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
    <svg width={width} height={height} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
      <path d="M8,22 Q12,17 14,25" stroke="#7A3DC0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M28,22 Q24,17 22,25" stroke="#7A3DC0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
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
