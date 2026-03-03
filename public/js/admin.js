// Admin Panel JavaScript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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
   ABAS
═══════════════════════════════════════ */
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userEmailEl.textContent = user.email;
        loadProducts();
        loadCategories();
    } else {
        window.location.href = 'admin-login.html';
    }
});

btnLogout.addEventListener('click', async () => {
    try { await signOut(auth); window.location.href = 'admin-login.html'; }
    catch (e) { showToast('Erro ao sair', 'error'); }
});

/* ═══════════════════════════════════════
   PRODUTOS
═══════════════════════════════════════ */
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
    if (products.length === 0) {
        productsGrid.innerHTML = `<div class="empty-state"><h3>Nenhum produto cadastrado</h3><p>Clique em "Adicionar Novo Produto" para começar</p></div>`;
        return;
    }
    productsGrid.innerHTML = products.map(product => {
        const NO_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3Crect fill='%23667eea' width='300' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='14' font-family='sans-serif'%3ESem Imagem%3C/text%3E%3C/svg%3E`;
        const imageUrl = Array.isArray(product.images) && product.images.length > 0
            ? product.images[0]
            : (product.image || NO_IMG);
        const imageCount = Array.isArray(product.images) ? product.images.length : (product.image ? 1 : 0);
        const videoCount = Array.isArray(product.videos) ? product.videos.length : 0;
        return `
        <div class="product-card" data-id="${product.id}">
            <div style="position:relative;">
                <img src="${imageUrl}" alt="${product.name}" class="product-image"
                     onerror="this.onerror=null;this.src='${NO_IMG}'">
                ${imageCount > 1 || videoCount > 0 ? `
                <div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.7);color:#fff;padding:5px 10px;border-radius:5px;font-size:12px;">
                    ${imageCount > 1 ? `🖼️ ${imageCount}` : ''} ${videoCount > 0 ? `🎬 ${videoCount}` : ''}
                </div>` : ''}
            </div>
            <div class="product-info">
                <div class="product-header">
                    <h3 class="product-name">${product.name}</h3>
                    <span class="product-status ${product.active ? 'active' : 'inactive'}">${product.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <p class="product-price">R$ ${formatPrice(product.price)}</p>
                <p class="product-description">${product.description}</p>
                <div class="product-meta">
                    <div>Categoria: ${product.category || '—'}</div>
                    ${product.tags ? `<div>Tags: ${Array.isArray(product.tags) ? product.tags.join(', ') : product.tags}</div>` : ''}
                </div>
                <div class="product-actions">
                    <button class="btn-edit" onclick="editProduct('${product.id}')">✏️ Editar</button>
                    <button class="btn-delete" onclick="confirmDelete('product','${product.id}','${product.name.replace(/'/g,"\\'")}')">🗑️ Excluir</button>
                </div>
            </div>
        </div>`;
    }).join('');
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
    document.getElementById('product-tags').value = Array.isArray(product.tags) ? product.tags.join(', ') : product.tags || '';
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
productModal.addEventListener('click', e => { if (e.target === productModal) closeProductModal(); });

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
categoryModal.addEventListener('click', e => { if (e.target === categoryModal) closeCategoryModal(); });

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
