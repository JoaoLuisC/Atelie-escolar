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
      price: 29.9,
      image: 'https://via.placeholder.com/600x400/6366f1/ffffff?text=Produto+Teste',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=EXEMPLO_ID_AQUI',
      category: 'Educação',
      tags: ['teste', 'exemplo', 'educação'],
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Produto criado: ${productRef.id}\n`);

    // 2. Criar pedido de exemplo (schema atual)
    console.log('🛒 Criando pedido de exemplo...');
    const orderRef = await db.collection('orders').add({
      orderId: '',
      items: [
        {
          id: productRef.id,
          title: 'Kit Criativo Completo - Teste',
          description: 'Produto de exemplo',
          price: 29.9,
          quantity: 1,
          fileUrl: 'https://drive.google.com/uc?export=download&id=EXEMPLO_ID_AQUI',
        },
      ],
      customer: {
        email: 'cliente@exemplo.com',
        name: 'Cliente Exemplo',
      },
      totalAmount: 29.9,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await orderRef.update({ orderId: orderRef.id });
    console.log(`✅ Pedido criado: ${orderRef.id}\n`);

    // 3. Criar userProducts de exemplo (schema atual)
    console.log('👤 Criando registro userProducts...');
    await db.collection('userProducts').doc('cliente@exemplo.com').set({
      email: 'cliente@exemplo.com',
      productIds: [productRef.id],
      purchases: [
        {
          productId: productRef.id,
          productName: 'Kit Criativo Completo - Teste',
          purchasedAt: new Date().toISOString(),
          orderId: orderRef.id,
        },
      ],
      updatedAt: new Date().toISOString(),
    });
    console.log(`✅ userProducts criado: cliente@exemplo.com\n`);

    console.log('🎉 Estrutura criada com sucesso!\n');
    console.log('📋 Coleções criadas:');
    console.log('   - products (produtos à venda)');
    console.log('   - orders (pedidos com items/customer/totalAmount)');
    console.log('   - userProducts (histórico de compras por email)');
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
