import PropTypes from 'prop-types';

export function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast-${toast.type}`} data-type={toast.type}>
          <p>{toast.message}</p>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Fechar aviso">
            x
          </button>
        </article>
      ))}
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
