import PropTypes from 'prop-types';

const DEFAULT_BADGES = [
  { icon: 'shield-lock-fill', label: 'Compra segura', tone: 'emerald' },
  { icon: 'credit-card-2-front-fill', label: 'Pagamento Mercado Pago', tone: 'brand' },
  { icon: 'cloud-arrow-down-fill', label: 'Acesso imediato após aprovação', tone: 'sky' },
  { icon: 'envelope-paper-fill', label: 'Suporte por e-mail', tone: 'pink' },
];

const TONE_STYLES = {
  emerald: 'text-emerald-700 ring-emerald-200 bg-emerald-50',
  brand: 'text-brand-700 ring-brand-200 bg-brand-50',
  sky: 'text-sky-700 ring-sky-200 bg-sky-50',
  pink: 'text-rose-700 ring-rose-200 bg-rose-50',
  amber: 'text-amber-700 ring-amber-200 bg-amber-50',
};

export function TrustBadgeRow({ badges = DEFAULT_BADGES, align = 'center', className = '' }) {
  const justify = align === 'start' ? 'justify-start' : align === 'end' ? 'justify-end' : 'justify-center';

  return (
    <div
      role="list"
      aria-label="Selos de confiança"
      className={`flex flex-wrap gap-2 ${justify} ${className}`}
    >
      {badges.map((badge) => {
        const tone = TONE_STYLES[badge.tone] || TONE_STYLES.brand;
        return (
          <span
            role="listitem"
            key={badge.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 sm:text-sm ${tone}`}
          >
            <i className={`bi bi-${badge.icon} text-base`} aria-hidden="true" />
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}

TrustBadgeRow.propTypes = {
  badges: PropTypes.arrayOf(
    PropTypes.shape({
      icon: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      tone: PropTypes.oneOf(['emerald', 'brand', 'sky', 'pink', 'amber']),
    }),
  ),
  align: PropTypes.oneOf(['start', 'center', 'end']),
  className: PropTypes.string,
};
