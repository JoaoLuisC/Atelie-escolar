import PropTypes from 'prop-types';

export function StatCard({ label, value, icon, accent = 'primary', hint = null }) {
  const accentClasses = {
    primary: 'from-violet-500/10 to-violet-500/0 text-violet-700 ring-violet-200',
    success: 'from-emerald-500/10 to-emerald-500/0 text-emerald-700 ring-emerald-200',
    warning: 'from-amber-500/10 to-amber-500/0 text-amber-700 ring-amber-200',
    info: 'from-sky-500/10 to-sky-500/0 text-sky-700 ring-sky-200',
    neutral: 'from-slate-500/10 to-slate-500/0 text-slate-700 ring-slate-200',
  };

  const accentClass = accentClasses[accent] || accentClasses.primary;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentClass}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ${accentClass
              .split(' ')
              .filter((c) => c.startsWith('text-') || c.startsWith('ring-'))
              .join(' ')}`}
          >
            <i className={`bi bi-${icon} text-lg`} />
          </span>
        ) : null}
      </div>
    </article>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.string,
  accent: PropTypes.oneOf(['primary', 'success', 'warning', 'info', 'neutral']),
  hint: PropTypes.string,
};
