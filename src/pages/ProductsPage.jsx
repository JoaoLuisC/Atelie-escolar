import { useEffect } from 'react';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { ProductGrid } from '../components/ProductGrid';
import { ProductSidebar } from '../components/ProductSidebar';
import { SortDropdown } from '../components/SortDropdown';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { useProductFilters } from '../hooks/useProductFilters';
import { trackEvent } from '../utils/analytics';

export function ProductsPage() {
  const { addToCart } = useCart();
  const { pushToast } = useToast();

  // Primeira etapa do funil canônico (PLANO_ECOMMERCE §"Fase 0").
  // Disparado uma vez por montagem — re-renders por filtro/ordenação
  // não devem contar como nova "visita ao catálogo".
  useEffect(() => {
    trackEvent('view_catalog', { source: 'products_page' });
  }, []);
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
      <SEO
        title="Catálogo de materiais educativos"
        description="Banners, painéis e atividades pedagógicas em PDF, organizados por categoria. Pague uma vez e use o ano todo na sala de aula."
        pathname="/produtos"
      />
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-100 via-white to-sky-50">
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-accent-sky/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16">
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl lg:text-5xl">
            Banners para toda
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-accent-pink bg-clip-text text-transparent">
              ocasião escolar
            </span>
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="lg:w-64 lg:shrink-0">
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
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openSidebar}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
              >
                <i className="bi bi-sliders" /> Filtros
              </button>

              <div className="flex flex-1 flex-wrap gap-1.5 overflow-x-auto">
                <CategoryChip
                  active={activeCategory === 'all'}
                  onClick={() => selectCategory('all')}
                >
                  Todos
                </CategoryChip>
                {featuredCategories.map((category) => (
                  <CategoryChip
                    key={category}
                    active={activeCategory === category}
                    onClick={() => selectCategory(category)}
                  >
                    {category}
                  </CategoryChip>
                ))}
              </div>

              <SortDropdown
                value={activeSort}
                onChange={(event) => setActiveSort(event.target.value)}
              />
            </div>

            {canShowResultsCount ? (
              <p className="mb-4 text-sm text-slate-500">
                {filteredProducts.length} produto{resultSuffix} encontrado{resultSuffix}
              </p>
            ) : null}

            <ProductGrid
              error={error}
              loading={loading}
              onAddToCart={onAddToCart}
              products={filteredProducts}
            />
          </div>
        </div>
      </section>
    </Shell>
  );
}

function CategoryChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}
