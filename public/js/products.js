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
  loadProducts();
  bindFilters();
});

/* ══════ carrega produtos do Firestore ══════ */
async function loadProducts() {
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

/* ══════ bind filtros ══════ */
function bindFilters() {
  /* categoria */
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderProducts();
    });
  });

  /* ordenação */
  const sortSel = document.getElementById('sortSelect');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      activeSort = sortSel.value;
      sortProducts();
      renderProducts();
    });
  }

  /* preço */
  document.querySelectorAll('input[name="price"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activePriceRange = radio.value;
      renderProducts();
    });
  });
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

/* ══════ constrói card ══════ */
function buildCard(p) {
  const price  = typeof p.price === 'number' ? 'R$ ' + p.price.toFixed(2).replace('.', ',') : '—';
  const badge  = BADGES[p.category];
  const img    = p.imageUrl || p.image || '';
  const imgTag = img
    ? `<img src="${img}" alt="${p.name}" class="pc-img" loading="lazy">`
    : `<div class="pc-img-placeholder"><i class="bi bi-image" style="font-size:2.5rem;color:rgba(255,255,255,.3);"></i></div>`;

  return `
    <div class="pc-card">

      <!-- imagem -->
      <a href="/product-details.html?id=${p.id}" class="pc-img-wrap">
        ${imgTag}
        ${badge ? `<span class="pc-badge ${badge.cls}">${badge.label}</span>` : ''}
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
          <button class="pc-btn-cart" onclick="handleAddToCart('${p.id}','${encodeURIComponent(p.name)}',${p.price || 0},'${img}')">
            <i class="bi bi-cart-plus"></i> Adicionar ao Carrinho
          </button>
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

/* ══════ helpers ══════ (mantidos para compatibilidade) */
function formatPrice(price) {
  return typeof price === 'number' ? 'R$ ' + price.toFixed(2).replace('.', ',') : '—';
}

