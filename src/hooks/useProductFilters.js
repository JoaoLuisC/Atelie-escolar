import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchProducts } from '../services/products';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '');
}

function matchesPreset(product, preset) {
  if (preset === 'novidades') {
    const createdAtMs = new Date(product.createdAt || 0).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return Boolean(createdAtMs && createdAtMs >= sevenDaysAgo);
  }

  return true;
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

export function useProductFilters() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activePreset, setActivePreset] = useState('');
  const [activePriceRange, setActivePriceRange] = useState('all');
  const [activeSort, setActiveSort] = useState('newest');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCategorySectionOpen, setIsCategorySectionOpen] = useState(true);
  const [isPriceSectionOpen, setIsPriceSectionOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(products.map((item) => item.category).filter(Boolean))),
    [products],
  );

  useEffect(() => {
    const categoryFromQuery = searchParams.get('categoria');
    const presetFromQuery = normalizeText(searchParams.get('preset'));

    if (categoryFromQuery) {
      const foundCategory = categories.find(
        (category) => normalizeText(category) === normalizeText(categoryFromQuery),
      );
      if (foundCategory) {
        setActiveCategory(foundCategory);
      }
    }

    if (presetFromQuery === 'mais-vendidos') {
      setActivePreset('mais-vendidos');
      setActiveSort('sold-desc');
    }

    if (presetFromQuery === 'novidades') {
      setActivePreset('novidades');
      setActiveSort('newest');
    }
  }, [searchParams, categories]);

  const featuredCategories = useMemo(() => categories.slice(0, 5), [categories]);

  const filteredProducts = useMemo(() => {
    const sortedProducts = sortProducts(products, activeSort);

    return sortedProducts.filter((product) => {
      if (!matchesPreset(product, activePreset)) {
        return false;
      }

      const categoryMatch = activeCategory === 'all' || product.category === activeCategory;

      if (!categoryMatch) {
        return false;
      }

      if (activePriceRange === '0-25') return (product.price || 0) <= 25;
      if (activePriceRange === '25-50')
        return (product.price || 0) > 25 && (product.price || 0) <= 50;
      if (activePriceRange === '50+') return (product.price || 0) > 50;

      return true;
    });
  }, [activeCategory, activePreset, activePriceRange, activeSort, products]);

  function selectCategory(category) {
    setActivePreset('');
    setActiveCategory(category);
    setIsSidebarOpen(false);
  }

  function selectPriceRange(range) {
    setActivePriceRange(range);
    setIsSidebarOpen(false);
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

  const totalByCategory = (category) => {
    if (category === 'all') return products.length;
    return products.filter((product) => product.category === category).length;
  };

  return {
    activeCategory,
    activePriceRange,
    activeSort,
    categories,
    closeSidebar,
    error,
    featuredCategories,
    filteredProducts,
    isCategorySectionOpen,
    isPriceSectionOpen,
    isSidebarOpen,
    loading,
    openSidebar,
    resetPreset: () => setActivePreset(''),
    selectCategory,
    selectPriceRange,
    setActiveSort,
    toggleCategorySection,
    togglePriceSection,
    totalByCategory,
  };
}
