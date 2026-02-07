const { getFirestore } = require('../lib/firebase-admin');

/**
 * API: Listar produtos disponíveis
 * GET /api/products
 */
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getFirestore();
    const productsSnapshot = await db
      .collection('products')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const products = [];
    productsSnapshot.forEach(doc => {
      const data = doc.data();
      products.push({
        id: doc.id,
        name: data.name,
        description: data.description,
        price: data.price,
        image: data.image,
        category: data.category,
        tags: data.tags || [],
      });
    });

    return res.status(200).json({
      success: true,
      products,
      total: products.length,
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ 
      error: 'Erro ao buscar produtos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
