/**
 * Script para criar usuário administrador no Firebase
 * 
 * USO:
 * node scripts/create-admin-user.js
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Inicializar Firebase Admin
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
  console.error('❌ Firebase credentials not configured. Check .env.local file.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  })
});

const auth = admin.auth();

// ====================================
// CONFIGURE AQUI O USUÁRIO ADMIN
// ====================================
const ADMIN_EMAIL = 'admin@ateliedaescola.com';
const ADMIN_PASSWORD = '123456';
// ====================================

async function createAdminUser() {
  try {
    console.log('🔐 Criando usuário administrador...\n');

    // Verificar se o usuário já existe
    let user;
    try {
      user = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log('⚠️ Usuário já existe!');
      console.log('📧 Email:', user.email);
      console.log('🆔 UID:', user.uid);
      console.log('\n💡 Se desejar alterar a senha, use o Firebase Console.');
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Usuário não existe, criar novo
        user = await auth.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          emailVerified: true,
          disabled: false,
        });

        console.log('✅ Usuário administrador criado com sucesso!\n');
        console.log('📧 Email:', user.email);
        console.log('🆔 UID:', user.uid);
        console.log('🔑 Senha:', ADMIN_PASSWORD);
        console.log('\n⚠️ IMPORTANTE: Anote estas credenciais em local seguro!');
        console.log('💡 Recomendamos alterar a senha após o primeiro login.\n');
      } else {
        throw error;
      }
    }

    console.log('\n🌐 Acesse o painel admin em:');
    console.log('   http://localhost:3000/admin-login.html');
    console.log('\n📝 Para usar em produção:');
    console.log('   https://seu-dominio.com/admin-login.html\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    process.exit(1);
  }
}

// Executar
createAdminUser();
