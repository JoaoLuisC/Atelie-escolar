import PropTypes from 'prop-types';

// LOJA-22: a redação acompanha a linha fixa do bloco de preço da página de
// produto ("download imediato após a aprovação do pagamento") — antes uma dizia
// "após pagamento" e a outra "após aprovação", lado a lado.
const DEFAULT_BENEFITS = [
  { icon: 'file-pdf-fill', label: 'PDF em alta resolução' },
  { icon: 'printer-fill', label: 'Pronto para imprimir' },
  { icon: 'cloud-arrow-down-fill', label: 'Download imediato após a aprovação do pagamento' },
  { icon: 'arrow-clockwise', label: 'Acesso permanente, sem renovação' },
];

// CROSS-09: o ícone de um benefício customizado é TEXTO LIVRE no painel
// (ProductWizard → "ícone (opcional)"), e a loja só carrega um SUBSET da fonte
// de ícones (scripts/build-icon-subset.js). Ícone fora do subset — inclusive o
// padrão `check-circle-fill`, que nunca entrou nele — desenhava um <i> vazio.
// Agora só os ícones desta lista são usados; qualquer outro cai no padrão.
// As classes estão escritas por extenso para a varredura do subset enxergá-las.
const BENEFIT_ICON_CLASSES = {
  'check-circle-fill': 'bi bi-check-circle-fill',
  'file-pdf-fill': 'bi bi-file-pdf-fill',
  'printer-fill': 'bi bi-printer-fill',
  'cloud-arrow-down-fill': 'bi bi-cloud-arrow-down-fill',
  'arrow-clockwise': 'bi bi-arrow-clockwise',
  'pencil-square': 'bi bi-pencil-square',
  'star-fill': 'bi bi-star-fill',
  'heart-fill': 'bi bi-heart-fill',
  'gift-fill': 'bi bi-gift-fill',
  'palette-fill': 'bi bi-palette-fill',
  'clock-fill': 'bi bi-clock-fill',
  'shield-check': 'bi bi-shield-check',
};

const DEFAULT_ICON_CLASS = BENEFIT_ICON_CLASSES['check-circle-fill'];

function iconClassFor(name) {
  const key = String(name || '')
    .trim()
    .replace(/^bi-/, '');
  return BENEFIT_ICON_CLASSES[key] || DEFAULT_ICON_CLASS;
}

/**
 * Bullets curtos de benefícios — ajudam a conversão na página de produto
 * (Fase 2 do PLANO_ECOMMERCE). Aceita lista custom vinda de
 * `products.benefits` (jsonb); cai no default se vazio.
 */
export function ProductBenefits({ items, className = '' }) {
  const list =
    Array.isArray(items) && items.length > 0
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
            className={`${iconClassFor(benefit.icon)} mt-0.5 shrink-0 text-emerald-600`}
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
