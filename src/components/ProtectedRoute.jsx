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
      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <article className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <i className="bi bi-shield-lock-fill text-3xl text-brand-600" />
          <h3 className="mt-2 font-heading text-lg font-bold text-slate-900">Verificando sessão</h3>
          <p className="mt-1 text-sm text-slate-600">Aguarde enquanto validamos seu acesso administrativo.</p>
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
