import { useContext } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CartContext } from '../providers/CartProvider';
import { useToast } from '../hooks/useToast';

export function Shell({ children }) {
  const { customerSession, logoutCustomer } = useAuth();
  const cartContext = useContext(CartContext);
  const cartCount = Array.isArray(cartContext?.cart) ? cartContext.cart.length : 0;
  const { pushToast } = useToast();

  function handleCustomerLogout() {
    logoutCustomer();
    pushToast('Sessao do cliente encerrada.', 'info');
  }

  return (
    <>
      <nav className="navbar navbar-transparent" id="mainNav">
        <div className="container">
          <Link to="/" className="brand-owl">
            <span className="owl-icon" aria-hidden="true">
              <OwlLogo width={36} height={36} />
            </span>
            <span className="brand-text">Profa. Marciar Cardoso</span>
          </Link>

          <ul className="navbar-menu">
            <li>
              <NavLink to="/" end className={({ isActive }) => `nav-link-item shell-nav-link${isActive ? ' nav-active' : ''}`}>
                Inicio
              </NavLink>
            </li>
            <li className="nav-hide-sm">
              <a href="/#como-funciona" className="nav-link-item shell-nav-link">Como Funciona</a>
            </li>
            <li className="nav-hide-sm">
              <a href="/#contato" className="nav-link-item shell-nav-link">Contato</a>
            </li>
            <li>
              <NavLink to="/produtos" className={({ isActive }) => `nav-link-item shell-nav-link${isActive ? ' nav-active' : ''}`}>
                Produtos
              </NavLink>
            </li>
            {customerSession?.email ? (
              <li>
                <NavLink to="/downloads" className={({ isActive }) => `nav-link-item shell-nav-link${isActive ? ' nav-active' : ''}`}>
                  <i className="bi bi-bag-heart" /> Meus Produtos
                </NavLink>
              </li>
            ) : null}
            <li>
              <NavLink to="/checkout" className="cart-icon shell-icon-link" aria-label="Carrinho">
                <i className="bi bi-cart3" />
                <span className="cart-badge">{cartCount}</span>
              </NavLink>
            </li>
            <li id="nav-auth-item">
              <NavLink to="/login" className={({ isActive }) => `nav-link-item shell-nav-link nav-auth-link${isActive ? ' nav-active' : ''}`}>
                <i className="bi bi-person-circle" /> {customerSession?.email ? 'Conta' : 'Entrar'}
              </NavLink>
            </li>
            {customerSession?.email ? (
              <li>
                <button type="button" className="nav-link-item shell-nav-link shell-logout-btn" onClick={handleCustomerLogout}>
                  Sair
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      </nav>

      <main className="app-main">{children}</main>

      <footer className="footer" id="contato">
        <div className="footer-aurora" aria-hidden="true" />
        <div className="container footer-react-wrap" style={{ position: 'relative', zIndex: 1 }}>
          <div className="footer-content">
            <div className="footer-section">
              <Link to="/" className="footer-brand">
                <OwlLogo width={28} height={28} />
                <span className="brand-text-f">Profa. Marciar Cardoso</span>
              </Link>
              <p>
                Materiais graficos digitais profissionais e editaveis para festas, eventos e decoracao escolar.
                Download instantaneo no seu tempo.
              </p>
              <div className="footer-social">
                <a href="https://instagram.com/profamarciarcardoso" target="_blank" rel="noopener noreferrer" className="social-btn social-ig shell-social-link" aria-label="Instagram"><i className="bi bi-instagram" /></a>
                <a href="https://www.facebook.com" className="social-btn social-fb shell-social-link" aria-label="Facebook"><i className="bi bi-facebook" /></a>
                <a href="https://www.pinterest.com" className="social-btn social-pt shell-social-link" aria-label="Pinterest"><i className="bi bi-pinterest" /></a>
              </div>
            </div>

            <div className="footer-section">
              <h4 className="footer-title"><i className="bi bi-bookmark-fill" style={{ color: 'var(--accent-yellow)' }} /> Links Rapidos</h4>
              <ul className="footer-links">
                <li><Link to="/">Inicio</Link></li>
                <li><Link to="/produtos">Produtos</Link></li>
                <li><a href="/#como-funciona">Como Funciona</a></li>
                <li><Link to="/login">Minha Conta</Link></li>
                <li><Link to="/downloads">Downloads</Link></li>
              </ul>
            </div>

            <div className="footer-section">
              <h4 className="footer-title"><i className="bi bi-chat-heart-fill" style={{ color: 'var(--accent-pink)' }} /> Fale Conosco</h4>
              <p className="footer-contact-item">
                <span aria-hidden="true"><i className="bi bi-envelope-fill footer-contact-icon" style={{ color: 'var(--accent-blue)' }} /></span>{' '}
                contato@profamarciarcardoso.com.br
              </p>
              <p className="footer-contact-item">
                <span aria-hidden="true"><i className="bi bi-whatsapp footer-contact-icon" style={{ color: '#25D366' }} /></span>{' '}
                (11) 99999-9999
              </p>
            </div>
          </div>

          <div className="footer-pencil-line" />

          <div className="footer-bottom">
            <span className="footer-bottom-icons"><i className="bi bi-book-half" /></span>
            <p>&copy; 2026 Profa. Marciar Cardoso - Todos os direitos reservados</p>
            <span className="footer-bottom-icons"><i className="bi bi-pencil-fill" /></span>
            <p className="footer-tagline">Iluminando o futuro com criatividade e amor - <em>Profa. Marciar Cardoso</em></p>
          </div>
        </div>
      </footer>
    </>
  );
}

function OwlLogo({ width, height }) {
  return (
    <svg className="owl-svg" width={width} height={height} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
