const crypto = require('node:crypto');
const { createPaymentPreference } = require('../lib/mercadopago-config');
const { getSupabaseConfig, getTableRow, insertIntoTable, listTableRows, updateTable } = require('../lib/supabase');

module.exports = async function createPaymentHandler(req, res) {
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

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items são obrigatórios' });
    }

    if (!customer?.email) {
      return res.status(400).json({ error: 'Email do cliente é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const validatedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await getTableRow('products', {
        select: 'id,name,description,price,download_url,active',
        filters: [{ column: 'id', value: item.productId }],
      });

      if (!product) {
        return res.status(404).json({ error: `Produto ${item.productId} não encontrado` });
      }

      if (product.active === false) {
        return res.status(400).json({ error: `Produto ${product.name} não está disponível` });
      }

      const quantity = Number(item.quantity || 1);
      const price = Number(product.price || 0);
      totalAmount += price * quantity;

      validatedItems.push({
        id: String(product.id),
        title: product.name,
        description: product.description || '',
        price,
        quantity,
        fileUrl: product.download_url || null,
      });
    }

    const orderCode = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const [createdOrder] = await insertIntoTable('orders', {
      order_code: orderCode,
      customer_name: customer.name || '',
      customer_email: customer.email,
      customer_cpf: customer.cpf || null,
      customer_phone: customer.phone || null,
      total_amount: totalAmount,
      status: 'pending',
      payment_status: 'pending',
    });

    for (const item of validatedItems) {
      await insertIntoTable('order_items', {
        order_id: createdOrder.id,
        product_id: item.id,
        product_name: item.title,
        unit_price: item.price,
        quantity: item.quantity,
        total_price: item.price * item.quantity,
      });
    }

    const preference = await createPaymentPreference(validatedItems, orderCode, customer.email);

    await updateTable('orders', { id: `eq.${createdOrder.id}` }, {
      preference_id: preference.id,
      payment_status: 'pending',
      status: 'pending',
    });

    return res.status(200).json({
      success: true,
      orderId: orderCode,
      orderInternalId: createdOrder.id,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    return res.status(error.statusCode || 500).json({
      error: 'Erro ao criar pagamento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
