import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { getSupabaseBrowserClient } from '../services/supabase-browser';
import { ROUTES } from '../constants/routes';

function getSafeRedirect(search) {
  const params = new URLSearchParams(search);
  const redirect = params.get('redirect');

  return redirect === '/downloads' ? '/downloads' : '/checkout';
}

function applyRecoverySessionFromUrl(supabase) {
  const searchParams = new URLSearchParams(globalThis.window.location.search);
  const code = String(searchParams.get('code') || '').trim();

  if (code) {
    return supabase.auth.exchangeCodeForSession(code);
  }

  const hashParams = new URLSearchParams(
    String(globalThis.window.location.hash || '').replace(/^#/, ''),
  );
  const accessToken = String(hashParams.get('access_token') || '').trim();
  const refreshToken = String(hashParams.get('refresh_token') || '').trim();

  if (accessToken && refreshToken) {
    return supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  return Promise.resolve({ data: null, error: null });
}

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const supabase = getSupabaseBrowserClient();
  const redirectTo = getSafeRedirect(location.search);

  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRecoverySession() {
      if (!supabase) {
        pushToast('Configuração do Supabase ausente no frontend.', 'error');
        setLoading(false);
        return;
      }

      try {
        const { error } = await applyRecoverySessionFromUrl(supabase);
        if (error) {
          throw error;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          pushToast('Defina uma nova senha para sua conta.', 'warning');
        } else {
          pushToast('Abra o link enviado por e-mail para concluir a redefinição.', 'warning');
        }
      } catch (error) {
        const message = error?.message || 'Não foi possível validar o link de recuperação.';
        pushToast(message, 'error');
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
  }, [pushToast, supabase]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!newPassword || newPassword.length < 8) {
      pushToast('A nova senha precisa ter ao menos 8 caracteres.', 'warning');
      return;
    }

    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      pushToast('A senha deve ter letra maiúscula, minúscula e número.', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      pushToast('As senhas digitadas não conferem.', 'warning');
      return;
    }

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
      const message = error?.message || 'Não foi possível atualizar a senha.';
      pushToast(message, 'error');
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
              Use ao menos 8 caracteres, com letra maiúscula, minúscula e número.
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
            <strong>{redirectTo === '/downloads' ? 'Downloads' : 'Checkout'}</strong>.
          </p>
        </form>
      </article>
    </section>
  );
}
