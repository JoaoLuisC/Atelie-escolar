const { getSupabaseConfig, serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable } } = require('../lib/supabase');
const { createSignedDownloadUrl, parseStorageRef } = require('../lib/storage-signed-url');
const { extractClientIp, recordSecurityEvent } = require('../lib/security-logger');

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

    // FAIL-CLOSED, antes de queimar o token: só entregamos via Storage assinado.
    // Antes havia fallback `finalUrl = signedUrl || product.download_url`, que
    // redirecionava cru para qualquer URL externa/pública gravada em
    // products.download_url — entrega do produto pago sem assinatura e sem
    // expiração. Um download_url que não seja do Storage é erro de cadastro,
    // não um modo de entrega. A checagem vem ANTES do claim para não consumir
    // o token do comprador por erro de dado.
    if (!parseStorageRef(product.download_url)) {
      await recordSecurityEvent({
        eventName: 'download_url_not_storage',
        severity: 'error',
        ip: extractClientIp(req),
        userAgent: req.headers['user-agent'],
        properties: { product_id: String(tokenRecord.product_id) },
      });
      return res.status(500).json({ error: 'Arquivo indisponível. Fale com o suporte.' });
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

    // Signed URL temporário (5 min) para o objeto privado do Storage.
    const signedUrl = await createSignedDownloadUrl(product.download_url);
    if (!signedUrl) {
      // Falha na API de assinatura (rede/Storage), não erro de cadastro: o token
      // já foi reivindicado, então devolvemos o claim para o comprador poder
      // repetir. Seguro contra corrida: só quem venceu o claim chega aqui.
      try {
        await updateTable('download_tokens',
          { token: `eq.${tokenRecord.token}` },
          { used: false, used_at: null });
      } catch (revertErr) {
        console.error('[download] falha ao devolver o claim do token:', revertErr.message);
      }
      return res.status(502).json({ error: 'Não foi possível preparar o download. Tente novamente.' });
    }

    const finalUrl = signedUrl;

    await insertIntoTable('download_logs', {
      order_id: tokenRecord.order_id,
      product_id: tokenRecord.product_id,
      token,
      ip_address: extractClientIp(req) || '',
      user_agent: String(req.headers['user-agent'] || ''),
      downloaded_at: new Date().toISOString(),
    });

    // Evita que o token assinado vaze via Referer pro destino.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Download-Mode', 'signed-storage');
    return res.redirect(finalUrl);
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ error: 'Erro ao processar download' });
  }
};
