import PropTypes from 'prop-types';

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
      <button
        type="button"
        className={`sidebar-overlay${isOpen ? ' open' : ''}`}
        onClick={onClose}
        aria-label="Fechar filtros"
      />

      <aside className={`products-sidebar${isOpen ? ' open' : ''}`}>
        <div className={`sidebar-collapsible${isCategorySectionOpen ? ' open' : ' collapsed'}`}>
          <button type="button" className="sidebar-section-toggle" onClick={onToggleCategorySection}>
            Categorias <i className="bi bi-chevron-down" />
          </button>
          <div className="sidebar-section-body">
            <button
              type="button"
              className={`cat-btn sidebar-cat${activeCategory === 'all' ? ' active' : ''}`}
              onClick={() => onSelectCategory('all')}
            >
              Todos <span className="cat-count">{totalByCategory('all')}</span>
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={`cat-btn sidebar-cat${activeCategory === category ? ' active' : ''}`}
                onClick={() => onSelectCategory(category)}
              >
                {category} <span className="cat-count">{totalByCategory(category)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`sidebar-collapsible${isPriceSectionOpen ? ' open' : ' collapsed'}`}>
          <button type="button" className="sidebar-section-toggle" onClick={onTogglePriceSection}>
            Faixa de preco <i className="bi bi-chevron-down" />
          </button>
          <div className="sidebar-section-body">
            <label className="sidebar-radio">
              <input type="radio" name="price" value="all" checked={activePriceRange === 'all'} onChange={(event) => onSelectPriceRange(event.target.value)} />{' '}
              Todos
            </label>
            <label className="sidebar-radio">
              <input type="radio" name="price" value="0-25" checked={activePriceRange === '0-25'} onChange={(event) => onSelectPriceRange(event.target.value)} />{' '}
              Ate R$ 25
            </label>
            <label className="sidebar-radio">
              <input type="radio" name="price" value="25-50" checked={activePriceRange === '25-50'} onChange={(event) => onSelectPriceRange(event.target.value)} />{' '}
              R$ 25 - R$ 50
            </label>
            <label className="sidebar-radio">
              <input type="radio" name="price" value="50+" checked={activePriceRange === '50+'} onChange={(event) => onSelectPriceRange(event.target.value)} />{' '}
              Acima de R$ 50
            </label>
          </div>
        </div>
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