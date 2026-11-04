const helmet = require('helmet');

// Domínios autorizados por funcionalidade. Mantenha a lista enxuta —
// cada entrada amplia a superfície de XSS se o navegador respeitar CSP.
const CSP_SCRIPT_HOSTS = [
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://connect.facebook.net',
  'https://sdk.mercadopago.com',
];

const CSP_CONNECT_HOSTS = [
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://stats.g.doubleclick.net',
  'https://www.facebook.com',
  'https://api.mercadopago.com',
  'https://*.supabase.co',
];

const CSP_IMG_HOSTS = [
  'https://*.supabase.co',
  'https://www.google-analytics.com',
  'https://www.facebook.com',
  'https://www.googletagmanager.com',
];

const CSP_FRAME_HOSTS = ['https://www.mercadopago.com', 'https://www.mercadopago.com.br'];
// Só iframe (não entra em form-action): o vídeo do produto, sempre no domínio
// sem cookie (src/pages/ProductDetailsPage.jsx normaliza o link).
const CSP_EMBED_HOSTS = ['https://www.youtube-nocookie.com'];

/**
 * CSP estrita, mas tolerante ao que de fato carregamos:
 *   • scripts inline: bloqueados (default-src 'self', script-src whitelist)
 *   • estilos inline do Tailwind: permitidos via 'unsafe-inline' (pendente
 *     gerar nonces/hashes — sem isso, várias bibliotecas quebram em prod).
 *   • images data:/blob: liberadas para previews internos.
 *   • frame-src restrito ao MP (Checkout Pro abre em popup, mas também
 *     iframe no fallback) e ao YouTube sem cookie (vídeo do produto).
 *   • O vercel.json repete esta CSP à mão: o teste security-headers compara os dois.
 *
 * Em desenvolvimento liberamos `connect-src` para qualquer localhost:*
 * (Vite HMR usa `ws://localhost:PORT`).
 */
function buildCspDirectives({ runtimeEnv = 'production' } = {}) {
  const isDev = runtimeEnv !== 'production';
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...CSP_SCRIPT_HOSTS],
    // Ícones auto-hospedados (scripts/build-icon-subset.js): nada do jsdelivr.
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:', ...CSP_IMG_HOSTS],
    'connect-src': isDev
      ? ["'self'", 'ws://localhost:*', 'http://localhost:*', ...CSP_CONNECT_HOSTS]
      : ["'self'", ...CSP_CONNECT_HOSTS],
    'frame-src': ["'self'", ...CSP_FRAME_HOSTS, ...CSP_EMBED_HOSTS],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'", ...CSP_FRAME_HOSTS],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'upgrade-insecure-requests': isDev ? null : [],
  };
}

/**
 * Constrói o middleware helmet com CSP estrita + headers complementares.
 * Exporta como função para que seja testável em isolamento.
 */
function createSecurityMiddleware({ runtimeEnv = 'production' } = {}) {
  const directives = buildCspDirectives({ runtimeEnv });
  // Helmet espera valores false (desabilita) ou array — limpamos null.
  const cleanedDirectives = Object.fromEntries(
    Object.entries(directives).filter(([, value]) => value !== null),
  );

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: cleanedDirectives,
    },
    crossOriginEmbedderPolicy: false, // bloqueia imagens externas sem CORP
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    hsts:
      runtimeEnv === 'production'
        ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
        : false,
  });
}

module.exports = {
  buildCspDirectives,
  createSecurityMiddleware,
  CSP_SCRIPT_HOSTS,
  CSP_CONNECT_HOSTS,
  CSP_IMG_HOSTS,
  CSP_FRAME_HOSTS,
};
