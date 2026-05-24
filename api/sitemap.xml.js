const { getSupabaseConfig, listTableRows } = require('../lib/supabase');

const STATIC_PATHS = [
  { loc: '/', changefreq: 'weekly', priority: 1.0 },
  { loc: '/produtos', changefreq: 'daily', priority: 0.9 },
  { loc: '/login', changefreq: 'monthly', priority: 0.3 },
];

function getBaseUrl() {
  const raw = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (raw) return raw;
  return 'https://profamarciarcardoso.com.br';
}

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
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
    console.warn('[sitemap] falha ao carregar produtos:', error.message);
    return [];
  }
}

async function loadActiveCategories() {
  if (!getSupabaseConfig()) return [];
  try {
    return await listTableRows('categories', {
      select: 'slug,updated_at',
      filters: [{ column: 'active', value: true }],
      orderBy: 'updated_at',
      ascending: false,
      limit: 200,
    });
  } catch (error) {
    console.warn('[sitemap] falha ao carregar categorias:', error.message);
    return [];
  }
}

module.exports = async function sitemapHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const baseUrl = getBaseUrl();
  const [products, categories] = await Promise.all([loadActiveProducts(), loadActiveCategories()]);

  const urls = [
    ...STATIC_PATHS.map((entry) => ({
      ...entry,
      loc: `${baseUrl}${entry.loc}`,
    })),
    ...categories.map((category) => ({
      loc: `${baseUrl}/produtos?categoria=${encodeURIComponent(category.slug || '')}`,
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
