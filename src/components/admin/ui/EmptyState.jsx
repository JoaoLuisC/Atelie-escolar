import PropTypes from 'prop-types';

export function EmptyState({ icon = 'inbox', title, description }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
      <i className={`bi bi-${icon} text-3xl text-slate-400`} />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

EmptyState.propTypes = {
  icon: PropTypes.string,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
};
