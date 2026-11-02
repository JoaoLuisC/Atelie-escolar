import { useState } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

/**
 * O formulário de "trocar o nome" da conta do cliente — o mesmo em /login
 * (Minha conta) e em /downloads (Meus produtos → Minha conta). `children`
 * entra depois do botão (links de privacidade, por exemplo).
 */
export function AccountNameForm({ title, submitLabel = 'Salvar nome', className = '', children }) {
  const { customerSession, updateCustomerName } = useAuth();
  const { pushToast } = useToast();
  // null = ainda não editado (mostra o nome da sessão); '' = a pessoa apagou o campo.
  const [name, setName] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateCustomerName(name ?? customerSession?.name ?? '');
      pushToast('Nome atualizado.', 'success');
    } catch (error) {
      pushToast(error?.message || 'Não foi possível salvar seu nome.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      {title ? <h3 className="text-sm font-bold text-slate-900">{title}</h3> : null}
      <label
        htmlFor="account-name"
        className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        Nome
      </label>
      <input
        id="account-name"
        value={name ?? customerSession?.name ?? ''}
        onChange={(event) => setName(event.target.value)}
        minLength={2}
        maxLength={120}
        required
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <p className="mt-2 text-xs text-slate-500">E-mail: {customerSession?.email}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Salvando…' : submitLabel}
        </button>
        {children}
      </div>
    </form>
  );
}

AccountNameForm.propTypes = {
  title: PropTypes.string,
  submitLabel: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.node,
};
