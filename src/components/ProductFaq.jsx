import PropTypes from 'prop-types';
import { useState } from 'react';

/**
 * FAQ por produto (Fase 2). Dados vêm de `products.faq` (jsonb).
 * Não renderiza se não houver perguntas configuradas — não inventar
 * conteúdo (regra B6: mensagens humanas, sem placeholder).
 */
export function ProductFaq({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (!Array.isArray(items) || items.length === 0) return null;

  const normalized = items
    .map((entry) => ({
      question: String(entry?.question || '').trim(),
      answer: String(entry?.answer || '').trim(),
    }))
    .filter((entry) => entry.question && entry.answer)
    .slice(0, 8);

  if (normalized.length === 0) return null;

  return (
    <section aria-labelledby="product-faq-title" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Perguntas frequentes</p>
        <h2 id="product-faq-title" className="font-display text-xl font-bold text-slate-900">
          Tire suas dúvidas
        </h2>
      </header>
      <ul className="flex flex-col gap-2">
        {normalized.map((entry, index) => {
          const isOpen = openIndex === index;
          const panelId = `faq-panel-${index}`;
          const buttonId = `faq-button-${index}`;
          return (
            <li key={entry.question} className="rounded-xl border border-slate-200 bg-slate-50/40">
              <h3 className="text-sm">
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-slate-800 transition hover:bg-slate-100/60"
                >
                  <span>{entry.question}</span>
                  <i
                    className={`bi bi-chevron-down shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </h3>
              {isOpen ? (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="border-t border-slate-200 px-4 py-3 text-sm leading-relaxed text-slate-700"
                >
                  {entry.answer}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

ProductFaq.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      question: PropTypes.string.isRequired,
      answer: PropTypes.string.isRequired,
    }),
  ),
};
