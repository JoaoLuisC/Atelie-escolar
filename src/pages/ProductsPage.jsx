import { Shell } from '../components/Shell';
import { ProductGrid } from '../components/ProductGrid';
import { ProductSidebar } from '../components/ProductSidebar';
import { SortDropdown } from '../components/SortDropdown';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { useProductFilters } from '../hooks/useProductFilters';

export function ProductsPage() {
  const { addToCart } = useCart();
  const { pushToast } = useToast();
  const {
    activeCategory,
    activePriceRange,
    activeSort,
    categories,
    closeSidebar,
    error,
    featuredCategories,
    filteredProducts,
    isCategorySectionOpen,
    isPriceSectionOpen,
    isSidebarOpen,
    loading,
    openSidebar,
    selectCategory,
    selectPriceRange,
    setActiveSort,
    toggleCategorySection,
    togglePriceSection,
    totalByCategory,
  } = useProductFilters();

  function onAddToCart(product) {
    const result = addToCart(product);
    pushToast(result.message, result.ok ? 'success' : 'warning');
  }

  const canShowResultsCount = !loading && !error;
  const resultSuffix = filteredProducts.length === 1 ? '' : 's';

  return (
    <Shell>
      <section className="hero-animated products-page-header">
        <div className="hero-bg-gradient" />
        <div className="hero-blob hero-blob-1" />
        <div className="hero-blob hero-blob-2" />
        <div className="hero-blob hero-blob-3" />
        <div className="hero-blob hero-blob-4" />
        <div className="hero-grid" />

        <div className="hero-school-icons" aria-hidden="true">
          <span className="school-icon school-icon-1">✏️</span>
          <span className="school-icon school-icon-2">📚</span>
          <span className="school-icon school-icon-3">🎨</span>
          <span className="school-icon school-icon-4">⭐</span>
          <span className="school-icon school-icon-5">📐</span>
          <span className="school-icon school-icon-6">🖍️</span>
          <span className="school-icon school-icon-7">📏</span>
          <span className="school-icon school-icon-8">🔢</span>
          <span className="school-icon school-icon-9">🌈</span>
          <span className="school-icon school-icon-10">🎒</span>
        </div>

        <div className="container hero-content">
          <div className="row align-items-center" style={{ minHeight: '30vh', padding: '40px 0 44px' }}>
            <div className="col-lg-8">
              <h1 className="hero-title" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
                Banners para toda
                <br />
                <span className="highlight-royal">ocasiao escolar</span>
              </h1>
            </div>
          </div>
        </div>
      </section>

      <div className="products-layout">
        <ProductSidebar
          activeCategory={activeCategory}
          activePriceRange={activePriceRange}
          categories={categories}
          isCategorySectionOpen={isCategorySectionOpen}
          isOpen={isSidebarOpen}
          isPriceSectionOpen={isPriceSectionOpen}
          onClose={closeSidebar}
          onSelectCategory={selectCategory}
          onSelectPriceRange={selectPriceRange}
          onToggleCategorySection={toggleCategorySection}
          onTogglePriceSection={togglePriceSection}
          totalByCategory={totalByCategory}
        />

        <div className="products-main">
          <div className="products-top-bar">
            <button type="button" className="btn-toggle-filters" onClick={openSidebar}>
              <i className="bi bi-sliders" /> Filtros
            </button>

            <div className="cat-filter-bar">
              <button
                type="button"
                className={`cat-btn${activeCategory === 'all' ? ' active' : ''}`}
                onClick={() => selectCategory('all')}
              >
                Todos
              </button>
              {featuredCategories.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={`cat-btn${activeCategory === category ? ' active' : ''}`}
                  onClick={() => selectCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <SortDropdown value={activeSort} onChange={(event) => setActiveSort(event.target.value)} />
          </div>

          {canShowResultsCount ? <p className="results-count">{filteredProducts.length} produto{resultSuffix} encontrado{resultSuffix}</p> : null}

          <ProductGrid error={error} loading={loading} onAddToCart={onAddToCart} products={filteredProducts} />
        </div>
      </div>
    </Shell>
  );
}
