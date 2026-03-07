const admin = require('firebase-admin');
const mercadopago = require('mercadopago');
const { getFirestore, createDownloadToken } = require('../lib/firebase-admin');
const { initializeMercadoPago } = require('../lib/mercadopago-config');

/**
 * API: Verificar status do pagamento
 * GET /api/verify-payment?orderId=xxx
 *
 * Se o pedido ainda estiver "pending" no Firestore, consulta o MercadoPago
 * diretamente e, se o pagamento já foi aprovado, atualiza o Firestore na hora
 * (funciona mesmo quando o webhook não chegou por falta de ngrok).
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
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    let orderData = orderDoc.data();

    // ── Se ainda pendente, consultar MercadoPago diretamente ──────────────────
    if (orderData.paymentStatus !== 'approved' && orderData.status !== 'completed') {
      try {
        const mpClient = initializeMercadoPago();
        const paymentApi = new mercadopago.Payment(mpClient);

        // Buscar por external_reference = orderId
        const searchResult = await paymentApi.search({
          options: { external_reference: orderId, sort: 'date_created', criteria: 'desc', limit: 5 },
        });

        // Verificação dupla: garante que o pagamento realmente pertence a este pedido
        const approvedPayment = (searchResult.results || []).find(
          p => p.status === 'approved' && p.external_reference === orderId
        );

        if (approvedPayment) {
          console.log(`[verify-payment] Pagamento aprovado encontrado no MP para ordem ${orderId}:`, approvedPayment.id);

          // Criar tokens de download
          const downloadTokens = [];
          for (const item of orderData.items) {
            const token = await createDownloadToken(orderId, item.id, 72);
            downloadTokens.push({ productId: item.id, productName: item.title, token });
          }

          const updateData = {
            paymentStatus: 'approved',
            paymentId: approvedPayment.id,
            status: 'completed',
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            downloadTokens,
            'mercadoPagoData.paymentInfo': {
              id: approvedPayment.id,
              status: approvedPayment.status,
              statusDetail: approvedPayment.status_detail,
              paymentMethod: approvedPayment.payment_method_id,
              transactionAmount: approvedPayment.transaction_amount,
              dateApproved: approvedPayment.date_approved,
            },
          };

          await orderRef.update(updateData);

          // Registrar produtos comprados na conta do cliente
          const customerEmail = orderData.customer?.email;
          if (customerEmail) {
            const productIds = orderData.items.map(i => i.id);
            const productEntries = orderData.items.map(i => ({
              productId: i.id,
              productName: i.title,
              purchasedAt: new Date().toISOString(),
              orderId,
            }));
            const userProductsRef = db.collection('userProducts').doc(customerEmail);
            await userProductsRef.set(
              {
                email: customerEmail,
                productIds: admin.firestore.FieldValue.arrayUnion(...productIds),
                purchases: admin.firestore.FieldValue.arrayUnion(...productEntries),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
            console.log(`[verify-payment] Produtos registrados para ${customerEmail}:`, productIds);
          }

          // Reler dados atualizados
          orderData = { ...orderData, ...updateData };
        }
      } catch (mpErr) {
        // Falha na consulta ao MP não deve derrubar o endpoint — retorna o que tiver
        console.error('[verify-payment] Erro ao consultar MercadoPago:', mpErr.message);
      }
    }

    // Retornar status atual
    return res.status(200).json({
      success: true,
      order: {
        orderId: orderData.orderId,
        status: orderData.status,
        paymentStatus: orderData.paymentStatus,
        totalAmount: orderData.totalAmount,
        downloadTokens: orderData.downloadTokens || [],
        createdAt: orderData.createdAt,
        items: (orderData.items || []).map(item => ({
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
