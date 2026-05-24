import PropTypes from 'prop-types';

const TOAST_STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
};

const TOAST_ICONS = {
  success: 'check-circle-fill',
  error: 'exclamation-triangle-fill',
  warning: 'exclamation-circle-fill',
  info: 'info-circle-fill',
};

export function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] mx-auto flex max-w-md flex-col gap-2 px-4 sm:right-4 sm:left-auto sm:items-end"
    >
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
        const icon = TOAST_ICONS[toast.type] || TOAST_ICONS.info;

        return (
          <article
            key={toast.id}
            data-type={toast.type}
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur ${style}`}
          >
            <i className={`bi bi-${icon} mt-0.5 shrink-0`} />
            <p className="flex-1 text-sm">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fechar aviso"
              className="rounded p-0.5 text-current/70 transition hover:bg-black/5 hover:text-current"
            >
              <i className="bi bi-x-lg text-xs" />
            </button>
          </article>
        );
      })}
    </div>
  );
}

ToastViewport.propTypes = {
  toasts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      message: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onDismiss: PropTypes.func.isRequired,
};
