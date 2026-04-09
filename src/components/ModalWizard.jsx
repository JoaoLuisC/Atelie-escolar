import PropTypes from 'prop-types';

export function ModalWizard({
  title,
  steps,
  currentStep,
  onStepChange,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Salvar',
  showProgress = true,
  size = 'modal-large',
}) {
  return (
    <div className="modal-wizard-overlay">
      <button
        type="button"
        className="modal-wizard-overlay-btn"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        aria-label="Fechar modal"
      />
      <dialog
        className={`modal-wizard ${size}`}
        open
      >
        <div className="modal-wizard-header">
          <div className="modal-wizard-title-row">
            <h2>{title}</h2>
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Fechar"
              type="button"
            >
              ×
            </button>
          </div>

          {showProgress && steps && steps.length > 1 && (
            <div className="modal-stepper" role="tablist">
              {steps.map((step, idx) => (
                <div key={step.id} className="modal-stepper-item">
                  <button
                    type="button"
                    className={`modal-step ${
                      currentStep === idx ? 'active' : ''
                    } ${idx < currentStep ? 'completed' : ''}`}
                    onClick={() => onStepChange(idx)}
                    disabled={idx > currentStep}
                  >
                    <span className="modal-step-num">{idx + 1}</span>
                    <span className="modal-step-label">{step.label}</span>
                  </button>
                  {idx < steps.length - 1 && <div className="modal-step-bar" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="modal-wizard-form">
          <div className="modal-wizard-content">{children}</div>

          <div className="modal-wizard-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <div className="modal-nav-group">
              {currentStep > 0 && (
                <button
                  type="button"
                  className="btn-secondary modal-nav-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    onStepChange(currentStep - 1);
                  }}
                >
                  ← Voltar
                </button>
              )}
              {currentStep < steps.length - 1 && (
                <button
                  type="button"
                  className="btn-primary modal-nav-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    onStepChange(currentStep + 1);
                  }}
                >
                  Avançar →
                </button>
              )}
              {currentStep === steps.length - 1 && (
                <button type="submit" className="btn-primary">
                  ✓ {submitLabel}
                </button>
              )}
            </div>
          </div>
        </form>
      </dialog>
    </div>
  );
}

ModalWizard.propTypes = {
  title: PropTypes.string.isRequired,
  steps: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  currentStep: PropTypes.number.isRequired,
  onStepChange: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  submitLabel: PropTypes.string,
  showProgress: PropTypes.bool,
  size: PropTypes.string,
};
