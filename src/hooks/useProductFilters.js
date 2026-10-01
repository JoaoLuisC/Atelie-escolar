import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchProducts } from '../services/products';

// ════════════════════════════════════════════════════════════════════
// Filtros do catálogo — a URL é a FONTE da verdade.
//
// ── POR QUE (LOJA-03/06/07/14/23) ───────────────────────────────────
// Antes, os filtros moravam em `useState` e a URL só era lida uma vez, para
// "semear" o estado. Daí, todos os sintomas do relatório de 2026-10-01:
//   • chips, faixa de preço e ordenação não iam para a URL — F5 ou link
//     compartilhado perdiam a escolha;
//   • "Produtos" no cabeçalho limpava a URL mas o filtro continuava aplicado;
//   • `?categoria=` só casava com o NOME exato, e o sitemap publica o SLUG;
//   • `?q=` era ignorado, embora o JSON-LD da home anuncie a busca;
//   • o preset "novidades" filtrava 7 dias, e a faixa "Novidades" da home
//     mostra os mais recentes sem janela: 8 produtos lá, 0 aqui.
//
// Agora o estado é DERIVADO dos parâmetros e cada ação escreve na URL:
//   ?categoria=<slug ou nome>  ?faixa=0-25|25-50|50+  ?ordem=<sort>
//   ?preset=novidades|mais-vendidos  ?q=<texto>
// Os presets são ORDENAÇÃO, não filtro — o mesmo critério da home.
// ════════════════════════════════════════════════════════════════════

const PRICE_RANGES = new Set(['all', '0-25', '25-50', '50+']);
const SORTS = new Set(['sold-desc', 'newest', 'price-asc', 'price-desc', 'name']);
const PRESET_SORT = {
  novidades: 'newest',
  'mais-vendidos': 'sold-desc',
};
export const PRESET_LABELS = {
  novidades: 'Novidades — mais recentes primeiro',
  'mais-vendidos': 'Mais vendidos primeiro',
};

// Mesmo formato de UUID usado no backend (lib/public-catalog.js). Defesa em
// profundidade para LOJA-02: categoria com cara de id nunca vira filtro.
const UUID_LOOKING = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '');
}

function slugify(value) {
  return normalizeText(value)
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function isPresentableCategory(name) {
  const text = String(name || '').trim();
  return Boolean(text) && !UUID_LOOKING.test(text);
}

function matchesPriceRange(product, range) {
  const price = product.price || 0;
  if (range === '0-25') return price <= 25;
  if (range === '25-50') return price > 25 && price <= 50;
  if (range === '50+') return price > 50;
  return true;
}

function matchesQuery(product, normalizedQuery) {
  if (!normalizedQuery) return true;
  const haystack = normalizeText(
    [product.name, product.description, product.category, ...(product.tags || [])].join(' '),
  );
  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function sortProducts(products, sort) {
  return [...products].sort((a, b) => {
    if (sort === 'sold-desc') return (b.soldCount || 0) - (a.soldCount || 0);
    if (sort === 'price-asc') return (a.price || 0) - (b.price || 0);
    if (sort === 'price-desc') return (b.price || 0) - (a.price || 0);
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

/**
 * Casa o valor de `?categoria=` com uma categoria conhecida. Aceita o slug
 * (formato do sitemap e dos links da home), o nome (links antigos) e o nome
 * "slugificado" (categoria sem slug no banco).
 */
export function resolveCategoryParam(param, categoryOptions) {
  const raw = String(param || '').trim();
  if (!raw) return 'all';
  const asText = normalizeText(raw);
  const asSlug = slugify(raw);
  const found = categoryOptions.find(
    (option) =>
      (option.slug && normalizeText(option.slug) === asText) ||
      normalizeText(option.name) === asText ||
      slugify(option.name) === asSlug,
  );
  return found ? found.name : 'all';
}

/** Lê os filtros da URL — função pura, testável sem React. */
export function readFiltersFromParams(searchParams, categoryOptions) {
  const preset = normalizeText(searchParams.get('preset'));
  const activePreset = PRESET_SORT[preset] ? preset : '';
  const sortParam = String(searchParams.get('ordem') || '');
  const priceParam = String(searchParams.get('faixa') || '');

  return {
    activeCategory: resolveCategoryParam(searchParams.get('categoria'), categoryOptions),
    activePreset,
    activePriceRange: PRICE_RANGES.has(priceParam) ? priceParam : 'all',
    activeSort: SORTS.has(sortParam) ? sortParam : PRESET_SORT[activePreset] || 'newest',
    searchQuery: String(searchParams.get('q') || '').trim(),
  };
}

export function useProductFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCategorySectionOpen, setIsCategorySectionOpen] = useState(true);
  const [isPriceSectionOpen, setIsPriceSectionOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // LOJA-15: "Tentar novamente" incrementa e refaz a busca.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchProducts();

        if (isMounted) {
          setProducts(data);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, [attempt]);

  // Categorias públicas, na ordem em que aparecem no catálogo, com o slug que
  // a API devolve (`categorySlug`) para escrever na URL.
  const categoryOptions = useMemo(() => {
    const byName = new Map();
    for (const product of products) {
      if (!isPresentableCategory(product.category) || byName.has(product.category)) continue;
      byName.set(product.category, {
        name: product.category,
        slug: String(product.categorySlug || '').trim(),
      });
    }
    return Array.from(byName.values());
  }, [products]);

  const categories = useMemo(() => categoryOptions.map((option) => option.name), [categoryOptions]);

  const { activeCategory, activePreset, activePriceRange, activeSort, searchQuery } = useMemo(
    () => readFiltersFromParams(searchParams, categoryOptions),
    [searchParams, categoryOptions],
  );

  const normalizedQuery = normalizeText(searchQuery);

  const featuredCategories = useMemo(() => categories.slice(0, 5), [categories]);

  // Base comum da lista e dos contadores: tudo menos a categoria.
  const productsBeforeCategory = useMemo(
    () =>
      products.filter(
        (product) =>
          matchesPriceRange(product, activePriceRange) && matchesQuery(product, normalizedQuery),
      ),
    [products, activePriceRange, normalizedQuery],
  );

  const filteredProducts = useMemo(() => {
    const inCategory =
      activeCategory === 'all'
        ? productsBeforeCategory
        : productsBeforeCategory.filter((product) => product.category === activeCategory);
    return sortProducts(inCategory, activeSort);
  }, [activeCategory, activeSort, productsBeforeCategory]);

  /**
   * Escreve na URL. `replace: true` para não empilhar uma entrada de histórico
   * por clique de filtro — o Voltar leva à página anterior, não ao filtro
   * anterior. Valor vazio/padrão REMOVE o parâmetro, para a URL ficar limpa.
   */
  const updateParams = useCallback(
    (changes) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === undefined || value === '' || value === 'all') {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  function selectCategory(category) {
    const option = categoryOptions.find((item) => item.name === category);
    updateParams({ categoria: category === 'all' ? null : option?.slug || category });
    setIsSidebarOpen(false);
  }

  function selectPriceRange(range) {
    updateParams({ faixa: PRICE_RANGES.has(range) ? range : null });
    setIsSidebarOpen(false);
  }

  function setActiveSort(sort) {
    // Escolher uma ordenação à mão encerra o preset (que era só uma ordenação).
    updateParams({ ordem: SORTS.has(sort) ? sort : null, preset: null });
  }

  function clearSearch() {
    updateParams({ q: null });
  }

  function resetPreset() {
    updateParams({ preset: null });
  }

  function clearFilters() {
    updateParams({ categoria: null, faixa: null, ordem: null, preset: null, q: null });
  }

  function openSidebar() {
    setIsSidebarOpen(true);
  }

  function closeSidebar() {
    setIsSidebarOpen(false);
  }

  function toggleCategorySection() {
    setIsCategorySectionOpen((value) => !value);
  }

  function togglePriceSection() {
    setIsPriceSectionOpen((value) => !value);
  }

  // LOJA-14: os contadores respeitam a faixa de preço e a busca — antes
  // contavam o catálogo inteiro e diziam "Formatura 2" com a lista mostrando 0.
  const totalByCategory = (category) => {
    if (category === 'all') return productsBeforeCategory.length;
    return productsBeforeCategory.filter((product) => product.category === category).length;
  };

  const hasActiveFilters =
    activeCategory !== 'all' || activePriceRange !== 'all' || Boolean(normalizedQuery);

  return {
    activeCategory,
    activePreset,
    activePriceRange,
    activeSort,
    categories,
    clearFilters,
    clearSearch,
    closeSidebar,
    error,
    featuredCategories,
    filteredProducts,
    hasActiveFilters,
    isCategorySectionOpen,
    isPriceSectionOpen,
    isSidebarOpen,
    loading,
    openSidebar,
    resetPreset,
    retry: () => setAttempt((value) => value + 1),
    searchQuery,
    selectCategory,
    selectPriceRange,
    setActiveSort,
    toggleCategorySection,
    togglePriceSection,
    totalByCategory,
  };
}
