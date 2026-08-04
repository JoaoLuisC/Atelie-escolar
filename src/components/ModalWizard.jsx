import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';

const SIZE_CLASSES = {
  'modal-small': 'max-w-md',
  'modal-medium': 'max-w-xl',
  'modal-large': 'max-w-3xl',
};

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
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES['modal-large'];
  const dialogRef = useRef(null);

  // Esc fecha, foco preso dentro do dialog e devolvido ao gatilho ao fechar.
  useEffect(() => {
    const doc = globalThis.document;
    if (!doc) return undefined;

    const previouslyFocused = doc.activeElement;
    const dialog = dialogRef.current;

    const getFocusable = () => {
      if (!dialog) return [];
      return Array.from(
        dialog.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };

    const focusables = getFocusable();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else if (dialog) {
      dialog.focus();
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = doc.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  // Trava o scroll do body enquanto o modal está aberto.
  useEffect(() => {
    const body = globalThis.document?.body;
    if (!body) return undefined;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <dialog
        ref={dialogRef}
        open
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="modal-wizard-title"
        className={`relative z-10 flex w-full max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl focus:outline-none ${sizeClass}`}
      >
        <header className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="modal-wizard-title" className="font-heading text-lg font-bold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>

          {showProgress && steps && steps.length > 1 ? (
            <ol aria-label="Progresso do formulário" className="mt-4 flex items-center gap-2">
              {steps.map((step, idx) => {
                const isActive = currentStep === idx;
                const isCompleted = idx < currentStep;
                return (
                  <li key={step.id} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onStepChange(idx)}
                      disabled={idx > currentStep}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm'
                          : isCompleted
                            ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 text-[10px] font-bold">
                        {isCompleted ? <i className="bi bi-check2" /> : idx + 1}
                      </span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </button>
                    {idx < steps.length - 1 ? <span className="h-px flex-1 bg-slate-200" /> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </header>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
            <div className="flex gap-2">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onStepChange(currentStep - 1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  ← Voltar
                </button>
              ) : null}
              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onStepChange(currentStep + 1);
                  }}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  Avançar →
                </button>
              ) : null}
              {currentStep === steps.length - 1 ? (
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <i className="bi bi-check2" /> {submitLabel}
                </button>
              ) : null}
            </div>
          </footer>
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
    }),
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
