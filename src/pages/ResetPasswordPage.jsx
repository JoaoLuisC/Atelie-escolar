import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { getSupabaseBrowserClient } from '../services/supabase-browser';

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

  const hashParams = new URLSearchParams(String(globalThis.window.location.hash || '').replace(/^#/, ''));
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
        const message = error?.message || 'Nao foi possivel validar o link de recuperação.';
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

    if (!newPassword || newPassword.length < 6) {
      pushToast('A nova senha deve ter pelo menos 6 caracteres.', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      pushToast('As senhas digitadas nao conferem.', 'warning');
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
      const message = error?.message || 'Nao foi possivel atualizar a senha.';
      pushToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-standalone-page customer-reset-page">
      <article className="card customer-auth-card auth-standalone-card">
        <div className="auth-standalone-head">
          <p className="eyebrow">Conta</p>
          <h1>Redefinir senha</h1>
          <p>Escolha uma nova senha para continuar acessando sua conta.</p>
          <Link to="/login" className="auth-back-link">
            <i className="bi bi-arrow-left" /> Voltar para o login
          </Link>
        </div>

        <form className="customer-auth-form customer-reset-form" onSubmit={handleSubmit}>
          <label htmlFor="new-password">Nova Senha</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Mínimo de 6 caracteres"
            disabled={loading}
          />

          <label htmlFor="confirm-password">Confirmar Nova Senha</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Digite a senha novamente"
            disabled={loading}
          />

          <button type="submit" className="button primary" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>

          <p className="customer-reset-note">
            Após concluir, você será redirecionado para {redirectTo === '/downloads' ? 'Downloads' : 'Checkout'}.
          </p>
        </form>
      </article>
    </section>
  );
}
