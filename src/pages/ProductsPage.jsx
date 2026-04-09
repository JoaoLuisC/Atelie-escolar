import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { fetchProducts } from '../services/products';
import { formatPrice } from '../utils/currency';

const BADGES = {
  'Festa Junina': { label: 'MAIS VENDIDO', cls: 'badge-hot' },
  Formatura: { label: 'DESTAQUE', cls: 'badge-featured' },
  'Volta as Aulas': { label: 'LANCAMENTO', cls: 'badge-new' },
  'Datas Comemorativas': { label: 'PROMO LIMITADA', cls: 'badge-promo' },
  'Decoracao de Sala': { label: 'EXCLUSIVO', cls: 'badge-exclusive' },
};

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function ProductsPage() {
  const { addToCart } = useCart();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activePreset, setActivePreset] = useState('');
  const [activePriceRange, setActivePriceRange] = useState('all');
  const [activeSort, setActiveSort] = useState('newest');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCategorySectionOpen, setIsCategorySectionOpen] = useState(true);
  const [isPriceSectionOpen, setIsPriceSectionOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchProducts();

        if (isMounted) {
          setProducts(data);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  function onAddToCart(product) {
    const result = addToCart(product);
    pushToast(result.message, result.ok ? 'success' : 'warning');
  }

  const categories = useMemo(() => Array.from(new Set(products.map((item) => item.category).filter(Boolean))), [products]);

  useEffect(() => {
    const categoryFromQuery = searchParams.get('categoria');
    const presetFromQuery = normalizeText(searchParams.get('preset'));

    if (categoryFromQuery) {
      const foundCategory = categories.find((category) => normalizeText(category) === normalizeText(categoryFromQuery));
      if (foundCategory) {
        setActiveCategory(foundCategory);
      }
    }

    if (presetFromQuery === 'mais-vendidos') {
      setActivePreset('mais-vendidos');
      setActiveSort('sold-desc');
    }

    if (presetFromQuery === 'novidades') {
      setActivePreset('novidades');
      setActiveSort('newest');
    }
  }, [searchParams, categories]);

  const featuredCategories = categories.slice(0, 5);

  const sortedProducts = [...products].sort((a, b) => {
    if (activeSort === 'sold-desc') return (b.soldCount || 0) - (a.soldCount || 0);
    if (activeSort === 'price-asc') return (a.price || 0) - (b.price || 0);
    if (activeSort === 'price-desc') return (b.price || 0) - (a.price || 0);
    if (activeSort === 'name') return (a.name || '').localeCompare(b.name || '');
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const filteredProducts = sortedProducts.filter((product) => {
    if (activePreset === 'novidades') {
      const createdAtMs = new Date(product.createdAt || 0).getTime();
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (!createdAtMs || createdAtMs < sevenDaysAgo) {
        return false;
      }
    }

    const categoryMatch = activeCategory === 'all' || product.category === activeCategory;

    if (!categoryMatch) {
      return false;
    }

    if (activePriceRange === '0-25') return (product.price || 0) <= 25;
    if (activePriceRange === '25-50') return (product.price || 0) > 25 && (product.price || 0) <= 50;
    if (activePriceRange === '50+') return (product.price || 0) > 50;

    return true;
  });

  const totalByCategory = (category) => {
    if (category === 'all') return products.length;
    return products.filter((product) => product.category === category).length;
  };

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

      <div className={`sidebar-overlay${isSidebarOpen ? ' open' : ''}`} onClick={() => setIsSidebarOpen(false)} />

      <div className="products-layout">
        <aside className={`products-sidebar${isSidebarOpen ? ' open' : ''}`}>
          <div className={`sidebar-collapsible${isCategorySectionOpen ? ' open' : ' collapsed'}`}>
            <button type="button" className="sidebar-section-toggle" onClick={() => setIsCategorySectionOpen((value) => !value)}>
              Categorias <i className="bi bi-chevron-down" />
            </button>
            <div className="sidebar-section-body">
              <button
                type="button"
                className={`cat-btn sidebar-cat${activeCategory === 'all' ? ' active' : ''}`}
                onClick={() => {
                  setActivePreset('');
                  setActiveCategory('all');
                }}
              >
                Todos <span className="cat-count">{totalByCategory('all')}</span>
              </button>
              {categories.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={`cat-btn sidebar-cat${activeCategory === category ? ' active' : ''}`}
                  onClick={() => {
                    setActivePreset('');
                    setActiveCategory(category);
                  }}
                >
                  {category} <span className="cat-count">{totalByCategory(category)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`sidebar-collapsible${isPriceSectionOpen ? ' open' : ' collapsed'}`}>
            <button type="button" className="sidebar-section-toggle" onClick={() => setIsPriceSectionOpen((value) => !value)}>
              Faixa de preco <i className="bi bi-chevron-down" />
            </button>
            <div className="sidebar-section-body">
              <label className="sidebar-radio">
                <input type="radio" name="price" value="all" checked={activePriceRange === 'all'} onChange={(event) => setActivePriceRange(event.target.value)} /> Todos
              </label>
              <label className="sidebar-radio">
                <input type="radio" name="price" value="0-25" checked={activePriceRange === '0-25'} onChange={(event) => setActivePriceRange(event.target.value)} /> Ate R$ 25
              </label>
              <label className="sidebar-radio">
                <input type="radio" name="price" value="25-50" checked={activePriceRange === '25-50'} onChange={(event) => setActivePriceRange(event.target.value)} /> R$ 25 - R$ 50
              </label>
              <label className="sidebar-radio">
                <input type="radio" name="price" value="50+" checked={activePriceRange === '50+'} onChange={(event) => setActivePriceRange(event.target.value)} /> Acima de R$ 50
              </label>
            </div>
          </div>
        </aside>

        <div className="products-main">
          <div className="products-top-bar">
            <button type="button" className="btn-toggle-filters" onClick={() => setIsSidebarOpen(true)}>
              <i className="bi bi-sliders" /> Filtros
            </button>

            <div className="cat-filter-bar">
              <button
                type="button"
                className={`cat-btn${activeCategory === 'all' ? ' active' : ''}`}
                onClick={() => {
                  setActivePreset('');
                  setActiveCategory('all');
                }}
              >
                Todos
              </button>
              {featuredCategories.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={`cat-btn${activeCategory === category ? ' active' : ''}`}
                  onClick={() => {
                    setActivePreset('');
                    setActiveCategory(category);
                  }}
                >
                  {category}
                </button>
              ))}
            </div>

            <select className="sort-select-inline" value={activeSort} onChange={(event) => setActiveSort(event.target.value)}>
              <option value="sold-desc">Mais vendidos</option>
              <option value="newest">Mais recentes</option>
              <option value="price-asc">Menor preco</option>
              <option value="price-desc">Maior preco</option>
              <option value="name">Nome A-Z</option>
            </select>
          </div>

          {!loading && !error ? <p className="results-count">{filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}</p> : null}

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border" style={{ color: 'var(--primary-color)' }} role="status" />
              <p className="mt-3 text-muted">Carregando produtos...</p>
            </div>
          ) : null}

          {error ? (
            <div className="alert alert-danger">
              Erro ao carregar produtos. Tente novamente.
              <br />
              <small>{error}</small>
            </div>
          ) : null}

          {!loading && !error && filteredProducts.length > 0 ? (
            <div className="products-grid-new">
              {filteredProducts.map((product) => {
                const badge = BADGES[product.category];

                return (
                  <article className="pc-card" key={product.id}>
                    <Link to={`/produtos/${product.id}`} className="pc-img-wrap">
                      {product.image ? <img src={product.image} alt={product.name} className="pc-img" /> : <div className="pc-img-placeholder"><i className="bi bi-image" style={{ fontSize: '2.5rem', color: 'rgba(255,255,255,.3)' }} /></div>}
                      {badge ? <span className={`pc-badge ${badge.cls}`}>{badge.label}</span> : null}
                      <div className="pc-img-hover">Ver detalhes →</div>
                    </Link>

                    <div className="pc-body">
                      <span className="pc-cat">{product.category || 'Banner'}</span>
                      <h3 className="pc-name">{product.name}</h3>
                      <p className="pc-desc">{(product.description || '').slice(0, 90)}{(product.description || '').length > 90 ? '...' : ''}</p>

                      <div className="pc-specs">
                        <span><i className="bi bi-file-pdf-fill" style={{ color: '#e74c3c' }} /> PDF</span>
                        <span><i className="bi bi-pencil-square" style={{ color: 'var(--accent-blue)' }} /> Canva</span>
                        <span><i className="bi bi-printer-fill" style={{ color: 'var(--secondary-color)' }} /> Pronto p/ imprimir</span>
                      </div>

                      <div className="pc-price-row">
                        <span className="pc-price">{formatPrice(product.price)}</span>
                      </div>

                      <div className="pc-actions">
                        <button type="button" className="pc-btn-cart" onClick={() => onAddToCart(product)}>
                          <i className="bi bi-cart-plus" /> Adicionar ao Carrinho
                        </button>
                        <Link to={`/produtos/${product.id}`} className="pc-btn-details">
                          Detalhes
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {!loading && !error && filteredProducts.length === 0 ? (
            <div className="empty-state" style={{ display: 'flex' }}>
              <i className="bi bi-search" style={{ fontSize: '2.5rem', color: 'var(--gray)' }} />
              <p>Nenhum produto encontrado nessa categoria.</p>
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}
