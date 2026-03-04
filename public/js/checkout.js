// Checkout - Finalizar Compra
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

// ─── helpers ──────────────────────────────────────────────────────────────
function fmtPrice(n) {
    return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
}

function gdrive(url) {
    if (!url) return '';
    const m = url.match(/(?:\/d\/|id=)([\w-]{10,})/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200` : url;
}

// ─── render cart items ─────────────────────────────────────────────────────
function renderCart() {
    const cart = getCart();
    const wrap = document.getElementById('ck-items-wrap');
    const payBtn = document.getElementById('ck-pay-btn');
    const sumRows = document.getElementById('ck-summary-rows');
    const totalEl = document.getElementById('ck-total');

    if (!wrap) return;

    if (!cart || cart.length === 0) {
        wrap.innerHTML = `
          <div class="ck-empty">
            <i class="bi bi-cart-x"></i>
            <p style="font-weight:600;margin-bottom:8px;">Seu carrinho está vazio</p>
            <a href="/products.html" style="color:var(--primary-color);text-decoration:none;font-weight:700;">
              <i class="bi bi-arrow-left"></i> Ver Produtos
            </a>
          </div>`;
        if (sumRows) sumRows.innerHTML = '';
        if (totalEl) totalEl.textContent = 'R$ 0,00';
        if (payBtn) payBtn.disabled = true;
        return;
    }

    wrap.innerHTML = cart.map(item => {
        const qty = item.quantity || 1;
        const subtotal = (item.price || 0) * qty;
        let imgHtml;
        const imgSrc = item.image ? gdrive(item.image) : '';
        if (imgSrc) {
            imgHtml = `<img src="${imgSrc}" alt="${item.name}" class="ck-item-img"
                           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                       <div class="ck-item-ph" style="display:none">🛍️</div>`;
        } else {
            imgHtml = `<div class="ck-item-ph">🛍️</div>`;
        }
        return `
          <div class="ck-item">
            ${imgHtml}
            <div class="ck-item-info">
              <div class="ck-item-name">${item.name || 'Produto'}</div>
              <div class="ck-item-price">${fmtPrice(item.price)} × ${qty}</div>
            </div>
            <div class="ck-qty">
              <button class="ck-qty-btn" onclick="ckQty('${item.id}',-1)"><i class="bi bi-dash"></i></button>
              <div class="ck-qty-val">${qty}</div>
              <button class="ck-qty-btn" onclick="ckQty('${item.id}',1)"><i class="bi bi-plus"></i></button>
            </div>
            <div class="ck-item-subtotal">${fmtPrice(subtotal)}</div>
            <button class="ck-item-del" title="Remover" onclick="ckRemove('${item.id}')">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>`;
    }).join('');

    // summary
    const total = getCartTotal();
    if (sumRows) {
        sumRows.innerHTML = cart.map(item =>
            `<div class="ck-sum-row">
               <span>${item.name}</span>
               <span>${fmtPrice((item.price || 0) * (item.quantity || 1))}</span>
             </div>`
        ).join('');
    }
    if (totalEl) totalEl.textContent = fmtPrice(total);
    if (payBtn) payBtn.disabled = false;
}

// ─── qty / remove ──────────────────────────────────────────────────────────
window.ckQty = function (id, delta) {
    const cart = getCart();
    const item = cart.find(i => i.id === id);
    if (!item) return;
    const newQty = (item.quantity || 1) + delta;
    if (newQty <= 0) {
        removeFromCart(id);
    } else {
        updateCartQuantity(id, newQty);
    }
    renderCart();
};

window.ckRemove = function (id) {
    removeFromCart(id);
    renderCart();
};

// ─── auth state ───────────────────────────────────────────────────────────
let _currentUser = null;

function setAuthNotice(user) {
    const el = document.getElementById('ck-auth-notice');
    const hint = document.getElementById('ck-guest-hint');
    if (!el) return;
    if (user) {
        el.innerHTML = `
          <div class="ck-notice ok">
            <i class="bi bi-check-circle-fill" style="font-size:15px;flex-shrink:0;margin-top:1px;"></i>
            <div>Logado como <strong>${user.email}</strong></div>
          </div>`;
        const nameEl = document.getElementById('ck-name');
        const emailEl = document.getElementById('ck-email');
        if (nameEl && !nameEl.value) nameEl.value = user.displayName || '';
        if (emailEl) { emailEl.value = user.email || ''; emailEl.disabled = true; }
        if (hint) hint.style.display = 'none';
    } else {
        el.innerHTML = `
          <div class="ck-notice info">
            <i class="bi bi-info-circle-fill" style="font-size:15px;flex-shrink:0;margin-top:1px;"></i>
            <div>Sem conta? Não tem problema! Criamos uma para você acessar seus downloads.</div>
          </div>`;
        if (hint) hint.style.display = 'block';
    }
}

// ─── init Firebase auth listener ──────────────────────────────────────────
function initAuth() {
    if (typeof firebase === 'undefined') return;
    firebase.auth().onAuthStateChanged(user => {
        _currentUser = user;
        setAuthNotice(user);
    });
}

// ─── form submit ──────────────────────────────────────────────────────────
async function handleSubmit(e) {
    e.preventDefault();

    const cart = getCart();
    if (!cart || cart.length === 0) {
        alert('Seu carrinho está vazio.');
        return;
    }

    const name = (document.getElementById('ck-name').value || '').trim();
    const email = (document.getElementById('ck-email').value || '').trim();

    if (!name) { document.getElementById('ck-name').focus(); return; }
    if (!email || !email.includes('@')) { document.getElementById('ck-email').focus(); return; }

    const btn = document.getElementById('ck-pay-btn');
    const label = document.getElementById('ck-pay-label');
    btn.disabled = true;
    if (label) label.textContent = 'Processando…';

    try {
        // Guest: create Firebase account automatically
        if (!_currentUser && typeof firebase !== 'undefined') {
            try {
                const cred = await firebase.auth().createUserWithEmailAndPassword(email, 'Atelie@' + Math.random().toString(36).slice(2, 8));
                await cred.user.updateProfile({ displayName: name });
                _currentUser = cred.user;
            } catch (authErr) {
                if (authErr.code === 'auth/email-already-in-use') {
                    // silently continue — user already has account, let them log in later
                } else {
                    console.warn('Auth warning:', authErr.message);
                }
            }
        }

        // Build payload
        const items = cart.map(i => ({ productId: i.id, quantity: i.quantity || 1 }));
        const customer = { name, email };

        const response = await fetch(`${API_BASE_URL}/create-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, customer })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Erro ao criar pagamento');
        }

        localStorage.setItem('lastOrderId', data.orderId || '');

        const dest = data.initPoint || data.sandboxInitPoint;
        if (!dest) throw new Error('URL de pagamento não retornada');
        window.open(dest, '_blank');

    } catch (err) {
        console.error('Checkout error:', err);
        alert(err.message || 'Erro ao processar pagamento. Tente novamente.');
        btn.disabled = false;
        if (label) label.textContent = 'Ir para Pagamento';
    }
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    renderCart();
    initAuth();

    const form = document.getElementById('ck-form');
    if (form) form.addEventListener('submit', handleSubmit);
});
