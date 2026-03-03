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
let editingProductId  = null;
let editingCategoryId = null;
let deleteTarget      = null; // { type: 'product'|'category', id, name }

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
    dashboard: 'Dashboard',
    produtos:  'Produtos',
    categorias:'Categorias',
    usuarios:  'Usu\u00e1rios',
    vitrine:   'Vitrine da P\u00e1gina Inicial',
    seguranca: 'Seguran\u00e7a',
};
document.querySelectorAll('.adm-nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.adm-nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const tab = item.dataset.tab;
        document.getElementById(`tab-${tab}`)?.classList.add('active');
        const titleEl = document.getElementById('adm-page-title');
        if (titleEl) titleEl.textContent = PAGE_TITLES[tab] || tab;
        if (tab === 'dashboard') loadDashboard();
        if (tab === 'usuarios')  loadUsers();
        if (tab === 'vitrine')   loadVitrine();
        if (tab === 'seguranca') loadSeguranca();
        closeSidebar();
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
                    <div class="prod-list-name">${product.name}</div>
                    <div class="prod-list-desc">${product.description || '—'}</div>
                    <div class="prod-list-meta">
                        <span class="prod-list-cat">${product.category || '—'}</span>
                        ${imgCount > 1 ? `<span class="prod-list-chip">🖼️ ${imgCount}</span>` : ''}
                        ${videoCount > 0 ? `<span class="prod-list-chip">🎬 ${videoCount}</span>` : ''}
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
    document.getElementById('product-active').checked = true;
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
    document.getElementById('product-active').checked = product.active;

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
    const tagsValue = formData.get('tags');
    const images = Array.from(imagesContainer.querySelectorAll('.product-image-url')).map(i => i.value.trim()).filter(Boolean);
    const videos = Array.from(videosContainer.querySelectorAll('.product-video-url')).map(i => i.value.trim()).filter(Boolean);

    const productData = {
        name: formData.get('name'),
        description: formData.get('description'),
        price: parseFloat(formData.get('price')),
        images,
        image: images[0] || '',
        videos,
        downloadUrl: formData.get('downloadUrl'),
        category: formData.get('category'),
        tags: tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(Boolean) : [],
        active: formData.get('active') === 'on',
        updatedAt: new Date().toISOString()
    };

    try {
        if (editingProductId) {
            await updateDoc(doc(db, 'products', editingProductId), productData);
            showToast('Produto atualizado!', 'success');
        } else {
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
        <div class="cat-admin-table">
            <div class="cat-table-header">
                <span>Categoria</span>
                <span>Cor</span>
                <span>Ordem</span>
                <span>Destaque</span>
                <span>Badge</span>
                <span>Ações</span>
            </div>
            ${categories.map(cat => `
            <div class="cat-table-row">
                <span class="cat-name-cell">
                    <span class="color-dot" style="background:${cat.color || '#9B5DE5'};display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:8px;"></span>
                    ${cat.name}
                </span>
                <span><span class="color-dot" style="background:${cat.color || '#9B5DE5'};"></span></span>
                <span>${cat.order ?? 0}</span>
                <span>${cat.featured ? '⭐ Sim' : '—'}</span>
                <span>${cat.badgeLabel || '—'}</span>
                <span class="cat-actions">
                    <button class="btn-edit" onclick="editCategory('${cat.id}')">✏️ Editar</button>
                    <button class="btn-delete" onclick="confirmDelete('category','${cat.id}','${cat.name.replace(/'/g,"\\'")}')">🗑️ Excluir</button>
                </span>
            </div>`).join('')}
        </div>`;
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
    if (usersLoaded) return;
    const container = document.getElementById('users-table-container');
    const countEl   = document.getElementById('users-count');
    container.innerHTML = '<div class="loading-state"><p>Carregando usuários…</p></div>';
    try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
        allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        usersLoaded = true;
        renderUsers(allUsers);
        countEl.textContent = `${allUsers.length} usuário${allUsers.length !== 1 ? 's' : ''}`;
    } catch (err) {
        // fallback: sem orderBy
        try {
            const snap2 = await getDocs(collection(db, 'users'));
            allUsers = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
            allUsers.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
            usersLoaded = true;
            renderUsers(allUsers);
            countEl.textContent = `${allUsers.length} usuário${allUsers.length !== 1 ? 's' : ''}`;
        } catch (err2) {
            container.innerHTML = `<div class="empty-state"><h3>Erro ao carregar usuários</h3><p>${err2.message}</p></div>`;
        }
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
                return `<tr>
                    <td><div class="user-name-cell">${avatar}<span>${u.name || '—'}</span></div></td>
                    <td style="font-size:13px;">${u.email}</td>
                    <td>${provider}</td>
                    <td><span class="purchases-badge">${u.purchases ?? 0}</span></td>
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
    const filtered = q
        ? allUsers.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q))
        : allUsers;
    renderUsers(filtered);
    countEl.textContent = `${filtered.length} usuário${filtered.length !== 1 ? 's' : ''}${q ? ' (filtrado)' : ''}`;
});

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
        const recentOrders = [...allOrders].sort((a, b) => getDate(b) - getDate(a)).slice(0, 20);

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

        /* ── Tabela pedidos ── */
        dashRenderOrdersTable(recentOrders);

        /* ── Badge download ── */
        if (notDownloaded !== null) {
            const el = document.getElementById('kpi-not-dl-val');
            if (el) el.textContent = String(notDownloaded);
        }

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

    <!-- Tabela pedidos -->
    <div class="dash-card" style="margin-top:0;">
        <div class="dash-card-header">
            <h3><i class="bi bi-list-check" style="color:#415A77;margin-right:6px;"></i> &Uacute;ltimos Pedidos</h3>
            <span id="kpi-not-dl-val" class="dash-dl-badge" title="Pedidos aprovados sem download registrado" style="display:none;"></span>
        </div>
        <div style="overflow-x:auto;">
            <table class="orders-table" id="orders-table">
                <thead><tr>
                    <th>ID</th><th>Cliente</th><th>Data</th><th>Valor</th><th>Status</th>
                </tr></thead>
                <tbody id="orders-tbody"></tbody>
            </table>
        </div>
    </div>`;
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
