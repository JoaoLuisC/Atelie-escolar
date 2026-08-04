const mercadopago = require('mercadopago');
const crypto = require('node:crypto');

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
      unit_price: Number.parseFloat(item.price),
    })),
    payer: {
      email: customerEmail,
    },
    external_reference: orderId,
    notification_url: `${appUrl}/api/webhook`,
    back_urls: {
      success: `${appUrl}/downloads?order=${orderId}`,
      failure: `${appUrl}/checkout?status=failure`,
      pending: `${appUrl}/checkout?status=pending`,
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
  const signatureParts = String(xSignature)
    .split(',')
    .map((part) => part.trim())
    .reduce((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});

  const timestamp = signatureParts.ts;
  const hash = signatureParts.v1;
  const paymentId = req.body?.data?.id;

  if (!timestamp || !hash || !paymentId) {
    return false;
  }

  // NUNCA reutilizar o MERCADOPAGO_ACCESS_TOKEN como chave HMAC: é um segredo
  // distinto do webhook secret do MP. Sem WEBHOOK_SECRET, rejeitamos (fail-closed)
  // em vez de validar contra o segredo errado.
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }
  
  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${timestamp};`;
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  const left = Buffer.from(hash);
  const right = Buffer.from(expectedHash);
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  initializeMercadoPago,
  createPaymentPreference,
  getPaymentInfo,
  validateWebhookSignature,
};
