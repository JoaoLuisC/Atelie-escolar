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
            {customerSession?.email ? (
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
              aria-label="Abrir menu"
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              <i className={`bi text-xl ${mobileMenuOpen ? 'bi-x-lg' : 'bi-list'}`} />
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="border-t border-slate-200 bg-white lg:hidden">
            <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              <li><NavLink to="/" end onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>Início</NavLink></li>
              <li><a href="/#como-funciona" onClick={() => setMobileMenuOpen(false)} className={staticLinkClass()}>Como Funciona</a></li>
              <li><a href="/#contato" onClick={() => setMobileMenuOpen(false)} className={staticLinkClass()}>Contato</a></li>
              <li><NavLink to="/produtos" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>Produtos</NavLink></li>
              {customerSession?.email ? (
                <li><NavLink to="/downloads" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}><i className="bi bi-bag-heart" /> Meus produtos</NavLink></li>
              ) : null}
              {isAdminRole ? (
                <li>
                  <NavLink
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) => `inline-flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      isActive ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <i className="bi bi-shield-lock" /> Painel admin
                  </NavLink>
                </li>
              ) : null}
              <li><NavLink to="/login" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}><i className="bi bi-person-circle" /> {customerSession?.email ? 'Conta' : 'Entrar'}</NavLink></li>
              {customerSession?.email ? (
                <li>
                  <button
                    type="button"
                    onClick={handleCustomerLogout}
                    className="w-full rounded-lg bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-700"
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

      <footer id="contato" className="relative mt-12 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 text-white">
        <div aria-hidden="true" className="absolute -top-24 right-1/4 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-accent-sky/20 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 py-12 lg:px-6">
          <div className="grid gap-10 md:grid-cols-3">
            <div>
              <Link to="/" className="flex items-center gap-2.5">
                <OwlLogo width={28} height={28} />
                <span className="font-display text-base font-bold uppercase">Profa. Marciar Cardoso</span>
              </Link>
              <p className="mt-3 text-sm text-white/80">
                Materiais gráficos digitais profissionais e editáveis para festas, eventos e decoração escolar.
                Download instantâneo no seu tempo.
              </p>
              <div className="mt-4 flex gap-2">
                <a href="https://instagram.com/profamarciarcardoso" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20">
                  <i className="bi bi-instagram" />
                </a>
                <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20">
                  <i className="bi bi-facebook" />
                </a>
                <a href="https://www.pinterest.com" target="_blank" rel="noopener noreferrer" aria-label="Pinterest" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20">
                  <i className="bi bi-pinterest" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-accent-yellow">
                <i className="bi bi-bookmark-fill" /> Links rápidos
              </h4>
              <ul className="space-y-2 text-sm text-white/80">
                <li><Link to="/" className="transition hover:text-white">Início</Link></li>
                <li><Link to="/produtos" className="transition hover:text-white">Produtos</Link></li>
                <li><a href="/#como-funciona" className="transition hover:text-white">Como Funciona</a></li>
                <li><Link to="/login" className="transition hover:text-white">Minha Conta</Link></li>
                <li><Link to="/downloads" className="transition hover:text-white">Downloads</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-accent-pink">
                <i className="bi bi-chat-heart-fill" /> Fale conosco
              </h4>
              <p className="flex items-center gap-2 text-sm text-white/80">
                <i className="bi bi-envelope-fill text-accent-sky" />
                contato@profamarciarcardoso.com.br
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm text-white/80">
                <i className="bi bi-whatsapp text-emerald-300" />
                (11) 99999-9999
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-white/15 pt-6">
            <NewsletterSignup source="footer" className="mx-auto max-w-md" />
          </div>

          <div className="mt-8 border-t border-white/15 pt-6 text-center text-xs text-white/70">
            <p>&copy; 2026 Profa. Marciar Cardoso · Todos os direitos reservados</p>
            <p className="mt-1 italic">Iluminando o futuro com criatividade e amor</p>
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <Link to="/privacidade" className="underline-offset-2 hover:underline">Política de Privacidade</Link>
              <span aria-hidden="true">·</span>
              <Link to="/termos" className="underline-offset-2 hover:underline">Termos de Uso</Link>
            </p>
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
