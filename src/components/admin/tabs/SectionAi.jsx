import { useState } from 'react';
import { Button } from '../ui/Button';
import { requestAiAssist } from '../../../services/admin-panel';

/**
 * "Aprimorar seção": o botão de IA de UMA parte da página da loja. É um HOOK
 * (tem estado) que devolve `{ button, panel }`: o botão vai no cabeçalho da
 * seção e o painel com a sugestão, no corpo.
 *
 * Fica no cabeçalho da seção e só gera quando a pessoa clica. A sugestão
 * aparece embaixo para revisar; "Usar" leva para o rascunho (que se vê na
 * prévia) e nada vai para o site antes de Salvar. `current` são os textos de
 * hoje — a IA melhora o que existe, não inventa do zero.
 */
export function useSectionAi({ task, current, labels, onApply, onStart }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState(null);

  async function generate(event) {
    // Dentro de <summary>, o clique abriria/fecharia a seção.
    event.preventDefault();
    event.stopPropagation();
    onStart?.();
    setLoading(true);
    setError('');
    try {
      const currentText = Object.entries(current)
        .filter(([, value]) => String(value || '').trim())
        .map(([key, value]) => `${labels[key] || key}: ${value}`)
        .join('\n');
      setSuggestion(await requestAiAssist(task, { currentText }));
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível gerar a sugestão agora.');
    } finally {
      setLoading(false);
    }
  }

  const entries = suggestion
    ? Object.entries(suggestion).filter(([, value]) =>
        Array.isArray(value) ? value.length : String(value || '').trim(),
      )
    : [];

  return {
    button: (
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        data-edit-ui="ai"
        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:bg-violet-300"
      >
        <i
          className={`bi ${loading ? 'bi-arrow-clockwise animate-spin' : 'bi-stars'}`}
          aria-hidden="true"
        />
        {loading ? 'Gerando…' : 'Aprimorar seção'}
      </button>
    ),
    panel:
      error || suggestion ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm">
          {error ? (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          ) : null}
          {suggestion ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                Sugestão da IA — revise antes de usar
              </p>
              <dl className="mt-2 space-y-2">
                {entries.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs font-semibold text-slate-500">{labels[key] || key}</dt>
                    <dd className="text-slate-800">
                      {Array.isArray(value) ? (
                        <ol className="list-decimal space-y-1 pl-5">
                          {value.map((item, index) => (
                            <li key={index}>
                              <strong>{item.titulo}</strong> — {item.texto}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon="check2"
                  onClick={() => {
                    onApply(suggestion);
                    setSuggestion(null);
                  }}
                >
                  Usar estes textos
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
                  Descartar
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null,
  };
}
