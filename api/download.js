const { deleteFromTable, getSupabaseConfig, getTableRow, insertIntoTable, updateTable } = require('../lib/supabase');

module.exports = async function downloadHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const tokenRecord = await getTableRow('download_tokens', {
      select: 'token,order_id,product_id,used,expires_at',
      filters: [{ column: 'token', value: token }],
    });

    if (!tokenRecord) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    if (tokenRecord.used === true) {
      return res.status(401).json({ error: 'Token já utilizado' });
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: 'Token expirado' });
    }

    const product = await getTableRow('products', {
      select: 'id,name,download_url',
      filters: [{ column: 'id', value: tokenRecord.product_id }],
    });

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    if (!product.download_url) {
      return res.status(404).json({ error: 'Link de download não encontrado' });
    }

    await updateTable('download_tokens', { token: `eq.${tokenRecord.token}` }, {
      used: true,
      used_at: new Date().toISOString(),
    });

    await insertIntoTable('download_logs', {
      order_id: tokenRecord.order_id,
      product_id: tokenRecord.product_id,
      token,
      ip_address: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''),
      user_agent: String(req.headers['user-agent'] || ''),
      downloaded_at: new Date().toISOString(),
    });

    return res.redirect(product.download_url);
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({
      error: 'Erro ao processar download',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
