const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, listTableRows },
} = require('../lib/supabase');
const { loadSoldCountByProduct } = require('../lib/sales-counts');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('home-sections');

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function clampLimit(value, fallback = 8) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(4, Math.min(20, Math.round(parsed)));
}

function normalizeLabel(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function buildDefaultSections(categories) {
  const topCategories = categories
    .filter((category) => category.active !== false)
    .sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }),
    )
    .slice(0, 3)
    .map((category) => ({
      type: 'category',
      categoryId: String(category.id),
      title: category.name,
      limit: 8,
      enabled: true,
    }));

  return [
    ...topCategories,
    { type: 'best_sellers', title: 'Mais vendidos', limit: 8, enabled: true },
    { type: 'new_arrivals', title: 'Novidades', limit: 8, enabled: true },
  ];
}

function normalizeSections(rawSetting, categories) {
  const categoryById = new Map(categories.map((category) => [String(category.id), category]));
  const sections = Array.isArray(rawSetting?.sections) ? rawSetting.sections : [];

  const parsed = sections
    .map((section) => {
      const type = String(section?.type || '').trim();
      const enabled = section?.enabled !== false;
      const limit = clampLimit(section?.limit, 8);

      if (type === 'category') {
        const categoryId = String(section?.categoryId || '').trim();
        const category = categoryById.get(categoryId);
        if (!category) {
          return null;
        }

        return {
          type,
          categoryId,
          title: normalizeLabel(section?.title, category.name),
          limit,
          enabled,
        };
      }

      if (type === 'best_sellers') {
        return {
          type,
          title: normalizeLabel(section?.title, 'Mais vendidos'),
          limit,
          enabled,
        };
      }

      if (type === 'new_arrivals') {
        return {
          type,
          title: normalizeLabel(section?.title, 'Novidades'),
          limit,
          enabled,
        };
      }

      return null;
    })
    .filter(Boolean)
    .filter((section) => section.enabled !== false);

  return parsed.length ? parsed : buildDefaultSections(categories);
}

module.exports = async function homeSectionsHandler(req, res) {
  if (guardMethod(req, res, ['GET'])) return;

  // Regra E1 — ver RATE_LIMITS.catalog.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.catalog);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase nao configurado',
      });
    }

    // Achado M7: a vitrine da home é pública e anônima, e até aqui baixava
    // `orders` e `order_items` INTEIRAS (sem `limit`, sem janela) a cada hit
    // não-cacheado só para ordenar a seção "Mais vendidos".
    // loadSoldCountByProduct agrega no Postgres e tem teto explícito no
    // fallback — ver lib/sales-counts.js.
    const [settingRow, categoriesRows, productsRows, soldCountByProduct] = await Promise.all([
      getTableRow('settings', {
        select: 'setting_value',
        filters: [{ column: 'setting_key', value: 'homeSections' }],
      }),
      listTableRows('categories', {
        select: 'id,name,slug,active',
        filters: [{ column: 'active', value: true }],
        orderBy: 'name',
        ascending: true,
      }),
      listTableRows('products', {
        select: 'id,slug,name,price,image_url,category_id,active,created_at',
        filters: [{ column: 'active', value: true }],
        orderBy: 'created_at',
        ascending: false,
      }),
      loadSoldCountByProduct(),
    ]);

    const settings = safeJsonParse(settingRow?.setting_value, {});
    const sections = normalizeSections(settings, categoriesRows);

    const categoryById = new Map(categoriesRows.map((category) => [String(category.id), category]));

    const normalizedProducts = productsRows.map((product) => {
      const category = categoryById.get(String(product.category_id));
      return {
        id: String(product.id),
        slug: product.slug || String(product.id),
        name: product.name,
        price: Number(product.price || 0),
        image: product.image_url || '',
        categoryId: product.category_id ? String(product.category_id) : null,
        category: category?.name || 'Sem categoria',
        soldCount: soldCountByProduct.get(String(product.id)) || 0,
        createdAt: product.created_at,
      };
    });

    const responseSections = sections.map((section, index) => {
      let list = normalizedProducts;
      let link = '/produtos';

      if (section.type === 'category') {
        const category = categoryById.get(String(section.categoryId));
        list = normalizedProducts.filter(
          (product) => String(product.categoryId || '') === String(section.categoryId),
        );
        if (category?.name) {
          link = `/produtos?categoria=${encodeURIComponent(category.name)}`;
        }
      }

      if (section.type === 'best_sellers') {
        list = [...normalizedProducts].sort((a, b) => {
          if (b.soldCount !== a.soldCount) {
            return b.soldCount - a.soldCount;
          }
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        link = '/produtos?preset=mais-vendidos';
      }

      if (section.type === 'new_arrivals') {
        list = [...normalizedProducts].sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
        );
        link = '/produtos?preset=novidades';
      }

      return {
        key: `${section.type}-${section.categoryId || index}`,
        type: section.type,
        title: section.title,
        link,
        products: list.slice(0, clampLimit(section.limit, 8)),
      };
    });

    res.setHeader(
      'Cache-Control',
      'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    );
    return ok(res, {
      success: true,
      sections: responseSections,
    });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao carregar vitrine da home.',
    });
  }
};
