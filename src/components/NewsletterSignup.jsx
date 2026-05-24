import PropTypes from 'prop-types';
import { useState } from 'react';
import { getApiBaseUrl } from '../utils/api';
import { getAttributionPayload } from '../utils/analytics';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Form de inscrição na newsletter (Fase 3 / regra D1 — double opt-in).
 *
 * UI minimalista para footer do Shell. Após submit, exibe mensagem
 * inline pedindo para confirmar o email — não navega.
 *
 * O backend (/api/subscribe) sempre responde 200 com mensagem genérica
 * (não confirma se o email já existia — privacidade básica).
 */
export function NewsletterSignup({ source = 'footer', className = '' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      setStatus({ type: 'error', message: 'Informe um email válido.' });
      return;
    }

    setStatus({ type: 'loading', message: 'Enviando…' });

    try {
      const response = await fetch(`${getApiBaseUrl()}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          source,
          attribution: getAttributionPayload(),
        }),
      });
      const data = await response.json();

      if (!data.success) {
        setStatus({ type: 'error', message: data.error || 'Não foi possível inscrever agora.' });
        return;
      }

      setStatus({
        type: 'success',
        message: data.alreadyConfirmed
          ? 'Você já está inscrito. Obrigada!'
          : 'Confirmação enviada — verifique sua caixa de entrada e clique no link.',
      });
      setEmail('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Erro de conexão.' });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Inscrever-se na newsletter"
      className={`flex flex-col gap-2 ${className}`}
    >
      <label htmlFor={`newsletter-email-${source}`} className="text-sm font-semibold text-white/80">
        <i className="bi bi-envelope-heart mr-1 text-accent-yellow" aria-hidden="true" />
        Receba dicas + materiais novos no email
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`newsletter-email-${source}`}
          type="email"
          required
          placeholder="seu@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status.type === 'loading' || status.type === 'success'}
          className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-accent-yellow focus:outline-none focus:ring-2 focus:ring-accent-yellow/30"
        />
        <button
          type="submit"
          disabled={status.type === 'loading' || status.type === 'success'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-yellow px-4 py-2 text-sm font-semibold text-brand-900 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.type === 'loading' ? 'Enviando…' : 'Inscrever'}
        </button>
      </div>
      {status.message ? (
        <p
          role={status.type === 'error' ? 'alert' : 'status'}
          className={`text-xs ${
            status.type === 'error' ? 'text-rose-200' : status.type === 'success' ? 'text-emerald-200' : 'text-white/70'
          }`}
        >
          {status.message}
        </p>
      ) : null}
      <p className="text-[10px] text-white/50">
        Você pode cancelar a qualquer momento — link no rodapé de todos os emails.
      </p>
    </form>
  );
}

NewsletterSignup.propTypes = {
  source: PropTypes.string,
  className: PropTypes.string,
};
