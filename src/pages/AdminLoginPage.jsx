import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { ROUTES } from '../constants/routes';
import { GoogleLogo } from '../components/GoogleLogo';
import { LoginChooser } from '../components/LoginChooser';
import { STAFF_OAUTH_MARKER } from '../services/supabase-browser';
import { SEO } from '../components/SEO';

// Nome de cada método de 2º fator como a admin o reconhece.
const METHOD_LABELS = {
  totp: 'código do app autenticador',
  email: 'código enviado por e-mail',
  pin: 'PIN de recuperação',
};

function describeMethods(methods) {
  const names = methods.map((method) => METHOD_LABELS[method]).filter(Boolean);
  return names.length ? names.join(', ') : 'código de verificação';
}

// Renderizada pelo ProtectedRoute na própria /admin quando não há sessão admin.
export function AdminLoginPage() {
  const navigate = useNavigate();
  const { loginAdmin, loginAdminGoogle, completeAdminGoogle } = useAuth();
  const { pushToast } = useToast();
  const location = useLocation();
  // Voltando do Google (`?oauth=staff`)? Lido na montagem: o estado inicial já
  // nasce "carregando", sem setState síncrono dentro do efeito.
  const [returningFromGoogle] = useState(
    () => new URLSearchParams(location.search).get('oauth') === STAFF_OAUTH_MARKER,
  );
  const [loading, setLoading] = useState(returningFromGoogle);
  const [status, setStatus] = useState(
    returningFromGoogle ? 'Concluindo o login com Google...' : '',
  );
  const googleHandledRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [factorCode, setFactorCode] = useState('');
  const [requiresSecondFactor, setRequiresSecondFactor] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [factorMethods, setFactorMethods] = useState([]);
  const [emailNotice, setEmailNotice] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const acceptsEmail = factorMethods.includes('email');

  // Aplica um desafio de 2º fator vindo do servidor (1ª etapa ou reenvio do
  // código por e-mail). `emailSent` só vem quando houve tentativa de envio.
  function applyChallenge(data) {
    setRequiresSecondFactor(true);
    setChallengeToken(data.challengeToken || '');
    setFactorMethods(Array.isArray(data.methods) ? data.methods : []);
    if (data.emailSent === true) {
      setEmailNotice(
        `Enviamos um código de 6 dígitos para ${data.emailHint || 'o seu e-mail'}. Ele vale por 10 minutos.`,
      );
    } else if (data.emailSent === false) {
      setEmailNotice(
        'Não conseguimos enviar o código por e-mail agora. Use o app autenticador ou o PIN de recuperação.',
      );
    }
  }

  async function handleSendEmailCode() {
    setSendingEmail(true);
    try {
      const data = await loginAdmin({
        username: email.trim(),
        password,
        challengeToken,
        sendEmailCode: true,
      });
      if (data.requiresSecondFactor) applyChallenge(data);
    } catch (error) {
      const message = error.message || 'Não foi possível enviar o código agora.';
      setStatus(message);
      pushToast(message, 'error');
    } finally {
      setSendingEmail(false);
    }
  }

  // Uma vez só: o `code` do Google é de uso único, e o StrictMode monta duas vezes.
  useEffect(() => {
    if (!returningFromGoogle || googleHandledRef.current) return;
    googleHandledRef.current = true;
    completeAdminGoogle()
      .then((data) => {
        if (!data?.success) return;
        pushToast('Login realizado.', 'success');
        navigate(ROUTES.professores, { replace: true });
      })
      .catch((error) => {
        const message = error.message || 'Não foi possível entrar com Google.';
        setStatus(message);
        pushToast(message, 'error');
      })
      .finally(() => setLoading(false));
  }, [returningFromGoogle, completeAdminGoogle, navigate, pushToast]);

  async function handleGoogleLogin() {
    setLoading(true);
    setStatus('Abrindo o Google...');
    try {
      await loginAdminGoogle();
      // navega para o Google: o "carregando" fica até o redirect
    } catch (error) {
      const message = error.message || 'Falha ao iniciar login com Google.';
      setStatus(message);
      pushToast(message, 'error');
      setLoading(false);
    }
  }

  let submitLabel = 'Entrar';
  if (requiresSecondFactor) submitLabel = 'Validar código';
  if (loading) submitLabel = 'Entrando...';

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
        applyChallenge(data);
        setStatus('Informe o código de verificação para concluir o login.');
        return;
      }

      pushToast('Login realizado.', 'success');
      // Com a sessão marcada, o ProtectedRoute já troca o login pelo painel;
      // o navigate só limpa um eventual `?login` da URL.
      navigate(data.user?.role === 'seller' ? ROUTES.professores : ROUTES.admin, { replace: true });
    } catch (error) {
      // "Failed to fetch" é o texto cru do navegador sem rede (ADM-50).
      const message = /failed to fetch|networkerror|load failed/i.test(String(error?.message))
        ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
        : error.message || 'Falha no login administrativo.';
      setStatus(message);
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-100 via-white to-sky-50 px-4 py-10">
      {/* Título próprio da aba e fora dos buscadores (ADM-18 / LOJA-26). */}
      <SEO title="Entrar no painel" pathname={ROUTES.admin} noindex />
      <article className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <LoginChooser active="professor" />
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-lg">
            <i className="bi bi-shield-lock-fill text-2xl" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
              Área do professor
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Entrar como professor(a)</h1>
            <p className="mt-2 text-sm text-slate-600">
              Use o e-mail e a senha da sua conta de professor(a) ou de administração da loja.
            </p>
          </div>
        </div>

        {/* Só professor(a): a administração tem 2º fator e entra pela senha
            (handlers/admin/login-google.js explica o porquê). */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <GoogleLogo />
          Continuar com o Google
        </button>
        <p className="mt-1.5 text-center text-xs text-slate-500">
          Para professores(as). A administração da loja entra com e-mail e senha.
        </p>

        <div
          role="separator"
          aria-label="ou"
          className="my-4 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"
        >
          <span className="h-px flex-1 bg-slate-200" />
          ou
          <span className="h-px flex-1 bg-slate-200" />
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
                placeholder="Seu e-mail"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                required
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
                required
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
                  placeholder="Código de verificação"
                  value={factorCode}
                  onChange={(event) => setFactorCode(event.target.value.replaceAll(/\s+/g, ''))}
                  disabled={loading}
                  required
                  autoComplete="one-time-code"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 font-mono tracking-widest focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Aceito: {describeMethods(factorMethods)}.
              </p>
              {emailNotice ? (
                <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
                  {emailNotice}
                </p>
              ) : null}
              {acceptsEmail ? (
                <button
                  type="button"
                  onClick={handleSendEmailCode}
                  disabled={loading || sendingEmail}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline disabled:text-slate-400"
                >
                  <i className="bi bi-envelope" />
                  {sendingEmail
                    ? 'Enviando…'
                    : emailNotice
                      ? 'Reenviar código por e-mail'
                      : 'Enviar código por e-mail'}
                </button>
              ) : null}
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
          <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {status}
          </p>
        ) : null}

        {/* A conta do admin é uma conta Supabase como a dos clientes: a
            redefinição de senha da loja serve para ela também (ADM-18). */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <Link
            to={`${ROUTES.login}?mode=forgot&redirect=${encodeURIComponent(ROUTES.admin)}`}
            className="font-semibold text-violet-700 hover:underline"
          >
            Esqueci minha senha
          </Link>
          <Link to={ROUTES.home} className="text-slate-500 hover:text-slate-700 hover:underline">
            <i className="bi bi-arrow-left" /> Voltar à loja
          </Link>
        </div>
      </article>
    </section>
  );
}
