// Configuração do Firebase para o frontend
const firebaseConfig = {
  apiKey: "AIzaSyCq0iSJXD02FGq9wFq+DAEKJtd6VHBjAOk",
  authDomain: "atelie-da-escola.firebaseapp.com",
  projectId: "atelie-da-escola",
  storageBucket: "atelie-da-escola.firebasestorage.app",
  messagingSenderId: "325696647064",
  appId: "1:325696647064:web:e1c3b4bfaaf921ab7cd96d"
};

// Exportar configuração (para uso em módulos ES6)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}
