/**
 * Script para listar todos os produtos do Firestore
 * 
 * USO:
 * node scripts/list-products.js
 */

require('dotenv').config({ path: '.env.local' });
const { getFirestore } = require('../lib/firebase-admin');

async function listProducts() {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('products').get();

    if (snapshot.empty) {
      console.log('📭 Nenhum produto encontrado no banco de dados.');
      console.log('💡 Use o script add-product.js para adicionar produtos.');
      process.exit(0);
    }

    console.log(`📦 Total de produtos: ${snapshot.size}\n`);

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🆔 ID: ${doc.id}`);
      console.log(`📝 Nome: ${data.name}`);
      console.log(`💰 Preço: R$ ${data.price.toFixed(2)}`);
      console.log(`📁 Categoria: ${data.category}`);
      console.log(`🏷️  Tags: ${data.tags?.join(', ') || 'Nenhuma'}`);
      console.log(`✅ Ativo: ${data.active ? 'Sim' : 'Não'}`);
      console.log(`🔗 Download URL: ${data.downloadUrl}`);
      console.log(`📅 Criado em: ${data.createdAt}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao listar produtos:', error);
    process.exit(1);
  }
}

// Executar
listProducts();
