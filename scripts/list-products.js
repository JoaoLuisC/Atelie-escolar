/**
 * Script para listar todos os produtos do Firestore
 * 
 * USO:
 * node scripts/list-products.js --env .env.local
 */

function getArgValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const envPath = getArgValue('--env') || '.env.local';
require('dotenv').config({ path: envPath });

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
      const parsedPrice = Number(data.price);
      const formattedPrice = Number.isFinite(parsedPrice)
        ? `R$ ${parsedPrice.toFixed(2)}`
        : '—';

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🆔 ID: ${doc.id}`);
      console.log(`📝 Nome: ${data.name || '(sem nome)'}`);
      console.log(`💰 Preço: ${formattedPrice}`);
      console.log(`📁 Categoria: ${data.category || 'Sem categoria'}`);
      console.log(`🏷️  Tags: ${data.tags?.join(', ') || 'Nenhuma'}`);
      console.log(`✅ Ativo: ${data.active ? 'Sim' : 'Não'}`);
      console.log(`🔗 Download URL: ${data.downloadUrl || data.fileUrl || 'Não informado'}`);
      console.log(`📅 Criado em: ${data.createdAt || 'Não informado'}`);
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
