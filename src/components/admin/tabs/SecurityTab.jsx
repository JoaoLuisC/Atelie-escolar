import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { securitySaveProblem, generateTotpSecret, isFlagOn } from './security-rules';

function SecretField({ id, label, value, onChange, placeholder, hint, action = null }) {
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
          aria-label={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
        />
        {action}
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
  action: PropTypes.node,
};

function CodeField({ id, label, value, onChange, hint }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        maxLength={64}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 sm:max-w-xs"
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

CodeField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  hint: PropTypes.string,
};

// ════════════════════════════════════════════════════════════════════
// A aba que podia trancar o admin fora (ADM-38/ADM-49).
//
// 1. O checkbox nascia MARCADO com adminConfig vazio (`twoFactorEnabled !==
//    false` é verdadeiro para `undefined`): um "Salvar" ligava o 2FA sem método
//    nenhum, e o login passava a responder 500. Agora ele reflete o que está
//    gravado, e salvar "exigir 2FA" sem método é bloqueado aqui e no servidor.
// 2. Segredo TOTP novo só é enviado com o código que o app gerou A PARTIR
//    dele — prova de que app e servidor concordam antes de o segredo valer.
// 3. Com o 2FA em vigor, o servidor exige `confirmationCode` (o fator atual)
//    para mexer em qualquer campo de segurança, e a tela não tinha onde
//    digitá-lo: qualquer troca dava 403 sem saída. Agora há o campo.
// ════════════════════════════════════════════════════════════════════
export function SecurityTab({ config, onSave, saving = false }) {
  const [totpSecret, setTotpSecret] = useState('');
  const [fallbackPin, setFallbackPin] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [totpVerificationCode, setTotpVerificationCode] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [problem, setProblem] = useState('');

  // O GET redige os segredos e só expõe flags de "está configurado".
  const has2FA = Boolean(config?.has2FA);
  const hasPin = Boolean(config?.hasPin);
  const requiredNow =
    isFlagOn(config?.twoFactorEnabled) ||
    isFlagOn(config?.requireSecondFactor) ||
    isFlagOn(config?.require2FA);
  const pinAllowed = config?.allowPinFallback !== false;
  const enforcedNow = requiredNow && (has2FA || (hasPin && pinAllowed));

  useEffect(() => {
    // Campos começam vazios: deixar em branco preserva o segredo já guardado;
    // digitar um novo valor o substitui (o backend faz o merge "pegajoso").
    setTotpSecret('');
    setFallbackPin('');
    setTotpVerificationCode('');
    setConfirmationCode('');
    setProblem('');
    // Reflete o que está GRAVADO. Config vazia = 2FA desligado.
    setEnabled(
      isFlagOn(config?.twoFactorEnabled) ||
        isFlagOn(config?.requireSecondFactor) ||
        isFlagOn(config?.require2FA),
    );
  }, [config]);

  async function handleSave() {
    const nextTotp = totpSecret.trim();
    const nextPin = fallbackPin.trim();

    const erro = securitySaveProblem({
      enabled,
      requiredNow,
      enforcedNow,
      has2FA,
      hasPin,
      pinAllowed,
      nextTotp,
      nextPin,
      totpVerificationCode,
      confirmationCode,
    });
    setProblem(erro || '');
    if (erro) return;

    const payload = {};
    if (config && typeof config === 'object') {
      // Preserva demais campos do adminConfig, sem as flags/segredos do GET.
      const { has2FA: _h, hasPin: _p, totpSecret: _t, fallbackPin: _f, ...rest } = config;
      Object.assign(payload, rest);
    }
    if (nextTotp) payload.totpSecret = nextTotp; // só envia quando há valor novo
    if (nextPin) payload.fallbackPin = nextPin;
    payload.twoFactorEnabled = enabled;
    if (!enabled) {
      // O login considera o 2FA exigido se QUALQUER um dos três nomes herdados
      // estiver ligado: desmarcar só `twoFactorEnabled` não desligava nada.
      payload.requireSecondFactor = false;
      payload.require2FA = false;
    }

    const extras = {};
    if (nextTotp) extras.totpVerificationCode = totpVerificationCode.trim();
    if (confirmationCode.trim()) extras.confirmationCode = confirmationCode.trim();

    await onSave(payload, extras);
  }

  function handleGenerateSecret() {
    setTotpSecret(generateTotpSecret());
    setTotpVerificationCode('');
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
                Quando ativado, o login do admin exigirá código TOTP (ou o PIN de recuperação). Só
                pode ser ativado com pelo menos um dos dois cadastrado.
              </span>
            </span>
          </label>

          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              enforcedNow
                ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
            }`}
          >
            {enforcedNow
              ? `2FA em vigor (${[has2FA ? 'TOTP' : null, hasPin && pinAllowed ? 'PIN' : null]
                  .filter(Boolean)
                  .join(' + ')}).`
              : 'O 2FA não está em vigor: hoje o login pede só e-mail e senha.'}
          </p>

          <SecretField
            id="security-totp-secret"
            label="TOTP secret (Base32)"
            value={totpSecret}
            onChange={(value) => {
              setTotpSecret(value);
              setTotpVerificationCode('');
            }}
            placeholder={has2FA ? '•••••••• — configurado' : 'Ex: JBSWY3DPEHPK3PXP'}
            hint={
              has2FA
                ? 'Já configurado. Gere ou digite um novo segredo para substituir, ou deixe em branco para manter o atual.'
                : 'Clique em "Gerar", cadastre a chave no app autenticador (Google Authenticator, 1Password, Authy) e confirme com o código que ele mostrar.'
            }
            action={
              <Button variant="secondary" size="md" icon="key" onClick={handleGenerateSecret}>
                Gerar
              </Button>
            }
          />

          {totpSecret.trim() ? (
            <CodeField
              id="security-totp-verification"
              label="Código do app para este segredo"
              value={totpVerificationCode}
              onChange={setTotpVerificationCode}
              hint="Cadastre a chave acima no app autenticador e digite o código de 6 dígitos que ele gerar. Sem isso o segredo não é salvo — um segredo copiado errado trancaria o login."
            />
          ) : null}

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

          {enforcedNow ? (
            <CodeField
              id="security-confirmation-code"
              label="Código atual (TOTP ou PIN)"
              value={confirmationCode}
              onChange={setConfirmationCode}
              hint="Com o 2FA em vigor, qualquer mudança aqui exige o código do app (ou o PIN de recuperação) ATUAL."
            />
          ) : null}

          {problem ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200"
            >
              {problem}
            </p>
          ) : null}

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
