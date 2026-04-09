import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authReady, adminAuthenticated, loginAdmin } = useAuth();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [factorCode, setFactorCode] = useState('');
  const [requiresSecondFactor, setRequiresSecondFactor] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [factorMethods, setFactorMethods] = useState([]);

  const backTo = location.state?.from?.pathname || '/admin';
  let submitLabel = 'Entrar';
  if (requiresSecondFactor) {
    submitLabel = 'Validar codigo';
  }
  if (loading) {
    submitLabel = 'Entrando...';
  }

  if (authReady && adminAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (!username.trim() || !password) {
      setStatus('Informe usuario e senha para entrar.');
      return;
    }

    if (requiresSecondFactor && !factorCode.trim()) {
      setStatus('Informe o codigo de verificacao para continuar.');
      return;
    }

    setLoading(true);
    setStatus(requiresSecondFactor ? 'Validando segunda etapa...' : 'Validando credenciais...');

    try {
      const data = await loginAdmin({
        username: username.trim(),
        password,
        factorCode: requiresSecondFactor ? factorCode.trim() : undefined,
        challengeToken: requiresSecondFactor ? challengeToken : undefined,
      });

      if (data.requiresSecondFactor) {
        setRequiresSecondFactor(true);
        setChallengeToken(data.challengeToken || '');
        setFactorMethods(Array.isArray(data.methods) ? data.methods : []);
        setStatus('Informe o codigo de verificacao para concluir o login.');
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
    <section className="auth-standalone-page admin-auth-standalone-page">
      <article className="card admin-access-card admin-login-card auth-standalone-card">
        <div className="auth-standalone-head">
          <p className="eyebrow">Admin</p>
          <h1>Login administrativo</h1>
          <p>Area restrita. Use suas credenciais para acessar o painel.</p>
        </div>

        <form className="admin-access-form" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Usuario admin"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
          />
          {requiresSecondFactor ? (
            <input
              type="text"
              placeholder="Codigo TOTP ou PIN"
              value={factorCode}
              onChange={(event) => setFactorCode(event.target.value.replaceAll(/\s+/g, ''))}
              disabled={loading}
            />
          ) : null}
          <button type="submit" className="button primary small" disabled={loading}>
            {submitLabel}
          </button>
        </form>
        {requiresSecondFactor ? (
          <p className="admin-status">
            Segunda etapa ativa.
            {' '}Metodos aceitos: {factorMethods.join(' / ') || 'codigo de verificacao'}.
          </p>
        ) : null}
        {status ? <p className="admin-status">{status}</p> : null}
      </article>
    </section>
  );
}
