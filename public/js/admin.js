// Admin Panel JavaScript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getAuth, onAuthStateChanged, signOut, updatePassword,
    reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc,
    doc, query, orderBy, getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

/* ══ Email do único admin ══ altere para o email real */
const ADMIN_EMAIL = 'admin@ateliedaescola.com';

const firebaseConfig = {
    apiKey: "AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk",
    authDomain: "atelie-da-escola.firebaseapp.com",
    projectId: "atelie-da-escola",
    storageBucket: "atelie-da-escola.firebasestorage.app",
    messagingSenderId: "325690647064",
    appId: "1:325690647064:web:e1c3b4bfaaf921ab7cd96d"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ─── estado ─── */
let currentUser       = null;
let products          = [];
let categories        = [];
let allOrders         = [];
let ordersLoaded      = false;
let editingProductId  = null;
let editingCategoryId = null;
let deleteTarget      = null; // { type: 'product'|'category', id, name }

/* ── MercadoPago fee rates ── */
const MP_FEES = {
    pix:         { pct: 0.0099, fixed: 0,    label: 'PIX'                      },
    bolbradesco: { pct: 0,      fixed: 3.49, label: 'Boleto'                   },
    visa:        { pct: 0.0379, fixed: 0,    label: 'Visa Cr\u00e9dito'        },
    master:      { pct: 0.0379, fixed: 0,    label: 'Mastercard Cr\u00e9dito'  },
    amex:        { pct: 0.0469, fixed: 0,    label: 'Amex'                     },
    elo:         { pct: 0.0379, fixed: 0,    label: 'Elo Cr\u00e9dito'         },
    hipercard:   { pct: 0.0379, fixed: 0,    label: 'Hipercard'                },
    debvisa:     { pct: 0.0199, fixed: 0,    label: 'Visa D\u00e9bito'         },
    debmaster:   { pct: 0.0199, fixed: 0,    label: 'Mastercard D\u00e9bito'   },
    debelo:      { pct: 0.0199, fixed: 0,    label: 'Elo D\u00e9bito'          },
};

function calcOrderFee(order) {
    const gross = order.totalAmount || 0;
    const pm    = (order.mercadoPagoData?.paymentInfo?.paymentMethod || '').toLowerCase();
    const fee   = MP_FEES[pm];
    if (!fee) {
        const defaultPct = 0.0379; // crédito como fallback
        return { gross, fee: gross * defaultPct, net: gross * (1 - defaultPct) };
    }
    const feeAmt = gross * fee.pct + fee.fixed;
    return { gross, fee: feeAmt, net: gross - feeAmt };
}

/* ─── elementos ─── */
const userEmailEl      = document.getElementById('user-email');
const btnLogout        = document.getElementById('btn-logout');
const btnAddProduct    = document.getElementById('btn-add-product');
const productsGrid     = document.getElementById('products-grid');
const productModal     = document.getElementById('product-modal');
const deleteModal      = document.getElementById('delete-modal');
const productForm      = document.getElementById('product-form');
const toast            = document.getElementById('toast');
const imagesContainer  = document.getElementById('images-container');
const videosContainer  = document.getElementById('videos-container');
const catSelect        = document.getElementById('product-category');

// categorias
const btnAddCategory   = document.getElementById('btn-add-category');
const categoriesList   = document.getElementById('categories-list');
const categoryModal    = document.getElementById('category-modal');
const categoryForm     = document.getElementById('category-form');

// kit / painel
const panelSizesContainer = document.getElementById('panel-sizes-container');

/* ─── helpers: kit product picker ─── */
let _kitAllProds   = [];
let _kitCheckedIds = new Set();

async function populateKitPicker(selectedIds = []) {
    _kitCheckedIds = new Set(selectedIds);
    const picker    = document.getElementById('kit-product-picker');
    const catFilter = document.getElementById('kit-cat-filter');
    const searchInp = document.getElementById('kit-search');
    if (!picker) return;
    picker.innerHTML = '<p style="color:#778DA9;text-align:center;padding:10px 0;">Carregando produtos…</p>';
    try {
        let allProds = products.length ? products : [];
        if (!allProds.length) {
            const snap = await getDocs(collection(db, 'products'));
            allProds = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        _kitAllProds = editingProductId ? allProds.filter(p => p.id !== editingProductId) : allProds;
        if (!_kitAllProds.length) {
            picker.innerHTML = '<p style="color:#778DA9;text-align:center;padding:10px 0;">Nenhum produto encontrado.</p>';
            return;
        }
        if (catFilter) {
            const cats = [...new Set(_kitAllProds.map(p => p.category).filter(Boolean))].sort();
            catFilter.innerHTML = '<option value="">Todas as categorias</option>' +
                cats.map(c => `<option value="${c}">${c}</option>`).join('');
            catFilter.value = '';
        }
        if (searchInp) searchInp.value = '';
        renderKitPickerItems();
        updateKitTotalPrice();
    } catch (err) {
        picker.innerHTML = `<p style="color:#c0392b;text-align:center;padding:10px 0;">Erro: ${err.message}</p>`;
    }
}

function renderKitPickerItems() {
    const picker = document.getElementById('kit-product-picker');
    if (!picker) return;
    const cat    = document.getElementById('kit-cat-filter')?.value || '';
    const search = (document.getElementById('kit-search')?.value || '').toLowerCase().trim();
    let filtered = _kitAllProds;
    if (cat)    filtered = filtered.filter(p => p.category === cat);
    if (search) filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(search));
    if (!filtered.length) {
        picker.innerHTML = '<p style="color:#778DA9;text-align:center;padding:20px 0;">Nenhum produto encontrado para este filtro.</p>';
        return;
    }
    picker.innerHTML = filtered.map(p => `
        <label style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer;transition:background .15s;${p.active === false ? 'opacity:.6;' : ''}" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">
            <input type="checkbox" class="kit-product-check" value="${p.id}"
                data-name="${(p.name || '').replaceAll('"', '&quot;')}"
                data-price="${p.price || 0}"
                ${_kitCheckedIds.has(p.id) ? 'checked' : ''}>
            <span style="flex:1;font-weight:500;">${p.name}</span>
            <span style="font-size:12px;color:#778DA9;margin-right:4px;">${p.category || ''}</span>
            <span style="font-size:13px;font-weight:600;white-space:nowrap;color:#415A77;">R$&nbsp;${fmtMoney(p.price)}</span>
            ${p.active === false ? '<span style="font-size:11px;background:#fde8e8;color:#b91c1c;border-radius:4px;padding:1px 5px;flex-shrink:0;">inativo</span>' : ''}
            ${(p.productType === 'kit') ? '<span style="font-size:11px;background:#ede9fe;color:#6d28d9;border-radius:4px;padding:1px 5px;flex-shrink:0;">KIT</span>' : ''}
        </label>`).join('');
    picker.querySelectorAll('.kit-product-check').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) _kitCheckedIds.add(cb.value);
            else _kitCheckedIds.delete(cb.value);
            updateKitTotalPrice();
        });
    });
}

function updateKitTotalPrice() {
    const total = _kitAllProds
        .filter(p => _kitCheckedIds.has(p.id))
        .reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);
    const priceInput = document.getElementById('product-price');
    if (priceInput) priceInput.value = total.toFixed(2);
}

function collectKitProducts() {
    return _kitAllProds
        .filter(p => _kitCheckedIds.has(p.id))
        .map(p => ({ id: p.id, name: p.name, price: parseFloat(p.price) || 0 }));
}

/* ─── helpers: panel sizes ─── */
function addPanelSizeRow(ps = {}) {
    const row = document.createElement('div');
    row.className = 'panel-size-row';
    row.style.cssText = 'border:1px solid #e6e9f0;border-radius:8px;padding:10px;margin-bottom:8px;';
    row.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;">
            <div>
                <label style="font-size:12px;color:#778DA9;display:block;margin-bottom:4px;">Etiqueta</label>
                <input type="text" class="panel-size-label" placeholder="Ex: Menor" value="${(ps.label||'').replaceAll('"','&quot;')}" style="width:100%;">
            </div>
            <div>
                <label style="font-size:12px;color:#778DA9;display:block;margin-bottom:4px;">Dimensões</label>
                <input type="text" class="panel-size-dimensions" placeholder="Ex: 0,76x0,53m" value="${(ps.dimensions||'').replaceAll('"','&quot;')}" style="width:100%;">
            </div>
            <div>
                <label style="font-size:12px;color:#778DA9;display:block;margin-bottom:4px;">Nº de folhas A4</label>
                <input type="number" class="panel-size-sheets" min="1" placeholder="8" value="${ps.sheets||''}" style="width:100%;">
            </div>
            <div style="display:flex;align-items:flex-end;padding-bottom:0;">
                <button type="button" class="btn-remove-image btn-remove-panel-size" title="Remover">&times;</button>
            </div>
        </div>`;
    row.querySelector('.btn-remove-panel-size').addEventListener('click', () => row.remove());
    panelSizesContainer.appendChild(row);
}

function resetPanelSizes() { panelSizesContainer.innerHTML = ''; }

function collectPanelSizes() {
    return Array.from(panelSizesContainer.querySelectorAll('.panel-size-row')).map(row => ({
        label:      row.querySelector('.panel-size-label').value.trim(),
        dimensions: row.querySelector('.panel-size-dimensions').value.trim(),
        sheets:     Number.parseInt(row.querySelector('.panel-size-sheets').value, 10) || null,
    })).filter(ps => ps.dimensions || ps.label);
}

/* ─── toggle kit sections ─── */
function toggleKitSections(isKit, selectedIds = []) {
    document.getElementById('kit-items-section').style.display    = isKit ? 'block' : 'none';
    document.getElementById('original-price-group').style.display = isKit ? 'block' : 'none';
    if (isKit) populateKitPicker(selectedIds);
}

function setProductTypeBadge(type) {
    const input = document.getElementById('product-type');
    const badge = document.getElementById('product-type-badge');
    if (input) input.value = type;
    if (!badge) return;
    if (type === 'kit') {
        badge.textContent = '\u{1F4E6} KIT';
        badge.style.background   = '#ede9fe';
        badge.style.color        = '#6d28d9';
        badge.style.borderColor  = '#ddd6fe';
    } else {
        badge.textContent = '\u{1F4C4} Individual';
        badge.style.background   = '#e8f5e9';
        badge.style.color        = '#2e7d32';
        badge.style.borderColor  = '#c8e6c9';
    }
}

/* ═══════════════════════════════════════
   NAVEGAÇÃO — SIDEBAR
═══════════════════════════════════════ */

/* Data no topbar */
(function() {
    const el = document.getElementById('adm-topbar-date');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
})();

/* Mobile sidebar toggle */
const sidebarEl  = document.getElementById('adm-sidebar');
const overlayEl  = document.getElementById('adm-overlay');
const toggleBtn  = document.getElementById('adm-toggle');
function closeSidebar() {
    sidebarEl?.classList.remove('open');
    overlayEl?.classList.remove('open');
}
toggleBtn?.addEventListener('click', () => {
    const open = sidebarEl?.classList.toggle('open');
    overlayEl?.classList.toggle('open', open);
});
overlayEl?.addEventListener('click', closeSidebar);

/* Nav item clicks */
const PAGE_TITLES = {
    dashboard:      'Dashboard',
    produtos:       'Todos os Produtos',
    categorias:     'Categorias',
    usuarios:       'Usu\u00e1rios',
    pedidos:        'Pedidos',
    vitrine:        'Vitrine',
    seguranca:      'Seguran\u00e7a',
    faturamento:    'Faturamento',
    'prod-config':  'Configura\u00e7\u00e3o de Produtos',
    'prod-saida':   'Sa\u00edda \u0026 Desempenho',
    'comparativo':  'Comparativo de Per\u00edodos',
};

function activateTab(tab) {
    document.querySelectorAll('.adm-nav-item, .adm-nav-sub-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const navEl = document.querySelector(`[data-tab="${tab}"]`);
    if (navEl) navEl.classList.add('active');

    // If it's a sub-item, keep the parent group open
    if (navEl?.classList.contains('adm-nav-sub-item')) {
        const sub = navEl.closest('.adm-nav-sub');
        if (sub) {
            sub.classList.add('open');
            const chev = sub.previousElementSibling?.querySelector('.adm-grp-chevron');
            if (chev) chev.classList.add('open');
        }
    }

    document.getElementById(`tab-${tab}`)?.classList.add('active');
    const titleEl = document.getElementById('adm-page-title');
    if (titleEl) titleEl.textContent = PAGE_TITLES[tab] || tab;

    if (tab === 'dashboard')   loadDashboard();
    if (tab === 'usuarios')    loadUsers();
    if (tab === 'pedidos')     loadOrders();
    if (tab === 'vitrine')     loadVitrine();
    if (tab === 'seguranca')   loadSeguranca();
    if (tab === 'faturamento') loadFaturamento();
    if (tab === 'prod-saida')   loadProdSaida();
    if (tab === 'prod-config')  loadProdConfig();
    if (tab === 'comparativo')  loadComparativo();

    closeSidebar();
}

document.querySelectorAll('.adm-nav-item, .adm-nav-sub-item').forEach(item => {
    item.addEventListener('click', () => activateTab(item.dataset.tab));
});

// Group head toggles sub-menu
document.querySelectorAll('.adm-nav-group-head').forEach(head => {
    head.addEventListener('click', () => {
        const group = head.dataset.group;
        const sub   = document.getElementById(`nav-sub-${group}`);
        const chev  = head.querySelector('.adm-grp-chevron');
        if (sub)  sub.classList.toggle('open');
        if (chev) chev.classList.toggle('open');
    });
});

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email !== ADMIN_EMAIL) {
            signOut(auth).then(() => { window.location.href = '/'; });
            return;
        }
        /* Bloqueia acesso direto sem passar pelo PIN na tela de login */
        if (!sessionStorage.getItem('admin_pin_ok')) {
            signOut(auth).then(() => { window.location.href = '/admin-login.html'; });
            return;
        }
        currentUser = user;
        userEmailEl.textContent = user.email;
        loadProducts();
        loadCategories();
        loadDashboard();
    } else {
        window.location.href = '/admin-login.html';
    }
});

btnLogout.addEventListener('click', async () => {
    try {
        sessionStorage.removeItem('admin_pin_ok');
        await signOut(auth);
        window.location.href = '/admin-login.html';
    }
    catch (e) { showToast('Erro ao sair', 'error'); }
});

/* ═══════════════════════════════════════
   PRODUTOS
═══════════════════════════════════════ */

/* Converte URL de compartilhamento do Google Drive para URL direta de imagem */
function gdrive(url) {
    if (!url || !url.includes('drive.google.com')) return url;
    const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w800`;
    return url;
}

let productsFilter = '';

async function loadProducts() {
    try {
        productsGrid.innerHTML = '<div class="loading-state"><p>Carregando produtos...</p></div>';
        const snap = await getDocs(collection(db, 'products'));
        products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        renderProducts();
    } catch (e) {
        productsGrid.innerHTML = `<div class="empty-state"><h3>Erro ao carregar produtos</h3><p>${e.message}</p></div>`;
        showToast('Erro ao carregar produtos', 'error');
    }
}

function renderProducts() {
    const NO_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23edf1f5' width='80' height='80'/%3E%3C/svg%3E`;

    if (products.length === 0) {
        productsGrid.innerHTML = `<div class="empty-state"><h3>Nenhum produto cadastrado</h3><p>Clique em "Adicionar Produto" para começar</p></div>`;
        return;
    }

    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const filtered = productsFilter ? products.filter(p => p.category === productsFilter) : products;

    const toolbarHTML = `
    <div class="prod-list-toolbar">
        <button class="prod-filter-btn ${!productsFilter ? 'active' : ''}" data-cat="">Todos <span class="prod-filter-count">${products.length}</span></button>
        ${cats.map(c => `<button class="prod-filter-btn ${productsFilter === c ? 'active' : ''}" data-cat="${c}">${c} <span class="prod-filter-count">${products.filter(p => p.category === c).length}</span></button>`).join('')}
    </div>`;

    const listHTML = !filtered.length
        ? `<div class="empty-state" style="padding:30px 0;"><p>Nenhum produto nesta categoria.</p></div>`
        : `<div class="prod-list">${filtered.map(product => {
            const imgRaw = Array.isArray(product.images) && product.images.length ? product.images[0] : (product.image || '');
            const imgSrc = gdrive(imgRaw);
            const imgHTML = imgSrc
                ? `<img class="prod-thumb" src="${imgSrc}" alt="" onerror="this.onerror=null;this.style.visibility='hidden'">`
                : `<div class="prod-thumb prod-thumb-ph">🎨</div>`;
            const imgCount  = Array.isArray(product.images) ? product.images.length : (product.image ? 1 : 0);
            const videoCount = Array.isArray(product.videos) ? product.videos.length : 0;
            return `
            <div class="prod-list-item" data-id="${product.id}">
                ${imgHTML}
                <div class="prod-list-info">
                    <div class="prod-list-name">${product.name}${product.productType === 'kit' ? ' <span style="background:#fff3e0;color:#e65100;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:700;vertical-align:middle;">KIT</span>' : ''}</div>
                    <div class="prod-list-desc">${product.description || '—'}</div>
                    <div class="prod-list-meta">
                        <span class="prod-list-cat">${product.category || '—'}</span>
                        ${imgCount > 1 ? `<span class="prod-list-chip">🖼️ ${imgCount}</span>` : ''}
                        ${videoCount > 0 ? `<span class="prod-list-chip">🎬 ${videoCount}</span>` : ''}
                        ${product.kitItems?.length > 0 ? `<span class="prod-list-chip">📦 ${product.kitItems.length} itens</span>` : ''}
                    </div>
                </div>
                <div class="prod-list-price">R$ ${formatPrice(product.price)}</div>
                <span class="product-status ${product.active ? 'active' : 'inactive'}">${product.active ? 'Ativo' : 'Inativo'}</span>
                <div class="prod-list-actions">
                    <button class="btn-edit" onclick="editProduct('${product.id}')">✏️ Editar</button>
                    <button class="btn-delete" onclick="confirmDelete('product','${product.id}','${product.name.replaceAll("'","\\'")}')" >🗑️ Excluir</button>
                </div>
            </div>`;
        }).join('')}</div>`;

    productsGrid.innerHTML = toolbarHTML + listHTML;

    productsGrid.querySelectorAll('.prod-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            productsFilter = btn.dataset.cat;
            renderProducts();
        });
    });
}

/* ─── abrir modal adicionar produto ─── */
btnAddProduct.addEventListener('click', () => {
    editingProductId = null;
    document.getElementById('modal-title').textContent = 'Adicionar Produto';
    productForm.reset();
    setProductTypeBadge('individual');
    document.getElementById('product-original-price').value = '';
    toggleKitSections(false);
    resetPanelSizes();
    resetImageInputs();
    resetVideoInputs();
    refreshCategorySelect();
    productModal.classList.add('show');
});

/* ─── editar produto ─── */
window.editProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    editingProductId = productId;
    document.getElementById('modal-title').textContent = 'Editar Produto';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-description').value = product.description;
    document.getElementById('product-download').value = product.downloadUrl;

    // Tipo e campos kit
    const pType = product.productType || 'individual';
    const isKit = pType === 'kit';
    setProductTypeBadge(pType);
    document.getElementById('product-original-price').value = product.originalPrice || '';

    // kit items → extract productIds from new format ({ id, name, price }) or legacy
    const kitItemIds = Array.isArray(product.kitItems)
        ? product.kitItems.filter(item => item.id).map(item => item.id)
        : [];
    toggleKitSections(isKit, kitItemIds);

    // Panel sizes
    resetPanelSizes();
    if (Array.isArray(product.panelSizes)) {
        product.panelSizes.forEach(ps => addPanelSizeRow(ps));
    }

    refreshCategorySelect(product.category);

    // imagens
    const images = Array.isArray(product.images) ? product.images : [product.image].filter(Boolean);
    imagesContainer.innerHTML = '';
    images.forEach((url, i) => addImageInput(url, i === 0 && images.length === 1));

    // vídeos
    const videos = Array.isArray(product.videos) ? product.videos : [];
    videosContainer.innerHTML = '';
    if (videos.length > 0) {
        videos.forEach((url, i) => addVideoInput(url, i === 0 && videos.length === 1));
    } else {
        addVideoInput('', true);
    }

    productModal.classList.add('show');
};

/* ─── fechar modal produto ─── */
function closeProductModal() {
    productModal.classList.remove('show');
    productForm.reset();
    editingProductId = null;
}
document.getElementById('modal-close').addEventListener('click', closeProductModal);
document.getElementById('btn-cancel').addEventListener('click', closeProductModal);
// Backdrop click desativado — fechar apenas pelo ×

/* ─── salvar produto ─── */
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(productForm);
    const images = Array.from(imagesContainer.querySelectorAll('.product-image-url')).map(i => i.value.trim()).filter(Boolean);
    const videos = Array.from(videosContainer.querySelectorAll('.product-video-url')).map(i => i.value.trim()).filter(Boolean);
    const pType  = formData.get('productType') || 'individual';
    const origPriceRaw = formData.get('originalPrice');

    const productData = {
        name:          formData.get('name'),
        description:   formData.get('description'),
        price:         Number.parseFloat(formData.get('price')),
        images,
        image:         images[0] || '',
        videos,
        downloadUrl:   formData.get('downloadUrl'),
        category:      formData.get('category'),
        productType:   pType,
        originalPrice: origPriceRaw ? Number.parseFloat(origPriceRaw) : null,
        kitItems:      pType === 'kit' ? collectKitProducts() : [],
        panelSizes:    collectPanelSizes(),
        updatedAt:     new Date().toISOString()
    };

    try {
        if (editingProductId) {
            await updateDoc(doc(db, 'products', editingProductId), productData);
            showToast('Produto atualizado!', 'success');
        } else {
            productData.active    = true;
            productData.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'products'), productData);
            showToast('Produto adicionado!', 'success');
        }
        closeProductModal();
        loadProducts();
    } catch (e) {
        showToast('Erro ao salvar: ' + e.message, 'error');
    }
});

/* ─── imagens helpers ─── */
document.getElementById('btn-add-image').addEventListener('click', () => addImageInput());
document.getElementById('btn-add-video').addEventListener('click', () => addVideoInput());
document.getElementById('btn-add-panel-size')?.addEventListener('click', () => addPanelSizeRow());
document.getElementById('kit-cat-filter')?.addEventListener('change', () => renderKitPickerItems());
document.getElementById('kit-search')?.addEventListener('input', () => renderKitPickerItems());

function addImageInput(value = '', hideRemove = false) {
    const g = document.createElement('div');
    g.className = 'image-input-group';
    g.innerHTML = `
        <input type="url" class="product-image-url" placeholder="https://... (Imagem ${imagesContainer.children.length + 1})" value="${value}" ${imagesContainer.children.length === 0 ? 'required' : ''}>
        <button type="button" class="btn-remove-image" style="display:${hideRemove ? 'none' : 'inline-block'};">❌</button>`;
    imagesContainer.appendChild(g);
    g.querySelector('.btn-remove-image').addEventListener('click', () => { g.remove(); updateImagePlaceholders(); });
}
function addVideoInput(value = '', hideRemove = false) {
    const g = document.createElement('div');
    g.className = 'video-input-group';
    g.innerHTML = `
        <input type="url" class="product-video-url" placeholder="https://youtube.com/... (Vídeo ${videosContainer.children.length + 1})" value="${value}">
        <button type="button" class="btn-remove-video" style="display:${hideRemove ? 'none' : 'inline-block'};">❌</button>`;
    videosContainer.appendChild(g);
    g.querySelector('.btn-remove-video').addEventListener('click', () => { g.remove(); updateVideoPlaceholders(); });
}
function resetImageInputs() {
    imagesContainer.innerHTML = '';
    addImageInput('', true);
}
function resetVideoInputs() {
    videosContainer.innerHTML = '';
    addVideoInput('', true);
}
function updateImagePlaceholders() {
    imagesContainer.querySelectorAll('.product-image-url').forEach((inp, i) => inp.placeholder = `https://... (Imagem ${i + 1})`);
}
function updateVideoPlaceholders() {
    videosContainer.querySelectorAll('.product-video-url').forEach((inp, i) => inp.placeholder = `https://youtube.com/... (Vídeo ${i + 1})`);
}

/* ─── populate category select ─── */
function refreshCategorySelect(selectedValue = '') {
    catSelect.innerHTML = '<option value="">Selecione uma categoria...</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        if (cat.name === selectedValue) opt.selected = true;
        catSelect.appendChild(opt);
    });
}

/* ═══════════════════════════════════════
   CATEGORIAS
═══════════════════════════════════════ */
async function loadCategories() {
    console.group('[loadCategories] início');
    try {
        console.log('[loadCategories] usuário autenticado:', auth.currentUser?.email ?? 'NENHUM (não autenticado)');
        console.log('[loadCategories] uid:', auth.currentUser?.uid ?? 'null');
        categoriesList.innerHTML = '<div class="loading-state"><p>Carregando categorias...</p></div>';
        let snap;
        try {
            console.log('[loadCategories] tentando query com orderBy...');
            const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
            snap = await getDocs(q);
            console.log('[loadCategories] query com orderBy OK — docs:', snap.size);
        } catch (innerErr) {
            console.warn('[loadCategories] query com orderBy falhou:', innerErr.code, innerErr.message);
            console.log('[loadCategories] tentando fallback sem orderBy...');
            snap = await getDocs(collection(db, 'categories'));
            console.log('[loadCategories] fallback OK — docs:', snap.size);
        }
        categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        console.log('[loadCategories] categorias carregadas:', categories.map(c => c.name));
        renderCategories();
    } catch (e) {
        console.error('[loadCategories] ERRO TOTAL:', e.code, e.message, e);
        categoriesList.innerHTML = `<div class="empty-state"><h3>Erro ao carregar categorias</h3><p>${e.message}</p></div>`;
        showToast('Erro ao carregar categorias: ' + e.message, 'error');
    }
    console.groupEnd();
}

function renderCategories() {
    if (categories.length === 0) {
        categoriesList.innerHTML = `
            <div class="empty-state">
                <h3>Nenhuma categoria cadastrada</h3>
                <p>Clique em "Adicionar Categoria" para criar a primeira.</p>
            </div>`;
        return;
    }
    categoriesList.innerHTML = `
    <div class="dash-card" style="margin-top:0;">
        <div style="overflow-x:auto;">
        <table class="orders-table" style="width:100%;">
            <thead><tr>
                <th style="width:80px;">Ordem</th>
                <th>Categoria</th>
                <th>Cor</th>
                <th>Destaque</th>
                <th>Badge</th>
                <th>A&ccedil;&otilde;es</th>
            </tr></thead>
            <tbody>
            ${categories.map((cat, idx) => `<tr>
                <td>
                    <div style="display:flex;gap:4px;align-items:center;">
                        <button class="pc-action-btn" style="padding:2px 8px;font-size:14px;line-height:1;" title="Mover para cima" ${idx === 0 ? 'disabled' : ''} onclick="window.moveCategoryUp('${cat.id}')">&#8593;</button>
                        <button class="pc-action-btn" style="padding:2px 8px;font-size:14px;line-height:1;" title="Mover para baixo" ${idx === categories.length - 1 ? 'disabled' : ''} onclick="window.moveCategoryDown('${cat.id}')">&#8595;</button>
                    </div>
                </td>
                <td style="font-weight:600;">${cat.name}</td>
                <td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${cat.color || '#9B5DE5'};border:2px solid #e0e4ea;"></span></td>
                <td>${cat.featured ? 'Sim' : '—'}</td>
                <td>${cat.badgeLabel || '—'}</td>
                <td class="pc-actions-cell">
                    <button class="pc-action-btn" onclick="editCategory('${cat.id}')">Editar</button>
                    <button class="pc-action-btn pc-btn-del" onclick="confirmDelete('category','${cat.id}','${cat.name.replaceAll("'","\\'")}')">Excluir</button>
                </td>
            </tr>`).join('')}
            </tbody>
        </table>
        </div>
    </div>`;
}

window.moveCategoryUp = function(catId) {
    const idx = categories.findIndex(c => c.id === catId);
    if (idx <= 0) return;
    swapCategoryOrder(idx, idx - 1);
};

window.moveCategoryDown = function(catId) {
    const idx = categories.findIndex(c => c.id === catId);
    if (idx < 0 || idx >= categories.length - 1) return;
    swapCategoryOrder(idx, idx + 1);
};

async function swapCategoryOrder(idxA, idxB) {
    [categories[idxA], categories[idxB]] = [categories[idxB], categories[idxA]];
    categories[idxA].order = idxA;
    categories[idxB].order = idxB;
    renderCategories();
    try {
        await Promise.all([
            updateDoc(doc(db, 'categories', categories[idxA].id), { order: idxA }),
            updateDoc(doc(db, 'categories', categories[idxB].id), { order: idxB }),
        ]);
    } catch (e) {
        showToast('Erro ao reordenar: ' + e.message, 'error');
    }
}

/* ─── abrir modal adicionar categoria ─── */
btnAddCategory.addEventListener('click', () => {
    editingCategoryId = null;
    document.getElementById('cat-modal-title').textContent = 'Adicionar Categoria';
    categoryForm.reset();
    document.getElementById('cat-color').value = '#9B5DE5';
    document.getElementById('cat-order').value = categories.length;
    categoryModal.classList.add('show');
});

/* ─── editar categoria ─── */
window.editCategory = function(catId) {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    editingCategoryId = catId;
    document.getElementById('cat-modal-title').textContent = 'Editar Categoria';
    document.getElementById('cat-id').value = cat.id;
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-color').value = cat.color || '#9B5DE5';
    document.getElementById('cat-order').value = cat.order ?? 0;
    document.getElementById('cat-badge-label').value = cat.badgeLabel || '';
    document.getElementById('cat-featured').checked = !!cat.featured;
    categoryModal.classList.add('show');
};

/* ─── fechar modal categoria ─── */
function closeCategoryModal() { categoryModal.classList.remove('show'); categoryForm.reset(); editingCategoryId = null; }
document.getElementById('cat-modal-close').addEventListener('click', closeCategoryModal);
document.getElementById('btn-cancel-cat').addEventListener('click', closeCategoryModal);
// Backdrop click desativado — fechar apenas pelo ×

/* ─── salvar categoria ─── */
categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const catData = {
        name:       document.getElementById('cat-name').value.trim(),
        color:      document.getElementById('cat-color').value,
        order:      parseInt(document.getElementById('cat-order').value) || 0,
        badgeLabel: document.getElementById('cat-badge-label').value.trim(),
        featured:   document.getElementById('cat-featured').checked,
        slug:       document.getElementById('cat-name').value.trim().toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g,''),
        updatedAt:  new Date().toISOString()
    };
    try {
        if (editingCategoryId) {
            await updateDoc(doc(db, 'categories', editingCategoryId), catData);
            showToast('Categoria atualizada!', 'success');
        } else {
            catData.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'categories'), catData);
            showToast('Categoria criada!', 'success');
        }
        closeCategoryModal();
        loadCategories();
    } catch (e) {
        showToast('Erro ao salvar categoria: ' + e.message, 'error');
    }
});

/* ═══════════════════════════════════════
   DELETE GENÉRICO
═══════════════════════════════════════ */
window.confirmDelete = function(type, id, name) {
    deleteTarget = { type, id, name };
    document.getElementById('delete-item-name').textContent = name;
    deleteModal.classList.add('show');
};

function closeDeleteModal() { deleteModal.classList.remove('show'); deleteTarget = null; }
document.getElementById('delete-modal-close').addEventListener('click', closeDeleteModal);
document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });

document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (!deleteTarget) return;
    try {
        if (deleteTarget.type === 'product') {
            await deleteDoc(doc(db, 'products', deleteTarget.id));
            showToast('Produto excluído!', 'success');
            closeDeleteModal();
            loadProducts();
        } else {
            await deleteDoc(doc(db, 'categories', deleteTarget.id));
            showToast('Categoria excluída!', 'success');
            closeDeleteModal();
            loadCategories();
        }
    } catch (e) {
        showToast('Erro ao excluir: ' + e.message, 'error');
    }
});

/* ═══════════════════════════════════════
   USUÁRIOS
═══════════════════════════════════════ */
let allUsers = [];
let usersLoaded = false;

async function loadUsers() {
    if (usersLoaded && allUsers.length > 0) return;
    const container = document.getElementById('users-table-container');
    const countEl   = document.getElementById('users-count');
    container.innerHTML = '<div class="loading-state"><p>Carregando usuários…</p></div>';
    try {
        // Load users and orders in parallel to cross-reference real purchase data
        const [usersSnap, ordersSnap] = await Promise.all([
            getDocs(collection(db, 'users')),
            getDocs(collection(db, 'orders')).catch(() => null),
        ]);

        allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allUsers.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

        // Build email → purchase stats from approved orders
        const emailStats = {};
        if (ordersSnap) {
            ordersSnap.docs.forEach(d => {
                const o = d.data();
                if (o.paymentStatus !== 'approved') return;
                const email = (o.customer?.email || o.customerEmail || '').toLowerCase();
                if (!email) return;
                if (!emailStats[email]) emailStats[email] = { qty: 0, total: 0, lastDate: null };
                emailStats[email].qty++;
                emailStats[email].total += o.totalAmount || 0;
                const dt = new Date(o.completedAt || o.createdAt || 0);
                if (!emailStats[email].lastDate || dt > emailStats[email].lastDate) {
                    emailStats[email].lastDate = dt;
                }
            });
        }

        // Attach stats to users
        allUsers = allUsers.map(u => {
            const stats = emailStats[(u.email || '').toLowerCase()] || { qty: 0, total: 0, lastDate: null };
            return { ...u, _purchases: stats.qty, _totalSpent: stats.total, _lastPurchase: stats.lastDate };
        });

        usersLoaded = true;
        // Exclui contas admin da lista de clientes
        const customers = allUsers.filter(u => u.role !== 'admin' && u.email !== 'admin@ateliedaescola.com');
        renderUsers(customers);
        countEl.textContent = `${customers.length} usuário${customers.length !== 1 ? 's' : ''}`;
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><h3>Erro ao carregar usuários</h3><p>${err.message}</p></div>`;
    }
}

function renderUsers(users) {
    const container = document.getElementById('users-table-container');
    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Nenhum usuário cadastrado ainda</h3></div>';
        return;
    }
    container.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="users-table">
        <thead>
            <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Provedor</th>
                <th>Compras</th>
                <th>Total Gasto</th>
                <th>Última Compra</th>
                <th>Cadastro</th>
            </tr>
        </thead>
        <tbody>
            ${users.map(u => {
                const initials = (u.name || u.email || '?').charAt(0).toUpperCase();
                const avatar = u.photoURL
                    ? `<img class="user-avatar" src="${u.photoURL}" alt="" onerror="this.style.display='none'">`
                    : `<span class="user-avatar-placeholder">${initials}</span>`;
                const provider = u.provider === 'google'
                    ? '<span class="provider-badge google"><i class="bi bi-google"></i> Google</span>'
                    : '<span class="provider-badge email"><i class="bi bi-envelope-fill"></i> E-mail</span>';
                const date = u.createdAt
                    ? (u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt))
                        .toLocaleDateString('pt-BR')
                    : '—';
                const lastPurchase = u._lastPurchase
                    ? u._lastPurchase.toLocaleDateString('pt-BR')
                    : '—';
                return `<tr>
                    <td><div class="user-name-cell">${avatar}<span>${u.name || '—'}</span></div></td>
                    <td style="font-size:13px;">${u.email}</td>
                    <td>${provider}</td>
                    <td><span class="purchases-badge${u._purchases > 0 ? ' has-purchases' : ''}">${u._purchases}</span></td>
                    <td style="font-weight:${u._totalSpent > 0 ? '700' : '400'};color:${u._totalSpent > 0 ? '#1B263B' : '#aab0ba'};white-space:nowrap;">
                        ${u._totalSpent > 0 ? `R$&nbsp;${fmtMoney(u._totalSpent)}` : '—'}
                    </td>
                    <td style="font-size:12px;color:#778DA9;">${lastPurchase}</td>
                    <td style="font-size:13px;">${date}</td>
                </tr>`;
            }).join('')}
        </tbody>
    </table>
    </div>`;
}

/* ── Busca de usuários ── */
document.getElementById('user-search')?.addEventListener('input', function() {
    const q = this.value.toLowerCase().trim();
    const countEl = document.getElementById('users-count');
    const customers = allUsers.filter(u => u.role !== 'admin' && u.email !== 'admin@ateliedaescola.com');
    const filtered = q
        ? customers.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q))
        : customers;
    renderUsers(filtered);
    countEl.textContent = `${filtered.length} usuário${filtered.length !== 1 ? 's' : ''}${q ? ' (filtrado)' : ''}`;
});

/* ═══════════════════════════════════════
   PEDIDOS
═══════════════════════════════════════ */
let allOrdersFull = [];

const ORDER_STATUS = {
    approved:  { label: 'Aprovado',  cls: 'st-approved' },
    pending:   { label: 'Pendente',  cls: 'st-pending'  },
    rejected:  { label: 'Recusado',  cls: 'st-rejected' },
    cancelled: { label: 'Cancelado', cls: 'st-rejected' },
    failed:    { label: 'Falhou',    cls: 'st-rejected' },
};

async function loadOrders() {
    if (ordersLoaded) return;
    const container = document.getElementById('orders-full-table-container');
    const countEl   = document.getElementById('orders-count');
    container.innerHTML = '<div class="loading-state"><p>Carregando pedidos…</p></div>';
    try {
        const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
        allOrdersFull = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        ordersLoaded = true;
        renderOrdersTable(allOrdersFull);
        countEl.textContent = `${allOrdersFull.length} pedido${allOrdersFull.length !== 1 ? 's' : ''}`;
    } catch (err) {
        try {
            const snap2 = await getDocs(collection(db, 'orders'));
            allOrdersFull = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
            allOrdersFull.sort((a, b) => {
                const da = a.createdAt ? new Date(a.createdAt) : 0;
                const db_ = b.createdAt ? new Date(b.createdAt) : 0;
                return db_ - da;
            });
            ordersLoaded = true;
            renderOrdersTable(allOrdersFull);
            countEl.textContent = `${allOrdersFull.length} pedido${allOrdersFull.length !== 1 ? 's' : ''}`;
        } catch (err2) {
            container.innerHTML = `<div class="empty-state"><h3>Erro ao carregar pedidos</h3><p>${err2.message}</p></div>`;
        }
    }
}

function renderOrdersTable(orders) {
    const container = document.getElementById('orders-full-table-container');
    if (!orders.length) {
        container.innerHTML = '<div class="empty-state"><h3>Nenhum pedido encontrado</h3></div>';
        return;
    }
    container.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="orders-table" style="width:100%;">
        <thead>
            <tr>
                <th>E-mail</th>
                <th style="text-align:center;">Itens</th>
                <th>Total</th>
                <th>Status</th>
                <th>Data</th>
                <th>Ações</th>
            </tr>
        </thead>
        <tbody>
            ${orders.map(o => {
                const st    = ORDER_STATUS[o.paymentStatus] || { label: o.paymentStatus || '—', cls: 'st-pending' };
                const email = o.customer?.email || o.customerEmail || '—';
                const itemCount = Array.isArray(o.items) ? o.items.reduce((s, it) => s + (it.quantity || 1), 0) : 0;
                const date  = o.createdAt
                    ? new Date(o.createdAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' })
                    : '—';
                return `<tr>
                    <td class="order-email-cell">${email}</td>
                    <td style="text-align:center;font-size:13px;color:#415A77;font-weight:600;">${itemCount || '—'}</td>
                    <td style="font-weight:700;color:#1B263B;white-space:nowrap;">R$&nbsp;${fmtMoney(o.totalAmount)}</td>
                    <td><span class="order-status ${st.cls}">${st.label}</span></td>
                    <td style="white-space:nowrap;font-size:12px;color:#778DA9;">${date}</td>
                    <td><button class="pc-action-btn" onclick="window.showOrderDetail('${o.id}')"><i class="bi bi-eye"></i> Detalhar</button></td>
                </tr>`;
            }).join('')}
        </tbody>
    </table>
    </div>`;
}

/* ── Detalhar pedido ── */
const orderDetailModal = document.getElementById('order-detail-modal');
document.getElementById('order-detail-close')?.addEventListener('click', () => orderDetailModal?.classList.remove('show'));
orderDetailModal?.addEventListener('click', e => { if (e.target === orderDetailModal) orderDetailModal.classList.remove('show'); });

window.showOrderDetail = function(id) {
    const o = allOrdersFull.find(x => x.id === id);
    if (!o) return;
    const st    = ORDER_STATUS[o.paymentStatus] || { label: o.paymentStatus || '\u2014', cls: 'st-pending' };
    const name  = o.customer?.name  || o.customerName  || '\u2014';
    const email = o.customer?.email || o.customerEmail || '\u2014';
    const cpf   = o.customer?.cpf   || o.customerCpf   || null;
    const phone = o.customer?.phone || o.customerPhone || null;
    const date  = o.createdAt ? new Date(o.createdAt).toLocaleString('pt-BR') : '\u2014';
    const items = Array.isArray(o.items) ? o.items : [];
    const fullId = o.id.toUpperCase();

    document.getElementById('order-detail-body').innerHTML = `
    <div class="od-grid">
        <div class="od-section">
            <h4>Informa\u00e7\u00f5es do Pedido</h4>
            <div class="od-field"><span>ID</span><code class="order-id">#${fullId}</code></div>
            <div class="od-field"><span>Status</span><span class="order-status ${st.cls}">${st.label}</span></div>
            <div class="od-field"><span>Data</span><span>${date}</span></div>
            <div class="od-field"><span>Total</span><strong>R$\u00a0${fmtMoney(o.totalAmount)}</strong></div>
            ${o.paymentMethod ? `<div class="od-field"><span>Pagamento</span><span>${o.paymentMethod}</span></div>` : ''}
            ${o.mercadopagoId ? `<div class="od-field"><span>MP ID</span><span style="font-size:11px;">${o.mercadopagoId}</span></div>` : ''}
        </div>
        <div class="od-section">
            <h4>Cliente</h4>
            <div class="od-field"><span>Nome</span><span>${name}</span></div>
            <div class="od-field"><span>E-mail</span><span>${email}</span></div>
            ${cpf   ? `<div class="od-field"><span>CPF</span><span>${cpf}</span></div>`   : ''}
            ${phone ? `<div class="od-field"><span>Telefone</span><span>${phone}</span></div>` : ''}
        </div>
    </div>
    <div class="od-section" style="margin-top:18px;">
        <h4>Produtos Comprados</h4>
        ${items.length ? `
        <table class="orders-table" style="width:100%;margin-top:8px;">
            <thead><tr><th>Produto</th><th>Qtd</th><th>Pre\u00e7o unit.</th><th>Subtotal</th></tr></thead>
            <tbody>
                ${items.map(it => `<tr>
                    <td style="font-weight:600;">${it.title || it.name || it.id || '\u2014'}</td>
                    <td>${it.quantity || 1}</td>
                    <td>R$\u00a0${fmtMoney(it.price || 0)}</td>
                    <td style="font-weight:700;">R$\u00a0${fmtMoney((it.price || 0) * (it.quantity || 1))}</td>
                </tr>`).join('')}
            </tbody>
        </table>` : '<p style="color:#aab0ba;font-size:13px;margin-top:8px;">Sem itens registrados</p>'}
    </div>`;
    orderDetailModal.classList.add('show');
};

/* ── Filtros de pedidos ── */
function applyOrderFilters() {
    const st      = (document.getElementById('orders-filter-status')?.value || '');
    const countEl = document.getElementById('orders-count');
    const filtered = st ? allOrdersFull.filter(o => o.paymentStatus === st) : allOrdersFull;
    renderOrdersTable(filtered);
    countEl.textContent = `${filtered.length} pedido${filtered.length !== 1 ? 's' : ''}${st ? ' (filtrado)' : ''}`;
}
document.getElementById('orders-filter-status')?.addEventListener('change', applyOrderFilters);

/* ═══════════════════════════════════════
   FATURAMENTO
═══════════════════════════════════════ */
let fatPeriod  = 'month';
let fatOrders  = [];
let fatLoaded  = false;

async function loadFaturamento() {
    const panel = document.getElementById('tab-faturamento');
    if (!panel) return;
    panel.innerHTML = `<div class="loading-state"><p>Carregando faturamento…</p></div>`;
    try {
        const snap = await getDocs(collection(db, 'orders'));
        fatOrders  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(o => o.paymentStatus === 'approved');
        fatLoaded  = true;
        renderFaturamento(fatPeriod);
    } catch (err) {
        panel.innerHTML = `<div class="empty-state"><h3>Erro ao carregar</h3><p>${err.message}</p></div>`;
    }
}

function renderFaturamento(period) {
    fatPeriod = period;
    const panel = document.getElementById('tab-faturamento');
    if (!panel) return;

    const now = new Date();
    let orders  = fatOrders;
    let buckets = {};
    let bucketLabel = '';

    if (period === 'week') {
        const cutoff = new Date(now);
        cutoff.setDate(now.getDate() - 6);
        cutoff.setHours(0, 0, 0, 0);
        orders = fatOrders.filter(o => new Date(o.completedAt || o.createdAt) >= cutoff);
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            buckets[d.toISOString().slice(0, 10)] = { gross: 0, fee: 0, qty: 0 };
        }
        orders.forEach(o => {
            const k = new Date(o.completedAt || o.createdAt).toISOString().slice(0, 10);
            if (buckets[k]) {
                const { gross, fee } = calcOrderFee(o);
                buckets[k].gross += gross;
                buckets[k].fee   += fee;
                buckets[k].qty++;
            }
        });
        bucketLabel = 'últimos 7 dias';

    } else if (period === 'month') {
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
        orders = fatOrders.filter(o => new Date(o.completedAt || o.createdAt) >= mStart);
        const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= days; i++) {
            buckets[String(i).padStart(2, '0')] = { gross: 0, fee: 0, qty: 0 };
        }
        orders.forEach(o => {
            const d = new Date(o.completedAt || o.createdAt);
            if (d >= mStart) {
                const k = String(d.getDate()).padStart(2, '0');
                if (buckets[k]) {
                    const { gross, fee } = calcOrderFee(o);
                    buckets[k].gross += gross;
                    buckets[k].fee   += fee;
                    buckets[k].qty++;
                }
            }
        });
        bucketLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    } else {
        // year — by month
        const yStart = new Date(now.getFullYear(), 0, 1);
        orders = fatOrders.filter(o => new Date(o.completedAt || o.createdAt) >= yStart);
        const mNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        mNames.forEach((m, i) => {
            buckets[String(i).padStart(2, '0')] = { gross: 0, fee: 0, qty: 0, label: m };
        });
        orders.forEach(o => {
            const d = new Date(o.completedAt || o.createdAt);
            if (d >= yStart) {
                const k = String(d.getMonth()).padStart(2, '0');
                const { gross, fee } = calcOrderFee(o);
                buckets[k].gross += gross;
                buckets[k].fee   += fee;
                buckets[k].qty++;
            }
        });
        bucketLabel = String(now.getFullYear());
    }

    const totalGross = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const totalFee   = orders.reduce((s, o) => s + calcOrderFee(o).fee, 0);
    const totalNet   = totalGross - totalFee;
    const totalQty   = orders.length;

    // Payment method breakdown
    const pmBreakdown = {};
    orders.forEach(o => {
        const pmKey   = (o.mercadoPagoData?.paymentInfo?.paymentMethod || 'desconhecido').toLowerCase();
        const feeInfo = MP_FEES[pmKey];
        const label   = feeInfo ? feeInfo.label : pmKey;
        if (!pmBreakdown[label]) pmBreakdown[label] = { gross: 0, fee: 0, qty: 0 };
        const { gross, fee } = calcOrderFee(o);
        pmBreakdown[label].gross += gross;
        pmBreakdown[label].fee   += fee;
        pmBreakdown[label].qty++;
    });

    const bKeys   = Object.keys(buckets);
    const bGross  = bKeys.map(k => buckets[k].gross);
    const bNet    = bKeys.map(k => buckets[k].gross - buckets[k].fee);
    const bLabels = period === 'year' ? bKeys.map(k => buckets[k].label) : bKeys;

    panel.innerHTML = `
    <div class="fat-period-bar">
        <button class="fat-period-btn${period === 'week'  ? ' active' : ''}" data-period="week">Semana</button>
        <button class="fat-period-btn${period === 'month' ? ' active' : ''}" data-period="month">M&ecirc;s</button>
        <button class="fat-period-btn${period === 'year'  ? ' active' : ''}" data-period="year">Ano</button>
        <span style="margin-left:auto;font-size:12px;color:#778DA9;">${bucketLabel}</span>
    </div>

    <div class="kpi-grid kpi-grid-4" style="margin-bottom:20px;">
        <div class="kpi-card kpi-green">
            <div class="kpi-header"><span class="kpi-label">Bruto</span><span class="kpi-icon"><i class="bi bi-cash-stack"></i></span></div>
            <div class="kpi-value">R$&nbsp;${fmtMoney(totalGross)}</div>
            <div class="kpi-sub">${totalQty} venda${totalQty !== 1 ? 's' : ''}</div>
        </div>
        <div class="kpi-card kpi-blue">
            <div class="kpi-header"><span class="kpi-label">Taxas MP</span><span class="kpi-icon"><i class="bi bi-dash-circle"></i></span></div>
            <div class="kpi-value" style="color:#c0392b;">&#8722;&nbsp;R$&nbsp;${fmtMoney(totalFee)}</div>
            <div class="kpi-sub">${totalGross > 0 ? Math.round(totalFee / totalGross * 100) : 0}% do bruto</div>
        </div>
        <div class="kpi-card kpi-purple">
            <div class="kpi-header"><span class="kpi-label">L&iacute;quido</span><span class="kpi-icon"><i class="bi bi-wallet2"></i></span></div>
            <div class="kpi-value">R$&nbsp;${fmtMoney(totalNet)}</div>
            <div class="kpi-sub">ap&oacute;s taxas</div>
        </div>
        <div class="kpi-card kpi-yellow">
            <div class="kpi-header"><span class="kpi-label">Ticket M&eacute;dio Liq.</span><span class="kpi-icon"><i class="bi bi-receipt"></i></span></div>
            <div class="kpi-value">R$&nbsp;${fmtMoney(totalQty > 0 ? totalNet / totalQty : 0)}</div>
            <div class="kpi-sub">l&iacute;quido por venda</div>
        </div>
    </div>

    <div class="dash-row dash-charts-row">
        <div class="dash-card dash-chart-main">
            <div class="dash-card-header">
                <h3><i class="bi bi-bar-chart-fill" style="color:#415A77;margin-right:6px;"></i> Receita por per&iacute;odo &mdash; ${bucketLabel}</h3>
            </div>
            <canvas id="fat-chart" style="max-height:220px;"></canvas>
        </div>
        <div class="dash-card" style="flex:1;min-width:220px;">
            <div class="dash-card-header">
                <h3><i class="bi bi-credit-card" style="color:#2980b9;margin-right:6px;"></i> Por Meio de Pagamento</h3>
            </div>
            <div id="fat-pm-list"></div>
        </div>
    </div>

    <div class="dash-card" style="margin-top:0;">
        <div class="dash-card-header">
            <h3><i class="bi bi-table" style="color:#27ae60;margin-right:6px;"></i> Detalhe por Per&iacute;odo</h3>
        </div>
        <div style="overflow-x:auto;">
            <table class="orders-table" style="width:100%;">
                <thead><tr>
                    <th>Per&iacute;odo</th><th>Vendas</th><th>Bruto</th><th>Taxas Est.</th><th>L&iacute;quido</th>
                </tr></thead>
                <tbody>
                ${bKeys.map((k, i) => {
                    const b    = buckets[k];
                    const bfee = b.gross - bNet[i];
                    return b.qty > 0
                        ? `<tr>
                            <td style="font-weight:600;">${bLabels[i]}</td>
                            <td>${b.qty}</td>
                            <td>R$&nbsp;${fmtMoney(b.gross)}</td>
                            <td style="color:#c0392b;">&#8722;&nbsp;R$&nbsp;${fmtMoney(bfee)}</td>
                            <td style="font-weight:700;color:#1B263B;">R$&nbsp;${fmtMoney(bNet[i])}</td>
                           </tr>`
                        : '';
                }).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <p class="fat-fee-note"><i class="bi bi-info-circle"></i> Taxas estimadas com base nas tarifas padr&atilde;o do MercadoPago. Consulte o painel MP para o valor exato.</p>`;

    // Period button handlers
    panel.querySelectorAll('.fat-period-btn').forEach(btn => {
        btn.addEventListener('click', () => renderFaturamento(btn.dataset.period));
    });

    // Chart
    const ctx = document.getElementById('fat-chart');
    if (ctx && typeof Chart !== 'undefined') {
        if (window._fatChart) { window._fatChart.destroy(); window._fatChart = null; }
        window._fatChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bLabels,
                datasets: [
                    { label: 'Bruto',    data: bGross, backgroundColor: 'rgba(65,90,119,.7)',  borderRadius: 4, borderSkipped: false },
                    { label: 'Líquido',  data: bNet,   backgroundColor: 'rgba(39,174,96,.8)',  borderRadius: 4, borderSkipped: false },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
                    tooltip: { callbacks: { label: c => `${c.dataset.label}: R$ ${fmtMoney(c.parsed.y)}` } },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } },
                    y: { beginAtZero: true, grid: { color: '#f0f2f5' },
                         ticks: { font: { size: 11 }, callback: v => 'R$\u00a0' + fmtMoney(v) } },
                },
            },
        });
    }

    // PM breakdown list
    const pmEl   = document.getElementById('fat-pm-list');
    if (pmEl) {
        const pmEntries = Object.entries(pmBreakdown).sort((a, b) => b[1].gross - a[1].gross);
        if (!pmEntries.length) {
            pmEl.innerHTML = '<div class="dash-empty" style="padding:20px;"><p>Sem dados</p></div>';
        } else {
            pmEl.innerHTML = pmEntries.map(([label, d]) => `
            <div class="prod-rank-item">
                <div class="prod-rank-info">
                    <div class="prod-rank-name">${label}</div>
                    <div class="prod-rank-meta">${d.qty} venda${d.qty !== 1 ? 's' : ''} &middot; bruto R$&nbsp;${fmtMoney(d.gross)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:700;font-size:13px;color:#1B263B;">R$&nbsp;${fmtMoney(d.gross - d.fee)}</div>
                    <div style="font-size:11px;color:#c0392b;">&#8722;&nbsp;R$&nbsp;${fmtMoney(d.fee)}</div>
                </div>
            </div>`).join('');
        }
    }
}

/* ═══════════════════════════════════════
   COMPARATIVO DE PERÍODOS
═══════════════════════════════════════ */
function loadComparativo() {
    const panel = document.getElementById('tab-comparativo');
    if (!panel) return;

    const opts = [];
    const now  = new Date();
    for (let i = 0; i < 24; i++) {
        const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = d.toISOString().slice(0, 7);
        const lbl = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        opts.push({ val, lbl });
    }
    window._cmpOpts       = opts;
    window._cmpMonthCount = 2;

    const catOpts = [...new Set(products.map(p => p.category).filter(Boolean))].sort()
        .map(c => `<option value="${c}">${c}</option>`).join('');

    panel.innerHTML = `
    <div class="dash-card" style="margin-top:0;">
        <div class="dash-card-header">
            <h3><i class="bi bi-bar-chart-steps" style="color:#415A77;margin-right:6px;"></i> Comparativo de Per\u00edodos</h3>
        </div>
        <div class="cmp-filters">
            <div class="cmp-months-wrap" id="cmp-months">
                ${[0, 1].map(i => cmpMonthHTML(opts, i)).join('')}
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px;">
                <button class="pc-action-btn pc-btn-add" id="cmp-add-btn" onclick="window.cmpAddMonth()">
                    <i class="bi bi-plus-lg"></i> Adicionar m\u00eas
                </button>
                <select id="cmp-cat" class="orders-filter-select" style="min-width:180px;">
                    <option value="">Todas as categorias</option>
                    ${catOpts}
                </select>
                <button class="btn-primary" style="font-size:13px;padding:7px 20px;" onclick="window.cmpCompare()">
                    <i class="bi bi-play-fill"></i> Comparar
                </button>
            </div>
        </div>
        <div id="cmp-results"></div>
    </div>`;
}

function cmpMonthHTML(opts, idx) {
    const sel = opts.map((o, i) => `<option value="${o.val}" ${i === idx ? 'selected' : ''}>${o.lbl}</option>`).join('');
    return `<div class="cmp-month-item" id="cmp-m-${idx}">
        <label class="cmp-month-label">M\u00eas ${idx + 1}</label>
        <select class="cmp-month-sel orders-filter-select" data-idx="${idx}">${sel}</select>
        ${idx >= 2 ? `<button class="pc-action-btn pc-btn-del" style="padding:4px 9px;" onclick="window.cmpRemoveMonth(${idx})"><i class="bi bi-x"></i></button>` : ''}
    </div>`;
}

window.cmpAddMonth = function() {
    if (window._cmpMonthCount >= 4) { showToast('M\u00e1ximo de 4 meses', 'info'); return; }
    const idx  = window._cmpMonthCount;
    window._cmpMonthCount++;
    const wrap = document.getElementById('cmp-months');
    const tmp  = document.createElement('div');
    tmp.innerHTML = cmpMonthHTML(window._cmpOpts, idx);
    wrap.appendChild(tmp.firstElementChild);
    if (window._cmpMonthCount >= 4)
        document.getElementById('cmp-add-btn').disabled = true;
};

window.cmpRemoveMonth = function(idx) {
    document.getElementById(`cmp-m-${idx}`)?.remove();
    window._cmpMonthCount--;
    const btn = document.getElementById('cmp-add-btn');
    if (btn) btn.disabled = false;
};

window.cmpCompare = async function() {
    const months = [...document.querySelectorAll('.cmp-month-sel')].map(s => s.value).filter(Boolean);
    if (months.length < 2) { showToast('Selecione ao menos 2 meses', 'info'); return; }
    const cat     = document.getElementById('cmp-cat')?.value || '';
    const results = document.getElementById('cmp-results');
    results.innerHTML = `<div class="loading-state"><p>Calculando\u2026</p></div>`;
    try {
        let ordersData = allOrdersFull.length ? allOrdersFull : (await getDocs(collection(db, 'orders'))).docs.map(d => ({ id: d.id, ...d.data() }));
        const approved = ordersData.filter(o => o.paymentStatus === 'approved');

        const stats = months.map(m => {
            const [y, mo] = m.split('-').map(Number);
            const start   = new Date(y, mo - 1, 1);
            const end     = new Date(y, mo, 1);
            const label   = start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

            let mo_orders = approved.filter(o => {
                const d = new Date(o.completedAt || o.createdAt || 0);
                return d >= start && d < end;
            });
            if (cat) {
                mo_orders = mo_orders.filter(o =>
                    Array.isArray(o.items) && o.items.some(it => {
                        const p = products.find(x => x.id === (it.id || it.productId));
                        return p?.category === cat || it.category === cat;
                    })
                );
            }
            const gross = mo_orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
            const qty   = mo_orders.length;
            const avg   = qty ? gross / qty : 0;

            const pqty = {};
            mo_orders.forEach(o => (o.items || []).forEach(it => {
                const id = it.id || it.productId;
                if (id) pqty[id] = (pqty[id] || 0) + (it.quantity || 1);
            }));
            const topProds = Object.entries(pqty).sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([id, n]) => ({ name: products.find(p => p.id === id)?.name || id, qty: n }));

            return { label, gross, qty, avg, topProds };
        });

        const maxGross = Math.max(...stats.map(s => s.gross));
        const maxQty   = Math.max(...stats.map(s => s.qty));

        results.innerHTML = `
        <div class="cmp-grid" style="grid-template-columns:repeat(${stats.length},1fr);">
            ${stats.map(s => `
            <div class="cmp-col">
                <div class="cmp-col-head">${s.label}</div>
                <div class="cmp-kpi${s.gross === maxGross && maxGross > 0 ? ' cmp-best' : ''}">
                    <div class="cmp-kpi-label">Receita Bruta</div>
                    <div class="cmp-kpi-val">R$\u00a0${fmtMoney(s.gross)}</div>
                </div>
                <div class="cmp-kpi${s.qty === maxQty && maxQty > 0 ? ' cmp-best' : ''}">
                    <div class="cmp-kpi-label">Vendas</div>
                    <div class="cmp-kpi-val">${s.qty}</div>
                </div>
                <div class="cmp-kpi">
                    <div class="cmp-kpi-label">Ticket M\u00e9dio</div>
                    <div class="cmp-kpi-val">R$\u00a0${fmtMoney(s.avg)}</div>
                </div>
                <div class="cmp-kpi" style="border-bottom:none;">
                    <div class="cmp-kpi-label">Top Produtos</div>
                    ${s.topProds.length
                        ? s.topProds.map((p, i) => `<div class="cmp-prod-item"><span class="cmp-prod-rank">${i + 1}\u00b0</span>${p.name}<span class="cmp-prod-qty">\u00d7${p.qty}</span></div>`).join('')
                        : '<div style="color:#aab0ba;font-size:12px;padding-top:4px;">Sem vendas</div>'}
                </div>
            </div>`).join('')}
        </div>`;
    } catch (err) {
        results.innerHTML = `<div class="empty-state"><h3>Erro ao calcular</h3><p>${err.message}</p></div>`;
    }
};

/* ═══════════════════════════════════════
   SAÍDA & DESEMPENHO DE PRODUTOS
═══════════════════════════════════════ */
let _saidaProdList = [];

async function loadProdSaida() {
    const panel = document.getElementById('tab-prod-saida');
    if (!panel) return;
    panel.innerHTML = `<div class="loading-state"><p>Carregando dados…</p></div>`;
    try {
        const [ordSnap, prodSnap, dlSnap] = await Promise.all([
            getDocs(collection(db, 'orders')),
            getDocs(collection(db, 'products')),
            getDocs(collection(db, 'downloadLogs')).catch(() => null),
        ]);

        const approvedOrd = ordSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(o => o.paymentStatus === 'approved');

        const prods = {};
        prodSnap.docs.forEach(d => {
            prods[d.id] = { id: d.id, ...d.data(), qty: 0, rev: 0, downloads: 0 };
        });

        if (dlSnap) {
            dlSnap.docs.forEach(d => {
                const pid = d.data().productId || d.data().itemId;
                if (pid && prods[pid]) prods[pid].downloads++;
            });
        }

        approvedOrd.forEach(o => {
            (o.items || []).forEach(item => {
                const id = item.id || item.productId;
                if (id && prods[id]) {
                    prods[id].qty   += item.quantity || 1;
                    prods[id].rev   += (item.price || 0) * (item.quantity || 1);
                }
            });
        });

        _saidaProdList = Object.values(prods).sort((a, b) => b.qty - a.qty);
        const cats = [...new Set(_saidaProdList.map(p => p.category).filter(Boolean))].sort();

        panel.innerHTML = `
        <div class="dash-card" style="margin-top:0;">
            <div class="dash-card-header">
                <h3><i class="bi bi-bar-chart-steps" style="color:#415A77;margin-right:6px;"></i> Desempenho por Produto</h3>
                <span id="saida-count" style="font-size:12px;color:#778DA9;">${_saidaProdList.length} produto${_saidaProdList.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="pc-toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div class="pc-cat-filter" id="saida-cat-filter">
                    <button class="pc-cat-btn active" data-saida-cat="">Todas</button>
                    ${cats.map(c => `<button class="pc-cat-btn" data-saida-cat="${c.replaceAll('"','&quot;')}">${c}</button>`).join('')}
                </div>
                <select id="saida-status-filter" class="form-control" style="max-width:170px;font-size:13px;">
                    <option value="">Todos os status</option>
                    <option value="active">Ativos</option>
                    <option value="inactive">Inativos</option>
                </select>
            </div>
            <div id="saida-table-wrap"></div>
        </div>`;

        renderSaidaTable();

        document.getElementById('saida-cat-filter').addEventListener('click', e => {
            const btn = e.target.closest('[data-saida-cat]');
            if (!btn) return;
            document.querySelectorAll('#saida-cat-filter .pc-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderSaidaTable();
        });
        document.getElementById('saida-status-filter').addEventListener('change', renderSaidaTable);

    } catch (err) {
        panel.innerHTML = `<div class="empty-state"><h3>Erro ao carregar</h3><p>${err.message}</p></div>`;
    }
}

function renderSaidaTable() {
    const catBtn = document.querySelector('#saida-cat-filter .pc-cat-btn.active');
    const cat    = catBtn ? catBtn.dataset.saidaCat : '';
    const status = document.getElementById('saida-status-filter')?.value || '';

    let list = _saidaProdList;
    if (cat)               list = list.filter(p => p.category === cat);
    if (status === 'active')   list = list.filter(p => p.active !== false);
    if (status === 'inactive') list = list.filter(p => p.active === false);

    const countEl = document.getElementById('saida-count');
    if (countEl) countEl.textContent = `${list.length} produto${list.length !== 1 ? 's' : ''}`;

    const wrap = document.getElementById('saida-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="orders-table" style="width:100%;">
        <thead><tr>
            <th>Produto</th><th>Categoria</th><th>Pre&ccedil;o</th>
            <th>Vendas</th><th>Receita</th><th>Downloads</th><th>Status</th>
        </tr></thead>
        <tbody>
        ${list.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:#778DA9;">Nenhum produto encontrado.</td></tr>` :
          list.map(p => `<tr>
            <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name || p.id}</td>
            <td><span style="font-size:12px;color:#778DA9;">${p.category || '—'}</span></td>
            <td style="white-space:nowrap;">R$&nbsp;${fmtMoney(p.price)}</td>
            <td style="font-weight:700;color:${p.qty > 0 ? '#27ae60' : '#c0392b'};">${p.qty}</td>
            <td style="white-space:nowrap;">R$&nbsp;${fmtMoney(p.rev)}</td>
            <td>${p.downloads}</td>
            <td><span class="product-status ${p.active !== false ? 'active' : 'inactive'}">${p.active !== false ? 'Ativo' : 'Inativo'}</span></td>
        </tr>`).join('')}
        </tbody>
    </table>
    </div>`;
}

/* ═══════════════════════════════════════
   CONFIGURAÇÃO DE PRODUTOS
═══════════════════════════════════════ */
async function loadProdConfig() {
    const panel = document.getElementById('tab-prod-config');
    if (!panel) return;
    panel.innerHTML = `<div class="loading-state"><p>Carregando…</p></div>`;
    try {
        if (!products.length) {
            const snap = await getDocs(collection(db, 'products'));
            products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }
        renderProdConfig();
    } catch (err) {
        panel.innerHTML = `<div class="empty-state"><h3>Erro ao carregar</h3><p>${err.message}</p></div>`;
    }
}

let pcFilter = '';

window.setPcFilter = function(cat) {
    pcFilter = cat;
    renderProdConfig();
};

function renderProdConfig() {
    const panel = document.getElementById('tab-prod-config');
    if (!panel) return;

    const cats     = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const filtered = pcFilter ? products.filter(p => p.category === pcFilter) : products;

    panel.innerHTML = `
    <div class="pc-top-toolbar" style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <select id="pc-cat-select" onchange="window.setPcFilter(this.value)" style="font-size:14px;padding:7px 12px;border-radius:8px;border:1.5px solid #dde4ee;background:#fff;height:38px;min-width:180px;cursor:pointer;">
            <option value="">Todas as categorias</option>
            ${cats.map(c => `<option value="${c}" ${pcFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <button class="pc-action-btn pc-btn-add" onclick="document.getElementById('btn-add-product').click()" style="height:38px;padding:0 16px;"><i class="bi bi-plus-lg"></i> Adicionar Produto</button>
        <button class="pc-action-btn" onclick="window.openAddKitModal()" style="height:38px;padding:0 16px;background:#7B2D8B;border-color:#7B2D8B;color:#fff;border-radius:8px;font-weight:600;cursor:pointer;border:none;"><i class="bi bi-collection-fill"></i> Adicionar KIT</button>
    </div>
    <div class="dash-card" style="margin-top:0;">
        <div class="pc-toolbar">
            <div class="pc-toolbar-right">
                <button class="pc-action-btn" onclick="window.bulkToggle(true)">Ativar sel.</button>
                <button class="pc-action-btn" onclick="window.bulkToggle(false)">Desativar sel.</button>
            </div>
        </div>
        <div style="overflow-x:auto;">
        <table class="orders-table" style="width:100%;">
            <thead><tr>
                <th><input type="checkbox" id="pc-check-all" onchange="window.selectAllProdConfig(this.checked)" style="cursor:pointer;"></th>
                <th>Produto</th><th>Categoria</th><th>Pre&ccedil;o</th><th>Status</th><th>A&ccedil;&otilde;es</th>
            </tr></thead>
            <tbody>
            ${filtered.map(p => `<tr data-pid="${p.id}">
                <td><input type="checkbox" class="pc-row-check" data-pid="${p.id}" style="cursor:pointer;"></td>
                <td style="font-weight:600;">${p.name}${p.productType === 'kit' ? ' <span style="background:#7B2D8B;color:#fff;border-radius:4px;font-size:11px;padding:1px 6px;margin-left:4px;vertical-align:middle;">KIT</span>' : ''}</td>
                <td style="font-weight:600;">${p.category || '\u2014'}</td>
                <td style="white-space:nowrap;">R$&nbsp;${fmtMoney(p.price)}</td>
                <td><span class="pc-status-text ${p.active !== false ? 'active' : 'inactive'}">${p.active !== false ? 'Ativo' : 'Inativo'}</span></td>
                <td class="pc-actions-cell">
                    <button class="pc-action-btn" onclick="editProduct('${p.id}')">Editar</button>
                    <button class="pc-action-btn" onclick="window.toggleProductActive('${p.id}', ${!(p.active !== false)})">${p.active !== false ? 'Desativar' : 'Ativar'}</button>
                    <button class="pc-action-btn pc-btn-view" onclick="window.previewProduct('${p.id}')">Visualizar</button>
                    <button class="pc-action-btn pc-btn-del" onclick="window.confirmDelete('product','${p.id}','${p.name.replaceAll("'", "\\'")}')">Excluir</button>
                </td>
            </tr>`).join('')}
            </tbody>
        </table>
        </div>
    </div>`;
}

window.openAddKitModal = function() {
    editingProductId = null;
    document.getElementById('modal-title').textContent = 'Adicionar KIT';
    productForm.reset();
    setProductTypeBadge('kit');
    document.getElementById('product-original-price').value = '';
    toggleKitSections(true);
    resetPanelSizes();
    resetImageInputs();
    resetVideoInputs();
    refreshCategorySelect();
    productModal.classList.add('show');
};

window.toggleProductActive = async function(id, active) {
    try {
        await updateDoc(doc(db, 'products', id), { active });
        const p = products.find(x => x.id === id);
        if (p) p.active = active;
        renderProdConfig();
        showToast(`Produto ${active ? 'ativado' : 'desativado'}!`, 'success');
    } catch (e) {
        showToast('Erro: ' + e.message, 'error');
    }
};

window.bulkToggle = async function(active) {
    const checked = [...document.querySelectorAll('.pc-row-check:checked')].map(c => c.dataset.pid);
    if (!checked.length) { showToast('Selecione ao menos um produto.', 'info'); return; }
    try {
        await Promise.all(checked.map(id => updateDoc(doc(db, 'products', id), { active })));
        checked.forEach(id => { const p = products.find(x => x.id === id); if (p) p.active = active; });
        renderProdConfig();
        showToast(`${checked.length} produto(s) ${active ? 'ativado(s)' : 'desativado(s)'}!`, 'success');
    } catch (e) {
        showToast('Erro: ' + e.message, 'error');
    }
};

window.selectAllProdConfig = function(checked) {
    document.querySelectorAll('.pc-row-check').forEach(c => { c.checked = checked; });
};

/* ─── Preview modal ─── */
const prodPreviewModal = document.getElementById('prod-preview-modal');
document.getElementById('prod-preview-close')?.addEventListener('click', () => {
    prodPreviewModal?.classList.remove('show');
});
prodPreviewModal?.addEventListener('click', e => {
    if (e.target === prodPreviewModal) prodPreviewModal.classList.remove('show');
});

window.previewProduct = function(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    const body = document.getElementById('prod-preview-body');
    const price    = parseFloat(p.price) || 0;
    const pixPrice = (price * 0.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const priceStr = price.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const installStr = price >= 10
        ? `ou em até 3x de R$ ${(price / 3).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sem juros`
        : '';

    body.innerHTML = `
    <div class="ppv-layout">
        <div class="ppv-gallery-col">
            <div id="ppv-gallery"></div>
        </div>
        <div class="ppv-info-col">
            <div class="ppv-category">${(p.category || 'Produto').toUpperCase()}</div>
            <h2 class="ppv-title">${p.name}</h2>
            <div class="ppv-price-block">
                <div class="ppv-price">R$ ${priceStr}</div>
                <div class="ppv-pix"><i class="bi bi-lightning-charge-fill" style="color:#FEE440;"></i> R$ ${pixPrice} à vista no Pix (10% off)</div>
                ${installStr ? `<div class="ppv-installments">${installStr}</div>` : ''}
            </div>
            <div class="ppv-desc">${(p.description || 'Sem descrição disponível.').replace(/\n/g, '<br>')}</div>
            <div class="ppv-status-row">
                <span class="pc-status-text ${p.active !== false ? 'active' : 'inactive'}" style="font-size:14px;">${p.active !== false ? '● Produto Ativo' : '● Produto Inativo'}</span>
            </div>
        </div>
    </div>`;

    buildPpvGallery(p, document.getElementById('ppv-gallery'));
    prodPreviewModal.classList.add('show');
};

function buildPpvGallery(product, container) {
    function gdrive(url) {
        if (!url || !url.includes('drive.google.com')) return url;
        const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
        if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
        const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
        if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w800`;
        return url;
    }
    const NO_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect fill='%239B5DE5' width='800' height='600'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.4)' font-size='24' font-family='sans-serif'%3ESem Imagem%3C/text%3E%3C/svg%3E`;

    const images = (Array.isArray(product.images) && product.images.length
        ? product.images
        : (product.imageUrl ? [product.imageUrl] : (product.image ? [product.image] : []))).map(gdrive);
    const videos = Array.isArray(product.videos) ? product.videos : [];
    const allMedia = [
        ...images.map(u => ({ type: 'image', url: u })),
        ...videos.map(u => ({ type: 'video', url: u }))
    ];
    if (!allMedia.length) allMedia.push({ type: 'image', url: NO_IMG });

    let current = 0;

    function getEmbedUrl(url) {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const vid = url.includes('youtu.be')
                ? url.split('youtu.be/')[1]?.split('?')[0]
                : url.split('v=')[1]?.split('&')[0];
            return `https://www.youtube.com/embed/${vid}`;
        }
        if (url.includes('vimeo.com')) {
            const vid = url.split('vimeo.com/')[1]?.split('?')[0];
            return `https://player.vimeo.com/video/${vid}`;
        }
        if (url.includes('drive.google.com')) {
            const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
            if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
            const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
            if (m2) return `https://drive.google.com/file/d/${m2[1]}/preview`;
        }
        return url;
    }
    function makeImgEl(url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = product.name || '';
        img.onerror = () => { img.onerror = null; img.src = NO_IMG; };
        return img;
    }
    function makeVideoEl(url) {
        const iframe = document.createElement('iframe');
        iframe.src = getEmbedUrl(url);
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; encrypted-media';
        return iframe;
    }

    const mainWrap = document.createElement('div');
    mainWrap.className = 'pd-main-img-wrap';
    const first = allMedia[0];
    mainWrap.appendChild(first.type === 'video' ? makeVideoEl(first.url) : makeImgEl(first.url));

    if (allMedia.length > 1) {
        const prev = document.createElement('button');
        prev.className = 'pd-gallery-nav pd-gallery-nav-prev';
        prev.innerHTML = '<i class="bi bi-chevron-left"></i>';
        prev.onclick = () => { current = (current - 1 + allMedia.length) % allMedia.length; update(); };
        const next = document.createElement('button');
        next.className = 'pd-gallery-nav pd-gallery-nav-next';
        next.innerHTML = '<i class="bi bi-chevron-right"></i>';
        next.onclick = () => { current = (current + 1) % allMedia.length; update(); };
        mainWrap.appendChild(prev);
        mainWrap.appendChild(next);
    }

    const thumbsWrap = document.createElement('div');
    thumbsWrap.className = 'pd-thumbs';
    allMedia.forEach((m, i) => {
        const t = document.createElement('div');
        t.className = 'pd-thumb' + (i === 0 ? ' active' : '');
        if (m.type === 'image') {
            const img = document.createElement('img');
            img.src = m.url; img.alt = '';
            img.onerror = () => { img.onerror = null; img.src = NO_IMG; };
            t.appendChild(img);
        } else {
            t.innerHTML = `<div style="width:100%;height:100%;background:#111;display:flex;align-items:center;justify-content:center;"><i class="bi bi-play-circle-fill" style="color:#fff;font-size:1.5rem;"></i></div>`;
        }
        t.onclick = () => { current = i; update(); };
        thumbsWrap.appendChild(t);
    });

    container.innerHTML = '';
    container.appendChild(mainWrap);
    if (allMedia.length > 1) container.appendChild(thumbsWrap);

    function update() {
        const media = allMedia[current];
        const el = media.type === 'video' ? makeVideoEl(media.url) : makeImgEl(media.url);
        const prevBtn = mainWrap.querySelector('.pd-gallery-nav-prev');
        const nextBtn = mainWrap.querySelector('.pd-gallery-nav-next');
        mainWrap.innerHTML = '';
        mainWrap.appendChild(el);
        if (prevBtn) mainWrap.appendChild(prevBtn);
        if (nextBtn) mainWrap.appendChild(nextBtn);
        thumbsWrap.querySelectorAll('.pd-thumb').forEach((t, i) => t.classList.toggle('active', i === current));
    }
}

/* ═══════════════════════════════════════
   UTILITIES
═══════════════════════════════════════ */
function formatPrice(price) { return parseFloat(price).toFixed(2).replace('.', ','); }

function showToast(message, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

// legacy alias
window.confirmDeleteProduct = (id) => {
    const p = products.find(x => x.id === id);
    if (p) window.confirmDelete('product', id, p.name);
};

/* ═══════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════ */
let dashboardChart = null;  // daily revenue chart
let dashCatChart   = null;  // category donut chart

function fmtMoney(v) {
    return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

async function loadDashboard() {
    const panel = document.getElementById('tab-dashboard');
    if (!panel) return;
    panel.innerHTML = `<div class="loading-state"><p>Carregando dados…</p></div>`;

    try {
        /* ── Busca paralela ── */
        const [allOrdSnap, prodSnap, , dlSnap] = await Promise.all([
            getDocs(collection(db, 'orders')),
            getDocs(collection(db, 'products')),
            getDocs(collection(db, 'users')).catch(() => null),
            getDocs(collection(db, 'downloadLogs')).catch(() => null),
        ]);

        /* ── Pedidos ── */
        const getDate  = o => new Date(o.completedAt || o.createdAt || 0);
        const allOrders = allOrdSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const approved  = allOrders.filter(o => o.paymentStatus === 'approved');
        const pending   = allOrders.filter(o => o.paymentStatus === 'pending');

        /* ── Datas de referência ── */
        const now    = new Date();
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lmS    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmE    = mStart;

        const thisM = approved.filter(o => getDate(o) >= mStart);
        const lastM = approved.filter(o => { const d = getDate(o); return d >= lmS && d < lmE; });

        /* ── KPI helpers ── */
        const sumRev  = arr => arr.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const pctChg  = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

        const thisRev   = sumRev(thisM);
        const lastRev   = sumRev(lastM);
        const thisAvg   = thisM.length ? thisRev / thisM.length : 0;
        const lastAvg   = lastM.length ? (sumRev(lastM) / lastM.length) : 0;
        const pendingRev = sumRev(pending);

        /* ── Mapa de produtos ── */
        const prodMap = {};
        prodSnap.docs.forEach(d => {
            const data = d.data();
            prodMap[d.id] = {
                name:     data.name || d.id,
                image:    (Array.isArray(data.images) ? data.images[0] : null) || data.image || data.imageUrl || '',
                category: data.category || 'Outros',
                active:   data.active !== false,
            };
        });

        /* ── Dados por dia (mês atual) ── */
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dailyRev    = Array(daysInMonth).fill(0);
        approved.forEach(o => {
            const d = getDate(o);
            if (d >= mStart && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
                dailyRev[d.getDate() - 1] += (o.totalAmount || 0);
            }
        });

        /* ── Receita por Categoria ── */
        const catRev = {};
        approved.forEach(o => {
            (o.items || []).forEach(item => {
                const cat = prodMap[item.id || item.productId]?.category || item.category || 'Outros';
                catRev[cat] = (catRev[cat] || 0) + (item.price || 0) * (item.quantity || 1);
            });
        });
        // fallback: se items vazio, usa totalAmount na categoria do 1º item ou "Outros"
        if (!Object.keys(catRev).length) {
            approved.forEach(o => { catRev['Vendas'] = (catRev['Vendas'] || 0) + (o.totalAmount || 0); });
        }

        /* ── Rankings de produtos ── */
        const pQty = {}, pRev = {};
        approved.forEach(o => {
            (o.items || []).forEach(item => {
                const id  = item.id || item.productId;
                if (!id) return;
                pQty[id] = (pQty[id] || 0) + (item.quantity || 1);
                pRev[id] = (pRev[id] || 0) + (item.price || 0) * (item.quantity || 1);
            });
        });

        const topProds = Object.entries(pQty)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([id, qty]) => ({ id, qty, rev: pRev[id] || 0, ...(prodMap[id] || { name: id, image: '' }) }));

        const bottomProds = Object.values(prodMap)
            .filter(p => p.active)
            .map(p => {
                const id = Object.keys(prodMap).find(k => prodMap[k] === p);
                return { id, qty: pQty[id] || 0, rev: pRev[id] || 0, ...p };
            })
            .sort((a, b) => a.qty - b.qty).slice(0, 5);

        /* ── Pedidos recentes (últimos 20, todos os status) ── */
        // (usado anteriormente para tabela no dashboard — removido)

        /* ── Comprou mas não baixou ── */
        let notDownloaded = null;
        if (dlSnap) {
            const dlOrderIds = new Set(dlSnap.docs.map(d => d.data().orderId).filter(Boolean));
            notDownloaded = approved.filter(o => !dlOrderIds.has(o.id)).length;
        }

        /* ── Renderiza HTML ── */
        panel.innerHTML = dashHTML();

        /* ── KPI Cards ── */
        setKPI('kpi-month-rev',   `R$\u00a0${fmtMoney(thisRev)}`,   'vs. mês anterior', pctChg(thisRev, lastRev));
        setKPI('kpi-month-sales', String(thisM.length),              'vs. mês anterior', pctChg(thisM.length, lastM.length));
        setKPI('kpi-avg-ticket',  `R$\u00a0${fmtMoney(thisAvg)}`,   'vs. mês anterior', pctChg(thisAvg, lastAvg));
        setKPI('kpi-pending',     String(pending.length),            `R$\u00a0${fmtMoney(pendingRev)} retido`);

        /* ── Gráficos ── */
        dashBuildDailyChart(dailyRev, now);
        dashBuildCatChart(catRev);

        /* ── Rankings ── */
        dashRenderTopProds(topProds);
        dashRenderBottomProds(bottomProds);

        /* ── Badge download removido (tabela de pedidos não exibida no dashboard) ── */

    } catch (err) {
        console.error('Dashboard:', err);
        panel.innerHTML = `<div class="dash-empty"><i class="bi bi-exclamation-triangle"></i><p>Erro ao carregar: ${err.message}</p></div>`;
    }
}

/* ── HTML skeleton ── */
function dashHTML() {
    const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return `
    <!-- KPI Cards -->
    <div class="kpi-grid kpi-grid-4">
        <div class="kpi-card kpi-green">
            <div class="kpi-header"><span class="kpi-label">Faturamento do Mês</span><span class="kpi-icon"><i class="bi bi-cash-stack"></i></span></div>
            <div class="kpi-value" id="kpi-month-rev">&mdash;</div>
            <div class="kpi-sub"  id="kpi-month-rev-sub"><span style="font-size:11px;color:#aab0ba;">${monthName}</span></div>
        </div>
        <div class="kpi-card kpi-blue">
            <div class="kpi-header"><span class="kpi-label">Vendas Conclu&iacute;das</span><span class="kpi-icon"><i class="bi bi-bag-check-fill"></i></span></div>
            <div class="kpi-value" id="kpi-month-sales">&mdash;</div>
            <div class="kpi-sub"  id="kpi-month-sales-sub"></div>
        </div>
        <div class="kpi-card kpi-purple">
            <div class="kpi-header"><span class="kpi-label">Ticket M&eacute;dio</span><span class="kpi-icon"><i class="bi bi-receipt"></i></span></div>
            <div class="kpi-value" id="kpi-avg-ticket">&mdash;</div>
            <div class="kpi-sub"  id="kpi-avg-ticket-sub"></div>
        </div>
        <div class="kpi-card kpi-yellow">
            <div class="kpi-header"><span class="kpi-label">Aguardando Pagamento</span><span class="kpi-icon"><i class="bi bi-hourglass-split"></i></span></div>
            <div class="kpi-value" id="kpi-pending">&mdash;</div>
            <div class="kpi-sub"  id="kpi-pending-sub"></div>
        </div>
    </div>

    <!-- Gráficos -->
    <div class="dash-row dash-charts-row">
        <div class="dash-card dash-chart-main">
            <div class="dash-card-header">
                <h3><i class="bi bi-graph-up-arrow" style="color:#415A77;margin-right:6px;"></i> Receita por Dia &mdash; ${monthName}</h3>
            </div>
            <canvas id="daily-chart" style="max-height:220px;"></canvas>
        </div>
        <div class="dash-card dash-chart-side">
            <div class="dash-card-header">
                <h3><i class="bi bi-pie-chart-fill" style="color:#8e44ad;margin-right:6px;"></i> Vendas por Categoria</h3>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                <canvas id="cat-chart" style="max-height:190px;max-width:190px;"></canvas>
                <div id="cat-legend" class="cat-legend"></div>
            </div>
        </div>
    </div>

    <!-- Rankings -->
    <div class="dash-row">
        <div class="dash-card">
            <div class="dash-card-header">
                <h3><i class="bi bi-trophy-fill" style="color:#e67e22;margin-right:6px;"></i> Top 5 Mais Vendidos</h3>
            </div>
            <div id="top5-list"></div>
        </div>
        <div class="dash-card">
            <div class="dash-card-header">
                <h3><i class="bi bi-graph-down-arrow" style="color:#c0392b;margin-right:6px;"></i> Aten&ccedil;&atilde;o &mdash; Menos Vendidos</h3>
                <span class="dash-period" title="Produtos ativos com menor volume de vendas">ativos</span>
            </div>
            <div id="bottom5-list"></div>
        </div>
    </div>

    `;  // (últimos pedidos removidos do dashboard)
}

/* ── KPI setter ── */
function setKPI(id, val, sub, pct) {
    const ve = document.getElementById(id);
    const se = document.getElementById(id + '-sub');
    if (ve) ve.textContent = val;
    if (se) {
        let html = sub || '';
        if (pct != null) {
            const cls  = pct >= 0 ? 'up' : 'down';
            const icon = pct >= 0 ? 'bi-arrow-up-short' : 'bi-arrow-down-short';
            html += ` <span class="kpi-badge ${cls}"><i class="bi ${icon}"></i>${Math.abs(pct)}%</span>`;
        }
        se.innerHTML = html;
    }
}

/* ── Gráfico de linha — receita por dia ── */
function dashBuildDailyChart(dailyRev, now) {
    const ctx = document.getElementById('daily-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (dashboardChart) { dashboardChart.destroy(); dashboardChart = null; }

    const labels = Array.from({ length: dailyRev.length }, (_, i) =>
        String(i + 1).padStart(2, '0'));
    const today = now.getDate() - 1;
    const bgColors = dailyRev.map((_, i) =>
        i === today ? 'rgba(65,90,119,1)' : 'rgba(65,90,119,.55)');

    dashboardChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Receita (R$)',
                data: dailyRev,
                backgroundColor: bgColors,
                borderRadius: 5,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => `R$ ${fmtMoney(c.parsed.y)}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } },
                y: { beginAtZero: true, grid: { color: '#f0f2f5' },
                     ticks: { font: { size: 11 }, callback: v => 'R$ ' + fmtMoney(v) } }
            }
        }
    });
}

/* ── Gráfico rosca — categorias ── */
const CAT_COLORS = ['#415A77','#8e44ad','#27ae60','#e67e22','#2980b9','#c0392b','#16a085','#f39c12'];

function dashBuildCatChart(catRev) {
    const ctx = document.getElementById('cat-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (dashCatChart) { dashCatChart.destroy(); dashCatChart = null; }

    const entries = Object.entries(catRev).sort((a, b) => b[1] - a[1]);
    if (!entries.length) { ctx.closest('.dash-card').querySelector('#cat-legend').innerHTML = '<p style="font-size:12px;color:#aab0ba;text-align:center;">Sem dados</p>'; return; }

    const labels = entries.map(e => e[0]);
    const data   = entries.map(e => e[1]);
    const total  = data.reduce((a, b) => a + b, 0);
    const colors = entries.map((_, i) => CAT_COLORS[i % CAT_COLORS.length]);

    dashCatChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
        options: {
            responsive: true,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                    label: c => `R$ ${fmtMoney(c.parsed)} (${Math.round(c.parsed / total * 100)}%)`
                }}
            }
        }
    });

    /* Legend manual */
    const leg = document.getElementById('cat-legend');
    if (leg) leg.innerHTML = entries.map((e, i) => `
        <div class="cat-legend-item">
            <span style="background:${colors[i]};width:10px;height:10px;border-radius:50%;display:inline-block;flex-shrink:0;"></span>
            <span style="font-size:11px;color:#415A77;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e[0]}</span>
            <span style="font-size:11px;font-weight:700;color:#1B263B;margin-left:auto;">${Math.round(e[1] / total * 100)}%</span>
        </div>`).join('');
}

/* ── Top 5 produtos ── */
function dashRenderTopProds(tops) {
    const el = document.getElementById('top5-list');
    if (!el) return;
    if (!tops.length) { el.innerHTML = `<div class="dash-empty"><i class="bi bi-inbox"></i><p>Nenhuma venda ainda</p></div>`; return; }
    const medals = ['🥇','🥈','🥉','4°','5°'];
    el.innerHTML = tops.map((p, i) => `
        <div class="prod-rank-item">
            <span class="prod-rank-medal">${medals[i] || (i+1)+'°'}</span>
            ${p.image ? `<img src="${p.image}" class="prod-rank-thumb" alt="" onerror="this.style.display='none'">` : `<div class="prod-rank-thumb prod-rank-no-img"><i class="bi bi-image"></i></div>`}
            <div class="prod-rank-info">
                <div class="prod-rank-name">${p.name}</div>
                <div class="prod-rank-meta">${p.qty} vendido${p.qty !== 1 ? 's' : ''} &middot; R$&nbsp;${fmtMoney(p.rev)}</div>
            </div>
            <div class="prod-rank-qty">${p.qty}</div>
        </div>`).join('');
}

/* ── Bottom 5 produtos ── */
function dashRenderBottomProds(bottoms) {
    const el = document.getElementById('bottom5-list');
    if (!el) return;
    if (!bottoms.length) { el.innerHTML = `<div class="dash-empty"><i class="bi bi-inbox"></i><p>Nenhum produto cadastrado</p></div>`; return; }
    el.innerHTML = bottoms.map(p => `
        <div class="prod-rank-item prod-rank-low">
            ${p.image ? `<img src="${p.image}" class="prod-rank-thumb" alt="" onerror="this.style.display='none'">` : `<div class="prod-rank-thumb prod-rank-no-img"><i class="bi bi-image"></i></div>`}
            <div class="prod-rank-info">
                <div class="prod-rank-name">${p.name}</div>
                <div class="prod-rank-meta">${p.qty === 0 ? '<span style="color:#c0392b;font-weight:600;">Nenhuma venda</span>' : `${p.qty} venda${p.qty !== 1 ? 's' : ''}`}</div>
            </div>
            <span class="prod-rank-low-badge">${p.qty === 0 ? 'Revisar' : 'Baixo'}</span>
        </div>`).join('');
}

/* ── Tabela de pedidos ── */
function dashRenderOrdersTable(orders) {
    const tbody = document.getElementById('orders-tbody');
    const badge = document.getElementById('kpi-not-dl-val');
    if (!tbody) return;
    if (!orders.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#aab0ba;">Nenhum pedido encontrado</td></tr>`; return; }

    const ST = {
        approved:  { label: 'Aprovado',   cls: 'st-approved'  },
        pending:   { label: 'Pendente',   cls: 'st-pending'   },
        rejected:  { label: 'Recusado',   cls: 'st-rejected'  },
        cancelled: { label: 'Cancelado',  cls: 'st-rejected'  },
        failed:    { label: 'Falhou',     cls: 'st-rejected'  },
    };

    if (badge) {
        const notDl = parseInt(badge.textContent);
        if (!isNaN(notDl) && notDl > 0) {
            badge.textContent = `${notDl} sem download`;
            badge.style.display = 'inline-flex';
        }
    }

    tbody.innerHTML = orders.map(o => {
        const st    = ST[o.paymentStatus] || { label: o.paymentStatus || '—', cls: 'st-pending' };
        const short = o.id.slice(-8).toUpperCase();
        const name  = o.customer?.name || o.customerName || o.customer?.email || '—';
        return `<tr>
            <td><code class="order-id">#${short}</code></td>
            <td class="order-name">${name}</td>
            <td style="white-space:nowrap;font-size:12px;color:#778DA9;">${fmtDate(o.completedAt || o.createdAt)}</td>
            <td style="font-weight:700;color:#1B263B;">R$&nbsp;${fmtMoney(o.totalAmount)}</td>
            <td><span class="order-status ${st.cls}">${st.label}</span></td>
        </tr>`;
    }).join('');
}

/* ═══════════════════════════════════════
   VITRINE DA PÁGINA INICIAL
═══════════════════════════════════════ */
const VITRINE_DOC   = 'homeSections';
const MAX_ROWS      = 4;
/* BADGE_STYLES removido — cor livre via color picker */

/* Retorna branco ou escuro dependendo da luminosidade da cor hex */
function vitBadgeText(hex) {
    const r = parseInt((hex || '#000').slice(1,3), 16);
    const g = parseInt((hex || '#000').slice(3,5), 16);
    const b = parseInt((hex || '#000').slice(5,7), 16);
    return (r*299 + g*587 + b*114) / 1000 > 145 ? '#1a0533' : '#fff';
}

const DEFAULT_SECTIONS = [
    { id: 'row1', active: true,  title: 'Lançamentos',      badge: '✨ Lançamentos',   badgeColor: '#00BBF9', type: 'latest',  limit: 10, productIds: [] },
    { id: 'row2', active: false, title: 'Mais Vendidos',    badge: '🔥 Mais Vendidos',  badgeColor: '#9B5DE5', type: 'manual',  limit: 10, productIds: [] },
    { id: 'row3', active: false, title: 'Evento Especial',  badge: '🎉 Evento',        badgeColor: '#FEE440', type: 'manual',  limit: 10, productIds: [] },
    { id: 'row4', active: false, title: 'Promoções',        badge: '💸 Promoção',      badgeColor: '#27ae60', type: 'manual',  limit: 10, productIds: [] },
];

async function loadVitrine() {
    const panel = document.getElementById('tab-vitrine');
    if (!panel) return;
    panel.innerHTML = `<div class="loading-state"><p>Carregando vitrine…</p></div>`;

    /* Carrega config salva */
    let sections = DEFAULT_SECTIONS.map(s => ({ ...s }));
    try {
        const snap = await getDoc(doc(db, 'settings', VITRINE_DOC));
        if (snap.exists() && Array.isArray(snap.data().sections)) {
            sections = snap.data().sections;
        }
    } catch { /* usa padrão */ }

    /* Carrega lista de produtos para o seletor */
    let allProds = [];
    try {
        const psnap = await getDocs(collection(db, 'products'));
        allProds = psnap.docs.map(d => ({ id: d.id, name: d.data().name || d.id, active: d.data().active !== false }))
                            .filter(p => p.active)
                            .sort((a, b) => a.name.localeCompare(b.name));
    } catch { /* sem produtos */ }

    renderVitrineEditor(panel, sections, allProds);
}

function renderVitrineEditor(panel, sections, allProds) {
    panel.innerHTML = `
    <div class="vit-wrap">
        <div class="vit-header">
            <p class="vit-hint">Configure até <strong>${MAX_ROWS} linhas</strong> de produtos exibidas na página inicial.
               Arraste para reordenar, ative/desative cada linha e escolha os produtos manualmente ou por ordem de lançamento.</p>
            <button class="btn-primary" id="btn-save-vitrine"><i class="bi bi-floppy-fill"></i> Salvar vitrine</button>
        </div>

        <div id="vit-rows">
            ${sections.map((s, i) => renderVitrineRow(s, i, allProds)).join('')}
        </div>

        <div id="vit-save-alert" class="sec-alert" style="display:none;margin-top:16px;"></div>
    </div>`;

    /* Accordion toggle */
    panel.querySelectorAll('.vit-row-head').forEach(head => {
        head.addEventListener('click', e => {
            if (e.target.closest('input[type=checkbox]') || e.target.closest('button')) return;
            const row = head.closest('.vit-row');
            row.classList.toggle('open');
        });
    });

    /* Live preview badge color */
    panel.querySelectorAll('.vit-badge-color').forEach(picker => {
        const row  = picker.closest('.vit-row-body');
        const idx  = picker.closest('.vit-row').dataset.idx;
        const prev = document.getElementById(`vit-badge-preview-${idx}`);
        const updatePreview = () => {
            if (!prev) return;
            const badgeInput = row.querySelector('.vit-badge');
            prev.style.background = picker.value;
            prev.style.color      = vitBadgeText(picker.value);
            if (badgeInput) prev.textContent = badgeInput.value || '✨ Preview';
        };
        picker.addEventListener('input', updatePreview);
        row.querySelector('.vit-badge')?.addEventListener('input', () => {
            if (!prev) return;
            prev.textContent = row.querySelector('.vit-badge').value || '✨ Preview';
        });
    });

    /* Salvar */
    document.getElementById('btn-save-vitrine').addEventListener('click', saveVitrine);

    /* Reordenar linhas com setas */
    function updateVitrineRowNums() {
        const allRows = document.querySelectorAll('#vit-rows .vit-row');
        allRows.forEach((row, i) => {
            row.dataset.idx = i;
            const numEl = row.querySelector('.vit-row-num');
            if (numEl) numEl.textContent = `Linha ${i + 1}`;
            const up   = row.querySelector('.vit-move-up');
            const down = row.querySelector('.vit-move-down');
            if (up)   up.disabled   = (i === 0);
            if (down) down.disabled = (i === allRows.length - 1);
        });
    }
    updateVitrineRowNums();

    document.getElementById('vit-rows').addEventListener('click', e => {
        const up   = e.target.closest('.vit-move-up');
        const down = e.target.closest('.vit-move-down');
        if (!up && !down) return;
        e.stopPropagation();
        const row  = (up || down).closest('.vit-row');
        if (up) {
            const prev = row.previousElementSibling;
            if (prev) row.parentNode.insertBefore(row, prev);
        } else {
            const next = row.nextElementSibling;
            if (next) row.parentNode.insertBefore(next, row);
        }
        updateVitrineRowNums();
    });
}

function renderVitrineRow(s, idx, allProds) {
    const prodOptions = allProds.map(p =>
        `<option value="${p.id}" ${s.productIds?.includes(p.id) ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    const badgeColorVal = s.badgeColor || (s.badgeStyle === 'badge-fire' ? '#9B5DE5' : s.badgeStyle === 'badge-event' ? '#FEE440' : s.badgeStyle === 'badge-sale' ? '#27ae60' : '#00BBF9');

    return `
    <div class="vit-row ${s.active ? 'active' : ''}" data-idx="${idx}">
        <div class="vit-row-head">
            <label class="vit-toggle" title="Ativar/desativar linha">
                <input type="checkbox" class="vit-active" ${s.active ? 'checked' : ''}>
                <span class="vit-toggle-slider"></span>
            </label>
            <span class="vit-row-num">Linha ${idx + 1}</span>
            <span class="vit-row-title-preview">${s.title || '—'}</span>
            <div class="vit-reorder" style="display:flex;gap:4px;margin-left:auto;padding-right:8px;">
                <button class="vit-move-btn vit-move-up" title="Mover para cima" style="background:#e8eaf6;border:none;border-radius:5px;padding:2px 8px;font-size:14px;cursor:pointer;line-height:1;">&#8593;</button>
                <button class="vit-move-btn vit-move-down" title="Mover para baixo" style="background:#e8eaf6;border:none;border-radius:5px;padding:2px 8px;font-size:14px;cursor:pointer;line-height:1;">&#8595;</button>
            </div>
            <i class="bi bi-chevron-down vit-chevron"></i>
        </div>

        <div class="vit-row-body">
            <div class="vit-fields">

                <div class="vit-field">
                    <label>Título da linha</label>
                    <input type="text" class="vit-title form-control" value="${s.title || ''}" placeholder="Ex: Halloween, Carnaval…" maxlength="50">
                </div>

                <div class="vit-field">
                    <label>Texto do badge</label>
                    <input type="text" class="vit-badge form-control" value="${s.badge || ''}" placeholder="Ex: 🎃 Halloween" maxlength="40">
                </div>

                <div class="vit-field">
                    <label>Cor do badge</label>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <input type="color" class="vit-badge-color" value="${badgeColorVal}" style="width:48px;height:38px;border:1.5px solid #dde4ee;border-radius:8px;cursor:pointer;padding:2px;">
                        <span class="catalog-row-badge" id="vit-badge-preview-${idx}" style="background:${badgeColorVal};color:${vitBadgeText(badgeColorVal)};">${s.badge || '✨ Preview'}</span>
                    </div>
                </div>

                <div class="vit-field">
                    <label>Tipo de seleção</label>
                    <select class="vit-type form-control">
                        <option value="latest"  ${s.type === 'latest'  ? 'selected' : ''}>Últimos lançamentos (automático)</option>
                        <option value="manual"  ${s.type === 'manual'  ? 'selected' : ''}>Produtos escolhidos manualmente</option>
                        <option value="category"${s.type === 'category'? 'selected' : ''}>Por categoria</option>
                    </select>
                </div>

                <div class="vit-field vit-field-limit">
                    <label>Quantidade máxima</label>
                    <input type="number" class="vit-limit form-control" value="${s.limit || 10}" min="1" max="20" style="max-width:90px;">
                </div>

            </div>

            <!-- Seletor manual de produtos -->
            <div class="vit-manual-wrap" style="display:${s.type === 'manual' ? 'block' : 'none'};">
                <label style="font-size:12px;font-weight:600;color:#415A77;margin-bottom:6px;display:block;">
                    Produtos selecionados <span style="font-weight:400;color:#778DA9;">(Ctrl+Clique para múltiplos)</span>
                </label>
                <select class="vit-product-ids form-control" multiple size="8">${prodOptions}</select>
                <div class="vit-selected-count">${(s.productIds||[]).length} produto(s) selecionado(s)</div>
            </div>

            <!-- Seletor de categoria -->
            <div class="vit-cat-wrap" style="display:${s.type === 'category' ? 'block' : 'none'};">
                <label style="font-size:12px;font-weight:600;color:#415A77;margin-bottom:6px;display:block;">Categoria</label>
                <select class="vit-category form-control">
                    <option value="">Selecione…</option>
                    ${categories.map(c => `<option value="${c.name}" ${s.categoryName === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
            </div>
        </div>
    </div>`;
}

/* Bind dinâmico após render — delegado ao container */
document.addEventListener('change', e => {
    /* Toggle visível/oculto dos sub-painéis ao mudar tipo */
    if (e.target.classList.contains('vit-type')) {
        const row  = e.target.closest('.vit-row');
        row.querySelector('.vit-manual-wrap').style.display = e.target.value === 'manual'   ? 'block' : 'none';
        row.querySelector('.vit-cat-wrap').style.display    = e.target.value === 'category' ? 'block' : 'none';
    }
    /* Título preview no header */
    if (e.target.classList.contains('vit-title')) {
        const row = e.target.closest('.vit-row');
        row.querySelector('.vit-row-title-preview').textContent = e.target.value || '—';
    }
    /* Atualiza contagem de produtos selecionados */
    if (e.target.classList.contains('vit-product-ids')) {
        const row = e.target.closest('.vit-row');
        const cnt = row.querySelectorAll('.vit-product-ids option:checked').length;
        row.querySelector('.vit-selected-count').textContent = `${cnt} produto(s) selecionado(s)`;
    }
    /* Toggle classe active na row */
    if (e.target.classList.contains('vit-active')) {
        e.target.closest('.vit-row').classList.toggle('active', e.target.checked);
    }
});

async function saveVitrine() {
    const rows = document.querySelectorAll('#vit-rows .vit-row');
    const sections = Array.from(rows).map((row, i) => {
        const type = row.querySelector('.vit-type').value;
        const ids  = type === 'manual'
            ? Array.from(row.querySelectorAll('.vit-product-ids option:checked')).map(o => o.value)
            : [];
        const catName = type === 'category'
            ? (row.querySelector('.vit-category')?.value || '')
            : '';
        return {
            id:           `row${i + 1}`,
            active:       row.querySelector('.vit-active').checked,
            title:        row.querySelector('.vit-title').value.trim(),
            badge:        row.querySelector('.vit-badge').value.trim(),
            badgeColor:   row.querySelector('.vit-badge-color').value,
            type,
            limit:        parseInt(row.querySelector('.vit-limit').value) || 10,
            productIds:   ids,
            categoryName: catName,
        };
    });

    const alertEl = document.getElementById('vit-save-alert');
    try {
        await setDoc(doc(db, 'settings', VITRINE_DOC), { sections }, { merge: false });
        alertEl.textContent = '✅ Vitrine salva! As alterações aparecerão na página inicial.';
        alertEl.className   = 'sec-alert success';
        alertEl.style.display = 'block';
        setTimeout(() => { alertEl.style.display = 'none'; }, 5000);
    } catch (err) {
        alertEl.textContent = 'Erro ao salvar: ' + err.message;
        alertEl.className   = 'sec-alert error';
        alertEl.style.display = 'block';
    }
}

/* ═══════════════════════════════════════
   SEGURANÇA
═══════════════════════════════════════ */
async function loadSeguranca() {
    /* Importa OTPAuth dinamicamente */
    const OTPAuth = await import('https://cdn.jsdelivr.net/npm/otpauth@9.3.6/dist/otpauth.esm.js');

    /* Busca config atual */
    let hasTOTP = false;
    try {
        const snap = await getDoc(doc(db, 'settings', 'adminConfig'));
        hasTOTP = snap.exists() && !!snap.data().totpSecret;
    } catch { /* sem acesso */ }

    const totpStatusHtml = hasTOTP
        ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#e6f4ea;border:1px solid #c3e6cb;border-radius:8px;margin-bottom:14px;font-size:13px;color:#155724;">
               <i class="bi bi-check-circle-fill" style="font-size:1rem;"></i>
               <span>FortiToken <strong>configurado</strong> neste dispositivo.</span>
           </div>`
        : `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;margin-bottom:14px;font-size:13px;color:#856404;">
               <i class="bi bi-exclamation-triangle-fill"></i>
               <span>TOTP <strong>não configurado</strong>. Login usa PIN de fallback.</span>
           </div>`;

    document.getElementById('tab-seguranca').innerHTML = `
    <div class="sec-wrap">

        <div class="sec-card">
            <h3 class="sec-title"><i class="bi bi-key"></i> Trocar Senha</h3>
            <div class="form-group">
                <label>Senha atual</label>
                <input type="password" id="sec-cur-pw" class="form-control" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;">
            </div>
            <div class="form-group">
                <label>Nova senha <span style="font-weight:400;color:#778DA9;">(min. 8 caracteres)</span></label>
                <input type="password" id="sec-new-pw" class="form-control" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;">
            </div>
            <div class="form-group">
                <label>Confirmar nova senha</label>
                <input type="password" id="sec-conf-pw" class="form-control" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;">
            </div>
            <div id="sec-pw-alert" class="sec-alert" style="display:none;"></div>
            <button class="btn-primary" id="btn-save-pw">Salvar nova senha</button>
        </div>

        <div class="sec-card">
            <h3 class="sec-title"><i class="bi bi-phone"></i> Autenticador TOTP (FortiToken)</h3>
            <p class="sec-hint">Gera um c&oacute;digo de 6 d&iacute;gitos a cada 30 segundos no app FortiToken Mobile ou qualquer autenticador TOTP (Google Authenticator, Authy, etc.).</p>
            ${totpStatusHtml}
            <button class="btn-primary" id="btn-setup-totp" style="background:linear-gradient(135deg,#415A77,#1B263B);">
                <i class="bi bi-qr-code"></i> ${hasTOTP ? 'Reconfigurar autenticador' : 'Configurar autenticador'}
            </button>

            <!-- Area de setup (oculta inicialmente) -->
            <div id="totp-setup-area" style="display:none;margin-top:20px;">
                <div style="text-align:center;margin-bottom:14px;">
                    <p style="font-size:12px;color:#778DA9;margin-bottom:12px;">Escaneie o QR code com o FortiToken Mobile:</p>
                    <img id="totp-qr-img" src="" alt="QR Code" style="width:200px;height:200px;border:4px solid #eef0f4;border-radius:12px;">
                    <p style="font-size:10px;color:#aab0ba;margin-top:8px;">
                        Ou insira a chave manualmente:<br>
                        <code id="totp-secret-text" style="font-size:12px;color:#415A77;word-break:break-all;display:block;margin-top:4px;"></code>
                    </p>
                </div>
                <div class="form-group">
                    <label>Confirme com um c&oacute;digo do app (6 d&iacute;gitos)</label>
                    <input type="text" id="sec-totp-verify" class="form-control"
                           placeholder="000000" maxlength="6" inputmode="numeric"
                           style="text-align:center;font-size:1.4rem;font-weight:700;letter-spacing:.3em;">
                </div>
                <div id="sec-totp-alert" class="sec-alert" style="display:none;"></div>
                <button class="btn-primary" id="btn-confirm-totp">Confirmar e salvar</button>
                <button type="button" id="btn-cancel-totp"
                        style="width:100%;margin-top:8px;background:none;border:none;color:#778DA9;cursor:pointer;font-size:13px;padding:6px;">
                    Cancelar
                </button>
            </div>

            <div id="sec-totp-status-alert" class="sec-alert" style="display:none;margin-top:12px;"></div>
        </div>

    </div>`;

    /* ── Alert helper ── */
    function secAlert(elId, msg, type = 'error') {
        const el = document.getElementById(elId);
        el.textContent = msg;
        el.className = `sec-alert ${type}`;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 6000);
    }

    /* ── Trocar senha ── */
    document.getElementById('btn-save-pw').addEventListener('click', async () => {
        const cur  = document.getElementById('sec-cur-pw').value;
        const novo = document.getElementById('sec-new-pw').value;
        const conf = document.getElementById('sec-conf-pw').value;

        if (!cur || !novo || !conf) { secAlert('sec-pw-alert', 'Preencha todos os campos.'); return; }
        if (novo.length < 8)        { secAlert('sec-pw-alert', 'A nova senha deve ter ao menos 8 caracteres.'); return; }
        if (novo !== conf)          { secAlert('sec-pw-alert', 'As senhas nao coincidem.'); return; }

        try {
            const credential = EmailAuthProvider.credential(currentUser.email, cur);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, novo);
            secAlert('sec-pw-alert', 'Senha alterada com sucesso!', 'success');
            ['sec-cur-pw','sec-new-pw','sec-conf-pw'].forEach(id => { document.getElementById(id).value = ''; });
        } catch(err) {
            const msgs = {
                'auth/wrong-password':        'Senha atual incorreta.',
                'auth/invalid-credential':    'Senha atual incorreta.',
                'auth/requires-recent-login': 'Sessao expirada. Faca login novamente.',
            };
            secAlert('sec-pw-alert', msgs[err.code] || 'Erro: ' + err.message);
        }
    });

    /* ── Setup TOTP ── */
    let pendingSecret = null;

    document.getElementById('btn-setup-totp').addEventListener('click', async () => {
        /* Gera novo secret */
        pendingSecret = new OTPAuth.Secret({ size: 20 });
        const secretBase32 = pendingSecret.base32;

        const totp = new OTPAuth.TOTP({
            issuer:    'Atelie da Escola',
            label:     'admin@ateliedaescola.com',
            secret:    pendingSecret,
            algorithm: 'SHA1',
            digits:    6,
            period:    30,
        });

        const uri    = totp.toString();
        const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;

        document.getElementById('totp-qr-img').src       = qrUrl;
        document.getElementById('totp-secret-text').textContent = secretBase32;
        document.getElementById('totp-setup-area').style.display = 'block';
        document.getElementById('btn-setup-totp').style.display  = 'none';
        document.getElementById('sec-totp-verify').value = '';
        document.getElementById('sec-totp-verify').focus();
    });

    document.getElementById('btn-cancel-totp').addEventListener('click', () => {
        document.getElementById('totp-setup-area').style.display = 'none';
        document.getElementById('btn-setup-totp').style.display  = '';
        pendingSecret = null;
    });

    document.getElementById('btn-confirm-totp').addEventListener('click', async () => {
        const code = document.getElementById('sec-totp-verify').value.replace(/\D/g, '');
        if (code.length !== 6) { secAlert('sec-totp-alert', 'Insira o codigo de 6 digitos do app.'); return; }
        if (!pendingSecret)    { secAlert('sec-totp-alert', 'Gere um QR code primeiro.'); return; }

        const totp  = new OTPAuth.TOTP({ secret: pendingSecret, algorithm: 'SHA1', digits: 6, period: 30 });
        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
            secAlert('sec-totp-alert', 'Codigo invalido. Verifique o app e tente novamente.');
            return;
        }

        try {
            await setDoc(doc(db, 'settings', 'adminConfig'),
                { totpSecret: pendingSecret.base32 }, { merge: true });
            document.getElementById('totp-setup-area').style.display = 'none';
            document.getElementById('btn-setup-totp').style.display  = '';
            document.getElementById('btn-setup-totp').innerHTML = '<i class="bi bi-qr-code"></i> Reconfigurar autenticador';
            secAlert('sec-totp-status-alert', 'FortiToken configurado! Proximo login usara TOTP.', 'success');
            pendingSecret = null;
        } catch(err) {
            secAlert('sec-totp-alert', 'Erro ao salvar: ' + err.message);
        }
    });
}
