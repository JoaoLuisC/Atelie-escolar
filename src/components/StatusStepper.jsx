import PropTypes from 'prop-types';

export function StatusStepper({ activeStep, description = '', steps }) {
  return (
    <section
      aria-label="Progresso do processo"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => {
          const isActive = index === activeStep;
          const isComplete = index < activeStep;

          const circleClasses = isComplete
            ? 'bg-emerald-500 text-white'
            : isActive
              ? 'bg-brand-600 text-white shadow-brand'
              : 'bg-slate-100 text-slate-500';

          return (
            <li
              key={step.label}
              aria-current={isActive ? 'step' : undefined}
              className={`flex gap-3 rounded-xl p-3 ring-1 transition ${
                isActive ? 'bg-brand-50/60 ring-brand-200' : 'ring-slate-100'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${circleClasses}`}
              >
                {isComplete ? <i className="bi bi-check2" /> : index + 1}
              </span>
              <div className="min-w-0">
                <strong className="block text-sm font-semibold text-slate-900">{step.label}</strong>
                <p className="text-xs text-slate-500">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {description ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {description}
        </p>
      ) : null}
    </section>
  );
}

StatusStepper.propTypes = {
  activeStep: PropTypes.number.isRequired,
  description: PropTypes.string,
  steps: PropTypes.arrayOf(
    PropTypes.shape({
      description: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
};
