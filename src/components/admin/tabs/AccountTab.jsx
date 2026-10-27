import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useToast } from '../../../hooks/useToast';
import { ROUTES } from '../../../constants/routes';
import { fetchMyAccount, updateMyAccount } from '../../../services/teacher-panel';
import {
  buildPasswordResetRedirectUrl,
  getSupabaseBrowserClient,
} from '../../../services/supabase-browser';
import { formatDateTime } from '../../../utils/date';
import { Card } from '../ui/Card';

// Aba "Minha conta": os dados da própria conta de quem está no painel, com o
// nome editável e a troca de senha por link no e-mail (o mesmo fluxo de
// "Esqueci minha senha", que volta para o login do painel).

const ROLE_LABELS = {
  seller: 'Professor(a)',
  admin: 'Administração da plataforma',
  master: 'Administração da plataforma',
};

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

Field.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
};

export function AccountTab() {
  const { pushToast } = useToast();
  const [account, setAccount] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyAccount()
      .then((data) => {
        if (cancelled) return;
        setAccount(data);
        setName(data.displayName || '');
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || 'Não foi possível carregar sua conta.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await updateMyAccount({ displayName: name });
      setAccount(updated);
      pushToast('Dados salvos.', 'success');
    } catch (saveError) {
      pushToast(saveError.message || 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onResetPassword() {
    setSendingReset(true);
    try {
      const supabase = await getSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(account.email, {
        redirectTo: buildPasswordResetRedirectUrl(ROUTES.admin),
      });
      if (resetError) throw resetError;
      pushToast(`Enviamos o link para trocar a senha para ${account.email}.`, 'success');
    } catch {
      pushToast('Não foi possível enviar o link agora. Tente de novo em alguns minutos.', 'error');
    } finally {
      setSendingReset(false);
    }
  }

  if (error) {
    return <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>;
  }
  if (!account) {
    return <p className="text-sm text-slate-500">Carregando sua conta…</p>;
  }

  const roleLabel = account.storeOwner
    ? 'Professor(a) · dona da loja'
    : ROLE_LABELS[account.role] || account.role;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Seus dados" subtitle="Como você aparece no painel e para a plataforma.">
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label
              htmlFor="account-name"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Nome
            </label>
            <input
              id="account-name"
              type="text"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Como você quer ser chamada(o)"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail">{account.email}</Field>
            <Field label="Tipo de conta">{roleLabel}</Field>
            <Field label="Entra com">
              {account.provider === 'google' ? 'Google' : 'E-mail e senha'}
            </Field>
            <Field label="Conta criada em">
              {account.createdAt ? formatDateTime(account.createdAt) : '—'}
            </Field>
          </dl>
          <button
            type="submit"
            disabled={saving || !name.trim() || name.trim() === account.displayName}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-violet-300"
          >
            {saving ? 'Salvando…' : 'Salvar nome'}
          </button>
        </form>
      </Card>

      <Card
        title="Senha e acesso"
        subtitle="Para trocar a senha, mandamos um link para o seu e-mail."
      >
        <p className="text-sm text-slate-600">
          O link vale por pouco tempo. Depois de criar a senha nova, você volta para o login do
          painel. Para trocar o e-mail da conta, fale com a administração da plataforma.
        </p>
        <button
          type="button"
          onClick={onResetPassword}
          disabled={sendingReset}
          className="mt-4 rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50"
        >
          {sendingReset ? 'Enviando…' : 'Enviar link para trocar a senha'}
        </button>
      </Card>
    </div>
  );
}
