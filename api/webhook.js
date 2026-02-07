const { getFirestore } = require('../lib/firebase-admin');
const { getPaymentInfo, validateWebhookSignature } = require('../lib/mercadopago-config');
const { createDownloadToken } = require('../lib/firebase-admin');

/**
 * API: Webhook do Mercado Pago
 * POST /api/webhook
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Webhook received:', req.body);

    // Validar assinatura do webhook (segurança)
    const isValid = validateWebhookSignature(req);
    if (!isValid && process.env.NODE_ENV === 'production') {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;

    // Processar apenas notificações de pagamento
    if (type !== 'payment') {
      return res.status(200).json({ message: 'Event type not handled' });
    }

    const paymentId = data.id;
    
    // Buscar informações do pagamento
    const payment = await getPaymentInfo(paymentId);
    console.log('Payment info:', payment);

    const orderId = payment.external_reference;
    
    if (!orderId) {
      console.error('No external_reference found');
      return res.status(400).json({ error: 'Invalid payment data' });
    }

    const db = getFirestore();
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      console.error('Order not found:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Atualizar status do pedido
    const updateData = {
      paymentStatus: payment.status,
      paymentId: payment.id,
      'mercadoPagoData.paymentInfo': {
        id: payment.id,
        status: payment.status,
        statusDetail: payment.status_detail,
        paymentMethod: payment.payment_method_id,
        transactionAmount: payment.transaction_amount,
        dateApproved: payment.date_approved,
      },
      updatedAt: new Date().toISOString(),
    };

    // Se pagamento aprovado, criar tokens de download
    if (payment.status === 'approved') {
      updateData.status = 'completed';
      updateData.completedAt = new Date().toISOString();

      const orderData = orderDoc.data();
      const downloadTokens = [];

      // Criar um token para cada produto
      for (const item of orderData.items) {
        const token = await createDownloadToken(orderId, item.id, 72); // 72 horas
        downloadTokens.push({
          productId: item.id,
          productName: item.title,
          token,
          expiresIn: '72 horas',
        });
      }

      updateData.downloadTokens = downloadTokens;
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      updateData.status = 'failed';
    }

    await orderRef.update(updateData);

    console.log('Order updated successfully:', orderId);
    return res.status(200).json({ message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Webhook processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
