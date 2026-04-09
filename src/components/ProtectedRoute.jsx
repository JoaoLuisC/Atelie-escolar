import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ADMIN_LOGIN_PATH } from '../constants/routes';

export function ProtectedRoute({ children }) {
  const location = useLocation();
  const { authReady, adminAuthenticated } = useAuth();
  const allowAdminBypass = import.meta.env.DEV || import.meta.env.VITE_ALLOW_ADMIN_BYPASS === 'true';

  if (!authReady) {
    return (
      <section className="admin-wrap" style={{ padding: '24px' }}>
        <article className="card admin-access-card">
          <h3>Verificando sessao</h3>
          <p>Aguarde enquanto validamos seu acesso administrativo.</p>
        </article>
      </section>
    );
  }

  if (!adminAuthenticated && !allowAdminBypass) {
    return <Navigate to={ADMIN_LOGIN_PATH} replace state={{ from: location }} />;
  }

  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
