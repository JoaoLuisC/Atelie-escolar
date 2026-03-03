// Configuração do Firebase para o frontend
const firebaseConfig = {
  apiKey: "AIzaSyCqbiSJXD02F0q9wFqrDAEKJtd6VHBjAOk",
  authDomain: "atelie-da-escola.firebaseapp.com",
  projectId: "atelie-da-escola",
  storageBucket: "atelie-da-escola.firebasestorage.app",
  messagingSenderId: "325690647064",
  appId: "1:325690647064:web:e1c3b4bfaaf921ab7cd96d"
};

// Initialize Firebase compat SDK if loaded (non-module pages)
if (typeof firebase !== 'undefined') {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
}

// Exportar configuração (para uso em módulos ES6)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}
