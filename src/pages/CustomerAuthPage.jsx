import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  buildPasswordResetRedirectUrl,
  getSupabaseBrowserClient,
} from '../services/supabase-browser';
import { confirmAccountDeletion, requestAccountDeletion } from '../services/customer-auth';
import { ROUTES, sanitizeRedirectPath } from '../constants/routes';

function getMode(search) {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  if (mode === 'register') {
    return 'register';
  }

  if (mode === 'forgot') {
    return 'forgot';
  }

  return 'login';
}

function useCustomerAuthHandlers({
  loginCustomer,
  loginCustomerGoogle,
  registerCustomer,
  pushToast,
  navigate,
  redirectTo,
}) {
  const [loading, setLoading] = useState(false);
  // Erros persistentes inline no formulário (o toast some em ~2.4s e o usuário
  // pode não chegar a lê-lo). Mantemos ambos: toast para chamar atenção e o
  // texto inline para o erro ficar visível enquanto o usuário corrige.
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');

  async function submitLogin(loginForm) {
    setLoginError('');
    if (!loginForm.email.trim() || !loginForm.password) {
      const message = 'Informe e-mail e senha para entrar.';
      setLoginError(message);
      pushToast(message, 'warning');
      return;
    }

    setLoading(true);

    try {
      await loginCustomer({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      pushToast('Login realizado com sucesso.', 'success');
      navigate(redirectTo);
    } catch (error) {
      const message = error?.message || 'E-mail ou senha incorretos.';
      setLoginError(message);
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(registerForm) {
    setRegisterError('');
    const name = registerForm.name.trim();
    const email = registerForm.email.trim();
    const password = registerForm.password;

    if (!name || !email || !password) {
      const message = 'Preencha nome, e-mail e senha para cadastrar.';
      setRegisterError(message);
      pushToast(message, 'warning');
      return;
    }
    if (password.length < 8) {
      const message = 'A senha precisa ter ao menos 8 caracteres.';
      setRegisterError(message);
      pushToast(message, 'warning');
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      const message = 'A senha deve ter letra maiúscula, minúscula e número.';
      setRegisterError(message);
      pushToast(message, 'warning');
      return;
    }

    setLoading(true);

    try {
      const result = await registerCustomer({ name, email, password });

      if (result?.verificationRequired) {
        pushToast('Conta criada. Verifique seu e-mail para confirmar o cadastro.', 'warning');
        return;
      }

      pushToast('Conta criada com sucesso.', 'success');
      navigate(redirectTo);
    } catch (error) {
      const message = error?.message || 'Não foi possível criar a conta.';
      setRegisterError(message);
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function submitGoogleLogin() {
    setLoading(true);
    try {
      await loginCustomerGoogle(redirectTo);
      // navega para Google: loading fica até o redirect
    } catch (error) {
      pushToast(error?.message || 'Falha ao iniciar login com Google.', 'error');
      setLoading(false);
    }
  }

  async function submitPasswordReset(recoveryForm) {
    const email = recoveryForm.email.trim();
    if (!email) {
      pushToast('Informe um e-mail para receber o link de recuperação.', 'warning');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      pushToast('Configuração do Supabase ausente no frontend.', 'error');
      return;
    }

    setLoading(true);

    try {
      const redirectUrl = buildPasswordResetRedirectUrl(redirectTo);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        throw error;
      }

      const message = 'Enviamos um link de recuperação. Verifique sua caixa de entrada.';
      pushToast(message, 'success');
    } catch {
      const message = 'Não foi possível enviar o link de recuperação.';
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    loginError,
    registerError,
    submitLogin,
    submitGoogleLogin,
    submitRegister,
    submitPasswordReset,
  };
}

export function CustomerAuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customerSession, loginCustomer, loginCustomerGoogle, registerCustomer, logoutCustomer } =
    useAuth();
  const { pushToast } = useToast();

  // Sanitizado: o valor vai para navigate() e para o redirect_to do OAuth.
  const redirectTo = sanitizeRedirectPath(new URLSearchParams(location.search).get('redirect'));
  const deleteToken = new URLSearchParams(location.search).get('delete_token') || '';
  const [deleting, setDeleting] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);

  async function handleRequestDeletion() {
    if (
      typeof globalThis.window !== 'undefined' &&
      !globalThis.window.confirm?.(
        'Tem certeza? Enviaremos um e-mail para confirmar a exclusão definitiva da sua conta.',
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const result = await requestAccountDeletion();
      setDeleteRequested(true);
      pushToast(result?.message || 'Enviamos um e-mail de confirmação.', 'success');
      if (result?.devConfirmUrl) {
        console.info('[dev] link de confirmação de exclusão:', result.devConfirmUrl);
      }
    } catch (error) {
      pushToast(error?.message || 'Erro ao solicitar exclusão.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmDeletion() {
    setDeleting(true);
    try {
      await confirmAccountDeletion(deleteToken);
      pushToast('Conta excluída. Sentiremos sua falta.', 'success');
      try {
        await logoutCustomer();
      } catch {
        /* sessão já encerrada no backend */
      }
      navigate(ROUTES.home);
    } catch (error) {
      pushToast(error?.message || 'Erro ao excluir conta.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  const [mode, setMode] = useState(() => getMode(location.search));

  // Re-sincroniza o modo (login/register/forgot) quando a query muda — antes
  // ficava congelado no valor do primeiro render, ignorando navegações que só
  // alteram ?mode=... (ex.: link "Cadastrar" vindo de outra página).
  useEffect(() => {
    setMode(getMode(location.search));
  }, [location.search]);

  const {
    loading,
    loginError,
    registerError,
    submitLogin,
    submitGoogleLogin,
    submitRegister,
    submitPasswordReset,
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
  const [recoveryForm, setRecoveryForm] = useState({ email: '' });

  function changeMode(nextMode) {
    setMode(nextMode);
    if (nextMode === 'forgot') {
      setRecoveryForm((prev) => ({
        ...prev,
        email: loginForm.email,
      }));
    }
  }

  async function submitLoginForm(event) {
    event.preventDefault();
    await submitLogin(loginForm);
  }

  async function submitRegisterForm(event) {
    event.preventDefault();
    await submitRegister(registerForm);
  }

  async function submitRecoveryForm(event) {
    event.preventDefault();
    await submitPasswordReset(recoveryForm);
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50';
  const primaryBtnClass =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:bg-brand-300';

  let authForm = null;

  if (mode === 'login') {
    authForm = (
      <>
        <button
          type="button"
          onClick={submitGoogleLogin}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 via-amber-500 to-sky-500 text-[10px] font-bold text-white"
          >
            G
          </span>
          {loading ? 'Conectando…' : 'Entrar com Google'}
        </button>

        <div
          role="separator"
          aria-label="ou"
          className="my-3 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"
        >
          <span className="h-px flex-1 bg-slate-200" />
          ou
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submitLoginForm} noValidate className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="customer-login-email"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              E-mail
            </label>
            <input
              id="customer-login-email"
              type="email"
              required
              value={loginForm.email}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="seu@email.com"
              disabled={loading}
              aria-invalid={Boolean(loginError)}
              aria-describedby={loginError ? 'customer-login-error' : undefined}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="customer-login-password"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Senha
            </label>
            <input
              id="customer-login-password"
              type="password"
              required
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="Sua senha"
              disabled={loading}
              aria-invalid={Boolean(loginError)}
              aria-describedby={loginError ? 'customer-login-error' : undefined}
              className={inputClass}
            />
          </div>
          {loginError ? (
            <p
              id="customer-login-error"
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
            >
              {loginError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => changeMode('forgot')}
            disabled={loading}
            className="self-end text-xs font-semibold text-brand-700 transition hover:underline"
          >
            Esqueci minha senha
          </button>
          <button type="submit" disabled={loading} className={primaryBtnClass}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </>
    );
  } else if (mode === 'forgot') {
    authForm = (
      <form onSubmit={submitRecoveryForm} noValidate className="flex flex-col gap-3">
        <div>
          <label
            htmlFor="customer-recovery-email"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            E-mail
          </label>
          <input
            id="customer-recovery-email"
            type="email"
            required
            value={recoveryForm.email}
            onChange={(event) =>
              setRecoveryForm((prev) => ({ ...prev, email: event.target.value }))
            }
            placeholder="seu@email.com"
            disabled={loading}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={loading} className={primaryBtnClass}>
          {loading ? 'Enviando…' : 'Enviar link de recuperação'}
        </button>
        <button
          type="button"
          onClick={() => changeMode('login')}
          disabled={loading}
          className="text-xs font-semibold text-slate-500 transition hover:text-slate-700"
        >
          ← Voltar para login
        </button>
      </form>
    );
  } else {
    authForm = (
      <form onSubmit={submitRegisterForm} noValidate className="flex flex-col gap-3">
        <div>
          <label
            htmlFor="customer-register-name"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Nome
          </label>
          <input
            id="customer-register-name"
            type="text"
            required
            value={registerForm.name}
            onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Seu nome"
            disabled={loading}
            aria-invalid={Boolean(registerError)}
            aria-describedby={registerError ? 'customer-register-error' : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="customer-register-email"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            E-mail
          </label>
          <input
            id="customer-register-email"
            type="email"
            required
            value={registerForm.email}
            onChange={(event) =>
              setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
            }
            placeholder="seu@email.com"
            disabled={loading}
            aria-invalid={Boolean(registerError)}
            aria-describedby={registerError ? 'customer-register-error' : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="customer-register-password"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Senha
          </label>
          <input
            id="customer-register-password"
            type="password"
            required
            minLength={8}
            value={registerForm.password}
            onChange={(event) =>
              setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
            }
            placeholder="Sua senha"
            disabled={loading}
            aria-invalid={Boolean(registerError)}
            aria-describedby={
              registerError
                ? 'customer-register-error customer-register-password-help'
                : 'customer-register-password-help'
            }
            className={inputClass}
          />
          <p id="customer-register-password-help" className="mt-1 text-xs text-slate-500">
            Use ao menos 8 caracteres, com letra maiúscula, minúscula e número.
          </p>
        </div>
        {registerError ? (
          <p
            id="customer-register-error"
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
          >
            {registerError}
          </p>
        ) : null}
        <button type="submit" disabled={loading} className={primaryBtnClass}>
          {loading ? 'Cadastrando…' : 'Criar conta'}
        </button>
      </form>
    );
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-100 via-white to-sky-50 px-4 py-10">
      <SEO title="Entrar ou criar conta" pathname="/login" noindex />
      <article className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-xl backdrop-blur sm:p-8">
        <header className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Conta</p>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Acesso do cliente</h1>
          <p className="mt-1 text-sm text-slate-600">
            Entre ou crie sua conta para continuar sua compra.
          </p>
          <Link
            to={ROUTES.home}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <i className="bi bi-arrow-left" /> Voltar para a loja
          </Link>
        </header>

        {deleteToken ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <h3 className="font-bold text-rose-900">Confirmar exclusão de conta</h3>
            <p className="mt-1 text-sm text-rose-800">
              Esta ação remove seus dados pessoais de forma{' '}
              <strong>permanente e irreversível</strong>. Seus pedidos são mantidos anonimizados
              apenas para fins fiscais.
            </p>
            <button
              type="button"
              onClick={handleConfirmDeletion}
              disabled={deleting}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:bg-rose-300"
            >
              <i className="bi bi-trash" /> {deleting ? 'Excluindo…' : 'Excluir permanentemente'}
            </button>
          </div>
        ) : customerSession?.email ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="font-bold text-emerald-900">Você já está conectado</h3>
              <p className="mt-1 text-sm text-emerald-800">
                Sessão ativa para <strong>{customerSession.email}</strong>.
              </p>
              <Link
                to={ROUTES.checkout}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
              >
                Ir para checkout <i className="bi bi-arrow-right" />
              </Link>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
              <h3 className="text-sm font-bold text-rose-900">Excluir minha conta</h3>
              <p className="mt-1 text-xs text-rose-700">
                Remove seus dados pessoais (LGPD). Pedidos são mantidos de forma anonimizada para
                fins fiscais. Ação irreversível.
              </p>
              <button
                type="button"
                onClick={handleRequestDeletion}
                disabled={deleting || deleteRequested}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
              >
                <i className="bi bi-trash" /> {deleting ? 'Enviando…' : 'Excluir minha conta'}
              </button>
              {deleteRequested ? (
                <p className="mt-2 text-xs font-semibold text-rose-700">
                  Verifique seu e-mail para confirmar a exclusão.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {mode !== 'forgot' ? (
              <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    mode === 'login'
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => changeMode('register')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    mode === 'register'
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Cadastrar
                </button>
              </div>
            ) : null}

            {authForm}
          </>
        )}
      </article>
    </section>
  );
}
