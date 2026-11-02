import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { getSupabaseBrowserClient } from '../services/supabase-browser';
import { ROUTES } from '../constants/routes';
import { isStrongPassword } from '../constants/password-policy';

/**
 * O template de e-mail (supabase/templates/recovery.html) aponta sempre para
 * /reset-password do site e leva o RedirectTo original em `next`: assim o link
 * funciona mesmo quando o Supabase cai no Site URL. O destino vem de
 * `redirect` (direto) ou do `redirect` de dentro de `next`.
 */
function readRedirectParam(params) {
  const direct = params.get('redirect');
  if (direct) return direct;
  try {
    return new URL(params.get('next') || '', globalThis.window?.location?.origin).searchParams.get(
      'redirect',
    );
  } catch {
    return null;
  }
}

function getSafeRedirect(search) {
  const params = new URLSearchParams(search);
  const redirect = readRedirectParam(params);

  // Allowlist fixa (nada de caminho livre vindo da URL): o checkout, o login do
  // painel (troca de senha pela aba "Minha conta") ou, por padrão, Meus produtos.
  if (redirect === ROUTES.checkout || redirect === ROUTES.admin) return redirect;
  return ROUTES.downloads;
}

const REDIRECT_LABELS = {
  [ROUTES.downloads]: 'Meus produtos',
  [ROUTES.checkout]: 'o checkout',
  [ROUTES.admin]: 'o login do painel',
};

/**
 * Erro do SDK do Supabase em português (LOJA-45).
 *
 * O SDK devolve texto cru em inglês ("Auth session missing!") e a página o
 * jogava direto no toast. Ramifica pelo `code`/`name` do erro quando existe, e
 * só então pelo texto — o SDK não marca todos os casos com código.
 */
export function recoveryErrorMessage(error, fallback) {
  const code = String(error?.code || '').toLowerCase();
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();

  if (
    name === 'AuthSessionMissingError' ||
    code === 'session_not_found' ||
    message.includes('session missing')
  ) {
    return 'O link de recuperação não foi aberto ou já expirou. Peça um novo em "Esqueci minha senha".';
  }
  if (
    code === 'otp_expired' ||
    code === 'flow_state_expired' ||
    code === 'flow_state_not_found' ||
    message.includes('expired') ||
    message.includes('invalid')
  ) {
    return 'Este link de recuperação é inválido ou expirou. Peça um novo em "Esqueci minha senha".';
  }
  if (code === 'same_password' || message.includes('different from the old')) {
    return 'A nova senha precisa ser diferente da anterior.';
  }
  if (code === 'weak_password' || message.includes('password')) {
    return 'Senha fraca. Use ao menos 8 caracteres, com letra maiúscula, minúscula, número e caractere especial (! @ # $ % & * e outros; acento não conta).';
  }
  if (Number(error?.status) === 429 || code.includes('rate_limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  return fallback;
}

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const redirectTo = getSafeRedirect(location.search);

  // ── Por que `useRef` e não `useState` (§1.1) ──────────────────────
  // O cliente do Supabase agora é resolvido por `import()` dinâmico, então
  // ele NÃO existe no primeiro render. Guardá-lo em estado provocaria um
  // render extra e, pior, abriria uma janela em que `supabase` é `null` por
  // estar CARREGANDO e não por estar mal configurado — e é exatamente nessa
  // janela que o toast de "Configuração ausente" dispararia um falso
  // negativo. O cliente só é usado dentro de efeito e de handler, que é o
  // caso de uso do `useRef`: valor mutável que não pinta tela.
  const supabaseRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // A promessa é memoizada dentro de `getSupabaseBrowserClient`, então
  // chamar de novo no submit não baixa o chunk duas vezes nem cria um
  // segundo cliente com PKCE state separado.
  const resolveSupabase = useCallback(async () => {
    if (supabaseRef.current) return supabaseRef.current;
    const client = await getSupabaseBrowserClient();
    supabaseRef.current = client;
    return client;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRecoverySession() {
      const supabase = await resolveSupabase();
      if (cancelled) return;

      if (!supabase) {
        pushToast('Configuração do Supabase ausente no frontend.', 'error');
        setLoading(false);
        return;
      }

      try {
        // O template próprio usa token_hash para que scanners de e-mail não
        // consumam o link antes da pessoa. A troca só ocorre dentro da página.
        const params = new URLSearchParams(location.search);
        const tokenHash = params.get('token_hash');
        if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (verifyError) throw verifyError;
          params.delete('token_hash');
          params.delete('type');
          // Sem parâmetro restante a URL fica limpa, não `/reset-password?`.
          const query = params.toString();
          globalThis.history.replaceState(
            {},
            '',
            query ? `${location.pathname}?${query}` : location.pathname,
          );
        }
        // No fluxo padrão/legado, o SDK já processa o código durante a
        // inicialização; não repetimos exchangeCodeForSession.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          pushToast('Defina uma nova senha para sua conta.', 'warning');
        } else {
          pushToast('Abra o link enviado por e-mail para concluir a redefinição.', 'warning');
        }
      } catch (error) {
        pushToast(
          recoveryErrorMessage(error, 'Não foi possível validar o link de recuperação.'),
          'error',
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrapRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, pushToast, resolveSupabase]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!newPassword || newPassword.length < 8) {
      pushToast('A nova senha precisa ter ao menos 8 caracteres.', 'warning');
      return;
    }

    if (!isStrongPassword(newPassword)) {
      pushToast(
        'A senha deve ter letra maiúscula, minúscula, número e caractere especial (! @ # $ % & * e outros; acento não conta).',
        'warning',
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      pushToast('As senhas digitadas não conferem.', 'warning');
      return;
    }

    const supabase = await resolveSupabase();
    if (!supabase) {
      pushToast('Configuração do Supabase ausente no frontend.', 'error');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        throw error;
      }

      pushToast('Senha redefinida com sucesso.', 'success');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      pushToast(recoveryErrorMessage(error, 'Não foi possível atualizar a senha.'), 'error');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50';

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-100 via-white to-sky-50 px-4 py-10">
      <article className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-xl backdrop-blur sm:p-8">
        <header className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Conta</p>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Redefinir senha</h1>
          <p className="mt-1 text-sm text-slate-600">
            Escolha uma nova senha para continuar acessando sua conta.
          </p>
          <Link
            to={ROUTES.login}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <i className="bi bi-arrow-left" /> Voltar para o login
          </Link>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="new-password"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Nova senha
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Sua nova senha"
              disabled={loading}
              aria-describedby="new-password-help"
              className={inputClass}
            />
            <p id="new-password-help" className="mt-1 text-xs text-slate-500">
              Use ao menos 8 caracteres, com letra maiúscula, minúscula, número e caractere
              especial.
            </p>
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Confirmar nova senha
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Digite a senha novamente"
              disabled={loading}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:bg-brand-300"
          >
            {loading ? 'Salvando…' : 'Salvar nova senha'}
          </button>

          <p className="text-xs text-slate-500">
            Após concluir, você será redirecionado para{' '}
            <strong>{REDIRECT_LABELS[redirectTo] || 'Meus produtos'}</strong>.
          </p>
        </form>
      </article>
    </section>
  );
}
