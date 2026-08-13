import PropTypes from 'prop-types';

const BASE_CLASSES = 'animate-pulse rounded bg-slate-200/80';

export function SkeletonLine({ width = 'w-full', height = 'h-3.5', className = '' }) {
  return (
    <span aria-hidden="true" className={`block ${BASE_CLASSES} ${width} ${height} ${className}`} />
  );
}

SkeletonLine.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  className: PropTypes.string,
};

export function SkeletonBlock({ className = 'h-24 w-full' }) {
  return <span aria-hidden="true" className={`block ${BASE_CLASSES} ${className}`} />;
}

SkeletonBlock.propTypes = {
  className: PropTypes.string,
};

/**
 * Card de skeleton que imita o layout de um download desbloqueado:
 * thumb + duas linhas de texto + botão. Mantém o usuário ancorado
 * no formato esperado enquanto o backend confirma o pagamento.
 */
export function SkeletonDownloadCard() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Carregando arquivos do pedido"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-brand-50 to-white p-3 ring-1 ring-brand-100"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <SkeletonLine width="w-3/5" height="h-4" />
          <SkeletonLine width="w-2/5" height="h-3" />
        </div>
      </div>
      <SkeletonBlock className="h-8 w-24 shrink-0 rounded-lg" />
    </div>
  );
}

export function SkeletonDownloadList({ count = 3 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonDownloadCard key={index} />
      ))}
    </div>
  );
}

SkeletonDownloadList.propTypes = {
  count: PropTypes.number,
};
