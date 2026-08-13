import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { ROUTES } from '../constants/routes';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authReady, adminAuthenticated, loginAdmin } = useAuth();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [factorCode, setFactorCode] = useState('');
  const [requiresSecondFactor, setRequiresSecondFactor] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [factorMethods, setFactorMethods] = useState([]);

  const backTo = location.state?.from?.pathname || '/admin';

  let submitLabel = 'Entrar';
  if (requiresSecondFactor) submitLabel = 'Validar código';
  if (loading) submitLabel = 'Entrando...';

  if (authReady && adminAuthenticated) {
    return <Navigate to={ROUTES.admin} replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setStatus('Informe e-mail e senha para entrar.');
      return;
    }
    if (requiresSecondFactor && !factorCode.trim()) {
      setStatus('Informe o código de verificação para continuar.');
      return;
    }

    setLoading(true);
    setStatus(requiresSecondFactor ? 'Validando segunda etapa...' : 'Validando credenciais...');

    try {
      const data = await loginAdmin({
        username: email.trim(),
        password,
        factorCode: requiresSecondFactor ? factorCode.trim() : undefined,
        challengeToken: requiresSecondFactor ? challengeToken : undefined,
      });

      if (data.requiresSecondFactor) {
        setRequiresSecondFactor(true);
        setChallengeToken(data.challengeToken || '');
        setFactorMethods(Array.isArray(data.methods) ? data.methods : []);
        setStatus('Informe o código de verificação para concluir o login.');
        return;
      }

      pushToast('Login administrativo realizado.', 'success');
      navigate(backTo, { replace: true });
    } catch (error) {
      const message = error.message || 'Falha no login administrativo.';
      setStatus(message);
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-100 via-white to-sky-50 px-4 py-10">
      <article className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-lg">
            <i className="bi bi-shield-lock-fill text-2xl" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
              Painel administrativo
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Acesso restrito</h1>
            <p className="mt-2 text-sm text-slate-600">
              Use o e-mail Supabase do perfil master/admin para acessar o painel.
            </p>
          </div>
        </div>

        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <div>
            <label htmlFor="admin-login-email" className="sr-only">
              E-mail
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <i className="bi bi-envelope" />
              </span>
              <input
                id="admin-login-email"
                type="email"
                placeholder="E-mail do admin"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-login-password" className="sr-only">
              Senha
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <i className="bi bi-lock" />
              </span>
              <input
                id="admin-login-password"
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          {requiresSecondFactor ? (
            <div>
              <label htmlFor="admin-login-factor" className="sr-only">
                Código de verificação
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                  <i className="bi bi-key" />
                </span>
                <input
                  id="admin-login-factor"
                  type="text"
                  inputMode="numeric"
                  placeholder="Código TOTP ou PIN"
                  value={factorCode}
                  onChange={(event) => setFactorCode(event.target.value.replaceAll(/\s+/g, ''))}
                  disabled={loading}
                  autoComplete="one-time-code"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 font-mono tracking-widest focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Métodos aceitos: {factorMethods.join(' / ') || 'código de verificação'}.
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:bg-violet-300"
          >
            {loading ? (
              <i className="bi bi-arrow-clockwise animate-spin" />
            ) : (
              <i className="bi bi-box-arrow-in-right" />
            )}
            {submitLabel}
          </button>
        </form>

        {status ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{status}</p>
        ) : null}
      </article>
    </section>
  );
}
