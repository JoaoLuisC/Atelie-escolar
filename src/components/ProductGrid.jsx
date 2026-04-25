import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { formatPrice } from '../utils/currency';

const BADGES = {
  'Festa Junina': { label: 'MAIS VENDIDO', cls: 'badge-hot' },
  Formatura: { label: 'DESTAQUE', cls: 'badge-featured' },
  'Volta as Aulas': { label: 'LANCAMENTO', cls: 'badge-new' },
  'Datas Comemorativas': { label: 'PROMO LIMITADA', cls: 'badge-promo' },
  'Decoracao de Sala': { label: 'EXCLUSIVO', cls: 'badge-exclusive' },
};

function getDescription(description = '') {
  return `${description.slice(0, 90)}${description.length > 90 ? '...' : ''}`;
}

function ProductCard({ onAddToCart, product }) {
  const badge = BADGES[product.category];

  return (
    <article className="pc-card">
      <Link to={`/produtos/${product.id}`} className="pc-img-wrap">
        {product.image ? (
          <img src={product.image} alt={product.name} className="pc-img" />
        ) : (
          <div className="pc-img-placeholder">
            <i className="bi bi-image" style={{ fontSize: '2.5rem', color: 'rgba(255,255,255,.3)' }} />
          </div>
        )}
        {badge ? <span className={`pc-badge ${badge.cls}`}>{badge.label}</span> : null}
        <div className="pc-img-hover">Ver detalhes →</div>
      </Link>

      <div className="pc-body">
        <span className="pc-cat">{product.category || 'Banner'}</span>
        <h3 className="pc-name">{product.name}</h3>
        <p className="pc-desc">{getDescription(product.description)}</p>

        <div className="pc-specs">
          <span>
            <i className="bi bi-file-pdf-fill" style={{ color: '#e74c3c' }} /> PDF
          </span>
          <span>
            <i className="bi bi-pencil-square" style={{ color: 'var(--accent-blue)' }} /> Canva
          </span>
          <span>
            <i className="bi bi-printer-fill" style={{ color: 'var(--secondary-color)' }} /> Pronto p/ imprimir
          </span>
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
}

ProductCard.propTypes = {
  onAddToCart: PropTypes.func.isRequired,
  product: PropTypes.shape({
    category: PropTypes.string,
    description: PropTypes.string,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    image: PropTypes.string,
    name: PropTypes.string.isRequired,
    price: PropTypes.number,
  }).isRequired,
};

function ProductSkeletonCard() {
  return (
    <article className="pc-card pc-skeleton-card" aria-hidden="true">
      <div className="pc-img-wrap pc-skeleton-media">
        <div className="pc-skeleton-line pc-skeleton-line-media" />
      </div>
      <div className="pc-body pc-skeleton-body">
        <div className="pc-skeleton-line pc-skeleton-line-chip" />
        <div className="pc-skeleton-line pc-skeleton-line-title" />
        <div className="pc-skeleton-line pc-skeleton-line-text" />
        <div className="pc-skeleton-line pc-skeleton-line-specs" />
        <div className="pc-skeleton-line pc-skeleton-line-price" />
        <div className="pc-skeleton-actions">
          <div className="pc-skeleton-line pc-skeleton-line-button" />
          <div className="pc-skeleton-line pc-skeleton-line-button" />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ error, loading, onAddToCart, products }) {
  const skeletonIds = ['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4', 'skeleton-5', 'skeleton-6'];

  if (loading) {
    return (
      <>
        <p className="results-count results-count-skeleton">Carregando catalogo...</p>
        <div className="products-grid-new">
          {skeletonIds.map((skeletonId) => (
            <ProductSkeletonCard key={skeletonId} />
          ))}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        Erro ao carregar produtos. Tente novamente.
        <br />
        <small>{error}</small>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="empty-state empty-state-prominent" style={{ display: 'flex' }}>
        <i className="bi bi-search" style={{ fontSize: '2.5rem', color: 'var(--gray)' }} />
        <p>Nenhum produto encontrado nessa categoria.</p>
      </div>
    );
  }

  return (
    <div className="products-grid-new">
      {products.map((product) => (
        <ProductCard key={product.id} onAddToCart={onAddToCart} product={product} />
      ))}
    </div>
  );
}

ProductGrid.propTypes = {
  error: PropTypes.string.isRequired,
  loading: PropTypes.bool.isRequired,
  onAddToCart: PropTypes.func.isRequired,
  products: PropTypes.arrayOf(PropTypes.object).isRequired,
};