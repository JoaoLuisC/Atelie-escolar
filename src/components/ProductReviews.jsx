import PropTypes from 'prop-types';

/**
 * Depoimentos reais por produto (Fase 2).
 * Dados vêm de `products.reviews` (jsonb): { author, role, location, text, rating }.
 * Não inventar depoimentos — se vazio, não renderiza o bloco.
 */
export function ProductReviews({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const normalized = items
    .map((entry) => ({
      author: String(entry?.author || '').trim(),
      role: String(entry?.role || '').trim(),
      location: String(entry?.location || '').trim(),
      text: String(entry?.text || '').trim(),
      rating: Number.isFinite(Number(entry?.rating)) ? Number(entry.rating) : null,
    }))
    .filter((entry) => entry.author && entry.text)
    .slice(0, 6);

  if (normalized.length === 0) return null;

  return (
    <section aria-labelledby="product-reviews-title" className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50/50 to-white p-5 shadow-sm sm:p-6">
      <header className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Quem já usou</p>
        <h2 id="product-reviews-title" className="font-display text-xl font-bold text-slate-900">
          O que professores estão falando
        </h2>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {normalized.map((entry) => {
          const initial = entry.author.charAt(0).toUpperCase();
          const subtitle = [entry.role, entry.location].filter(Boolean).join(' · ');
          return (
            <li
              key={`${entry.author}-${entry.text.slice(0, 24)}`}
              className="flex gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-pink text-sm font-bold text-white"
              >
                {initial}
              </span>
              <div className="min-w-0">
                {entry.rating ? (
                  <p aria-label={`Avaliação ${entry.rating} de 5`} className="mb-1 text-xs text-amber-500">
                    {'★'.repeat(Math.max(0, Math.min(5, Math.round(entry.rating))))}
                    <span className="text-slate-300">{'★'.repeat(5 - Math.max(0, Math.min(5, Math.round(entry.rating))))}</span>
                  </p>
                ) : null}
                <p className="text-sm leading-relaxed text-slate-700">“{entry.text}”</p>
                <p className="mt-2 text-xs font-semibold text-slate-600">{entry.author}</p>
                {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

ProductReviews.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      author: PropTypes.string.isRequired,
      role: PropTypes.string,
      location: PropTypes.string,
      text: PropTypes.string.isRequired,
      rating: PropTypes.number,
    }),
  ),
};
