import { useState } from 'react';
import PropTypes from 'prop-types';
import { useToast } from '../../../hooks/useToast';
import { changeMyPassword, requestMyEmailChange } from '../../../services/teacher-panel';
import { Card } from '../ui/Card';

// Cartões "Trocar senha" e "Trocar e-mail" da aba Minha conta. Os dois pedem a
// senha atual (handlers/teacher/account.js → lib/staff-account.js); o e-mail
// só muda depois do clique no link enviado ao endereço novo.

const INPUT =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100';
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
const PRIMARY =
  'rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-violet-300';

function TextInput({ id, label, ...props }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input id={id} className={INPUT} {...props} />
    </div>
  );
}

TextInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
};

export function PasswordCard({ onForgot, sendingReset = false }) {
  const { pushToast } = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const mismatch = Boolean(form.confirm) && form.next !== form.confirm;
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    if (mismatch) return;
    setSaving(true);
    try {
      await changeMyPassword({ currentPassword: form.current, newPassword: form.next });
      setForm({ current: '', next: '', confirm: '' });
      pushToast('Senha trocada. Use a nova no próximo login.', 'success');
    } catch (changeError) {
      pushToast(changeError.message || 'Não foi possível trocar a senha.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Trocar senha"
      subtitle="Ao menos 8 caracteres, com letra maiúscula, minúscula e número."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <TextInput
          id="account-current-password"
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={set('current')}
        />
        <TextInput
          id="account-new-password"
          label="Senha nova"
          type="password"
          autoComplete="new-password"
          value={form.next}
          onChange={set('next')}
        />
        <TextInput
          id="account-confirm-password"
          label="Repita a senha nova"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          aria-invalid={mismatch}
        />
        {mismatch ? (
          <p className="text-xs text-rose-600">As duas senhas novas não são iguais.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving || !form.current || !form.next || !form.confirm || mismatch}
            className={PRIMARY}
          >
            {saving ? 'Trocando…' : 'Trocar senha'}
          </button>
          <button
            type="button"
            onClick={onForgot}
            disabled={sendingReset}
            className="text-xs font-semibold text-violet-700 hover:underline disabled:opacity-50"
          >
            {sendingReset ? 'Enviando…' : 'Esqueci a senha atual (receber link por e-mail)'}
          </button>
        </div>
      </form>
    </Card>
  );
}

PasswordCard.propTypes = {
  onForgot: PropTypes.func.isRequired,
  sendingReset: PropTypes.bool,
};

export function EmailCard({ currentEmail }) {
  const { pushToast } = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState('');
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await requestMyEmailChange({
        currentPassword: form.password,
        newEmail: form.email,
      });
      setPending(data.pendingEmail || form.email.trim());
      setForm({ email: '', password: '' });
    } catch (changeError) {
      pushToast(changeError.message || 'Não foi possível pedir a troca de e-mail.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Trocar e-mail"
      subtitle={`Hoje: ${currentEmail}. O novo e-mail passa a ser o seu login.`}
    >
      {pending ? (
        <p
          role="status"
          className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          Enviamos um link de confirmação para <strong>{pending}</strong>. A troca só vale depois
          que você clicar nele (confira também a caixa do e-mail atual). Até lá, continue entrando
          com {currentEmail}.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-3">
        <TextInput
          id="account-new-email"
          label="E-mail novo"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
        />
        <TextInput
          id="account-email-password"
          label="Sua senha atual"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
        />
        <button
          type="submit"
          disabled={saving || !form.email || !form.password}
          className={PRIMARY}
        >
          {saving ? 'Enviando…' : 'Trocar e-mail'}
        </button>
      </form>
    </Card>
  );
}

EmailCard.propTypes = {
  currentEmail: PropTypes.string.isRequired,
};
