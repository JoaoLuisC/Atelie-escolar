import PropTypes from 'prop-types';

const STATUS_MAP = {
  approved: { label: 'Aprovado', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  completed: { label: 'Concluído', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  rejected: { label: 'Recusado', cls: 'bg-rose-100 text-rose-800 ring-rose-200' },
  cancelled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  failed: { label: 'Falhou', cls: 'bg-rose-100 text-rose-800 ring-rose-200' },
};

export function StatusChip({ status }) {
  const key = String(status || '').toLowerCase();
  const entry = STATUS_MAP[key] || {
    label: status || '-',
    cls: 'bg-slate-100 text-slate-700 ring-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${entry.cls}`}
    >
      {entry.label}
    </span>
  );
}

StatusChip.propTypes = {
  status: PropTypes.string,
};
