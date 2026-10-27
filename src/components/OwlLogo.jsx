import PropTypes from 'prop-types';

// A coruja roxa do Ateliê da Escola (public/logo.png). Os ícones da aba, do
// celular e da barra de tarefas saem da mesma arte (public/favicon-*.png,
// apple-touch-icon.png e icon-192/512.png, ligados no index.html e no
// site.webmanifest). Decorativa: o nome da loja vem escrito ao lado.
export function OwlLogo({ size }) {
  return <img src="/logo.png" alt="" aria-hidden="true" width={size} height={size} />;
}

OwlLogo.propTypes = {
  size: PropTypes.number.isRequired,
};
