/**
 * Script para deletar um produto do Firestore
 * 
 * USO:
 * node scripts/delete-product.js PRODUCT_ID --yes --env .env.local
 */

function getArgValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function getFirstPositionalArg() {
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      if (arg === '--env') i++;
      continue;
    }
    return arg;
  }
  return undefined;
}

const envPath = getArgValue('--env') || '.env.local';
require('dotenv').config({ path: envPath });

const { getFirestore } = require('../lib/firebase-admin');
const force = process.argv.includes('--yes');

async function deleteProduct(productId) {
  if (!productId) {
    console.error('❌ Erro: ID do produto não fornecido');
    console.log('💡 Uso: node scripts/delete-product.js PRODUCT_ID --yes --env .env.local');
    console.log('💡 Para ver IDs: node scripts/list-products.js');
    process.exit(1);
  }

  if (!force) {
    console.error('❌ Operação bloqueada: use --yes para confirmar exclusão.');
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
const productId = getFirstPositionalArg();
deleteProduct(productId);
