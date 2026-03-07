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
        const subtotal = item.price || 0;
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
              <div class="ck-item-price">${fmtPrice(item.price)}</div>
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
               <span>${fmtPrice(item.price || 0)}</span>
             </div>`
        ).join('');
    }
    if (totalEl) totalEl.textContent = fmtPrice(total);
    if (payBtn) payBtn.disabled = false;
}

// ─── remove ────────────────────────────────────────────────────────────────
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
    const nameWrap  = document.getElementById('ck-name')?.closest('.mb-3');
    const emailWrap = document.getElementById('ck-email')?.closest('.mb-1');

    if (user) {
        el.innerHTML = `
          <div class="ck-notice ok">
            <i class="bi bi-check-circle-fill" style="font-size:15px;flex-shrink:0;margin-top:1px;"></i>
            <div>Logado como <strong>${user.email}</strong></div>
          </div>`;
        // Preenche os valores ocultos para o submit continuar funcionando
        const nameEl  = document.getElementById('ck-name');
        const emailEl = document.getElementById('ck-email');
        if (nameEl)  { nameEl.value  = user.displayName || user.email; nameEl.required = false; }
        if (emailEl) { emailEl.value = user.email; emailEl.disabled = true; emailEl.required = false; }
        // Esconde os campos visualmente
        if (nameWrap)  nameWrap.style.display  = 'none';
        if (emailWrap) emailWrap.style.display = 'none';
        if (hint) hint.style.display = 'none';
    } else {
        el.innerHTML = `
          <div class="ck-notice info">
            <i class="bi bi-info-circle-fill" style="font-size:15px;flex-shrink:0;margin-top:1px;"></i>
            <div>Sem conta? Não tem problema! Criamos uma para você acessar seus downloads.</div>
          </div>`;
        // Reexibe os campos para usuários não logados
        if (nameWrap)  { nameWrap.style.display  = ''; document.getElementById('ck-name').required  = true; }
        if (emailWrap) { emailWrap.style.display = ''; document.getElementById('ck-email').required = true; }
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

        // Aguardar confirmação do pagamento e redirecionar automaticamente
        startPaymentPolling(data.orderId);

    } catch (err) {
        console.error('Checkout error:', err);
        alert(err.message || 'Erro ao processar pagamento. Tente novamente.');
        btn.disabled = false;
        if (label) label.textContent = 'Ir para Pagamento';
    }
}

// ─── polling de pagamento ──────────────────────────────────────────────────
function startPaymentPolling(orderId) {
    showWaitingOverlay();

    const MAX_ATTEMPTS = 150; // ~10 minutos (4s por tentativa)
    let attempts = 0;

    const interval = setInterval(async () => {
        attempts++;
        if (attempts > MAX_ATTEMPTS) {
            clearInterval(interval);
            hideWaitingOverlay();
            return;
        }
        try {
            const res = await fetch(`${API_BASE_URL}/verify-payment?orderId=${orderId}`);
            const data = await res.json();
            if (!data.success) return;

            const status = data.order?.paymentStatus;
            console.log(`[POLLING] tentativa ${attempts} — status: ${status} | _currentUser: ${_currentUser?.email ?? 'null'}`);
            if (status === 'approved') {
                clearInterval(interval);
                const downloadsUrl = `/downloads.html?order=${orderId}&success=1`;
                if (_currentUser) {
                    window.location.href = downloadsUrl;
                } else {
                    // Usuário não logado (guest checkout) — redireciona para a página inicial
                    window.location.href = '/index.html';
                }
            } else if (status === 'rejected' || status === 'cancelled') {
                clearInterval(interval);
                hideWaitingOverlay();
                showPaymentError();
            }
        } catch {
            // network error — retry on next tick
        }
    }, 4000);
}

function showWaitingOverlay() {
    if (document.getElementById('ck-waiting-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'ck-waiting-overlay';
    overlay.innerHTML = `
        <div class="ck-waiting-box">
            <div class="ck-waiting-spinner"></div>
            <p class="ck-waiting-title">Aguardando confirmação do pagamento…</p>
            <p class="ck-waiting-sub">Complete o pagamento na janela aberta pelo MercadoPago.<br>Você será redirecionado automaticamente.</p>
        </div>`;
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(30,0,60,.72); z-index:9999;
        display:flex; align-items:center; justify-content:center;`;
    overlay.querySelector('.ck-waiting-box').style.cssText = `
        background:#fff; border-radius:16px; padding:40px 32px; text-align:center;
        max-width:380px; width:90%; box-shadow:0 8px 40px rgba(0,0,0,.3);`;
    overlay.querySelector('.ck-waiting-spinner').style.cssText = `
        width:52px; height:52px; border:5px solid #f0e8ff; border-top-color:#9B5DE5;
        border-radius:50%; animation:spin .9s linear infinite; margin:0 auto 20px;`;
    overlay.querySelector('.ck-waiting-title').style.cssText = `
        font-weight:700; font-size:16px; color:#7A3DC0; margin:0 0 8px;`;
    overlay.querySelector('.ck-waiting-sub').style.cssText = `
        font-size:13px; color:#666; margin:0; line-height:1.6;`;

    if (!document.getElementById('ck-spin-style')) {
        const style = document.createElement('style');
        style.id = 'ck-spin-style';
        style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
}

function hideWaitingOverlay() {
    const el = document.getElementById('ck-waiting-overlay');
    if (el) el.remove();
}

function showPaymentError() {
    const btn = document.getElementById('ck-pay-btn');
    const label = document.getElementById('ck-pay-label');
    if (btn) btn.disabled = false;
    if (label) label.textContent = 'Ir para Pagamento';
    alert('Pagamento não aprovado. Tente novamente.');
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    renderCart();
    initAuth();

    const form = document.getElementById('ck-form');
    if (form) form.addEventListener('submit', handleSubmit);
});
