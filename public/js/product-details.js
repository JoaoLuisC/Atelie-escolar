import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk",
    authDomain: "atelie-da-escola.firebaseapp.com",
    projectId: "atelie-da-escola",
    storageBucket: "atelie-da-escola.firebasestorage.app",
    messagingSenderId: "325690647064",
    appId: "1:325690647064:web:e1c3b4bfaaf921ab7cd96d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

// DOM refs
const loading           = document.getElementById('loading');
const productSection    = document.getElementById('productSection');
const notFoundSection   = document.getElementById('notFoundSection');
const mediaGallery      = document.getElementById('mediaGallery');
const productCategory   = document.getElementById('productCategory');
const productTitle      = document.getElementById('productTitle');
const productPrice      = document.getElementById('productPrice');
const productDescription= document.getElementById('productDescription');
const productTags       = document.getElementById('productTags');
const tagsList          = document.getElementById('tagsList');
const breadcrumbProduct = document.getElementById('breadcrumbProduct');
const pageTitle         = document.getElementById('pageTitle');
const btnAddToCart      = document.getElementById('btnAddToCart');
const btnBuyNow         = document.getElementById('pdBuyNow');
const pdInstallments    = document.getElementById('pdInstallments');
const pdPixText         = document.getElementById('pdPixText');
const pdFormatBadges    = document.getElementById('pdFormatBadges');

// ─── Load ───────────────────────────────────────────
async function loadProductDetails() {
    if (!productId) { showNotFound(); return; }
    try {
        const snap = await getDoc(doc(db, 'products', productId));
        if (!snap.exists() || !snap.data().active) { showNotFound(); return; }
        displayProduct({ id: snap.id, ...snap.data() });
    } catch (err) {
        console.error('Erro ao carregar produto:', err);
        showNotFound();
    }
}

// ─── Display ────────────────────────────────────────
function displayProduct(product) {
    // Page meta
    pageTitle.textContent       = `${product.name} - Ateliê da Escola`;
    breadcrumbProduct.textContent = product.name;

    // Category & title
    productCategory.textContent = (product.category || 'Produto').toUpperCase();
    productTitle.textContent    = product.name;

    // Price
    const price = parseFloat(product.price) || 0;
    productPrice.textContent    = `R$ ${formatPrice(price)}`;

    // Original price (for kits with discount)
    const origEl = document.getElementById('pdOriginalPrice');
    if (origEl && product.originalPrice && product.originalPrice > price) {
        origEl.style.display = 'block';
        origEl.innerHTML = `De <del>R$ ${formatPrice(product.originalPrice)}</del> por`;
    } else if (origEl) {
        origEl.style.display = 'none';
    }

    // Pix discount (10%)
    const pixPrice = price * 0.9;
    if (pdPixText)      pdPixText.textContent = `R$ ${formatPrice(pixPrice)} à vista no Pix (10% off)`;
    if (pdInstallments) pdInstallments.textContent = price >= 10
        ? `ou em até 3x de R$ ${formatPrice(price / 3)} sem juros`
        : '';

    // Format badges (based on product.formats array or reasonable defaults)
    buildFormatBadges(product);

    // Kit contents
    buildKitContents(product);

    // Panel sizes (for formats tab)
    buildPanelSizes(product);

    // Description
    productDescription.textContent = product.description || 'Sem descrição disponível.';

    // Tags
    if (product.tags && product.tags.length > 0) {
        productTags.style.display = 'flex';
        tagsList.textContent = product.tags.join(', ');
    } else {
        productTags.style.display = 'none';
    }

    // Gallery
    buildGallery(product);

    // Buttons
    btnAddToCart.onclick = () => addToCart(product);
    if (btnBuyNow) btnBuyNow.onclick = () => buyNow(product);

    // Show
    loading.style.display  = 'none';
    productSection.style.display = 'block';
}

// ─── Format badges ──────────────────────────────────
function buildFormatBadges(product) {
    if (!pdFormatBadges) return;
    const badges = [];

    if ((product.productType || 'individual') === 'kit') {
        badges.push(`<span class="pd-fmt-tag" style="background:#fff3e0;color:#e65100;border-color:#ffe0b2;"><i class="bi bi-gift-fill"></i> KIT Completo</span>`);
    }

    const fmts = Array.isArray(product.formats) && product.formats.length
        ? product.formats
        : ['PDF'];

    fmts.forEach(f => {
        const fl = f.toLowerCase();
        if (fl.includes('pdf')) {
            badges.push(`<span class="pd-fmt-tag pd-fmt-pdf"><i class="bi bi-filetype-pdf"></i> PDF Alta Resolução</span>`);
        } else if (fl.includes('canva')) {
            badges.push(`<span class="pd-fmt-tag pd-fmt-canva"><i class="bi bi-pencil-square"></i> Canva Editável</span>`);
        } else {
            badges.push(`<span class="pd-fmt-tag"><i class="bi bi-file-earmark"></i> ${f}</span>`);
        }
    });

    if (product.pageSize) {
        badges.push(`<span class="pd-fmt-tag"><i class="bi bi-file-earmark-text"></i> Folha ${product.pageSize}</span>`);
    }
    if (product.paperType) {
        badges.push(`<span class="pd-fmt-tag"><i class="bi bi-printer"></i> ${product.paperType}</span>`);
    }

    pdFormatBadges.innerHTML = badges.join('');
}

// ─── Kit contents ────────────────────────────────────
function buildKitContents(product) {
    const el = document.getElementById('pdKitContents');
    if (!el) return;
    const isKit = (product.productType || 'individual') === 'kit';
    if (!isKit || !Array.isArray(product.kitItems) || !product.kitItems.length) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';
    el.innerHTML = `
        <div style="background:#f9fafb;border:1px solid #e6e9f0;border-radius:12px;padding:16px 20px;margin:14px 0;">
            <h4 style="font-size:0.95rem;font-weight:700;color:#1B263B;margin:0 0 10px;display:flex;align-items:center;gap:8px;">
                <i class="bi bi-gift-fill" style="color:#e65100;"></i> O que vem no Kit:
            </h4>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">
                ${product.kitItems.map(item => {
                    const meta = [
                        item.quantity ? `${item.quantity} folha${item.quantity > 1 ? 's' : ''}` : '',
                        item.pageSize || '',
                        item.dimensions || ''
                    ].filter(Boolean).join(' · ');
                    return `<li style="display:flex;align-items:flex-start;gap:8px;font-size:0.87rem;color:#415A77;">
                        <i class="bi bi-check-circle-fill" style="color:#27ae60;flex-shrink:0;margin-top:2px;"></i>
                        <span>
                            <strong style="color:#1B263B;">${item.name}</strong>
                            ${meta ? `<span style="color:#778DA9;margin-left:4px;">${meta}</span>` : ''}
                            ${item.notes ? `<br><span style="font-size:0.8rem;color:#9AA5B5;">${item.notes}</span>` : ''}
                        </span>
                    </li>`;
                }).join('')}
            </ul>
        </div>`;
}

// ─── Panel sizes (for formats tab) ───────────────────
function buildPanelSizes(product) {
    const el = document.getElementById('pdPanelSizes');
    if (!el) return;
    if (!Array.isArray(product.panelSizes) || !product.panelSizes.length) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';
    el.innerHTML = `
        <div style="margin-bottom:18px;">
            <h4 style="font-size:0.95rem;font-weight:700;color:#1B263B;margin:0 0 10px;display:flex;align-items:center;gap:6px;">
                <i class="bi bi-rulers" style="color:var(--secondary-color);"></i> Tamanhos de Painel disponíveis:
            </h4>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
                ${product.panelSizes.map(ps => `
                    <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;padding:10px 16px;min-width:130px;text-align:center;">
                        ${ps.label ? `<div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:.04em;color:#6366F1;font-weight:700;margin-bottom:4px;">${ps.label}</div>` : ''}
                        ${ps.dimensions ? `<div style="font-size:1rem;font-weight:700;color:#1B263B;">${ps.dimensions}</div>` : ''}
                        ${ps.sheets ? `<div style="font-size:0.78rem;color:#778DA9;margin-top:2px;">${ps.sheets} folhas A4</div>` : ''}
                    </div>`).join('')}
            </div>
        </div>`;
}

// ─── Gallery ────────────────────────────────────────
const NO_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect fill='%239B5DE5' width='800' height='600'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.4)' font-size='24' font-family='sans-serif'%3ESem Imagem%3C/text%3E%3C/svg%3E`;

function gdrive(url) {
    if (!url || !url.includes('drive.google.com')) return url;
    const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w800`;
    return url;
}

function buildGallery(product) {
    const images = (Array.isArray(product.images) && product.images.length
        ? product.images
        : (product.imageUrl ? [product.imageUrl] : (product.image ? [product.image] : []))).map(gdrive);
    const videos = Array.isArray(product.videos) ? product.videos : [];

    const allMedia = [
        ...images.map(u => ({ type: 'image', url: u })),
        ...videos.map(u => ({ type: 'video', url: u }))
    ];
    if (!allMedia.length) allMedia.push({ type: 'image', url: NO_IMG });

    let current = 0;

    const mainWrap = document.createElement('div');
    mainWrap.className = 'pd-main-img-wrap';

    const mainEl = allMedia[0].type === 'video'
        ? makeVideoEl(allMedia[0].url)
        : makeImgEl(allMedia[0].url, product.name);
    mainWrap.appendChild(mainEl);

    // Nav arrows (only if multiple)
    if (allMedia.length > 1) {
        const prev = document.createElement('button');
        prev.className = 'pd-gallery-nav pd-gallery-nav-prev';
        prev.innerHTML = '<i class="bi bi-chevron-left"></i>';
        prev.onclick = () => { current = (current - 1 + allMedia.length) % allMedia.length; update(); };

        const next = document.createElement('button');
        next.className = 'pd-gallery-nav pd-gallery-nav-next';
        next.innerHTML = '<i class="bi bi-chevron-right"></i>';
        next.onclick = () => { current = (current + 1) % allMedia.length; update(); };

        mainWrap.appendChild(prev);
        mainWrap.appendChild(next);
    }

    // Thumbnail strip
    const thumbsWrap = document.createElement('div');
    thumbsWrap.className = 'pd-thumbs';

    allMedia.forEach((m, i) => {
        const t = document.createElement('div');
        t.className = 'pd-thumb' + (i === 0 ? ' active' : '');
        if (m.type === 'image') {
            const img = document.createElement('img');
            img.src = m.url;
            img.alt = '';
            img.onerror = () => { img.onerror = null; img.src = NO_IMG; };
            t.appendChild(img);
        } else {
            t.innerHTML = `<div style="width:100%;height:100%;background:#111;display:flex;align-items:center;justify-content:center;"><i class="bi bi-play-circle-fill" style="color:#fff;font-size:1.5rem;"></i></div>`;
        }
        t.onclick = () => { current = i; update(); };
        thumbsWrap.appendChild(t);
    });

    mediaGallery.innerHTML = '';
    mediaGallery.appendChild(mainWrap);
    if (allMedia.length > 1) mediaGallery.appendChild(thumbsWrap);

    function update() {
        const media = allMedia[current];
        const el = media.type === 'video'
            ? makeVideoEl(media.url)
            : makeImgEl(media.url, product.name);

        // keep nav arrows
        const prevBtn = mainWrap.querySelector('.pd-gallery-nav-prev');
        const nextBtn = mainWrap.querySelector('.pd-gallery-nav-next');
        mainWrap.innerHTML = '';
        mainWrap.appendChild(el);
        if (prevBtn) mainWrap.appendChild(prevBtn);
        if (nextBtn) mainWrap.appendChild(nextBtn);

        // update thumb highlights
        thumbsWrap.querySelectorAll('.pd-thumb').forEach((t, i) =>
            t.classList.toggle('active', i === current)
        );
    }
}

function makeImgEl(url, alt) {
    const img = document.createElement('img');
    img.src  = url;
    img.alt  = alt || '';
    img.onerror = () => { img.onerror = null; img.src = NO_IMG; };
    return img;
}

function makeVideoEl(url) {
    const iframe = document.createElement('iframe');
    iframe.src = getEmbedUrl(url);
    iframe.allowFullscreen = true;
    iframe.allow = 'autoplay; encrypted-media';
    return iframe;
}

function getEmbedUrl(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const vid = url.includes('youtu.be')
            ? url.split('youtu.be/')[1]?.split('?')[0]
            : url.split('v=')[1]?.split('&')[0];
        return `https://www.youtube.com/embed/${vid}`;
    }
    if (url.includes('vimeo.com')) {
        const vid = url.split('vimeo.com/')[1]?.split('?')[0];
        return `https://player.vimeo.com/video/${vid}`;
    }
    if (url.includes('drive.google.com')) {
        const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
        if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
        const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
        if (m2) return `https://drive.google.com/file/d/${m2[1]}/preview`;
    }
    return url;
}

// ─── Cart ────────────────────────────────────────────
function addToCart(product) {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existing = cart.find(i => i.id === product.id);
    if (existing) {
        existing.quantity += 1;
    } else {
        const imgArr = Array.isArray(product.images) && product.images.length ? product.images : [];
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: gdrive(imgArr[0] || product.imageUrl || product.image || ''),
            quantity: 1
        });
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    showCartFeedback();
}

function buyNow(product) {
    addToCart(product);
    window.location.href = '/checkout.html';
}

// ─── Cart count ──────────────────────────────────────
function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = cart.reduce((t, i) => t + i.quantity, 0);
    const badge = document.getElementById('cartCount');
    if (badge) badge.textContent = count;
}

// ─── Cart feedback ───────────────────────────────────
function showCartFeedback() {
    const orig = btnAddToCart.innerHTML;
    btnAddToCart.innerHTML = '<i class="bi bi-check-circle-fill"></i> Adicionado!';
    btnAddToCart.style.background = 'rgba(0,196,106,.12)';
    btnAddToCart.style.borderColor = '#00c46a';
    btnAddToCart.style.color = '#00a857';
    btnAddToCart.disabled = true;
    setTimeout(() => {
        btnAddToCart.innerHTML = orig;
        btnAddToCart.style.background = '';
        btnAddToCart.style.borderColor = '';
        btnAddToCart.style.color = '';
        btnAddToCart.disabled = false;
    }, 2200);
}

// ─── Helpers ─────────────────────────────────────────
function formatPrice(n) {
    return parseFloat(n).toFixed(2).replace('.', ',');
}

function showNotFound() {
    loading.style.display      = 'none';
    notFoundSection.style.display = 'block';
}

// ─── Init ─────────────────────────────────────────────
loadProductDetails();
updateCartCount();
