/**
 * navbar-auth.js — Atualiza a navbar com estado do usuário logado.
 * Injeta automaticamente via components.js em todas as páginas.
 *
 * Estratégia "sem flash":
 *  1. Aplica o estado cacheado do localStorage IMEDIATAMENTE (síncrono)
 *     → navbar já aparece correta sem esperar o Firebase
 *  2. Firebase confirma/corrige o estado quando responder (~300ms)
 *     → se mudou (ex: sessão expirou em outra aba), atualiza silenciosamente
 *
 * Comportamento:
 *  - Logado:  mostra botão "Downloads" + nome → dropdown só com "Sair"
 *  - Admin:   idem + badge "ADMIN" + link Painel Admin
 *  - Deslogado: esconde Downloads, mostra "Entrar"
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk",
    authDomain: "atelie-da-escola.firebaseapp.com",
    projectId: "atelie-da-escola",
    storageBucket: "atelie-da-escola.firebasestorage.app",
    messagingSenderId: "325690647064",
    appId: "1:325690647064:web:e1c3b4bfaaf921ab7cd96d"
};

/* ── Email do único admin ── */
const ADMIN_EMAIL = 'admin@profamarciarcardoso.com';

/* ── Chave do cache no localStorage ── */
const CACHE_KEY = 'atelie_nav_user';

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

/* ════════════════════════════════════════════════════
   Função central: renderiza a navbar dado um user-like
   object { displayName, email, photoURL } ou null.
   Funciona tanto com o objeto do Firebase quanto com
   o objeto simplificado guardado no localStorage.
   ════════════════════════════════════════════════════ */
function applyNavState(user, isFirebaseConfirmed = false) {
    const authItem      = document.getElementById('nav-auth-item');
    const downloadsItem = document.getElementById('nav-downloads-item');
    if (!authItem) return;

    if (user) {
        const isAdmin   = user.email === ADMIN_EMAIL;
        const firstName = user.displayName?.split(' ')[0] || user.email.split('@')[0];
        const photo     = user.photoURL
            ? `<img src="${user.photoURL}"
                   style="width:22px;height:22px;border-radius:50%;object-fit:cover;" alt="">`
            : `<i class="bi bi-person-circle" style="font-size:18px;"></i>`;

        if (downloadsItem) downloadsItem.style.display = 'list-item';

        authItem.innerHTML = `
            <div style="position:relative;">
                <button id="nav-user-btn" style="
                    background: none;
                    border: 1.5px solid rgba(255,255,255,.35);
                    color: inherit;
                    border-radius: 20px;
                    padding: 5px 12px 5px 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: background .2s;
                ">
                    ${photo}
                    <span>${firstName}</span>
                    ${isAdmin ? '<span style="background:#FEE440;color:#0e0e16;font-size:10px;font-weight:800;padding:2px 6px;border-radius:8px;letter-spacing:.04em;">ADMIN</span>' : ''}
                    <i class="bi bi-chevron-down" style="font-size:10px;opacity:.6;"></i>
                </button>

                <ul id="nav-user-dropdown" style="
                    display: none;
                    position: absolute;
                    right: 0;
                    top: calc(100% + 10px);
                    background: #1a1a2e;
                    border: 1px solid rgba(155,93,229,.25);
                    border-radius: 10px;
                    list-style: none;
                    margin: 0;
                    padding: 6px 0;
                    min-width: 170px;
                    box-shadow: 0 8px 28px rgba(0,0,0,.3);
                    z-index: 9999;
                ">
                    <li style="padding: 8px 16px 6px; border-bottom: 1px solid rgba(255,255,255,.08);">
                        <div style="font-size:12px;color:rgba(255,255,255,.45);margin-bottom:2px;">Conectado como</div>
                        <div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${user.email}</div>
                    </li>
                    ${isAdmin ? `
                    <li>
                        <a href="/admin.html" style="
                            display:flex;align-items:center;gap:8px;
                            padding:10px 16px;color:#FEE440;text-decoration:none;
                            font-size:14px;font-weight:600;
                        " onmouseover="this.style.background='rgba(255,255,255,.07)'"
                           onmouseout="this.style.background='none'">
                            <i class="bi bi-shield-check"></i> Painel Admin
                        </a>
                    </li>
                    <li style="border-top:1px solid rgba(255,255,255,.08);"></li>` : ''}
                    <li>
                        <button id="nav-logout-btn" style="
                            width: 100%;
                            background: none;
                            border: none;
                            padding: 10px 16px;
                            color: #f87171;
                            text-align: left;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        " onmouseover="this.style.background='rgba(255,255,255,.07)'"
                           onmouseout="this.style.background='none'">
                            <i class="bi bi-box-arrow-right"></i> Sair
                        </button>
                    </li>
                </ul>
            </div>`;

        /* Toggle dropdown */
        const btn = document.getElementById('nav-user-btn');
        const dd  = document.getElementById('nav-user-dropdown');
        btn.addEventListener('click', e => {
            e.stopPropagation();
            dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', () => { dd.style.display = 'none'; });
        dd.addEventListener('click', e => e.stopPropagation());

        document.getElementById('nav-logout-btn').addEventListener('click', async () => {
            localStorage.removeItem(CACHE_KEY); // limpa cache ao sair
            await signOut(auth);
            window.location.href = '/';
        });

    } else {
        if (downloadsItem) downloadsItem.style.display = 'none';

        authItem.innerHTML = `
            <a href="/login.html" class="nav-link-item"
               style="display:inline-flex;align-items:center;gap:6px;
                      border:1.5px solid rgba(255,255,255,.3);border-radius:20px;
                      padding:5px 14px;font-size:14px;font-weight:600;transition:background .2s;"
               onmouseover="this.style.background='rgba(255,255,255,.1)'"
               onmouseout="this.style.background='none'">
                <i class="bi bi-person-circle"></i> Entrar
            </a>`;
    }
}

/* ════════════════════════════════════════════════════
   PASSO 1 — Aplica estado cacheado IMEDIATAMENTE.
   Acontece de forma síncrona, antes de qualquer await,
   então a navbar já aparece correta para o usuário.
   Admin é ignorado: ele tem o próprio painel (/admin.html).
   ════════════════════════════════════════════════════ */
try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && cached.email !== ADMIN_EMAIL) applyNavState(cached);
} catch (e) { /* cache corrompido — ignora, Firebase vai corrigir */ }

/* ════════════════════════════════════════════════════
   PASSO 2 — Firebase confirma/corrige (~300ms depois).
   Atualiza o cache e re-renderiza só se necessário.
   ════════════════════════════════════════════════════ */
onAuthStateChanged(auth, user => {
    /* Admin não aparece na navbar da loja — ele tem o painel próprio */
    if (user && user.email === ADMIN_EMAIL) {
        localStorage.removeItem(CACHE_KEY);
        applyNavState(null, true);
        return;
    }

    if (user) {
        /* Salva dados mínimos no cache para a próxima página */
        const toCache = {
            displayName: user.displayName,
            email:       user.email,
            photoURL:    user.photoURL,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
    } else {
        /* Sessão acabou (logout, expirou, outra aba) — limpa cache */
        localStorage.removeItem(CACHE_KEY);
    }

    /* Re-renderiza com dados oficiais do Firebase */
    applyNavState(user, true);
});
