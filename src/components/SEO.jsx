import PropTypes from 'prop-types';
import { Helmet } from 'react-helmet-async';

const DEFAULT_SITE_NAME = 'Ateliê da Escola';
const DEFAULT_DESCRIPTION =
  'Materiais educativos digitais para professores: banners, painéis e atividades pedagógicas em PDF, com download imediato após pagamento aprovado.';
// LOJA-24: o padrão era `/favicon.svg`, e as redes sociais não aceitam SVG em
// og:image — o card saía sem imagem do mesmo jeito, só que declarando uma.
// Sem um PNG/JPG próprio (1200×630) versionado em public/, páginas sem imagem
// não emitem og:image (o Twitter Card cai para `summary`). Páginas com imagem
// própria (ex.: produto) continuam passando a delas via prop.
const DEFAULT_IMAGE = null;

function readBaseUrl() {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
  } catch {
    /* SSR fallback */
  }
  try {
    const env = import.meta.env?.VITE_PUBLIC_BASE_URL;
    if (env) return String(env).replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  // Sem janela nem variável: URL relativa. O domínio fixo que estava aqui
  // (profamarciarcardoso.com.br) não resolve DNS (LOJA-13).
  return '';
}

// JSON-LD como texto de <script>: `<` vira o escape JSON \u003c, para que um
// "</script>" dentro de uma descrição de produto nunca feche a tag.
function serializeJsonLd(data) {
  return JSON.stringify(data).replaceAll('<', String.raw`\u003c`);
}

function buildCanonical(pathname) {
  const base = readBaseUrl();
  if (!pathname) return base;
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

/**
 * Componente único de SEO técnico por página.
 * - title e description: específicos da página (regra E2)
 * - canonical: evita duplicidade (regra E5)
 * - Open Graph + Twitter Card para compartilhamento social
 * - Aceita JSON-LD via prop `jsonLd` (Schema.org)
 *
 * NUNCA preencher description com keyword stuffing (anti-padrão da Fase 1).
 */
export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  type = 'website',
  pathname = '',
  noindex = false,
  jsonLd = null,
}) {
  const canonical = buildCanonical(pathname);
  const fullTitle = title ? `${title} · ${DEFAULT_SITE_NAME}` : DEFAULT_SITE_NAME;
  const resolvedImage = image || DEFAULT_IMAGE || '';
  // Só emite og:image/twitter:image quando há um asset real para apontar —
  // nunca deixa a tag referenciando um arquivo inexistente.
  const absoluteImage = resolvedImage
    ? resolvedImage.startsWith('http')
      ? resolvedImage
      : `${readBaseUrl()}${resolvedImage}`
    : null;

  return (
    <>
      <Helmet>
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}

        {/* Open Graph */}
        <meta property="og:type" content={type} />
        <meta property="og:site_name" content={DEFAULT_SITE_NAME} />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        {absoluteImage ? <meta property="og:image" content={absoluteImage} /> : null}

        {/* Twitter Card */}
        <meta name="twitter:card" content={absoluteImage ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
        {absoluteImage ? <meta name="twitter:image" content={absoluteImage} /> : null}
      </Helmet>
      {/* JSON-LD opcional para Schema.org — FORA do Helmet (LOJA-24): pelo
          Helmet, o Organization/WebSite da home ficava no <head> depois de
          navegar para /produtos ou /termos. No corpo, ele nasce e morre com a
          página que o declarou; o Google lê JSON-LD em qualquer ponto do
          documento. */}
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
    </>
  );
}

SEO.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  image: PropTypes.string,
  type: PropTypes.string,
  pathname: PropTypes.string,
  noindex: PropTypes.bool,
  jsonLd: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
};
