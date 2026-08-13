import PropTypes from 'prop-types';

const PRICE_RANGES = [
  { value: 'all', label: 'Todos' },
  { value: '0-25', label: 'Até R$ 25' },
  { value: '25-50', label: 'R$ 25 – R$ 50' },
  { value: '50+', label: 'Acima de R$ 50' },
];

function CollapsibleSection({ title, isOpen, onToggle, children }) {
  return (
    <section className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-700"
      >
        {title}
        <i className={`bi bi-chevron-down text-xs transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

CollapsibleSection.propTypes = {
  title: PropTypes.string.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export function ProductSidebar({
  activeCategory,
  activePriceRange,
  categories,
  isCategorySectionOpen,
  isOpen,
  isPriceSectionOpen,
  onClose,
  onSelectCategory,
  onSelectPriceRange,
  onToggleCategorySection,
  onTogglePriceSection,
  totalByCategory,
}) {
  return (
    <>
      {isOpen ? (
        <button
          type="button"
          aria-label="Fechar filtros"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-slate-200 bg-white shadow-xl transition-transform lg:static lg:z-0 lg:w-auto lg:translate-x-0 lg:rounded-2xl lg:border lg:shadow-sm ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 lg:hidden">
          <span className="text-sm font-bold text-slate-800">Filtros</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <CollapsibleSection
          title="Categorias"
          isOpen={isCategorySectionOpen}
          onToggle={onToggleCategorySection}
        >
          <ul className="flex flex-col gap-1">
            <li>
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  activeCategory === 'all'
                    ? 'bg-brand-50 font-semibold text-brand-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>Todos</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {totalByCategory('all')}
                </span>
              </button>
            </li>
            {categories.map((category) => (
              <li key={category}>
                <button
                  type="button"
                  onClick={() => onSelectCategory(category)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    activeCategory === category
                      ? 'bg-brand-50 font-semibold text-brand-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{category}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {totalByCategory(category)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection
          title="Faixa de preço"
          isOpen={isPriceSectionOpen}
          onToggle={onTogglePriceSection}
        >
          <ul className="flex flex-col gap-1.5">
            {PRICE_RANGES.map((range) => (
              <li key={range.value}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="price"
                    value={range.value}
                    checked={activePriceRange === range.value}
                    onChange={(event) => onSelectPriceRange(event.target.value)}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                  />
                  {range.label}
                </label>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      </aside>
    </>
  );
}

ProductSidebar.propTypes = {
  activeCategory: PropTypes.string.isRequired,
  activePriceRange: PropTypes.string.isRequired,
  categories: PropTypes.arrayOf(PropTypes.string).isRequired,
  isCategorySectionOpen: PropTypes.bool.isRequired,
  isOpen: PropTypes.bool.isRequired,
  isPriceSectionOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelectCategory: PropTypes.func.isRequired,
  onSelectPriceRange: PropTypes.func.isRequired,
  onToggleCategorySection: PropTypes.func.isRequired,
  onTogglePriceSection: PropTypes.func.isRequired,
  totalByCategory: PropTypes.func.isRequired,
};
