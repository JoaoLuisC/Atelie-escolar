// Gerenciamento do carrinho de compras
const CART_KEY = 'cart';

// Obter carrinho do localStorage
function getCart() {
  try {
    const cart = localStorage.getItem(CART_KEY);
    return cart ? JSON.parse(cart) : [];
  } catch (error) {
    console.error('Error reading cart:', error);
    return [];
  }
}

// Salvar carrinho no localStorage
function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  } catch (error) {
    console.error('Error saving cart:', error);
  }
}

// Adicionar produto ao carrinho
function addToCart(product) {
  const cart = getCart();
  
  // Verificar se produto já está no carrinho (produto digital = 1 unidade apenas)
  const existingIndex = cart.findIndex(item => item.id === product.id);
  
  if (existingIndex >= 0) {
    showNotification('Este produto já está no seu carrinho!', 'info');
    return;
  }

  // Adicionar novo produto com quantidade fixa 1
  cart.push({
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    quantity: 1
  });
  
  saveCart(cart);
  
  // Feedback visual
  showNotification('Produto adicionado ao carrinho!', 'success');
}

// Remover produto do carrinho
function removeFromCart(productId) {
  let cart = getCart();
  cart = cart.filter(item => item.id !== productId);
  saveCart(cart);
}

// Atualizar quantidade de produto
function updateCartQuantity(productId, quantity) {
  const cart = getCart();
  const item = cart.find(item => item.id === productId);
  
  if (item) {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      item.quantity = quantity;
      saveCart(cart);
    }
  }
}

// Limpar carrinho
function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartCount();
}

// Atualizar contador do carrinho no navbar
function updateCartCount() {
  const cart = getCart();
  const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  
  const cartBadge = document.getElementById('cartCount');
  if (cartBadge) {
    cartBadge.textContent = totalItems;
    cartBadge.style.display = totalItems > 0 ? 'flex' : 'none';
  }
}

// Calcular total do carrinho
function getCartTotal() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
}

// Mostrar notificação
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3`;
  notification.style.zIndex = '9999';
  notification.innerHTML = `
    <i class="bi bi-check-circle-fill me-2"></i>
    ${message}
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Formatar preço em BRL
function formatPrice(price) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(price);
}
