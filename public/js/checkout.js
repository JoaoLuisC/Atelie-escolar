// Checkout - Processar pagamento
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';

// Exibir itens do carrinho
function displayCartItems() {
  const cart = getCart();
  const cartItemsContainer = document.getElementById('cartItems');
  
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="text-center p-5">
        <i class="bi bi-cart-x" style="font-size: 3rem; color: var(--gray);"></i>
        <p class="mt-3">Seu carrinho está vazio</p>
        <a href="/products.html" class="btn btn-primary">Ver Produtos</a>
      </div>
    `;
    document.getElementById('checkoutBtn').disabled = true;
    return;
  }
  
  cartItemsContainer.innerHTML = cart.map(item => `
    <div class="row mb-3 pb-3 border-bottom align-items-center">
      <div class="col-md-2">
        <img src="${item.image}" alt="${item.name}" class="img-fluid rounded">
      </div>
      <div class="col-md-5">
        <h6 class="mb-0">${item.name}</h6>
      </div>
      <div class="col-md-2 text-center">
        <div class="input-group input-group-sm">
          <button class="btn btn-outline-secondary" onclick="updateCartQuantity('${item.id}', ${item.quantity - 1})">
            <i class="bi bi-dash"></i>
          </button>
          <input type="text" class="form-control text-center" value="${item.quantity}" readonly style="max-width: 50px;">
          <button class="btn btn-outline-secondary" onclick="updateCartQuantity('${item.id}', ${item.quantity + 1})">
            <i class="bi bi-plus"></i>
          </button>
        </div>
      </div>
      <div class="col-md-2 text-end">
        <strong>${formatPrice(item.price * item.quantity)}</strong>
      </div>
      <div class="col-md-1 text-end">
        <button class="btn btn-sm btn-outline-danger" onclick="removeFromCart('${item.id}'); location.reload();">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
  
  updateOrderSummary();
}

// Atualizar resumo do pedido
function updateOrderSummary() {
  const total = getCartTotal();
  document.getElementById('subtotal').textContent = formatPrice(total);
  document.getElementById('total').textContent = formatPrice(total);
}

// Processar checkout
async function processCheckout(e) {
  e.preventDefault();
  
  const cart = getCart();
  
  if (cart.length === 0) {
    showNotification('Carrinho vazio!', 'warning');
    return;
  }
  
  const customerName = document.getElementById('customerName').value;
  const customerEmail = document.getElementById('customerEmail').value;
  
  const checkoutBtn = document.getElementById('checkoutBtn');
  const originalBtnText = checkoutBtn.innerHTML;
  
  try {
    // Desabilitar botão
    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Processando...';
    
    // Preparar dados do pedido
    const items = cart.map(item => ({
      productId: item.id,
      quantity: item.quantity || 1
    }));
    
    const customer = {
      name: customerName,
      email: customerEmail
    };
    
    // Criar preferência de pagamento
    const response = await fetch(`${API_BASE_URL}/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items, customer })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao criar pagamento');
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Salvar orderId no localStorage para usar na página de downloads
      localStorage.setItem('lastOrderId', data.orderId);
      
      // Redirecionar para Mercado Pago
      window.location.href = data.initPoint;
    } else {
      throw new Error('Erro ao criar preferência de pagamento');
    }
    
  } catch (error) {
    console.error('Checkout error:', error);
    showNotification(error.message || 'Erro ao processar pagamento', 'danger');
    
    // Reabilitar botão
    checkoutBtn.disabled = false;
    checkoutBtn.innerHTML = originalBtnText;
  }
}

// Inicializar página de checkout
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  displayCartItems();
  
  // Form submit
  document.getElementById('customerForm').addEventListener('submit', processCheckout);
});
