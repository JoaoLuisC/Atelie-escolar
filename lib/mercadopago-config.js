const mercadopago = require('mercadopago');

let mpClient;

/**
 * Inicializa cliente Mercado Pago
 */
function initializeMercadoPago() {
  if (mpClient) {
    return mpClient;
  }

  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
  }

  mpClient = new mercadopago.MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  });

  console.log('Mercado Pago initialized successfully');
  return mpClient;
}

/**
 * Cria preferência de pagamento
 */
async function createPaymentPreference(items, orderId, customerEmail) {
  initializeMercadoPago();
  
  const preference = new mercadopago.Preference(mpClient);

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const isHttps = appUrl.startsWith('https://');

  const preferenceData = {
    items: items.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description || item.title,
      quantity: item.quantity || 1,
      currency_id: 'BRL',
      unit_price: parseFloat(item.price),
    })),
    payer: {
      email: customerEmail,
    },
    external_reference: orderId,
    notification_url: `${appUrl}/api/webhook`,
    back_urls: {
      success: `${appUrl}/downloads.html?order=${orderId}`,
      failure: `${appUrl}/checkout.html?status=failure`,
      pending: `${appUrl}/checkout.html?status=pending`,
    },
    // auto_return only works with HTTPS back_urls
    ...(isHttps ? { auto_return: 'approved' } : {}),
    statement_descriptor: 'ATELIE_DA_ESCOLA',
    payment_methods: {
      // Produto digital: sem parcelamento
      installments: 1,
    },
  };

  const result = await preference.create({ body: preferenceData });
  return result;
}

/**
 * Verifica status de um pagamento
 */
async function getPaymentInfo(paymentId) {
  initializeMercadoPago();
  
  const payment = new mercadopago.Payment(mpClient);
  const result = await payment.get({ id: paymentId });
  
  return result;
}

/**
 * Valida assinatura do webhook
 */
function validateWebhookSignature(req) {
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  
  if (!xSignature || !xRequestId) {
    return false;
  }

  // Mercado Pago envia: ts=timestamp,v1=hash
  const parts = xSignature.split(',');
  const timestamp = parts.find(p => p.startsWith('ts=')).split('=')[1];
  const hash = parts.find(p => p.startsWith('v1=')).split('=')[1];

  const crypto = require('crypto');
  const secret = process.env.WEBHOOK_SECRET || process.env.MERCADOPAGO_ACCESS_TOKEN;
  
  const manifest = `id:${req.body.data?.id};request-id:${xRequestId};ts:${timestamp};`;
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  return hash === expectedHash;
}

module.exports = {
  initializeMercadoPago,
  createPaymentPreference,
  getPaymentInfo,
  validateWebhookSignature,
};
