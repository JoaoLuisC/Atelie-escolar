const { getSupabaseConfig, listTableRows } = require('../lib/supabase');
const { createLogger } = require('../lib/logger');
const { categoryQueryValue, isPresentableCategoryName } = require('../lib/public-catalog');

const log = createLogger('sitemap.xml');

// LOJA-25: /login saiu — o robots.txt o bloqueia (Disallow: /login), e
// listar no sitemap uma URL que o robots proíbe é sinal contraditório para o
// buscador. As páginas legais entram: são públicas e indexáveis.
const STATIC_PATHS = [
  { loc: '/', changefreq: 'weekly', priority: 1.0 },
  { loc: '/produtos', changefreq: 'daily', priority: 0.9 },
  { loc: '/privacidade', changefreq: 'yearly', priority: 0.2 },
  { loc: '/termos', changefreq: 'yearly', priority: 0.2 },
];

/**
 * Origem pública das URLs do sitemap.
 *
 * LOJA-13/25: o fallback era um domínio fixo (`profamarciarcardoso.com.br`)
 * que não resolve DNS — um sitemap servido sem APP_URL listava URLs mortas.
 * Sem APP_URL, a origem certa é a do próprio pedido (o host por onde o
 * buscador chegou), que por construção existe.
 */
function getBaseUrl(req) {
  const raw = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (raw) return raw;

  const headers = req?.headers || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '')
    .split(',')[0]
    .trim();
  // Host vem do cliente: só aceita o formato de um host (sem barra, espaço ou
  // aspas) antes de interpolar no XML.
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return '';
  const proto =
    String(headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim() || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildUrlNode({ loc, lastmod, changefreq, priority }) {
  const lines = ['  <url>', `    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (typeof priority === 'number') lines.push(`    <priority>${priority.toFixed(1)}</priority>`);
  lines.push('  </url>');
  return lines.join('\n');
}

async function loadActiveProducts() {
  if (!getSupabaseConfig()) return [];
  try {
    return await listTableRows('products', {
      select: 'slug,id,updated_at',
      filters: [{ column: 'active', value: true }],
      orderBy: 'updated_at',
      ascending: false,
      limit: 1000,
    });
  } catch (error) {
    log.warn('falha_ao_carregar_produtos', { reason: error.message });
    return [];
  }
}

async function loadActiveCategories() {
  if (!getSupabaseConfig()) return [];
  try {
    return await listTableRows('categories', {
      select: 'name,slug,updated_at',
      filters: [{ column: 'active', value: true }],
      orderBy: 'updated_at',
      ascending: false,
      limit: 200,
    });
  } catch (error) {
    log.warn('falha_ao_carregar_categorias', { reason: error.message });
    return [];
  }
}

module.exports = async function sitemapHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const baseUrl = getBaseUrl(req);
  const [products, allCategories] = await Promise.all([
    loadActiveProducts(),
    loadActiveCategories(),
  ]);
  // LOJA-02: categoria com nome vazio ou com cara de UUID não é página
  // pública — e a URL dela não deve ser oferecida ao buscador.
  const categories = allCategories.filter(
    (category) => isPresentableCategoryName(category.name) && categoryQueryValue(category),
  );

  const urls = [
    ...STATIC_PATHS.map((entry) => ({
      ...entry,
      loc: `${baseUrl}${entry.loc}`,
    })),
    ...categories.map((category) => ({
      loc: `${baseUrl}/produtos?categoria=${encodeURIComponent(categoryQueryValue(category))}`,
      lastmod: category.updated_at,
      changefreq: 'weekly',
      priority: 0.6,
    })),
    ...products.map((product) => ({
      loc: `${baseUrl}/produtos/${product.slug || product.id}`,
      lastmod: product.updated_at,
      changefreq: 'weekly',
      priority: 0.8,
    })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(buildUrlNode),
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return res.status(200).send(xml);
};
