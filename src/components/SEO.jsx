import PropTypes from 'prop-types';
import { Helmet } from 'react-helmet-async';

const DEFAULT_SITE_NAME = 'Ateliê da Escola';
const DEFAULT_DESCRIPTION = 'Materiais educativos digitais para professores: banners, painéis e atividades pedagógicas em PDF, com download imediato após pagamento aprovado.';
const DEFAULT_IMAGE = '/og-default.png';

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
  return 'https://profamarciarcardoso.com.br';
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
  const absoluteImage = image && image.startsWith('http') ? image : `${readBaseUrl()}${image || DEFAULT_IMAGE}`;

  return (
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
      <meta property="og:image" content={absoluteImage} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />

      {/* JSON-LD opcional para Schema.org */}
      {jsonLd ? (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      ) : null}
    </Helmet>
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
