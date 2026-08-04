const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable } } = require('../lib/supabase');
const { createSignedDownloadUrl } = require('../lib/storage-signed-url');
const { extractClientIp } = require('../lib/security-logger');

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

    // Uso único ATÔMICO: marca used=false → true condicionando no próprio UPDATE.
    // Só prossegue quem "ganhar" a transição; requisições concorrentes com o
    // mesmo token recebem 0 linhas afetadas e são barradas (evita download duplo).
    // Feito ANTES de gerar a signed URL, mas só depois de validar o produto para
    // não consumir o token por erro de dado.
    const claimed = await updateTable('download_tokens',
      { token: `eq.${tokenRecord.token}`, used: 'is.false' },
      { used: true, used_at: new Date().toISOString() });

    if (!Array.isArray(claimed) || claimed.length === 0) {
      return res.status(401).json({ error: 'Token já utilizado' });
    }

    // Tenta gerar signed URL temporário (5 min) quando o arquivo está no
    // Supabase Storage. Caso contrário cai no redirect direto (Drive etc.) —
    // legado, com Referrer-Policy: no-referrer pra não vazar `Referer`.
    const signedUrl = await createSignedDownloadUrl(product.download_url);
    const finalUrl = signedUrl || product.download_url;
    const deliveryMode = signedUrl ? 'signed-storage' : 'external-redirect';

    await insertIntoTable('download_logs', {
      order_id: tokenRecord.order_id,
      product_id: tokenRecord.product_id,
      token,
      ip_address: extractClientIp(req) || '',
      user_agent: String(req.headers['user-agent'] || ''),
      downloaded_at: new Date().toISOString(),
    });

    // Evita que o token (signed ou externo) vaze via Referer pro destino.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Download-Mode', deliveryMode);
    return res.redirect(finalUrl);
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ error: 'Erro ao processar download' });
  }
};
