/**
 * Script para adicionar produtos no Firestore
 * 
 * USO:
 * node scripts/add-product.js
 */

require('dotenv').config({ path: '.env.local' });
const { getFirestore } = require('../lib/firebase-admin');

async function addProduct() {
  try {
    const db = getFirestore();

    // Dados do produto - EDITE AQUI!
    const productData = {
      name: "Kit Criativo Completo",
      description: "50 atividades artísticas prontas para imprimir. Inclui: desenhos para colorir, recorte e colagem, coordenação motora e muito mais!",
      price: 39.90,
      image: "https://via.placeholder.com/400x300/FF6B6B/FFFFFF?text=Kit+Criativo",
      downloadUrl: "https://drive.google.com/uc?export=download&id=COLOQUE_SEU_ID_AQUI",
      category: "Arte e Educação",
      tags: ["criança", "arte", "educação", "atividades"],
      active: true,
      createdAt: new Date().toISOString()
    };

    // Adicionar produto
    const docRef = await db.collection('products').add(productData);

    console.log('✅ Produto adicionado com sucesso!');
    console.log('📦 ID do produto:', docRef.id);
    console.log('📝 Dados:', JSON.stringify(productData, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao adicionar produto:', error);
    process.exit(1);
  }
}

// Executar
addProduct();
