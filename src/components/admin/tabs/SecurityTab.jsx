import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

function SecretField({ id, label, value, onChange, placeholder, hint }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
        />
        <Button
          variant="secondary"
          size="md"
          icon={revealed ? 'eye-slash' : 'eye'}
          onClick={() => setRevealed((value) => !value)}
          aria-label={revealed ? 'Ocultar' : 'Mostrar'}
        />
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

SecretField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  hint: PropTypes.string,
};

export function SecurityTab({ config, onSave, saving = false }) {
  const [totpSecret, setTotpSecret] = useState('');
  const [fallbackPin, setFallbackPin] = useState('');
  const [enabled, setEnabled] = useState(false);

  // O GET redige os segredos e só expõe flags de "está configurado".
  const has2FA = Boolean(config?.has2FA);
  const hasPin = Boolean(config?.hasPin);

  useEffect(() => {
    // Campos começam vazios: deixar em branco preserva o segredo já guardado;
    // digitar um novo valor o substitui (o backend faz o merge "pegajoso").
    setTotpSecret('');
    setFallbackPin('');
    setEnabled(config?.twoFactorEnabled !== false);
  }, [config]);

  function handleSave() {
    const payload = { twoFactorEnabled: enabled };
    if (config && typeof config === 'object') {
      // Preserva demais campos do adminConfig, sem as flags/segredos do GET.
      const { has2FA: _h, hasPin: _p, totpSecret: _t, fallbackPin: _f, ...rest } = config;
      Object.assign(payload, rest);
    }
    const nextTotp = totpSecret.trim();
    const nextPin = fallbackPin.trim();
    if (nextTotp) payload.totpSecret = nextTotp; // só envia quando há valor novo
    if (nextPin) payload.fallbackPin = nextPin;
    payload.twoFactorEnabled = enabled;
    onSave(payload);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Segundo fator" className="lg:col-span-2">
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                Exigir 2FA no login admin
              </span>
              <span className="block text-xs text-slate-500">
                Quando ativado, o login do admin exigirá código TOTP (ou o PIN de recuperação).
              </span>
            </span>
          </label>

          <SecretField
            id="security-totp-secret"
            label="TOTP secret (Base32)"
            value={totpSecret}
            onChange={setTotpSecret}
            placeholder={has2FA ? '•••••••• — configurado' : 'Ex: JBSWY3DPEHPK3PXP'}
            hint={
              has2FA
                ? 'Já configurado. Digite um novo segredo para substituir, ou deixe em branco para manter o atual.'
                : 'Use um app autenticador (Google Authenticator, 1Password, Authy). Gere uma chave Base32 de 16+ caracteres.'
            }
          />

          <SecretField
            id="security-fallback-pin"
            label="PIN de recuperação"
            value={fallbackPin}
            onChange={setFallbackPin}
            placeholder={hasPin ? '•••••• — configurado' : 'Ex: 487239'}
            hint={
              hasPin
                ? 'Já configurado. Digite um novo PIN para substituir, ou deixe em branco para manter o atual.'
                : 'PIN numérico (6+ dígitos) para uso emergencial caso o TOTP não esteja disponível.'
            }
          />

          <div className="flex justify-end">
            <Button icon="check-lg" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Boas práticas">
        <ul className="space-y-3 text-sm text-slate-600">
          <li className="flex gap-2">
            <i className="bi bi-shield-check mt-0.5 text-emerald-600" />
            Sempre mantenha o 2FA ativo em produção.
          </li>
          <li className="flex gap-2">
            <i className="bi bi-clock-history mt-0.5 text-violet-600" />
            Troque o segredo TOTP em caso de suspeita.
          </li>
          <li className="flex gap-2">
            <i className="bi bi-key mt-0.5 text-amber-600" />
            Guarde o PIN de recuperação em local seguro (cofre/gerenciador de senhas).
          </li>
          <li className="flex gap-2">
            <i className="bi bi-eye-slash mt-0.5 text-slate-600" />
            Nunca compartilhe seus segredos em e-mail ou chat.
          </li>
        </ul>
      </Card>
    </div>
  );
}

SecurityTab.propTypes = {
  config: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool,
};
