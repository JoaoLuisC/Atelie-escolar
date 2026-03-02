// Admin Panel JavaScript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc,
    query
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk",
    authDomain: "atelie-da-escola.firebaseapp.com",
    projectId: "atelie-da-escola",
    storageBucket: "atelie-da-escola.firebasestorage.app",
    messagingSenderId: "325690647064",
    appId: "1:325690647064:web:e1c3b4bfaaf921ab7cd96d"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado
let currentUser = null;
let products = [];
let editingProductId = null;

// Elementos do DOM
const userEmailEl = document.getElementById('user-email');
const btnLogout = document.getElementById('btn-logout');
const btnAddProduct = document.getElementById('btn-add-product');
const productsGrid = document.getElementById('products-grid');
const productModal = document.getElementById('product-modal');
const deleteModal = document.getElementById('delete-modal');
const productForm = document.getElementById('product-form');
const modalClose = document.getElementById('modal-close');
const btnCancel = document.getElementById('btn-cancel');
const modalTitle = document.getElementById('modal-title');
const deleteModalClose = document.getElementById('delete-modal-close');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const deleteProductName = document.getElementById('delete-product-name');
const toast = document.getElementById('toast');
const btnAddImage = document.getElementById('btn-add-image');
const btnAddVideo = document.getElementById('btn-add-video');
const imagesContainer = document.getElementById('images-container');
const videosContainer = document.getElementById('videos-container');

// Gerenciar múltiplas imagens
btnAddImage.addEventListener('click', () => {
    const imageGroup = document.createElement('div');
    imageGroup.className = 'image-input-group';
    imageGroup.innerHTML = `
        <input 
            type="url" 
            class="product-image-url" 
            placeholder="https://... (Imagem ${imagesContainer.children.length + 1})"
        >
        <button type="button" class="btn-remove-image">❌</button>
    `;
    imagesContainer.appendChild(imageGroup);
    
    imageGroup.querySelector('.btn-remove-image').addEventListener('click', () => {
        imageGroup.remove();
        updateImagePlaceholders();
    });
});

// Gerenciar múltiplos vídeos
btnAddVideo.addEventListener('click', () => {
    const videoGroup = document.createElement('div');
    videoGroup.className = 'video-input-group';
    videoGroup.innerHTML = `
        <input 
            type="url" 
            class="product-video-url" 
            placeholder="https://youtube.com/... ou https://vimeo.com/... (Vídeo ${videosContainer.children.length + 1})"
        >
        <button type="button" class="btn-remove-video">❌</button>
    `;
    videosContainer.appendChild(videoGroup);
    
    videoGroup.querySelector('.btn-remove-video').addEventListener('click', () => {
        videoGroup.remove();
        updateVideoPlaceholders();
    });
});

// Atualizar placeholders das imagens
function updateImagePlaceholders() {
    const inputs = imagesContainer.querySelectorAll('.product-image-url');
    inputs.forEach((input, index) => {
        input.placeholder = `https://... (Imagem ${index + 1})`;
    });
    
    const removeButtons = imagesContainer.querySelectorAll('.btn-remove-image');
    removeButtons.forEach((btn, index) => {
        btn.style.display = index === 0 && inputs.length === 1 ? 'none' : 'inline-block';
    });
}

// Atualizar placeholders dos vídeos
function updateVideoPlaceholders() {
    const inputs = videosContainer.querySelectorAll('.product-video-url');
    inputs.forEach((input, index) => {
        input.placeholder = `https://youtube.com/... ou https://vimeo.com/... (Vídeo ${index + 1})`;
    });
    
    const removeButtons = videosContainer.querySelectorAll('.btn-remove-video');
    removeButtons.forEach((btn, index) => {
        btn.style.display = index === 0 && inputs.length === 1 ? 'none' : 'inline-block';
    });
}

// Verificar autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userEmailEl.textContent = user.email;
        loadProducts();
    } else {
        // Redirecionar para login
        window.location.href = 'admin-login.html';
    }
});

// Logout
btnLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'admin-login.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        showToast('Erro ao sair', 'error');
    }
});

// Carregar produtos
async function loadProducts() {
    try {
        productsGrid.innerHTML = '<div class="loading-state"><p>Carregando produtos...</p></div>';
        
        const querySnapshot = await getDocs(collection(db, 'products'));
        
        products = [];
        querySnapshot.forEach((doc) => {
            products.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Ordenar no client-side
        products.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });

        renderProducts();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        productsGrid.innerHTML = `
            <div class="empty-state">
                <h3>Erro ao carregar produtos</h3>
                <p>${error.message}</p>
            </div>
        `;
        showToast('Erro ao carregar produtos', 'error');
    }
}

// Renderizar produtos
function renderProducts() {
    if (products.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state">
                <h3>Nenhum produto cadastrado</h3>
                <p>Clique em "Adicionar Novo Produto" para começar</p>
            </div>
        `;
        return;
    }

    productsGrid.innerHTML = products.map(product => {
        // Suporte para array de imagens ou campo image único (compatibilidade)
        const imageUrl = Array.isArray(product.images) && product.images.length > 0 
            ? product.images[0] 
            : (product.image || 'https://via.placeholder.com/300x200/667eea/ffffff?text=Sem+Imagem');
        
        const imageCount = Array.isArray(product.images) ? product.images.length : (product.image ? 1 : 0);
        const videoCount = Array.isArray(product.videos) ? product.videos.length : 0;
        
        return `
        <div class="product-card" data-id="${product.id}">
            <div style="position: relative;">
                <img src="${imageUrl}" alt="${product.name}" class="product-image" onerror="this.src='https://via.placeholder.com/300x200/667eea/ffffff?text=Sem+Imagem'">
                ${imageCount > 1 || videoCount > 0 ? `
                <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 5px 10px; border-radius: 5px; font-size: 12px;">
                    ${imageCount > 1 ? `🖼️ ${imageCount}` : ''} ${videoCount > 0 ? `🎬 ${videoCount}` : ''}
                </div>
                ` : ''}
            </div>
            <div class="product-info">
                <div class="product-header">
                    <h3 class="product-name">${product.name}</h3>
                    <span class="product-status ${product.active ? 'active' : 'inactive'}">
                        ${product.active ? 'Ativo' : 'Inativo'}
                    </span>
                </div>
                <p class="product-price">R$ ${formatPrice(product.price)}</p>
                <p class="product-description">${product.description}</p>
                <div class="product-meta">
                    <div>Categoria: ${product.category}</div>
                    ${product.tags ? `<div>Tags: ${Array.isArray(product.tags) ? product.tags.join(', ') : product.tags}</div>` : ''}
                </div>
                <div class="product-actions">
                    <button class="btn-edit" onclick="editProduct('${product.id}')">✏️ Editar</button>
                    <button class="btn-delete" onclick="confirmDeleteProduct('${product.id}')">🗑️ Excluir</button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// Formatar preço
function formatPrice(price) {
    return parseFloat(price).toFixed(2).replace('.', ',');
}

// Abrir modal de adicionar produto
btnAddProduct.addEventListener('click', () => {
    editingProductId = null;
    modalTitle.textContent = 'Adicionar Produto';
    productForm.reset();
    document.getElementById('product-active').checked = true;
    
    // Resetar imagens e vídeos
    imagesContainer.innerHTML = `
        <div class="image-input-group">
            <input 
                type="url" 
                class="product-image-url" 
                placeholder="https://... (Imagem 1)"
                required
            >
            <button type="button" class="btn-remove-image" style="display: none;">❌</button>
        </div>
    `;
    
    videosContainer.innerHTML = `
        <div class="video-input-group">
            <input 
                type="url" 
                class="product-video-url" 
                placeholder="https://youtube.com/... ou https://vimeo.com/..."
            >
            <button type="button" class="btn-remove-video" style="display: none;">❌</button>
        </div>
    `;
    
    productModal.classList.add('show');
});

// Editar produto
window.editProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    editingProductId = productId;
    modalTitle.textContent = 'Editar Produto';

    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-description').value = product.description;
    document.getElementById('product-category').value = product.category;
    document.getElementById('product-download').value = product.downloadUrl;
    document.getElementById('product-tags').value = Array.isArray(product.tags) ? product.tags.join(', ') : product.tags || '';
    document.getElementById('product-active').checked = product.active;

    // Carregar imagens
    const images = Array.isArray(product.images) ? product.images : [product.image];
    imagesContainer.innerHTML = '';
    images.forEach((imageUrl, index) => {
        if (imageUrl) {
            const imageGroup = document.createElement('div');
            imageGroup.className = 'image-input-group';
            imageGroup.innerHTML = `
                <input 
                    type="url" 
                    class="product-image-url" 
                    placeholder="https://... (Imagem ${index + 1})"
                    value="${imageUrl}"
                    ${index === 0 ? 'required' : ''}
                >
                <button type="button" class="btn-remove-image" style="display: ${index === 0 && images.length === 1 ? 'none' : 'inline-block'};">❌</button>
            `;
            imagesContainer.appendChild(imageGroup);
            
            imageGroup.querySelector('.btn-remove-image').addEventListener('click', () => {
                imageGroup.remove();
                updateImagePlaceholders();
            });
        }
    });
    
    // Carregar vídeos
    const videos = Array.isArray(product.videos) ? product.videos : [];
    videosContainer.innerHTML = '';
    if (videos.length > 0) {
        videos.forEach((videoUrl, index) => {
            if (videoUrl) {
                const videoGroup = document.createElement('div');
                videoGroup.className = 'video-input-group';
                videoGroup.innerHTML = `
                    <input 
                        type="url" 
                        class="product-video-url" 
                        placeholder="https://youtube.com/... (Vídeo ${index + 1})"
                        value="${videoUrl}"
                    >
                    <button type="button" class="btn-remove-video" style="display: ${index === 0 && videos.length === 1 ? 'none' : 'inline-block'};">❌</button>
                `;
                videosContainer.appendChild(videoGroup);
                
                videoGroup.querySelector('.btn-remove-video').addEventListener('click', () => {
                    videoGroup.remove();
                    updateVideoPlaceholders();
                });
            }
        });
    } else {
        videosContainer.innerHTML = `
            <div class="video-input-group">
                <input 
                    type="url" 
                    class="product-video-url" 
                    placeholder="https://youtube.com/... ou https://vimeo.com/..."
                >
                <button type="button" class="btn-remove-video" style="display: none;">❌</button>
            </div>
        `;
    }

    productModal.classList.add('show');
};

// Fechar modal
function closeModal() {
    productModal.classList.remove('show');
    productForm.reset();
    editingProductId = null;
}

modalClose.addEventListener('click', closeModal);
btnCancel.addEventListener('click', closeModal);

// Clicar fora do modal para fechar
productModal.addEventListener('click', (e) => {
    if (e.target === productModal) {
        closeModal();
    }
});

// Salvar produto (adicionar ou editar)
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(productForm);
    const tagsValue = formData.get('tags');
    
    // Coletar todas as imagens
    const imageInputs = imagesContainer.querySelectorAll('.product-image-url');
    const images = Array.from(imageInputs)
        .map(input => input.value.trim())
        .filter(url => url);
    
    // Coletar todos os vídeos
    const videoInputs = videosContainer.querySelectorAll('.product-video-url');
    const videos = Array.from(videoInputs)
        .map(input => input.value.trim())
        .filter(url => url);
    
    const productData = {
        name: formData.get('name'),
        description: formData.get('description'),
        price: parseFloat(formData.get('price')),
        images: images,
        image: images[0] || '', // Manter compatibilidade com código antigo
        videos: videos,
        downloadUrl: formData.get('downloadUrl'),
        category: formData.get('category'),
        tags: tagsValue ? tagsValue.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        active: formData.get('active') === 'on',
        updatedAt: new Date().toISOString()
    };

    try {
        if (editingProductId) {
            // Atualizar produto existente
            const productRef = doc(db, 'products', editingProductId);
            await updateDoc(productRef, productData);
            showToast('Produto atualizado com sucesso!', 'success');
        } else {
            // Adicionar novo produto
            productData.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'products'), productData);
            showToast('Produto adicionado com sucesso!', 'success');
        }

        closeModal();
        loadProducts();
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        showToast('Erro ao salvar produto: ' + error.message, 'error');
    }
});

// Confirmar exclusão
let productToDelete = null;

window.confirmDeleteProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    productToDelete = productId;
    deleteProductName.textContent = product.name;
    deleteModal.classList.add('show');
};

// Fechar modal de exclusão
function closeDeleteModal() {
    deleteModal.classList.remove('show');
    productToDelete = null;
}

deleteModalClose.addEventListener('click', closeDeleteModal);
btnCancelDelete.addEventListener('click', closeDeleteModal);

deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        closeDeleteModal();
    }
});

// Excluir produto
btnConfirmDelete.addEventListener('click', async () => {
    if (!productToDelete) return;

    try {
        await deleteDoc(doc(db, 'products', productToDelete));
        showToast('Produto excluído com sucesso!', 'success');
        closeDeleteModal();
        loadProducts();
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        showToast('Erro ao excluir produto: ' + error.message, 'error');
    }
});

// Mostrar notificação toast
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Exportar funções globais necessárias
window.editProduct = editProduct;
window.confirmDeleteProduct = confirmDeleteProduct;
