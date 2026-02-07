// Produtos - Carregar e exibir produtos
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';

// Carregar produtos da API
async function loadProducts() {
  const loading = document.getElementById('loading');
  const productsGrid = document.getElementById('productsGrid');
  const errorMessage = document.getElementById('errorMessage');

  try {
    const response = await fetch(`${API_BASE_URL}/products`);
    
    if (!response.ok) {
      throw new Error('Erro ao carregar produtos');
    }

    const data = await response.json();
    
    if (data.success && data.products.length > 0) {
      displayProducts(data.products);
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
  
  card.innerHTML = `
    <img 
      src="${product.image || 'https://via.placeholder.com/300x250?text=Banner'}" 
      alt="${product.name}" 
      class="product-image"
    >
    <div class="product-body">
      <div class="product-category">${product.category || 'Banner'}</div>
      <h3 class="product-title">${product.name}</h3>
      <p class="product-description">${product.description || ''}</p>
      <div class="product-footer">
        <div class="product-price">
          ${formatPrice(product.price)}
        </div>
        <button 
          class="btn-add-cart" 
          onclick="handleAddToCart('${product.id}')"
          data-product-id="${product.id}"
        >
          <i class="bi bi-cart-plus"></i> Adicionar
        </button>
      </div>
    </div>
  `;
  
  return card;
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
