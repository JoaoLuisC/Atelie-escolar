import PropTypes from 'prop-types';

const DEFAULT_BENEFITS = [
  { icon: 'file-pdf-fill', label: 'PDF em alta resolução' },
  { icon: 'printer-fill', label: 'Pronto para imprimir' },
  { icon: 'cloud-arrow-down-fill', label: 'Download imediato após pagamento' },
  { icon: 'arrow-clockwise', label: 'Acesso permanente, sem renovação' },
];

/**
 * Bullets curtos de benefícios — ajudam a conversão na página de produto
 * (Fase 2 do PLANO_ECOMMERCE). Aceita lista custom vinda de
 * `products.benefits` (jsonb); cai no default se vazio.
 */
export function ProductBenefits({ items, className = '' }) {
  const list = Array.isArray(items) && items.length > 0
    ? items.map((item) => (typeof item === 'string' ? { label: item } : item))
    : DEFAULT_BENEFITS;

  return (
    <ul className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${className}`}>
      {list.slice(0, 6).map((benefit) => (
        <li
          key={benefit.label}
          className="flex items-start gap-2 rounded-lg bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100"
        >
          <i
            className={`bi bi-${benefit.icon || 'check-circle-fill'} mt-0.5 shrink-0 text-emerald-600`}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-emerald-900">{benefit.label}</span>
        </li>
      ))}
    </ul>
  );
}

ProductBenefits.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({ icon: PropTypes.string, label: PropTypes.string.isRequired }),
    ]),
  ),
  className: PropTypes.string,
};
