import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

function getMode(search) {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  return mode === 'register' ? 'register' : 'login';
}

function useCustomerAuthHandlers({ loginCustomer, loginCustomerGoogle, registerCustomer, pushToast, navigate, redirectTo }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  async function submitLogin(loginForm) {
    if (!loginForm.email.trim() || !loginForm.password) {
      setStatus('Informe e-mail e senha para entrar.');
      return;
    }

    setLoading(true);
    setStatus('Entrando...');

    try {
      await loginCustomer({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      pushToast('Login realizado com sucesso.', 'success');
      navigate(redirectTo);
    } catch (error) {
      const message = error.message || 'Falha ao entrar.';
      setStatus(message);
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(registerForm) {
    if (!registerForm.name.trim() || !registerForm.email.trim() || !registerForm.password) {
      setStatus('Preencha nome, e-mail e senha para cadastrar.');
      return;
    }

    if (registerForm.password.length < 6) {
      setStatus('Use uma senha com pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    setStatus('Criando conta...');

    try {
      const session = await registerCustomer({
        name: registerForm.name.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
      });

      if (!session?.idToken) {
        const msg = 'Conta criada. Verifique seu e-mail para confirmar o cadastro.';
        setStatus(msg);
        pushToast(msg, 'success');
        return;
      }

      pushToast('Conta criada com sucesso.', 'success');
      navigate(redirectTo);
    } catch (error) {
      const message = error.message || 'Falha ao cadastrar.';
      setStatus(message);
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function submitGoogleLogin() {
    setLoading(true);
    setStatus('Redirecionando para login Google...');

    try {
      await loginCustomerGoogle(redirectTo);
    } catch (error) {
      const message = error.message || 'Falha ao entrar com Google.';
      setStatus(message);
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    status,
    setStatus,
    submitLogin,
    submitGoogleLogin,
    submitRegister,
  };
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function CustomerAuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customerSession, loginCustomer, loginCustomerGoogle, registerCustomer } = useAuth();
  const { pushToast } = useToast();

  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/checkout';

  const [mode, setMode] = useState(() => getMode(location.search));
  const {
    loading,
    status,
    setStatus,
    submitLogin,
    submitGoogleLogin,
    submitRegister,
  } = useCustomerAuthHandlers({
    loginCustomer,
    loginCustomerGoogle,
    registerCustomer,
    pushToast,
    navigate,
    redirectTo,
  });

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });

  function changeMode(nextMode) {
    setMode(nextMode);
    setStatus('');
  }

  async function submitLoginForm(event) {
    event.preventDefault();
    await submitLogin(loginForm);
  }

  async function submitRegisterForm(event) {
    event.preventDefault();
    await submitRegister(registerForm);
  }

  return (
    <section className="auth-standalone-page">
      <article className="card customer-auth-card account-auth-card auth-standalone-card">
        <div className="auth-standalone-head">
          <p className="eyebrow">Conta</p>
          <h1>Acesso do cliente</h1>
          <p>Entre ou crie sua conta para continuar sua compra.</p>
          <Link to="/" className="auth-back-link">
            <i className="bi bi-arrow-left" /> Voltar para a loja
          </Link>
        </div>

        {customerSession?.email ? (
          <div className="customer-auth-signed">
            <h3>Voce ja esta conectado</h3>
            <p>
              Sessao ativa para <strong>{customerSession.email}</strong>.
            </p>
            <Link className="button primary small" to="/checkout">
              Ir para checkout
            </Link>
          </div>
        ) : null}

        {customerSession ? null : (
          <>
            <div className="customer-auth-tabs">
              <button
                type="button"
                className={`button secondary small ${mode === 'login' ? 'active-inline-tab' : ''}`}
                onClick={() => changeMode('login')}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`button secondary small ${mode === 'register' ? 'active-inline-tab' : ''}`}
                onClick={() => changeMode('register')}
              >
                Cadastrar
              </button>
            </div>

            {mode === 'login' ? (
              <>
                <div className="customer-social-auth">
                  <button
                    type="button"
                    className="button secondary customer-google-button"
                    onClick={submitGoogleLogin}
                    disabled={loading}
                  >
                    <span className="customer-google-icon" aria-hidden="true">G</span>
                    {loading ? 'Conectando...' : 'Entrar com Google'}
                  </button>
                </div>

                <div className="customer-auth-divider" role="separator" aria-label="ou">
                  <span>ou</span>
                </div>

                <form className="customer-auth-form" onSubmit={submitLoginForm}>
                  <label htmlFor="customer-login-email">E-mail</label>
                  <input
                    id="customer-login-email"
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="seu@email.com"
                    disabled={loading}
                  />

                  <label htmlFor="customer-login-password">Senha</label>
                  <input
                    id="customer-login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Sua senha"
                    disabled={loading}
                  />

                  <button type="submit" className="button primary" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>
                </form>
              </>
            ) : (
              <form className="customer-auth-form" onSubmit={submitRegisterForm}>
                <label htmlFor="customer-register-name">Nome</label>
                <input
                  id="customer-register-name"
                  type="text"
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Seu nome"
                  disabled={loading}
                />

                <label htmlFor="customer-register-email">E-mail</label>
                <input
                  id="customer-register-email"
                  type="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="seu@email.com"
                  disabled={loading}
                />

                <label htmlFor="customer-register-password">Senha</label>
                <input
                  id="customer-register-password"
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Minimo de 6 caracteres"
                  disabled={loading}
                />

                <button type="submit" className="button primary" disabled={loading}>
                  {loading ? 'Cadastrando...' : 'Criar conta'}
                </button>
              </form>
            )}

            {status ? <p className="admin-status">{status}</p> : null}
          </>
        )}
      </article>
    </section>
  );
}
