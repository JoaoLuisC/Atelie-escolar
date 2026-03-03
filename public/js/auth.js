/**
 * auth.js — Helpers de autenticação reutilizáveis
 * Importar como módulo ES6 nas páginas que precisam de auth.
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signOut,
    GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
    getFirestore, doc, getDoc
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

/**
 * Aguarda resolução do estado de auth e retorna o user (ou null).
 */
export function waitForAuth() {
    return new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, user => {
            unsub();
            resolve(user);
        });
    });
}

/**
 * Redireciona para login se o usuário não estiver autenticado.
 * @param {string} redirectPath - caminho de retorno após login
 */
export async function requireAuth(redirectPath) {
    const user = await waitForAuth();
    if (!user) {
        const path = redirectPath || window.location.pathname + window.location.search;
        window.location.href = `/login.html?redirect=${encodeURIComponent(path)}`;
        return null;
    }
    return user;
}

/**
 * Faz logout e redireciona para a home.
 */
export async function logout() {
    await signOut(auth);
    window.location.href = '/';
}

/**
 * Retorna o app e auth já inicializados.
 */
export { app, auth, db };
