import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';

function DeltaBadge({ trend, pct }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
        <i className="bi bi-arrow-up-right" />+{pct.toFixed(1)}%
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-sm font-bold text-rose-700 ring-1 ring-rose-200">
        <i className="bi bi-arrow-down-right" />
        {pct.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
      <i className="bi bi-dash" />
      Estável
    </span>
  );
}

DeltaBadge.propTypes = {
  trend: PropTypes.string.isRequired,
  pct: PropTypes.number.isRequired,
};

export function ComparisonTab({ monthlyComparison, comparisonDelta }) {
  return (
    <Card
      title="Comparativo mensal"
      subtitle="Mês atual vs. mês anterior"
      action={<DeltaBadge trend={comparisonDelta.trend} pct={comparisonDelta.pct} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {monthlyComparison.map((month, index) => (
          <article
            key={month.label}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {index === 0 ? 'Mês anterior' : 'Mês atual'}
            </p>
            <p className="mt-1 text-base font-semibold capitalize text-slate-900">{month.label}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Vendas</dt>
                <dd className="font-semibold text-slate-900">{month.qty}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Receita</dt>
                <dd className="font-semibold text-slate-900">{formatPrice(month.gross)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Ticket médio</dt>
                <dd className="font-semibold text-slate-900">{formatPrice(month.avg)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

ComparisonTab.propTypes = {
  monthlyComparison: PropTypes.array.isRequired,
  comparisonDelta: PropTypes.shape({
    pct: PropTypes.number.isRequired,
    trend: PropTypes.string.isRequired,
  }).isRequired,
};
