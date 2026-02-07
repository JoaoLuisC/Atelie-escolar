// Downloads - Verificar pagamento e exibir links de download
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';

// Verificar status do pedido
async function checkOrderStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order') || localStorage.getItem('lastOrderId');
  
  if (!orderId) {
    showNoOrderMessage();
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/verify-payment?orderId=${orderId}`);
    
    if (!response.ok) {
      throw new Error('Erro ao verificar pedido');
    }
    
    const data = await response.json();
    
    if (data.success) {
      displayOrderStatus(data.order);
      
      // Se pagamento aprovado, limpar carrinho
      if (data.order.paymentStatus === 'approved') {
        clearCart();
      }
    } else {
      throw new Error('Pedido não encontrado');
    }
    
  } catch (error) {
    console.error('Error checking order:', error);
    showErrorMessage();
  } finally {
    document.getElementById('loading').style.display = 'none';
  }
}

// Exibir status do pedido
function displayOrderStatus(order) {
  const orderStatusDiv = document.getElementById('orderStatus');
  orderStatusDiv.style.display = 'block';
  
  let statusHTML = '';
  
  // Status do pagamento
  if (order.paymentStatus === 'approved') {
    statusHTML = `
      <div class="alert alert-success text-center" role="alert">
        <i class="bi bi-check-circle-fill" style="font-size: 3rem;"></i>
        <h4 class="mt-3">Pagamento Aprovado!</h4>
        <p>Pedido: <strong>#${order.orderId}</strong></p>
        <p>Total: <strong>${formatPrice(order.totalAmount)}</strong></p>
      </div>
      
      <div class="card">
        <div class="card-header bg-primary text-white">
          <h5 class="mb-0"><i class="bi bi-download"></i> Seus Downloads</h5>
        </div>
        <div class="card-body">
          ${order.downloadTokens && order.downloadTokens.length > 0 
            ? order.downloadTokens.map(token => `
              <div class="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
                <div>
                  <h6 class="mb-1">${token.productName}</h6>
                  <small class="text-muted">Disponível por ${token.expiresIn}</small>
                </div>
                <a href="/api/download?token=${token.token}" class="btn btn-primary">
                  <i class="bi bi-download"></i> Baixar
                </a>
              </div>
            `).join('')
            : '<p class="text-center">Downloads em processamento... Recarregue a página em alguns instantes.</p>'
          }
        </div>
      </div>
      
      <div class="alert alert-info mt-3" role="alert">
        <i class="bi bi-info-circle"></i>
        <strong>Importante:</strong> Cada link pode ser usado apenas uma vez. Salve seus arquivos com segurança.
      </div>
    `;
  } else if (order.paymentStatus === 'pending') {
    statusHTML = `
      <div class="alert alert-warning text-center" role="alert">
        <i class="bi bi-clock-fill" style="font-size: 3rem;"></i>
        <h4 class="mt-3">Pagamento Pendente</h4>
        <p>Pedido: <strong>#${order.orderId}</strong></p>
        <p>Aguardando confirmação do pagamento...</p>
        <button class="btn btn-primary mt-3" onclick="location.reload();">
          <i class="bi bi-arrow-clockwise"></i> Atualizar Status
        </button>
      </div>
    `;
  } else if (order.paymentStatus === 'rejected' || order.status === 'failed') {
    statusHTML = `
      <div class="alert alert-danger text-center" role="alert">
        <i class="bi bi-x-circle-fill" style="font-size: 3rem;"></i>
        <h4 class="mt-3">Pagamento Recusado</h4>
        <p>Pedido: <strong>#${order.orderId}</strong></p>
        <p>O pagamento foi recusado. Tente novamente.</p>
        <a href="/products.html" class="btn btn-primary mt-3">
          <i class="bi bi-arrow-left"></i> Voltar para Produtos
        </a>
      </div>
    `;
  } else {
    statusHTML = `
      <div class="alert alert-info text-center" role="alert">
        <i class="bi bi-hourglass-split" style="font-size: 3rem;"></i>
        <h4 class="mt-3">Processando Pagamento</h4>
        <p>Pedido: <strong>#${order.orderId}</strong></p>
        <p>Status: <strong>${order.paymentStatus}</strong></p>
        <button class="btn btn-primary mt-3" onclick="location.reload();">
          <i class="bi bi-arrow-clockwise"></i> Atualizar
        </button>
      </div>
    `;
  }
  
  // Produtos do pedido
  statusHTML += `
    <div class="card mt-4">
      <div class="card-header">
        <h6 class="mb-0">Produtos do Pedido</h6>
      </div>
      <div class="card-body">
        ${order.items.map(item => `
          <div class="d-flex justify-content-between mb-2">
            <span>${item.title} x${item.quantity}</span>
            <strong>${formatPrice(item.price * item.quantity)}</strong>
          </div>
        `).join('')}
        <hr>
        <div class="d-flex justify-content-between">
          <strong>Total:</strong>
          <strong class="text-primary">${formatPrice(order.totalAmount)}</strong>
        </div>
      </div>
    </div>
  `;
  
  orderStatusDiv.innerHTML = statusHTML;
}

// Mostrar mensagem de nenhum pedido
function showNoOrderMessage() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('orderStatus').innerHTML = `
    <div class="alert alert-warning text-center" role="alert">
      <i class="bi bi-exclamation-triangle" style="font-size: 3rem;"></i>
      <h4 class="mt-3">Nenhum pedido encontrado</h4>
      <p>Você ainda não realizou nenhuma compra.</p>
      <a href="/products.html" class="btn btn-primary mt-3">
        <i class="bi bi-arrow-left"></i> Ver Produtos
      </a>
    </div>
  `;
  document.getElementById('orderStatus').style.display = 'block';
}

// Mostrar mensagem de erro
function showErrorMessage() {
  document.getElementById('orderStatus').innerHTML = `
    <div class="alert alert-danger text-center" role="alert">
      <i class="bi bi-x-circle" style="font-size: 3rem;"></i>
      <h4 class="mt-3">Erro ao verificar pedido</h4>
      <p>Não foi possível verificar o status do seu pedido. Tente novamente.</p>
      <button class="btn btn-primary mt-3" onclick="location.reload();">
        <i class="bi bi-arrow-clockwise"></i> Tentar Novamente
      </button>
    </div>
  `;
  document.getElementById('orderStatus').style.display = 'block';
}

// Inicializar página de downloads
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  checkOrderStatus();
});
