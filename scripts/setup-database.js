require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Inicializar Firebase Admin
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  }),
});

const db = admin.firestore();

async function setupDatabase() {
  console.log('🔥 Configurando estrutura do Firestore...\n');

  try {
    // 1. Criar produto de exemplo
    console.log('📦 Criando produto de exemplo...');
    const productRef = await db.collection('products').add({
      name: 'Kit Criativo Completo - Teste',
      description: 'Produto de exemplo com 50 atividades educativas. Este é um produto de teste para você ver como funciona o sistema.',
      price: 29.90,
      image: 'https://via.placeholder.com/600x400/6366f1/ffffff?text=Produto+Teste',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=EXEMPLO_ID_AQUI',
      category: 'Educação',
      tags: ['teste', 'exemplo', 'educação'],
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Produto criado: ${productRef.id}\n`);

    // 2. Criar pedido de exemplo (pending)
    console.log('🛒 Criando pedido de exemplo...');
    const orderRef = await db.collection('orders').add({
      productId: productRef.id,
      buyerEmail: 'cliente@exemplo.com',
      status: 'pending',
      amount: 29.90,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Pedido criado: ${orderRef.id}\n`);

    // 3. Criar cliente de exemplo
    console.log('👤 Criando registro de cliente...');
    await db.collection('customers').doc('cliente@exemplo.com').set({
      email: 'cliente@exemplo.com',
      orders: [orderRef.id],
      totalPurchases: 0, // Será incrementado quando pagar
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastPurchaseAt: null,
    });
    console.log(`✅ Cliente criado: cliente@exemplo.com\n`);

    console.log('🎉 Estrutura criada com sucesso!\n');
    console.log('📋 Coleções criadas:');
    console.log('   - products (produtos à venda)');
    console.log('   - orders (pedidos/compras)');
    console.log('   - customers (histórico por email)');
    console.log('   - downloadTokens (será criada no primeiro pagamento)');
    console.log('   - downloadLogs (será criada no primeiro download)\n');

    console.log('🔍 Acesse o Firebase Console para ver os dados:');
    console.log(`   https://console.firebase.google.com/project/${process.env.FIREBASE_PROJECT_ID}/firestore\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar estrutura:', error);
    process.exit(1);
  }
}

setupDatabase();
