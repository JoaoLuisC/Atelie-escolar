import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { SocialProofStrip } from '../components/SocialProofStrip';
import { fetchHomeContent, fetchHomeSections } from '../services/products';
import { formatPrice } from '../utils/currency';
import { ROUTES } from '../constants/routes';
import {
  DEFAULT_HOME_CONTENT,
  mergeHomeContent,
  splitHighlights,
  stripHighlights,
} from '../constants/home-content';

// LOJA-13: o JSON-LD apontava para `profamarciarcardoso.com.br`, domínio que
// não resolve DNS. A origem agora é a do próprio site no ar (a mesma que o
// SEO usa no canonical) — certa em produção, em preview e em qualquer domínio
// que vier a ser configurado. A SearchAction (`/produtos?q=`) passou a
// funcionar de fato com o filtro de busca do catálogo (LOJA-23).
// As redes do `sameAs` vêm do bloco de prova social configurado no painel.
function buildHomeJsonLd(origin, socialProof) {
  const sameAs = [socialProof?.instagramUrl, socialProof?.tiktokUrl].filter(Boolean);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Profa. Marciar Cardoso · Ateliê da Escola',
      url: origin,
      logo: `${origin}/favicon.svg`,
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Ateliê da Escola',
      url: origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/produtos?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

function readOrigin() {
  try {
    return globalThis.location?.origin || '';
  } catch {
    return '';
  }
}

const SCHOOL_ICONS = [
  { emoji: '✏️', position: 'left-[4%] top-[18%]' },
  { emoji: '📚', position: 'right-[8%] top-[12%]' },
  { emoji: '🎨', position: 'left-[12%] bottom-[16%]' },
  { emoji: '⭐', position: 'right-[14%] bottom-[12%]' },
  { emoji: '📐', position: 'left-[40%] top-[8%]' },
  { emoji: '🖍️', position: 'right-[42%] top-[6%]' },
  { emoji: '📏', position: 'left-[24%] top-[36%]' },
  { emoji: '🌈', position: 'right-[22%] bottom-[28%]' },
];

// Ícone e cor de cada passo do "Como funciona" saem da POSIÇÃO: a admin edita
// título e texto, o visual continua consistente.
const STEP_STYLES = [
  { icon: 'search', accent: 'from-brand-500 to-brand-700' },
  { icon: 'credit-card-fill', accent: 'from-emerald-500 to-emerald-700' },
  { icon: 'cloud-arrow-down-fill', accent: 'from-sky-500 to-sky-700' },
  { icon: 'printer-fill', accent: 'from-amber-500 to-rose-500' },
];

// Mesmo critério para os indicadores e os avatares dos depoimentos.
const STAT_STYLES = [
  { icon: 'instagram', iconColor: 'text-pink-600' },
  { icon: 'tiktok', iconColor: 'text-slate-900' },
  { icon: 'star-fill', iconColor: 'text-accent-yellow' },
  { icon: 'bag-check-fill', iconColor: 'text-accent-sky' },
];

const AVATAR_STYLES = [
  'bg-gradient-to-br from-brand-500 to-accent-pink',
  'bg-gradient-to-br from-accent-sky to-emerald-400',
  'bg-gradient-to-br from-accent-yellow to-accent-pink',
];

const HIGHLIGHT_STYLES = [
  'bg-gradient-to-r from-brand-600 to-accent-pink bg-clip-text text-transparent',
  'bg-gradient-to-r from-emerald-500 to-accent-sky bg-clip-text text-transparent',
];

/** Título com os trechos entre *asteriscos* coloridos. */
function HighlightedText({ value, single = false }) {
  let highlightIndex = 0;
  return splitHighlights(value).map((part, index) => {
    if (!part.highlight) return <span key={index}>{part.text}</span>;
    const className = single
      ? 'text-brand-600'
      : HIGHLIGHT_STYLES[highlightIndex++ % HIGHLIGHT_STYLES.length];
    return (
      <span key={index} className={className}>
        {part.text}
      </span>
    );
  });
}

HighlightedText.propTypes = {
  value: PropTypes.string,
  single: PropTypes.bool,
};

/** Link interno vira <Link>; externo (https) vira <a> em nova aba. */
function SmartLink({ to, className, children }) {
  if (/^https:\/\//i.test(to)) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to || ROUTES.produtos} className={className}>
      {children}
    </Link>
  );
}

SmartLink.propTypes = {
  to: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.node,
};

// Respeita prefers-reduced-motion: desliga animações infinitas (float) que só
// podem ser controladas via JS por usarem `style` inline. O marquee usa
// `motion-reduce:animate-none` diretamente na classe (Tailwind).
//
// ── POR QUE `useSyncExternalStore` E NÃO useState + useEffect (regra D5) ──
// A versão anterior fazia `setReduced(mq.matches)` DENTRO do efeito, e era o
// exemplar do aviso `react-hooks/set-state-in-effect`: o componente pintava uma
// vez com `false` e imediatamente repintava com o valor real. Além do render em
// cascata, havia um erro visível — quem tem "reduzir movimento" ligado via a
// animação rodar no primeiro quadro.
//
// `useSyncExternalStore` é exatamente a API para ler estado que mora FORA do
// React: o valor certo já sai no primeiro render, sem efeito e sem repintura.
// O `getServerSnapshot` (terceiro argumento) devolve `false` porque no servidor
// não há `matchMedia` — e "não sei" tem de significar "não reduza", que é o
// padrão do CSS.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange) {
  const mq = globalThis.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!mq?.addEventListener) return () => {};

  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot() {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, () => false);
}

function Marquee({ items, dark = false, reverse = false }) {
  const doubled = [...items, ...items, ...items, ...items];
  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden border-y py-3 ${
        dark
          ? 'border-slate-700 bg-slate-900 text-white'
          : 'border-brand-100 bg-brand-50 text-brand-700'
      }`}
    >
      <div
        className={`flex w-max whitespace-nowrap font-display text-sm font-bold uppercase tracking-widest motion-reduce:animate-none ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}
      >
        {doubled.map((item, i) => (
          <span key={`${item}-${i}`} className="inline-flex items-center gap-8 pr-8">
            {item}
            <span className="opacity-50">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Regra C6: componente que RECEBE props declara `propTypes`. `items` é a lista
// que o marquee duplica quatro vezes — um valor não-array quebra o `...items`
// com uma mensagem que não diz de onde veio.
Marquee.propTypes = {
  items: PropTypes.arrayOf(PropTypes.node).isRequired,
  dark: PropTypes.bool,
  reverse: PropTypes.bool,
};

/**
 * Topo da home. O fundo (gradiente + ícones flutuantes) sai já no PRIMEIRO
 * render — o teste de movimento reduzido afirma sobre ele —, e só os textos
 * esperam a configuração chegar (`hero === null`), com um esqueleto no lugar,
 * para não piscar o texto padrão antes do texto salvo pela admin.
 */
function HeroBlock({ hero, prefersReducedMotion }) {
  const hasImage = Boolean(hero?.imageUrl);
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-100 via-white to-sky-50">
      <div
        aria-hidden="true"
        className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-400/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-accent-sky/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-pink/15 blur-3xl"
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
        {SCHOOL_ICONS.map((icon, i) => (
          <span
            key={i}
            className={`absolute text-3xl opacity-60 ${icon.position}`}
            style={
              prefersReducedMotion
                ? undefined
                : {
                    animation: `float ${5 + i * 0.5}s ease-in-out infinite`,
                    animationDelay: `${i * 0.3}s`,
                  }
            }
          >
            {icon.emoji}
          </span>
        ))}
      </div>

      <div
        className={`relative mx-auto max-w-6xl px-4 py-10 lg:px-6 lg:py-14 ${
          hasImage ? 'grid items-center gap-8 md:grid-cols-2' : ''
        }`}
      >
        {hero ? (
          <div className="max-w-3xl">
            <h1 className="font-display text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl lg:text-4xl">
              <HighlightedText value={hero.title} />
            </h1>
            {hero.subtitle ? (
              <p className="mt-3 whitespace-pre-line text-base text-slate-600 sm:text-lg">
                {hero.subtitle}
              </p>
            ) : null}

            {hero.ctaLabel ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <SmartLink
                  to={hero.ctaLink || ROUTES.produtos}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition hover:scale-105"
                >
                  {hero.ctaLabel} <i className="bi bi-arrow-right" />
                </SmartLink>
              </div>
            ) : null}
          </div>
        ) : (
          <div aria-busy="true" aria-label="Carregando" className="max-w-3xl space-y-3">
            <div className="h-8 w-11/12 animate-pulse rounded-lg bg-white/70" />
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-white/70" />
            <div className="mt-5 h-10 w-36 animate-pulse rounded-xl bg-white/70" />
          </div>
        )}

        {hasImage ? (
          <div className="flex justify-center">
            <img
              src={hero.imageUrl}
              alt={hero.imageAlt || stripHighlights(hero.title)}
              decoding="async"
              className="max-h-80 w-full rounded-2xl object-contain"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

HeroBlock.propTypes = {
  hero: PropTypes.shape({
    title: PropTypes.string,
    subtitle: PropTypes.string,
    ctaLabel: PropTypes.string,
    ctaLink: PropTypes.string,
    imageUrl: PropTypes.string,
    imageAlt: PropTypes.string,
  }),
  prefersReducedMotion: PropTypes.bool,
};

function ProductCard({ product }) {
  return (
    <Link
      to={`/produtos/${product.slug || product.id}`}
      className="group flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-brand-soft transition duration-300 hover:-translate-y-1 hover:shadow-brand"
    >
      {/* Imagem INTEIRA (object-contain): a foto que a professora sobe não é
          cortada para caber no quadro. */}
      <div className="aspect-square overflow-hidden bg-slate-50 p-2">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 text-xs text-white/70">
            Produto
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <strong className="line-clamp-2 text-sm text-slate-800">{product.name}</strong>
        <span className="font-display text-base font-bold text-brand-700">
          {formatPrice(product.price || 0)}
        </span>
      </div>
    </Link>
  );
}

ProductCard.propTypes = {
  product: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    slug: PropTypes.string,
    name: PropTypes.string,
    image: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }).isRequired,
};

export function HomePage() {
  // `null` até a configuração da home responder (ou falhar e cair no padrão).
  const [content, setContent] = useState(null);
  const [homeSections, setHomeSections] = useState([]);
  const [homeSectionsStatus, setHomeSectionsStatus] = useState('');
  const [homeSectionsError, setHomeSectionsError] = useState('');
  // LOJA-15: "Tentar novamente" refaz a busca da vitrine.
  const [attempt, setAttempt] = useState(0);
  const laneRefs = useRef({});
  const prefersReducedMotion = usePrefersReducedMotion();

  const effective = content || mergeHomeContent({});
  const socialProof = effective.socialProof;

  const homeJsonLd = useMemo(() => {
    const origin = readOrigin();
    return origin ? buildHomeJsonLd(origin, socialProof) : null;
  }, [socialProof]);

  useEffect(() => {
    let mounted = true;
    // Sem setState síncrono aqui (regra D5): o estado só muda quando a
    // resposta chega. Falha de rede não quebra a home — vale o padrão.
    fetchHomeContent()
      .then((saved) => {
        if (mounted) setContent(mergeHomeContent(saved));
      })
      .catch(() => {
        if (mounted) setContent(mergeHomeContent({}));
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadHomeSections() {
      try {
        setHomeSectionsError('');
        setHomeSectionsStatus('Carregando vitrine...');
        const data = await fetchHomeSections();
        if (!mounted) return;
        setHomeSections(data);
        setHomeSectionsStatus('');
      } catch (error) {
        if (!mounted) return;
        setHomeSections([]);
        setHomeSectionsStatus('');
        setHomeSectionsError(error.message || 'Erro ao carregar vitrine.');
      }
    }

    loadHomeSections();
    return () => {
      mounted = false;
    };
  }, [attempt]);

  // LOJA-02: faixa sem produto (o backend já as descarta) nunca vira título
  // solto com setas de rolagem — defesa contra resposta antiga em cache.
  const visibleSections = useMemo(
    () =>
      homeSections.filter(
        (section) => Array.isArray(section.products) && section.products.length > 0,
      ),
    [homeSections],
  );
  const hasHomeSections = visibleSections.length > 0;

  function scrollLane(laneKey, direction) {
    const laneElement = laneRefs.current[laneKey];
    if (!laneElement) return;
    const distance = Math.max(240, Math.round(laneElement.clientWidth * 0.8));
    laneElement.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  }

  function renderCatalog() {
    const catalog = effective.catalog;
    return (
      <section key="catalog" className="mx-auto max-w-6xl px-4 py-16 lg:px-6">
        <div className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            {catalog.eyebrow ? (
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-600">
                {catalog.eyebrow}
              </p>
            ) : null}
            {catalog.title ? (
              <h2 className="max-w-xl font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                <HighlightedText value={catalog.title} single />
              </h2>
            ) : null}
          </div>
          {catalog.ctaLabel ? (
            <Link
              to={ROUTES.produtos}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              {catalog.ctaLabel} <i className="bi bi-arrow-right" />
            </Link>
          ) : null}
        </div>

        {homeSectionsStatus ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {homeSectionsStatus}
          </p>
        ) : null}

        {homeSectionsError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <p>
              <strong className="block">Não foi possível carregar a vitrine.</strong>
              <span className="text-rose-700/80">{homeSectionsError}</span>
            </p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 font-semibold text-rose-800 transition hover:bg-rose-100"
            >
              <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Tentar novamente
            </button>
          </div>
        ) : null}

        {hasHomeSections ? (
          <div className="space-y-10">
            {visibleSections.map((section) => (
              <div key={section.key}>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="font-display text-xl font-bold text-slate-800">{section.title}</h3>
                  <Link
                    to={section.link || '/produtos'}
                    className="text-sm font-semibold text-brand-700 transition hover:underline"
                  >
                    Mais produtos →
                  </Link>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    aria-label="Rolar para esquerda"
                    onClick={() => scrollLane(section.key, 'left')}
                    className="absolute -left-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:bg-brand-50 hover:text-brand-700 md:flex"
                  >
                    <i className="bi bi-chevron-left" />
                  </button>

                  <div
                    ref={(element) => {
                      laneRefs.current[section.key] = element;
                    }}
                    className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {(section.products || []).map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>

                  <button
                    type="button"
                    aria-label="Rolar para direita"
                    onClick={() => scrollLane(section.key, 'right')}
                    className="absolute -right-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:bg-brand-50 hover:text-brand-700 md:flex"
                  >
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  function renderHowItWorks() {
    const how = effective.howItWorks;
    const steps = Array.isArray(how.steps) ? how.steps : [];
    return (
      // scroll-mt: a âncora /#como-funciona não pode parar embaixo do
      // cabeçalho fixo (LOJA-09).
      <section key="howItWorks" id="como-funciona" className="scroll-mt-20 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4 lg:px-6">
          <div className="mb-10 text-center">
            {how.eyebrow ? (
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-600">
                {how.eyebrow}
              </p>
            ) : null}
            {how.title ? (
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                <HighlightedText value={how.title} single />
              </h2>
            ) : null}
            {how.subtitle ? <p className="mt-3 text-sm text-slate-500">{how.subtitle}</p> : null}
          </div>

          {steps.length ? (
            <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => {
                const style = STEP_STYLES[index % STEP_STYLES.length];
                return (
                  <li
                    key={index}
                    className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-2 font-display text-5xl font-extrabold text-slate-100"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div
                      className={`relative inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-xl text-white shadow-brand ${style.accent}`}
                    >
                      <i className={`bi bi-${style.icon}`} />
                    </div>
                    {/* LOJA-31: h3 logo abaixo do h2 da seção (era h5, pulando níveis). */}
                    <h3 className="relative mt-3 font-heading text-lg font-bold text-slate-900">
                      {step.title}
                    </h3>
                    <p className="relative mt-1 text-sm text-slate-600">{step.text}</p>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {how.infoTitle || how.infoText ? (
            <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
              <div className="flex items-start gap-3">
                <i className="bi bi-info-circle-fill text-2xl text-brand-600" />
                <div>
                  {how.infoTitle ? (
                    <strong className="block font-semibold text-slate-900">{how.infoTitle}</strong>
                  ) : null}
                  {how.infoText ? (
                    <span className="text-sm text-slate-600">{how.infoText}</span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function renderSocialProof() {
    const stats = (socialProof.stats || []).map((stat, index) => ({
      num: stat.value || '',
      label: stat.label || '',
      ...STAT_STYLES[index % STAT_STYLES.length],
    }));
    const testimonials = socialProof.testimonials || [];
    return (
      <section key="socialProof" className="relative overflow-hidden py-16">
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-accent-pink/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-accent-sky/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
          <div className="mb-10 text-center">
            {socialProof.eyebrow ? (
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-600">
                {socialProof.eyebrow}
              </p>
            ) : null}
            {/* LOJA-34: número de audiência é dado do negócio — fica só nos
                indicadores, num lugar só, não no título. */}
            {socialProof.title ? (
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                <HighlightedText value={socialProof.title} single />
              </h2>
            ) : null}
            {socialProof.subtitle ? (
              <p className="mt-3 text-sm text-slate-500">{socialProof.subtitle}</p>
            ) : null}
          </div>

          {stats.length ? <SocialProofStrip className="mb-8" stats={stats} /> : null}

          {testimonials.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {testimonials.map((t, i) => (
                <article
                  key={i}
                  className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold text-white ${
                      AVATAR_STYLES[i % AVATAR_STYLES.length]
                    }`}
                  >
                    {String(t.name || '?')
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm leading-relaxed text-slate-700">{t.text}</p>
                    <span className="mt-2 block text-xs font-semibold text-slate-500">
                      {[t.name, t.role].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {socialProof.instagramUrl || socialProof.tiktokUrl ? (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {socialProof.instagramUrl ? (
                <a
                  href={socialProof.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-105"
                >
                  <i className="bi bi-instagram" /> {socialProof.instagramLabel || 'Instagram'}
                </a>
              ) : null}
              {socialProof.tiktokUrl ? (
                <a
                  href={socialProof.tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-105"
                >
                  <i className="bi bi-tiktok" /> {socialProof.tiktokLabel || 'TikTok'}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function renderBlock(id) {
    switch (id) {
      case 'hero':
        return (
          <HeroBlock key="hero" hero={effective.hero} prefersReducedMotion={prefersReducedMotion} />
        );
      case 'marquee':
        return effective.marquee.items?.length ? (
          <Marquee key="marquee" items={effective.marquee.items} />
        ) : null;
      case 'catalog':
        return renderCatalog();
      case 'howItWorks':
        return renderHowItWorks();
      case 'socialProof':
        return renderSocialProof();
      default:
        return null;
    }
  }

  const seo = content?.seo || DEFAULT_HOME_CONTENT.seo;

  return (
    <Shell>
      <SEO
        title={seo.title || DEFAULT_HOME_CONTENT.seo.title}
        description={seo.description || DEFAULT_HOME_CONTENT.seo.description}
        pathname="/"
        jsonLd={homeJsonLd}
      />
      {content ? (
        content.blocks.filter((block) => block.enabled).map((block) => renderBlock(block.id))
      ) : (
        // Configuração ainda chegando: só o fundo do hero, com esqueleto.
        <HeroBlock hero={null} prefersReducedMotion={prefersReducedMotion} />
      )}
    </Shell>
  );
}
