import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CrossSellSection } from '../components/CrossSellSection';
import { ProductBenefits } from '../components/ProductBenefits';
import { ProductFaq } from '../components/ProductFaq';
import { ProductReviews } from '../components/ProductReviews';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { fetchProductByIdentifier } from '../services/products';
import { formatPrice } from '../utils/currency';
import { formatMachinePrice } from '../utils/currency';
import { buildItemPayload, trackEvent } from '../utils/analytics';
import { ROUTES } from '../constants/routes';

function buildProductJsonLd(product) {
  if (!product) return null;
  return {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name,
    description: product.description || '',
    image: (product.images || []).filter(Boolean).slice(0, 5),
    sku: String(product.id),
    category: product.category || undefined,
    brand: { '@type': 'Brand', name: 'Profa. Marciar Cardoso' },
    offers: {
      '@type': 'Offer',
      url:
        typeof window !== 'undefined'
          ? `${window.location.origin}/produtos/${product.slug || product.id}`
          : undefined,
      priceCurrency: 'BRL',
      price: formatMachinePrice(product.price),
      availability:
        product.active === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
}

function buildProductSeoDescription(product) {
  if (!product) return undefined;
  const base = (product.description || '').replace(/\s+/g, ' ').trim();
  if (base.length > 30) return base.slice(0, 200);
  const fallback = `${product.name} · material educativo em PDF, pronto para imprimir.`;
  return fallback.slice(0, 200);
}

function getYoutubeEmbedUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith('/embed/')) return url;
    }
    return null;
  } catch {
    return null;
  }
}

export function ProductDetailsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { pushToast } = useToast();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchProductByIdentifier(slug);
        if (!data) throw new Error('Produto não encontrado na API.');
        if (isMounted) {
          setProduct(data);
          setActiveMediaIndex(0);
          trackEvent('view_item', buildItemPayload(data));

          // Soft redirect: usuário chegou por /produtos/<id-numérico>?
          // Reescreve a URL para o slug canônico sem recarregar a página.
          // Garante que canonical, share e SEO usem a URL nova.
          const canonicalSlug = data.slug || String(data.id);
          if (canonicalSlug && canonicalSlug !== slug) {
            navigate(`/produtos/${canonicalSlug}`, { replace: true });
          }
        }
      } catch (requestError) {
        if (isMounted) setError(requestError.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProduct();
    return () => {
      isMounted = false;
    };
  }, [slug, navigate]);

  const mediaList = useMemo(() => {
    if (!product) return [];
    const images = (product.images || []).filter(Boolean);
    const fallbackImages = images.length === 0 && product.image ? [product.image] : images;
    const videos = (product.videos || []).filter(Boolean);
    return [
      ...fallbackImages.map((url) => ({ type: 'image', url })),
      ...videos.map((url) => ({ type: 'video', url })),
    ];
  }, [product]);

  function onBuyNow() {
    if (!product) return;
    const result = addToCart(product);
    pushToast(result.message, result.ok ? 'success' : 'warning');
    navigate(ROUTES.checkout);
  }

  function onAddToCart() {
    if (!product) return;
    const result = addToCart(product);
    pushToast(result.message, result.ok ? 'success' : 'warning');
  }

  const activeMedia = mediaList[activeMediaIndex];
  const youtubeEmbed = activeMedia?.type === 'video' ? getYoutubeEmbedUrl(activeMedia.url) : null;

  return (
    <Shell>
      {product ? (
        <SEO
          title={product.name}
          description={buildProductSeoDescription(product)}
          image={(product.images || [])[0] || product.image || undefined}
          type="product"
          pathname={`/produtos/${product.slug || product.id}`}
          jsonLd={buildProductJsonLd(product)}
        />
      ) : (
        <SEO title="Carregando produto" pathname={`/produtos/${slug || ''}`} noindex />
      )}
      <section className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <Link
          to={ROUTES.produtos}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <i className="bi bi-arrow-left" /> Voltar ao catálogo
        </Link>

        {loading ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
            <i className="bi bi-arrow-clockwise mr-2 animate-spin" />
            Carregando produto…
          </article>
        ) : null}

        {error ? (
          <article className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm">
            <h3 className="text-lg font-bold text-rose-800">Não foi possível carregar o produto</h3>
            <p className="mt-1 text-sm text-rose-700/80">{error}</p>
          </article>
        ) : null}

        {!loading && !error && product ? (
          <article className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 md:p-6">
            {/* GALERIA */}
            <div>
              <div className="aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-brand-100 to-brand-200">
                {!activeMedia ? (
                  <div className="flex h-full w-full items-center justify-center text-white/70">
                    <i className="bi bi-image text-5xl" />
                  </div>
                ) : activeMedia.type === 'image' ? (
                  <img
                    src={activeMedia.url}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : youtubeEmbed ? (
                  <iframe
                    src={youtubeEmbed}
                    title="Vídeo do produto"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                ) : (
                  <video src={activeMedia.url} controls className="h-full w-full object-cover" />
                )}
              </div>

              {mediaList.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {mediaList.map((m, i) => {
                    const isActive = i === activeMediaIndex;
                    return (
                      <button
                        type="button"
                        key={`${m.type}-${i}`}
                        onClick={() => setActiveMediaIndex(i)}
                        className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                          isActive
                            ? 'border-brand-600 ring-2 ring-brand-200'
                            : 'border-slate-200 hover:border-brand-400'
                        }`}
                      >
                        {m.type === 'image' ? (
                          <img
                            src={m.url}
                            alt={`Mídia ${i + 1}`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
                            <i className="bi bi-play-circle-fill text-2xl" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* DETALHES */}
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                  {product.category || 'Sem categoria'}
                </span>
                {product.featured ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    <i className="bi bi-star-fill" /> Destaque
                  </span>
                ) : null}
                {product.isKit ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    KIT
                  </span>
                ) : null}
              </div>

              <h2 className="mt-3 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                {product.name}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {product.description || 'Sem descrição disponível.'}
              </p>

              <div className="mt-6 rounded-xl bg-slate-50 p-4">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-3xl font-bold text-brand-700">
                    {formatPrice(product.price)}
                  </span>
                  {product.originalPrice && product.originalPrice > product.price ? (
                    <span className="text-sm text-slate-500 line-through">
                      {formatPrice(product.originalPrice)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  PDF em alta resolução · acesso permanente · download imediato após aprovação
                </p>
              </div>

              {product.pageSize || product.paperType ? (
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {product.pageSize ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Tamanho</dt>
                      <dd className="font-semibold text-slate-800">{product.pageSize}</dd>
                    </div>
                  ) : null}
                  {product.paperType ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Formato</dt>
                      <dd className="font-semibold text-slate-800">{product.paperType}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              <ProductBenefits items={product.benefits} className="mt-5" />

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onBuyNow}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <i className="bi bi-lightning-charge-fill" /> Comprar agora
                </button>
                <button
                  type="button"
                  onClick={onAddToCart}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <i className="bi bi-cart-plus" /> Adicionar
                </button>
              </div>
            </div>
          </article>
        ) : null}

        {!loading && !error && product ? (
          <>
            <ProductReviews items={product.reviews} />
            <ProductFaq items={product.faq} />
            <CrossSellSection productId={product.id} />
          </>
        ) : null}
      </section>
    </Shell>
  );
}
