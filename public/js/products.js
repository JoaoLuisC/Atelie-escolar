/* ═══════════════════════════════════════════════
   products.js — Ateliê da Escola
   Carrega produtos do Firestore, filtros de
   categoria, ordenação e cards de conversão.
═══════════════════════════════════════════════ */

let allProducts = [];           // todos os produtos carregados
let activeCategory = 'all';     // categoria activa
let activePriceRange = 'all';   // faixa de preço activa
let activeSort = 'newest';      // ordenação activa

/* ─── badges de destaque (por categoria ou nome) ─── */
const BADGES = {
  'Festa Junina':        { label: 'MAIS VENDIDO',    cls: 'badge-hot' },
  'Formatura':           { label: 'DESTAQUE',         cls: 'badge-featured' },
  'Volta às Aulas':      { label: 'LANÇAMENTO',       cls: 'badge-new' },
  'Datas Comemorativas': { label: 'PROMO LIMITADA',   cls: 'badge-promo' },
  'Decoração de Sala':   { label: 'EXCLUSIVO',        cls: 'badge-exclusive' },
};

/* ─── mapeamento categoria → id do contador ─── */
const CAT_COUNT_IDS = {
  'Festa Junina':        'cat-festa',
  'Formatura':           'cat-form',
  'Volta às Aulas':      'cat-volta',
  'Datas Comemorativas': 'cat-datas',
  'Decoração de Sala':   'cat-deco',
};

/* ══════ inicialização ══════ */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof updateCartCount === 'function') updateCartCount();
  loadCategories();   // renderiza botões no sidebar, depois chama loadProducts
  bindStaticFilters(); // preco + sort (não dependem do Firestore)
  initSidebar();       // toggle e seções colapsáveis
});

/* ══════ carrega categorias do Firestore e renderiza barra + destaques ══════ */
async function loadCategories() {
  try {
    await waitForFirebase();

    const { orderBy } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
    const q = window.firebaseQuery(
      window.firebaseCollection(window.firebaseDb, 'categories'),
      orderBy('order', 'asc')
    );
    const snap = await window.firebaseGetDocs(q);
    const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log('[loadCategories] dados do Firestore:', cats.map(c => ({ id: c.id, name: c.name, slug: c.slug })));

    /* ─ todas as categorias no sidebar ─ */
    const sidebarBar = document.getElementById('sidebarCatList');
    /* ─ chips de destaque na barra superior ─ */
    const chipBar = document.getElementById('catFilterBar');

    cats.forEach(cat => {
      const slug = cat.slug || cat.id;

      /* botão sidebar */
      const btn = document.createElement('button');
      btn.className = 'cat-btn sidebar-cat';
      btn.dataset.cat = cat.name;
      btn.innerHTML = `${cat.name} <span class="cat-count" id="cat-dyn-${slug}">—</span>`;
      sidebarBar.appendChild(btn);

      /* chip de destaque no top bar (apenas categorias featured) */
      if (cat.featured && chipBar) {
        const chip = document.createElement('button');
        chip.className = 'cat-btn';
        chip.dataset.cat = cat.name;
        chip.innerHTML = `${cat.name}`;
        chip.style.setProperty('--chip-color', cat.color || 'var(--primary-color)');
        chipBar.appendChild(chip);
      }

      /* alimenta CAT_COUNT_IDS dinamicamente */
      CAT_COUNT_IDS[cat.name] = `cat-dyn-${slug}`;

      /* alimenta BADGES a partir de campos opcionais da categoria */
      if (cat.badgeLabel && !BADGES[cat.name]) {
        BADGES[cat.name] = { label: cat.badgeLabel, cls: cat.badgeClass || 'badge-hot' };
      }
    });

    /* ─ rebind cliques (inclui botões recém-criados) ─ */
    bindCatButtons();

  } catch (err) {
    console.warn('Categorias não carregadas (Firestore vazio ou sem coleção):', err.message);
  }

  /* carrega produtos de qualquer forma */
  loadProducts();
}

/* ══════ carrega produtos do Firestore ══════ */
async function loadProducts() {
  // Guard: se os produtos já foram carregados nesta sessão, apenas re-renderiza
  if (allProducts.length > 0) {
    renderProducts();
    return;
  }

  try {
    await waitForFirebase();

    const q = window.firebaseQuery(
      window.firebaseCollection(window.firebaseDb, 'products'),
      window.firebaseWhere('active', '==', true)
    );
    const snap = await window.firebaseGetDocs(q);

    snap.forEach(doc => {
      const d = doc.data();
      allProducts.push({ id: doc.id, ...d });
    });

    /* ordena padrão: mais recentes */
    sortProducts();

    /* preenche contadores nos botões de categoria */
    fillCategoryCounts();

    /* renderiza */
    renderProducts();

    document.getElementById('loading').style.display = 'none';
    document.getElementById('productsGrid').style.display = 'grid';

  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'block';
  }
}

/* ══════ preenche contadores ══════ */
function fillCategoryCounts() {
  /* total */
  const totalEl = document.getElementById('cat-all');
  if (totalEl) totalEl.textContent = allProducts.length;

  for (const [cat, elId] of Object.entries(CAT_COUNT_IDS)) {
    const el = document.getElementById(elId);
    if (el) el.textContent = allProducts.filter(p => p.category === cat).length;
  }
}

/* ══════ filtra + renderiza ══════ */
function renderProducts() {
  let list = [...allProducts];

  /* filtro categoria */
  if (activeCategory !== 'all') {
    list = list.filter(p => p.category === activeCategory);
  }

  /* filtro preço */
  if (activePriceRange === '0-25')  list = list.filter(p => p.price <= 25);
  if (activePriceRange === '25-50') list = list.filter(p => p.price > 25 && p.price <= 50);
  if (activePriceRange === '50+')   list = list.filter(p => p.price > 50);

  /* contagem */
  const rc = document.getElementById('resultsCount');
  if (rc) rc.textContent = `${list.length} produto${list.length !== 1 ? 's' : ''} encontrado${list.length !== 1 ? 's' : ''}`;

  const grid = document.getElementById('productsGrid');
  const empty = document.getElementById('emptyState');

  if (list.length === 0) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = list.map(p => buildCard(p)).join('');
}

/* ══════ ordenação ══════ */
function sortProducts() {
  allProducts.sort((a, b) => {
    if (activeSort === 'price-asc')  return (a.price || 0) - (b.price || 0);
    if (activeSort === 'price-desc') return (b.price || 0) - (a.price || 0);
    if (activeSort === 'name')       return (a.name || '').localeCompare(b.name || '');
    /* newest — padrão */
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

/* ══════ bind filtros estáticos (preço + sort) ══════ */
function bindStaticFilters() {
  const sortSel = document.getElementById('sortSelect');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      activeSort = sortSel.value;
      sortProducts();
      renderProducts();
    });
  }
  document.querySelectorAll('input[name="price"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activePriceRange = radio.value;
      renderProducts();
    });
  });
}

/* ══════ bind botões de categoria (chama após renderizá-los) ══════ */
function bindCatButtons() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderProducts();
    });
  });
}

/* ══════ bind filtros (legacy — mantido por compatibilidade) ══════ */
function bindFilters() {
  bindStaticFilters();
  bindCatButtons();
}

/* ══════ aguarda Firebase ══════ */
function waitForFirebase() {
  return new Promise(resolve => {
    if (window.firebaseDb) return resolve();
    const t = setInterval(() => {
      if (window.firebaseDb) { clearInterval(t); resolve(); }
    }, 80);
  });
}

/* ══════ converte URL do Google Drive ══════ */
function gdrive(url) {
  if (!url || !url.includes('drive.google.com')) return url;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w800`;
  return url;
}

/* ══════ constrói card ══════ */
function buildCard(p) {
  const price     = typeof p.price === 'number' ? 'R$ ' + p.price.toFixed(2).replace('.', ',') : '—';
  const badge     = BADGES[p.category];
  const rawImg    = (Array.isArray(p.images) && p.images.length ? p.images[0] : '') || p.imageUrl || p.image || '';
  const img       = gdrive(rawImg);
  const purchased = (window.purchasedProductIds || new Set()).has(p.id);
  const imgTag    = img
    ? `<img src="${img}" alt="${p.name}" class="pc-img" loading="lazy" onerror="this.onerror=null;this.style.visibility='hidden'">`
    : `<div class="pc-img-placeholder"><i class="bi bi-image" style="font-size:2.5rem;color:rgba(255,255,255,.3);"></i></div>`;

  const cartBtn = purchased
    ? `<a href="/downloads.html" class="pc-btn-purchased">
         <i class="bi bi-check-circle-fill"></i> Já Comprado — Ver Downloads
       </a>`
    : `<button class="pc-btn-cart" onclick="handleAddToCart('${p.id}','${encodeURIComponent(p.name)}',${p.price || 0},'${img}')">
         <i class="bi bi-cart-plus"></i> Adicionar ao Carrinho
       </button>`;

  return `
    <div class="pc-card${purchased ? ' pc-card-purchased' : ''}">

      <!-- imagem -->
      <a href="/product-details.html?id=${p.id}" class="pc-img-wrap">
        ${imgTag}
        ${purchased ? `<span class="pc-badge-purchased"><i class="bi bi-check-circle-fill"></i> Comprado</span>` : (badge ? `<span class="pc-badge ${badge.cls}">${badge.label}</span>` : '')}
        <div class="pc-img-hover">Ver detalhes →</div>
      </a>

      <!-- corpo -->
      <div class="pc-body">
        <span class="pc-cat">${p.category || 'Banner'}</span>
        <h3 class="pc-name">${p.name}</h3>
        <p class="pc-desc">${(p.description || '').substring(0, 90)}${p.description && p.description.length > 90 ? '…' : ''}</p>

        <div class="pc-specs">
          <span><i class="bi bi-file-pdf-fill" style="color:#e74c3c;"></i> PDF</span>
          <span><i class="bi bi-pencil-square" style="color:var(--accent-blue);"></i> Canva</span>
          <span><i class="bi bi-printer-fill" style="color:var(--secondary-color);"></i> Pronto p/ imprimir</span>
        </div>

        <div class="pc-price-row">
          <span class="pc-price">${price}</span>
        </div>

        <div class="pc-actions">
          ${cartBtn}
          <a href="/product-details.html?id=${p.id}" class="pc-btn-details">Detalhes</a>
        </div>
      </div>

    </div>`;
}

/* ══════ adicionar ao carrinho ══════ */
function handleAddToCart(id, name, price, image) {
  if (typeof addToCart === 'function') {
    addToCart({ id, name: decodeURIComponent(name), price, image });
  }
}
/* ══════ inicializa sidebar e seções colapsáveis ══════ */
function initSidebar() {
  const sidebar = document.getElementById('productsSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const btnOpen = document.getElementById('toggleFilters');

  function openSidebar()  { sidebar.classList.add('open'); overlay.classList.add('open'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }

  if (btnOpen)  btnOpen.addEventListener('click', openSidebar);
  if (overlay)  overlay.addEventListener('click', closeSidebar);

  /* seções colapsáveis */
  document.querySelectorAll('.sidebar-section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.closest('.sidebar-collapsible').classList.toggle('collapsed');
    });
  });
}
/* ══════ helpers ══════ (mantidos para compatibilidade) */
function formatPrice(price) {
  return typeof price === 'number' ? 'R$ ' + price.toFixed(2).replace('.', ',') : '—';
}

