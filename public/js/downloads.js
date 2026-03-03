/**
 * downloads.js (ES Module)
 * Requer autenticação e exibe pedidos do usuário.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
    getFirestore, collection, query, where, orderBy, getDocs
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk",
    authDomain: "atelie-da-escola.firebaseapp.com",
    projectId: "atelie-da-escola",
    storageBucket: "atelie-da-escola.firebasestorage.app",
    messagingSenderId: "325690647064",
    appId: "1:325690647064:web:e1c3b4bfaaf921ab7cd96d"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

function formatPrice(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ── Auth guard ── */
onAuthStateChanged(auth, async user => {
    document.getElementById('loading-auth').style.display = 'none';

    if (!user) {
        window.location.href = `/login.html?redirect=${encodeURIComponent('/downloads.html')}`;
        return;
    }

    /* User chip */
    const chipWrap = document.getElementById('user-chip-wrap');
    const avatar = user.photoURL
        ? `<img src="${user.photoURL}" alt="">`
        : `<i class="bi bi-person-circle"></i>`;
    chipWrap.innerHTML = `
        <div class="user-chip">
            ${avatar}
            <span>${user.displayName || user.email}</span>
        </div>`;

    document.getElementById('dl-content').style.display = 'block';

    /* Single order from URL param */
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order') || localStorage.getItem('lastOrderId');
    if (orderId) {
        await checkSingleOrder(orderId);
    }

    /* All orders for this user */
    await loadUserOrders(user.uid, user.email);
});

/* ── Single order (post-checkout) ── */
async function checkSingleOrder(orderId) {
    const wrap = document.getElementById('order-status-wrap');
    wrap.innerHTML = `<div class="text-center py-3"><div class="spinner-border" style="color:#9B5DE5;"></div><p class="mt-2">Verificando pedido…</p></div>`;
    try {
        const res = await fetch(`${API_BASE}/verify-payment?orderId=${orderId}`);
        const data = await res.json();
        if (data.success) {
            wrap.innerHTML = renderSingleOrderCard(data.order);
            if (data.order.paymentStatus === 'approved') {
                localStorage.removeItem('lastOrderId');
                clearCart();
            }
        } else {
            wrap.innerHTML = '';
        }
    } catch {
        wrap.innerHTML = '';
    }
}

function renderSingleOrderCard(order) {
    const statusClass = {
        approved: 'status-approved',
        pending:  'status-pending',
        rejected: 'status-rejected'
    }[order.paymentStatus] || 'status-pending';

    const statusLabel = {
        approved: '✓ Aprovado',
        pending:  '⏳ Pendente',
        rejected: '✕ Recusado'
    }[order.paymentStatus] || order.paymentStatus;

    let downloads = '';
    if (order.paymentStatus === 'approved' && order.downloadTokens?.length) {
        downloads = order.downloadTokens.map(t => `
            <div class="download-item">
                <div>
                    <strong>${t.productName}</strong>
                    <div style="font-size:12px;color:#B987FF;">Expira em: ${t.expiresIn || '24h'}</div>
                </div>
                <a href="/api/download?token=${t.token}" class="btn-dl">
                    <i class="bi bi-download"></i> Baixar
                </a>
            </div>`).join('');
    } else if (order.paymentStatus === 'approved') {
        downloads = '<p class="text-muted small">Downloads em processamento… Recarregue em instantes.</p>';
    } else if (order.paymentStatus === 'pending') {
        downloads = `<p class="text-muted small"><i class="bi bi-clock"></i> Aguardando confirmação do pagamento.
            <button class="btn btn-sm ms-2" style="background:#9B5DE5;color:#fff;" onclick="location.reload()">Atualizar</button></p>`;
    }

    return `
    <div class="order-card mb-4">
        <div class="order-card-head">
            <h5><i class="bi bi-receipt"></i> Pedido #${order.orderId}</h5>
            <span class="status-pill ${statusClass}">${statusLabel}</span>
        </div>
        <div class="order-card-body">
            ${downloads}
            <div class="mt-3 pt-2 border-top" style="font-size:13px; color:#555;">
                <strong>Total:</strong> ${formatPrice(order.totalAmount)}
            </div>
        </div>
    </div>`;
}

/* ── All user orders from Firestore ── */
async function loadUserOrders(uid, email) {
    const wrap = document.getElementById('all-orders-wrap');
    wrap.innerHTML = `<div class="text-center py-3"><div class="spinner-border" style="color:#9B5DE5;"></div><p class="mt-2 text-muted">Carregando seu histórico…</p></div>`;

    try {
        let snap;
        try {
            const q = query(
                collection(db, 'orders'),
                where('userId', '==', uid),
                orderBy('createdAt', 'desc')
            );
            snap = await getDocs(q);
        } catch {
            const q = query(
                collection(db, 'orders'),
                where('customerEmail', '==', email),
                orderBy('createdAt', 'desc')
            );
            snap = await getDocs(q);
        }

        if (snap.empty) {
            wrap.innerHTML = `
            <div class="empty-dl">
                <i class="bi bi-bag-x d-block"></i>
                <h4>Nenhuma compra encontrada</h4>
                <p>Explore nossa loja e encontre materiais incríveis!</p>
                <a href="/products.html" class="btn-dl mt-2" style="display:inline-flex;">
                    <i class="bi bi-shop"></i> Ver Produtos
                </a>
            </div>`;
            return;
        }

        let html = `<h5 style="color:#7A3DC0;font-weight:700;margin-bottom:16px;">
            <i class="bi bi-clock-history"></i> Histórico de Compras
        </h5>`;
        snap.forEach(docSnap => {
            const order = { ...docSnap.data(), id: docSnap.id };
            html += renderHistoryCard(order);
        });
        wrap.innerHTML = html;

    } catch (err) {
        console.error('Erro ao carregar pedidos:', err);
        wrap.innerHTML = `<div class="alert alert-warning">Não foi possível carregar o histórico. <button class="btn btn-sm btn-secondary ms-2" onclick="location.reload()">Tentar novamente</button></div>`;
    }
}

function renderHistoryCard(order) {
    const orderId = order.orderId || order.id;
    const statusClass = {
        approved: 'status-approved',
        pending:  'status-pending',
        rejected: 'status-rejected'
    }[order.paymentStatus] || 'status-pending';
    const statusLabel = { approved: '✓ Aprovado', pending: '⏳ Pendente', rejected: '✕ Recusado' }[order.paymentStatus] || order.paymentStatus;

    const items = (order.items || []).map(i => `<span class="me-2" style="font-size:13px;">• ${i.title || i.name}</span>`).join('');

    const dlBtn = order.paymentStatus === 'approved'
        ? `<a href="/downloads.html?order=${orderId}" class="btn-dl" style="font-size:12px;padding:6px 12px;">
               <i class="bi bi-download"></i> Downloads
           </a>`
        : '';

    return `
    <div class="order-card">
        <div class="order-card-head">
            <h5 style="font-size:14px;"><i class="bi bi-receipt"></i> Pedido #${orderId}
                <span style="font-weight:400;opacity:.7;font-size:12px;margin-left:8px;">${formatDate(order.createdAt)}</span>
            </h5>
            <span class="status-pill ${statusClass}">${statusLabel}</span>
        </div>
        <div class="order-card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div style="flex:1;min-width:200px;">
                ${items}
                <div style="font-size:13px;color:#555;margin-top:6px;"><strong>Total:</strong> ${formatPrice(order.totalAmount)}</div>
            </div>
            <div>${dlBtn}</div>
        </div>
    </div>`;
}

function clearCart() {
    if (typeof window.clearCartItems === 'function') window.clearCartItems();
    else localStorage.removeItem('cart');
}
