import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/currency';

export function BarList({
  entries,
  formatter = formatPrice,
  accent = 'primary',
  emptyText = 'Sem dados disponíveis.',
}) {
  if (!entries || entries.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  const accentBar =
    {
      primary: 'from-violet-500 to-violet-400',
      success: 'from-emerald-500 to-emerald-400',
      info: 'from-sky-500 to-sky-400',
      warning: 'from-amber-500 to-amber-400',
    }[accent] || 'from-violet-500 to-violet-400';

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{entry.label}</span>
            <span className="shrink-0 font-semibold text-slate-900">{formatter(entry.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${accentBar} transition-all`}
              style={{ width: `${Math.max(4, Math.min(100, Math.round(entry.pct || 0)))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

BarList.propTypes = {
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired,
      pct: PropTypes.number,
    }),
  ),
  formatter: PropTypes.func,
  accent: PropTypes.oneOf(['primary', 'success', 'info', 'warning']),
  emptyText: PropTypes.string,
};
