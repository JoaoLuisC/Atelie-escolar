// Produtos - Carregar e exibir produtos
// Carregar produtos do Firestore
async function loadProducts() {
  const loading = document.getElementById('loading');
  const productsGrid = document.getElementById('productsGrid');
  const errorMessage = document.getElementById('errorMessage');

  try {
    // Aguardar Firebase carregar
    await waitForFirebase();
    
    const q = window.firebaseQuery(
      window.firebaseCollection(window.firebaseDb, 'products'),
      window.firebaseWhere('active', '==', true)
    );
    
    const querySnapshot = await window.firebaseGetDocs(q);
    const products = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      products.push({
        id: doc.id,
        name: data.name,
        description: data.description,
        price: data.price,
        image: data.image,
        category: data.category,
        tags: data.tags || [],
        createdAt: data.createdAt
      });
    });
    
    // Ordenar no client-side
    products.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });
    
    if (products.length > 0) {
      displayProducts(products);
      loading.style.display = 'none';
      productsGrid.style.display = 'grid';
    } else {
      throw new Error('Nenhum produto encontrado');
    }
    
  } catch (error) {
    console.error('Error loading products:', error);
    loading.style.display = 'none';
    errorMessage.style.display = 'block';
  }
}

// Aguardar Firebase carregar
function waitForFirebase() {
  return new Promise((resolve) => {
    if (window.firebaseDb) {
      resolve();
    } else {
      const interval = setInterval(() => {
        if (window.firebaseDb) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    }
  });
}

// Exibir produtos na grid
function displayProducts(products) {
  const productsGrid = document.getElementById('productsGrid');
  productsGrid.innerHTML = '';

  products.forEach(product => {
    const productCard = createProductCard(product);
    productsGrid.appendChild(productCard);
  });
}

// Criar card de produto
function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  
  // Verificar se há múltiplas imagens ou vídeos
  const images = product.images || [product.image];
  const videos = product.videos || [];
  const hasMultipleMedia = images.length > 1 || videos.length > 0;
  
  let mediaHTML = '';
  
  if (hasMultipleMedia) {
    // Criar carrossel
    const carouselId = `carousel-${product.id}`;
    const allMedia = [...images.map(img => ({ type: 'image', url: img })), ...videos.map(vid => ({ type: 'video', url: vid }))];
    
    mediaHTML = `
      <div id="${carouselId}" class="carousel slide" data-bs-ride="carousel">
        <div class="carousel-indicators">
          ${allMedia.map((_, index) => `
            <button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${index}" 
              ${index === 0 ? 'class="active" aria-current="true"' : ''} 
              aria-label="Slide ${index + 1}"></button>
          `).join('')}
        </div>
        <div class="carousel-inner">
          ${allMedia.map((media, index) => `
            <div class="carousel-item ${index === 0 ? 'active' : ''}">
              ${media.type === 'image' ? 
                `<img src="${media.url}" class="d-block w-100 product-image" alt="${product.name}" style="height: 250px; object-fit: cover;">` :
                `<div class="ratio ratio-16x9" style="height: 250px;">
                  <iframe src="${getEmbedUrl(media.url)}" title="Vídeo" allowfullscreen></iframe>
                </div>`
              }
            </div>
          `).join('')}
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
  } else {
    // Imagem única
    mediaHTML = `
      <img 
        src="${images[0] || 'https://via.placeholder.com/300x250?text=Banner'}" 
        alt="${product.name}" 
        class="product-image"
      >
    `;
  }
  
  card.innerHTML = `
    <div class="product-clickable" onclick="window.location.href='/product-details.html?id=${product.id}'" style="cursor: pointer;">
      ${mediaHTML}
      <div class="product-body">
        <div class="product-category">${product.category || 'Banner'}</div>
        <h3 class="product-title">${product.name}</h3>
        <p class="product-description">${product.description || ''}</p>
        <div class="product-price">
          ${formatPrice(product.price)}
        </div>
      </div>
    </div>
    <div class="product-footer" style="padding: 15px;">
      <button 
        class="btn-add-cart" 
        onclick="event.stopPropagation(); handleAddToCart('${product.id}')"
        data-product-id="${product.id}"
        style="width: 100%;"
      >
        <i class="bi bi-cart-plus"></i> Adicionar ao Carrinho
      </button>
      <a href="/product-details.html?id=${product.id}" class="btn-view-details" style="display: block; text-align: center; margin-top: 10px; color: var(--primary); text-decoration: none; font-size: 14px;">
        Ver Detalhes <i class="bi bi-arrow-right"></i>
      </a>
    </div>
  `;
  
  // Prevenir que cliques no carousel acionem o link do produto
  card.querySelectorAll('.carousel-control-prev, .carousel-control-next, .carousel-indicators button').forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
  });
  
  return card;
}

// Converter URLs de vídeo para embed
function getEmbedUrl(url) {
  // YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = url.includes('youtu.be') 
      ? url.split('/').pop().split('?')[0]
      : new URLSearchParams(new URL(url).search).get('v');
    return `https://www.youtube.com/embed/${videoId}`;
  }
  
  // Vimeo
  if (url.includes('vimeo.com')) {
    const videoId = url.split('/').pop();
    return `https://player.vimeo.com/video/${videoId}`;
  }
  
  // URL direta
  return url;
}

// Handler para adicionar ao carrinho
function handleAddToCart(productId) {
  // Buscar dados do produto
  const productCard = document.querySelector(`[data-product-id="${productId}"]`).closest('.product-card');
  const product = {
    id: productId,
    name: productCard.querySelector('.product-title').textContent,
    price: parseFloat(productCard.querySelector('.product-price').textContent.replace(/[^\d,]/g, '').replace(',', '.')),
    image: productCard.querySelector('.product-image').src,
  };
  
  addToCart(product);
}

// Inicializar página de produtos
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  loadProducts();
});
