/**
 * Script para adicionar produtos no Firestore
 * 
 * USO:
 * node scripts/add-product.js --env .env.local
 */

function getArgValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const envPath = getArgValue('--env') || '.env.local';
require('dotenv').config({ path: envPath });

const { getFirestore } = require('../lib/firebase-admin');

async function addProduct() {
  try {
    const db = getFirestore();

    // Dados do produto - EDITE AQUI!
    const productData = {
      name: "Kit Dia do Circo",
      description: "Kit completo com painel decorativo, cone para guloseimas, pulseirinhas e folhas de atividades com tema circo.",
      price: 5.00,
      originalPrice: null,       // null = sem desconto, ou ex: 15.00 para mostrar "de R$15 por R$5"
      image: "https://via.placeholder.com/400x300/FF6B6B/FFFFFF?text=Kit+Circo",
      downloadUrl: "https://drive.google.com/uc?export=download&id=COLOQUE_SEU_ID_AQUI",
      category: "Kits Temáticos",
      tags: ["circo", "festa", "decoração", "atividades"],
      active: true,
      productType: "kit",        // "individual" ou "kit"
      pageSize: "A4",            // tamanho padrão de folha
      paperType: "Fotográfico Glossy 180g / Sulfit comum",
      kitItems: [
        { name: "Painel banner decorativo tema circo — Menor", pageSize: "A4", quantity: 8,  dimensions: "0,76x0,53m",  notes: "Papel glossy 180g" },
        { name: "Painel banner decorativo tema circo — Maior", pageSize: "A4", quantity: 16, dimensions: "1,07x0,76m",  notes: "Papel glossy 180g" },
        { name: "Cone para guloseimas",                        pageSize: "A4", quantity: 1,  dimensions: "",             notes: "Papel glossy 180g" },
        { name: "Pulseirinhas",                                pageSize: "A4", quantity: 1,  dimensions: "",             notes: "Papel glossy 180g" },
        { name: "Tag para pirulito",                           pageSize: "A4", quantity: 1,  dimensions: "",             notes: "Papel glossy 180g" },
        { name: "Folha de atividades — vogais",                pageSize: "A4", quantity: 1,  dimensions: "",             notes: "Sulfit comum" },
        { name: "Folha de atividades — numerais ordem crescente", pageSize: "A4", quantity: 1, dimensions: "",           notes: "Sulfit comum" },
      ],
      panelSizes: [
        { label: "Menor", dimensions: "0,76x0,53m", sheets: 8  },
        { label: "Maior", dimensions: "1,07x0,76m", sheets: 16 },
      ],
      createdAt: new Date().toISOString()
    };

    if ((productData.downloadUrl || '').includes('COLOQUE_SEU_ID_AQUI')) {
      console.error('❌ Defina um downloadUrl real antes de adicionar o produto.');
      process.exit(1);
    }

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
