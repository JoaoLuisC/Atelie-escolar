import PropTypes from 'prop-types';

export function StatusStepper({ activeStep, description, steps }) {
  return (
    <section className="status-stepper" aria-label="Progresso do processo">
      <div className="status-stepper-track">
        {steps.map((step, index) => {
          const isActive = index === activeStep;
          const isComplete = index < activeStep;

          return (
            <div
              key={step.label}
              className={`status-step${isActive ? ' active' : ''}${isComplete ? ' complete' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="status-step-index">{index + 1}</span>
              <div className="status-step-copy">
                <strong>{step.label}</strong>
                <p>{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      {description ? <p className="status-stepper-note">{description}</p> : null}
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

StatusStepper.defaultProps = {
  description: '',
};