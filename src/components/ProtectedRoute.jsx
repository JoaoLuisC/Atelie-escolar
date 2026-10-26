import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Guarda do painel admin. Sem sessão admin, renderiza `fallback` (o formulário
 * de login) na própria URL em vez de redirecionar — assim `/admin` é a única
 * entrada: deslogado vê o login, logado vê o painel.
 */
export function ProtectedRoute({ children, fallback, allowedRoles }) {
  const location = useLocation();
  const { authReady, adminAuthenticated, adminRole } = useAuth();
  // Bypass do painel só em DEV e quando explicitamente ligado por env.
  // `import.meta.env.DEV` garante que a flag fica INERTE em builds de
  // produção mesmo que VITE_ALLOW_ADMIN_BYPASS=true vaze para o deploy
  // (variáveis VITE_* são inlined no bundle público).
  const allowAdminBypass =
    import.meta.env.DEV && import.meta.env.VITE_ALLOW_ADMIN_BYPASS === 'true';
  // Com bypass ligado, `?login` ainda abre o formulário para obter sessão real.
  const wantsLogin = new URLSearchParams(location.search).has('login');

  if (!authReady) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <article className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <i className="bi bi-shield-lock-fill text-3xl text-brand-600" />
          <h3 className="mt-2 font-heading text-lg font-bold text-slate-900">Verificando sessão</h3>
          <p className="mt-1 text-sm text-slate-600">
            Aguarde enquanto validamos seu acesso ao painel.
          </p>
        </article>
      </section>
    );
  }

  const roleAllowed =
    !Array.isArray(allowedRoles) ||
    allowedRoles.length === 0 ||
    allowedRoles.includes(String(adminRole || '').toLowerCase());

  if ((!adminAuthenticated || !roleAllowed) && (!allowAdminBypass || wantsLogin)) {
    return fallback;
  }

  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node.isRequired,
  allowedRoles: PropTypes.arrayOf(PropTypes.string),
};
