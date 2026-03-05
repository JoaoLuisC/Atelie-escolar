const { validateDownloadToken, getFirestore } = require('../lib/firebase-admin');

/**
 * API: Download de arquivo
 * GET /api/download?token=xxx
 * 
 * Redireciona para o link do Google Drive após validar o token
 */
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }

    // Validar token
    const validation = await validateDownloadToken(token);

    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    const { orderId, productId } = validation.data;

    // Buscar informações do produto
    const db = getFirestore();
    const productDoc = await db.collection('products').doc(productId).get();

    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const product = productDoc.data();

    // Verificar se o produto tem um link de download
    if (!product.downloadUrl) {
      return res.status(404).json({ error: 'Link de download não encontrado' });
    }

    // Registrar log de download
    await db.collection('downloadLogs').add({
      orderId,
      productId,
      productName: product.name,
      token,
      downloadedAt: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    });

    // Redirecionar para o link do Google Drive
    return res.redirect(product.downloadUrl);

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      error: 'Erro ao processar download',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
