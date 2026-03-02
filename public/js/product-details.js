import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk",
    authDomain: "atelie-da-escola.firebaseapp.com",
    projectId: "atelie-da-escola",
    storageBucket: "atelie-da-escola.firebasestorage.app",
    messagingSenderId: "420111430525",
    appId: "1:420111430525:web:f6bc509fd6a3e2cb835d62"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Get product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

// DOM elements
const loading = document.getElementById('loading');
const productSection = document.getElementById('productSection');
const notFoundSection = document.getElementById('notFoundSection');
const mediaGallery = document.getElementById('mediaGallery');
const productCategory = document.getElementById('productCategory');
const productTitle = document.getElementById('productTitle');
const productPrice = document.getElementById('productPrice');
const productDescription = document.getElementById('productDescription');
const productTags = document.getElementById('productTags');
const tagsList = document.getElementById('tagsList');
const breadcrumbProduct = document.getElementById('breadcrumbProduct');
const pageTitle = document.getElementById('pageTitle');
const btnAddToCart = document.getElementById('btnAddToCart');

// Load product details
async function loadProductDetails() {
    if (!productId) {
        showNotFound();
        return;
    }

    try {
        const productRef = doc(db, 'products', productId);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists() || !productSnap.data().active) {
            showNotFound();
            return;
        }

        const product = { id: productSnap.id, ...productSnap.data() };
        displayProduct(product);
    } catch (error) {
        console.error('Erro ao carregar produto:', error);
        showNotFound();
    }
}

// Display product
function displayProduct(product) {
    // Update page title and breadcrumb
    pageTitle.textContent = `${product.name} - Ateliê da Escola`;
    breadcrumbProduct.textContent = product.name;

    // Update product info
    productCategory.textContent = product.category || 'PRODUTO';
    productTitle.textContent = product.name;
    productPrice.textContent = `R$ ${formatPrice(product.price)}`;
    productDescription.textContent = product.description || 'Sem descrição disponível.';

    // Tags
    if (product.tags && Array.isArray(product.tags) && product.tags.length > 0) {
        productTags.style.display = 'flex';
        tagsList.textContent = product.tags.join(', ');
    } else {
        productTags.style.display = 'none';
    }

    // Media gallery
    createMediaGallery(product);

    // Add to cart button
    btnAddToCart.onclick = () => addToCart(product);

    // Show product section
    loading.style.display = 'none';
    productSection.style.display = 'block';
}

// Create media gallery with carousel
function createMediaGallery(product) {
    const images = Array.isArray(product.images) && product.images.length > 0 
        ? product.images 
        : (product.image ? [product.image] : ['https://via.placeholder.com/800x500/667eea/ffffff?text=Sem+Imagem']);

    const videos = Array.isArray(product.videos) ? product.videos : [];
    const allMedia = [...images.map(img => ({ type: 'image', url: img })), ...videos.map(vid => ({ type: 'video', url: vid }))];

    if (allMedia.length === 1 && allMedia[0].type === 'image') {
        // Single image - no carousel needed
        mediaGallery.innerHTML = `
            <img src="${allMedia[0].url}" alt="${product.name}" 
                 style="width: 100%; height: 500px; object-fit: cover; border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);"
                 onerror="this.src='https://via.placeholder.com/800x500/667eea/ffffff?text=Erro+ao+Carregar+Imagem'">
        `;
    } else {
        // Multiple media - create carousel
        const carouselId = `carousel-${product.id}`;
        const indicators = allMedia.map((_, index) => 
            `<button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${index}" ${index === 0 ? 'class="active" aria-current="true"' : ''} aria-label="Slide ${index + 1}"></button>`
        ).join('');

        const slides = allMedia.map((media, index) => {
            const mediaContent = media.type === 'image'
                ? `<img src="${media.url}" class="d-block w-100" alt="${product.name}" onerror="this.src='https://via.placeholder.com/800x500/667eea/ffffff?text=Erro+ao+Carregar+Imagem'">`
                : `<iframe src="${getEmbedUrl(media.url)}" allowfullscreen></iframe>`;

            return `
                <div class="carousel-item ${index === 0 ? 'active' : ''}">
                    ${mediaContent}
                </div>
            `;
        }).join('');

        mediaGallery.innerHTML = `
            <div id="${carouselId}" class="carousel slide" data-bs-ride="carousel">
                <div class="carousel-indicators">
                    ${indicators}
                </div>
                <div class="carousel-inner">
                    ${slides}
                </div>
                ${allMedia.length > 1 ? `
                    <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev">
                        <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                        <span class="visually-hidden">Anterior</span>
                    </button>
                    <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next">
                        <span class="carousel-control-next-icon" aria-hidden="true"></span>
                        <span class="visually-hidden">Próximo</span>
                    </button>
                ` : ''}
            </div>
        `;
    }
}

// Convert video URL to embed format
function getEmbedUrl(url) {
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = url.includes('youtu.be') 
            ? url.split('youtu.be/')[1]?.split('?')[0]
            : url.split('v=')[1]?.split('&')[0];
        return `https://www.youtube.com/embed/${videoId}`;
    }
    
    // Vimeo
    if (url.includes('vimeo.com')) {
        const videoId = url.split('vimeo.com/')[1]?.split('?')[0];
        return `https://player.vimeo.com/video/${videoId}`;
    }
    
    return url;
}

// Format price
function formatPrice(price) {
    return parseFloat(price).toFixed(2).replace('.', ',');
}

// Add to cart function
function addToCart(product) {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : product.image,
            quantity: 1
        });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    
    // Show feedback
    showAddToCartFeedback();
}

// Update cart count
function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    const cartBadge = document.getElementById('cartCount');
    if (cartBadge) {
        cartBadge.textContent = count;
    }
}

// Show add to cart feedback
function showAddToCartFeedback() {
    const originalText = btnAddToCart.innerHTML;
    btnAddToCart.innerHTML = '<i class="bi bi-check-circle"></i> Adicionado!';
    btnAddToCart.style.background = '#28a745';
    btnAddToCart.disabled = true;

    setTimeout(() => {
        btnAddToCart.innerHTML = originalText;
        btnAddToCart.style.background = '';
        btnAddToCart.disabled = false;
    }, 2000);
}

// Show not found
function showNotFound() {
    loading.style.display = 'none';
    notFoundSection.style.display = 'block';
}

// Initialize
loadProductDetails();
updateCartCount();
