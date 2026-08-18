import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { SocialProofStrip } from '../components/SocialProofStrip';
import { fetchHomeSections } from '../services/products';
import { formatPrice } from '../utils/currency';
import { ROUTES } from '../constants/routes';

const HOME_SEO_TITLE = 'Materiais educativos digitais para professores';
const HOME_SEO_DESCRIPTION =
  'Painéis, banners e atividades pedagógicas em PDF, prontos para imprimir. Download imediato após o pagamento. Criados por professores, para professores.';

const HOME_JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Profa. Marciar Cardoso · Ateliê da Escola',
    url: 'https://profamarciarcardoso.com.br',
    logo: 'https://profamarciarcardoso.com.br/favicon.svg',
    sameAs: [
      'https://www.instagram.com/profamarciarcardoso',
      'https://www.tiktok.com/@profamarciarcardoso',
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Ateliê da Escola',
    url: 'https://profamarciarcardoso.com.br',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://profamarciarcardoso.com.br/produtos?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  },
];

const MARQUEE_ITEMS_TOP = ['BANNERS', 'PAINÉIS', 'ATIVIDADES', 'LEMBRANCINHAS', 'KITS'];

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

const HOW_STEPS = [
  {
    num: '01',
    icon: 'search',
    title: 'Escolha',
    text: 'Navegue pelo catálogo e encontre atividades práticas para tornar o aprendizado dos seus alunos mais prazeroso.',
    accent: 'from-brand-500 to-brand-700',
  },
  {
    num: '02',
    icon: 'credit-card-fill',
    title: 'Pague',
    text: 'Finalize seu pedido com segurança e confirmação rápida.',
    accent: 'from-emerald-500 to-emerald-700',
  },
  {
    num: '03',
    icon: 'cloud-arrow-down-fill',
    title: 'Baixe na hora',
    text: 'Acesso liberado imediatamente após a aprovação do pagamento.',
    accent: 'from-sky-500 to-sky-700',
  },
  {
    num: '04',
    icon: 'printer-fill',
    title: 'Imprima',
    text: 'Os arquivos estão prontos para uso no formato PDF com acesso ilimitado e permanente.',
    accent: 'from-amber-500 to-rose-500',
  },
];

const TESTIMONIALS = [
  {
    initial: 'C',
    name: 'Carla M.',
    role: 'Professora, SP',
    text: '"Comprei, baixei e mandei para a gráfica em menos de 5 minutos! 😍"',
    avatarBg: 'bg-gradient-to-br from-brand-500 to-accent-pink',
  },
  {
    initial: 'A',
    name: 'Ana R.',
    role: 'Diretora, MG',
    text: '"Os banners de formatura ficaram lindos. Todos elogiaram o design!"',
    avatarBg: 'bg-gradient-to-br from-accent-sky to-emerald-400',
  },
  {
    initial: 'J',
    name: 'Juliana F.',
    role: 'Coord. Pedagógica, RJ',
    text: '"Recebi os arquivos na hora e consegui organizar tudo sem complicação!"',
    avatarBg: 'bg-gradient-to-br from-accent-yellow to-accent-pink',
  },
];

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

export function HomePage() {
  const [homeSections, setHomeSections] = useState([]);
  const [homeSectionsStatus, setHomeSectionsStatus] = useState('');
  const laneRefs = useRef({});
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let mounted = true;

    async function loadHomeSections() {
      try {
        setHomeSectionsStatus('Carregando vitrine...');
        const data = await fetchHomeSections();
        if (!mounted) return;
        setHomeSections(data);
        setHomeSectionsStatus('');
      } catch (error) {
        if (!mounted) return;
        setHomeSections([]);
        setHomeSectionsStatus(error.message || 'Erro ao carregar vitrine.');
      }
    }

    loadHomeSections();
    return () => {
      mounted = false;
    };
  }, []);

  const hasHomeSections = useMemo(() => homeSections.length > 0, [homeSections]);

  function scrollLane(laneKey, direction) {
    const laneElement = laneRefs.current[laneKey];
    if (!laneElement) return;
    const distance = Math.max(240, Math.round(laneElement.clientWidth * 0.8));
    laneElement.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  }

  return (
    <Shell>
      <SEO
        title={HOME_SEO_TITLE}
        description={HOME_SEO_DESCRIPTION}
        pathname="/"
        jsonLd={HOME_JSON_LD}
      />
      {/* HERO */}
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

        <div className="relative mx-auto max-w-6xl px-4 py-10 lg:px-6 lg:py-14">
          <div className="max-w-3xl">
            <h1 className="font-display text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl lg:text-4xl">
              Painéis e recursos pedagógicos feitos com{' '}
              <span className="bg-gradient-to-r from-brand-600 to-accent-pink bg-clip-text text-transparent">
                cuidado
              </span>{' '}
              e{' '}
              <span className="bg-gradient-to-r from-emerald-500 to-accent-sky bg-clip-text text-transparent">
                criatividade
              </span>
            </h1>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={ROUTES.produtos}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition hover:scale-105"
              >
                Ver Produtos <i className="bi bi-arrow-right" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Marquee items={MARQUEE_ITEMS_TOP} />

      {/* CATÁLOGO */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6">
        <div className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-600">
              Catálogo
            </p>
            <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              É exatamente isso que
              <br />
              você precisa 👇
            </h2>
          </div>
          <Link
            to={ROUTES.produtos}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Ver catálogo completo <i className="bi bi-arrow-right" />
          </Link>
        </div>

        {homeSectionsStatus ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {homeSectionsStatus}
          </p>
        ) : null}

        {hasHomeSections ? (
          <div className="space-y-10">
            {homeSections.map((section) => (
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
                      <Link
                        key={product.id}
                        to={`/produtos/${product.slug || product.id}`}
                        className="group flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-brand-soft transition duration-300 hover:-translate-y-1 hover:shadow-brand"
                      >
                        <div className="aspect-square overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-white/70">
                              Produto
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 p-3">
                          <strong className="line-clamp-2 text-sm text-slate-800">
                            {product.name}
                          </strong>
                          <span className="font-display text-base font-bold text-brand-700">
                            {formatPrice(product.price || 0)}
                          </span>
                        </div>
                      </Link>
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

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4 lg:px-6">
          <div className="mb-10 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-600">
              Simples assim
            </p>
            <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Do clique à impressão
              <br />
              <span className="text-brand-600">em minutos</span>
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Sem cadastro obrigatório. Sem espera. Sem complicação.
            </p>
          </div>

          <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {HOW_STEPS.map((step) => (
              <li
                key={step.num}
                className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-2 font-display text-5xl font-extrabold text-slate-100"
                >
                  {step.num}
                </span>
                <div
                  className={`relative inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-xl text-white shadow-brand ${step.accent}`}
                >
                  <i className={`bi bi-${step.icon}`} />
                </div>
                <h5 className="relative mt-3 font-heading text-lg font-bold text-slate-900">
                  {step.title}
                </h5>
                <p className="relative mt-1 text-sm text-slate-600">{step.text}</p>
              </li>
            ))}
          </ol>

          <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
            <div className="flex items-start gap-3">
              <i className="bi bi-info-circle-fill text-2xl text-brand-600" />
              <div>
                <strong className="block font-semibold text-slate-900">
                  PDF em alta resolução
                </strong>
                <span className="text-sm text-slate-600">
                  Arquivos prontos para impressão, com acesso ilimitado e permanente.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="relative overflow-hidden py-16">
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
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-600">
              Como a escola usa
            </p>
            <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Mais de <span className="text-brand-600">16.000 professoras</span>
              <br />
              nos seguem nas redes 📲
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Veja como escolas de todo o Brasil estão usando nossos materiais.
            </p>
          </div>

          <SocialProofStrip className="mb-8" />

          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <article
                key={i}
                className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold text-white ${t.avatarBg}`}
                >
                  {t.initial}
                </div>
                <div>
                  <p className="text-sm leading-relaxed text-slate-700">{t.text}</p>
                  <span className="mt-2 block text-xs font-semibold text-slate-500">
                    {t.name} · {t.role}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://www.instagram.com/profamarciarcardoso"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-105"
            >
              <i className="bi bi-instagram" /> @profamarciarcardoso
            </a>
            <a
              href="https://www.tiktok.com/@profamarciarcardoso"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:scale-105"
            >
              <i className="bi bi-tiktok" /> @profamarciarcardoso
            </a>
          </div>
        </div>
      </section>
    </Shell>
  );
}
