const { getFirestore } = require('../lib/firebase-admin');

/**
 * API: Verificar status do pagamento
 * GET /api/verify-payment?orderId=xxx
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
    const { orderId } = req.query;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }

    const db = getFirestore();
    const orderDoc = await db.collection('orders').doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const orderData = orderDoc.data();

    // Retornar apenas informações necessárias
    return res.status(200).json({
      success: true,
      order: {
        orderId: orderData.orderId,
        status: orderData.status,
        paymentStatus: orderData.paymentStatus,
        totalAmount: orderData.totalAmount,
        downloadTokens: orderData.downloadTokens || [],
        createdAt: orderData.createdAt,
        items: orderData.items.map(item => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
        })),
      },
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({ 
      error: 'Erro ao verificar pagamento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
