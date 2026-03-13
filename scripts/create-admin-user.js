/**
 * Script para criar usuário administrador no Firebase
 * 
 * USO:
 * node scripts/create-admin-user.js --env .env.local
 */

function getArgValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const envPath = getArgValue('--env') || '.env.local';
require('dotenv').config({ path: envPath });

const admin = require('firebase-admin');

// Inicializar Firebase Admin
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replaceAll(String.raw`\n`, '\n')
  : undefined;

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
  console.error(`❌ Firebase credentials not configured. Check ${envPath}.`);
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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function isStrongPassword(password) {
  if (!password || password.length < 8) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Defina ADMIN_EMAIL e ADMIN_PASSWORD no arquivo de ambiente.');
  console.log('💡 Exemplo: ADMIN_EMAIL=admin@seu-dominio.com');
  console.log('💡 Defina ADMIN_PASSWORD no ambiente antes de executar.');
  process.exit(1);
}

if (!isStrongPassword(ADMIN_PASSWORD)) {
  console.error('❌ ADMIN_PASSWORD fraca. Use no mínimo 8 caracteres com letras e números.');
  process.exit(1);
}

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
