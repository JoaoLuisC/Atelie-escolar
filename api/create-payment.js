const { getFirestore } = require('../lib/firebase-admin');
const { createPaymentPreference } = require('../lib/mercadopago-config');

/**
 * API: Criar pedido e preferência de pagamento
 * POST /api/create-payment
 */
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, customer } = req.body;

    // Validações
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items são obrigatórios' });
    }

    if (!customer || !customer.email) {
      return res.status(400).json({ error: 'Email do cliente é obrigatório' });
    }

    const db = getFirestore();

    // Validar produtos e calcular total
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const productDoc = await db.collection('products').doc(item.productId).get();
      
      if (!productDoc.exists) {
        return res.status(404).json({ error: `Produto ${item.productId} não encontrado` });
      }

      const product = productDoc.data();
      
      if (!product.active) {
        return res.status(400).json({ error: `Produto ${product.name} não está disponível` });
      }

      const quantity = item.quantity || 1;
      totalAmount += product.price * quantity;

      validatedItems.push({
        id: item.productId,
        title: product.name,
        description: product.description || '',
        price: product.price,
        quantity: quantity,
        fileUrl: product.fileUrl || product.downloadUrl || null,
      });
    }

    // Criar pedido no Firestore
    const orderRef = db.collection('orders').doc();
    const orderId = orderRef.id;

    const orderData = {
      orderId,
      items: validatedItems,
      customer: {
        email: customer.email,
        name: customer.name || '',
      },
      totalAmount,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await orderRef.set(orderData);

    // Criar preferência de pagamento no Mercado Pago
    const preference = await createPaymentPreference(
      validatedItems,
      orderId,
      customer.email
    );

    // Atualizar pedido com ID da preferência
    await orderRef.update({
      preferenceId: preference.id,
      mercadoPagoData: {
        preferenceId: preference.id,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point,
      },
    });

    // Retornar dados para o frontend
    return res.status(200).json({
      success: true,
      orderId,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    });

  } catch (error) {
    console.error('Error creating payment:', error);
    return res.status(500).json({ 
      error: 'Erro ao criar pagamento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
