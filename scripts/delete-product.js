/**
 * Script para deletar um produto do Firestore
 * 
 * USO:
 * node scripts/delete-product.js PRODUCT_ID
 */

require('dotenv').config({ path: '.env.local' });
const { getFirestore } = require('../lib/firebase-admin');

async function deleteProduct(productId) {
  if (!productId) {
    console.error('❌ Erro: ID do produto não fornecido');
    console.log('💡 Uso: node scripts/delete-product.js PRODUCT_ID');
    console.log('💡 Para ver IDs: node scripts/list-products.js');
    process.exit(1);
  }

  try {
    const db = getFirestore();
    const docRef = db.collection('products').doc(productId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.error('❌ Produto não encontrado com ID:', productId);
      process.exit(1);
    }

    const productData = doc.data();
    console.log('🗑️  Deletando produto:');
    console.log(`   Nome: ${productData.name}`);
    console.log(`   ID: ${productId}`);
    
    await docRef.delete();

    console.log('✅ Produto deletado com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao deletar produto:', error);
    process.exit(1);
  }
}

// Pegar ID do produto dos argumentos
const productId = process.argv[2];
deleteProduct(productId);
