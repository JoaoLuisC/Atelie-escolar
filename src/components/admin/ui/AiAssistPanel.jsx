import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Um uso de IA no painel: diz o que faz e SÓ gera quando a pessoa clica.
 * A sugestão aparece para revisar; nada entra no formulário sem um clique em
 * "Usar…" (os botões vêm de `renderSuggestion`).
 */
export function AiAssistPanel({ title, description, buttonLabel, onRequest, renderSuggestion }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState(null);

  async function handleClick() {
    setLoading(true);
    setError('');
    try {
      setSuggestion(await onRequest());
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível gerar a sugestão agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-violet-900">
            <i className="bi bi-stars" aria-hidden="true" /> {title}
          </p>
          <p className="mt-1 text-xs text-violet-800/80">{description}</p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-violet-300"
        >
          {loading ? (
            <i className="bi bi-arrow-clockwise animate-spin" aria-hidden="true" />
          ) : (
            <i className="bi bi-stars" aria-hidden="true" />
          )}
          {loading ? 'Gerando…' : suggestion ? 'Gerar outra sugestão' : buttonLabel}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      {suggestion ? (
        <div className="mt-3 space-y-3 rounded-lg border border-violet-100 bg-white p-3 text-sm text-slate-700">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            Sugestão da IA — revise antes de usar
          </p>
          {renderSuggestion(suggestion, () => setSuggestion(null))}
        </div>
      ) : null}
    </section>
  );
}

AiAssistPanel.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  buttonLabel: PropTypes.string.isRequired,
  onRequest: PropTypes.func.isRequired,
  renderSuggestion: PropTypes.func.isRequired,
};
