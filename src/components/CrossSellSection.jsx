import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../utils/api';
import { formatPrice } from '../utils/currency';

/**
 * "Quem comprou também levou" — Fase 2.
 *
 * Backend (`/api/cross-sell`) usa co-ocorrência real em pedidos aprovados
 * e cai para "mesma categoria" enquanto não há histórico suficiente.
 * Não renderiza se vier vazio (evita placeholder "em breve").
 */
export function CrossSellSection({ productId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/cross-sell?productId=${encodeURIComponent(productId)}`,
        );
        const data = await response.json();
        if (cancelled) return;
        setItems(Array.isArray(data?.products) ? data.products : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm text-slate-500">
          <i className="bi bi-arrow-clockwise mr-2 animate-spin" aria-hidden="true" />
          Carregando sugestões…
        </p>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="cross-sell-title" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Você também pode gostar</p>
        <h2 id="cross-sell-title" className="font-display text-xl font-bold text-slate-900">
          Quem comprou este levou também
        </h2>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/produtos/${item.slug || item.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="aspect-square overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/60">
                    <i className="bi bi-image text-3xl" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 p-3">
                <strong className="line-clamp-2 text-sm text-slate-800">{item.name}</strong>
                <span className="font-display text-base font-bold text-brand-700">
                  {formatPrice(item.price)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

CrossSellSection.propTypes = {
  productId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
