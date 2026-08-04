import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { formatPrice } from '../utils/currency';

const BADGES = {
  'Festa Junina': { label: 'MAIS VENDIDO', cls: 'bg-rose-500' },
  Formatura: { label: 'DESTAQUE', cls: 'bg-brand-600' },
  'Volta as Aulas': { label: 'LANÇAMENTO', cls: 'bg-emerald-500' },
  'Datas Comemorativas': { label: 'PROMO LIMITADA', cls: 'bg-amber-500' },
  'Decoracao de Sala': { label: 'EXCLUSIVO', cls: 'bg-accent-sky' },
};

function truncate(text = '', max = 90) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function ProductCard({ onAddToCart, product }) {
  const badge = BADGES[product.category];

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-brand-soft transition duration-300 hover:-translate-y-1 hover:shadow-brand">
      <Link to={`/produtos/${product.slug || product.id}`} className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <i className="bi bi-image text-5xl text-white/40" />
          </div>
        )}
        {badge ? (
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md ${badge.cls}`}>
            {badge.label}
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-slate-900/80 to-transparent p-3 text-center text-sm font-semibold text-white transition group-hover:translate-y-0">
          Ver detalhes →
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <span className="inline-flex w-fit rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
          {product.category || 'Banner'}
        </span>
        <h3 className="mt-2 line-clamp-2 font-heading text-base font-bold text-slate-900">{product.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{truncate(product.description)}</p>

        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <li className="inline-flex items-center gap-1"><i className="bi bi-file-pdf-fill text-rose-500" /> PDF</li>
          <li className="inline-flex items-center gap-1"><i className="bi bi-pencil-square text-accent-sky" /> Canva</li>
          <li className="inline-flex items-center gap-1"><i className="bi bi-printer-fill text-brand-600" /> Imprimível</li>
        </ul>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="font-display text-xl font-bold text-brand-700">{formatPrice(product.price)}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onAddToCart(product)}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <i className="bi bi-cart-plus" /> Adicionar
          </button>
          <Link
            to={`/produtos/${product.slug || product.id}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
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
    <article aria-hidden="true" className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="aspect-[4/3] animate-pulse bg-slate-200" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-5 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 flex gap-2">
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-9 w-20 animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ error, loading, onAddToCart, products }) {
  if (loading) {
    return (
      <>
        <p className="mb-3 text-sm text-slate-500">Carregando catálogo…</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => i).map((skeletonId) => (
            <ProductSkeletonCard key={skeletonId} />
          ))}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        Erro ao carregar produtos. Tente novamente.
        <br />
        <small className="text-rose-700/80">{error}</small>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center">
        <i className="bi bi-search text-3xl text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">Nenhum produto encontrado nessa categoria.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
