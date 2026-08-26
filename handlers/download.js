const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('../lib/supabase');
const { createSignedDownloadUrl, parseStorageRef } = require('../lib/storage-signed-url');
const { extractClientIp, recordSecurityEvent } = require('../lib/security-logger');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { ERROR_CODES, fail, methodNotAllowed } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('download');

module.exports = async function downloadHandler(req, res) {
  // ── Headers de privacidade aplicados a TODAS as respostas ────────────
  // Postos aqui no topo, e não só antes do redirect, para valerem também nos
  // 400/401/404/502 — qualquer resposta desta rota carrega o token na URL.
  //
  // - Referrer-Policy: no-referrer → impede que o token vaze no header Referer
  //   para o host do Storage (destino do redirect) e para qualquer recurso
  //   carregado a partir da resposta.
  // - Cache-Control: no-store → impede que proxy/CDN/cache do navegador guarde
  //   a resposta que contém (ou redireciona a partir de) um token de uso único;
  //   sem isso, um 302 cacheado poderia ser reproduzido por terceiros na mesma
  //   rede compartilhada.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET', 'OPTIONS']);
  }

  // Regra E1. ANTES de qualquer consulta: o custo de enumerar tokens não pode
  // ser pago pelo banco, e a diferença entre 401 "Token inválido" e o redirect
  // já é o oráculo que torna a varredura interessante. Dois baldes — repetição
  // do mesmo token é barata, tokens DISTINTOS é que ficam caros. Ver
  // RATE_LIMITS.download.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.download);
  if (gate.blocked) return;

  try {
    // ── POR QUE O TOKEN CONTINUA NA QUERY STRING (achado M6) ───────────
    // O padrão do projeto é o oposto — api/me-delete-account.js:258-260 aceita
    // token SOMENTE no corpo POST, justamente porque a query vaza por Referer,
    // logs e histórico. Aqui a exceção é DELIBERADA: este link é clicado
    // diretamente pelo comprador, inclusive a partir de e-mails de confirmação
    // JÁ ENVIADOS. Trocar para POST quebraria a entrega de todo pedido antigo,
    // e nenhum <a href> consegue emitir POST. O risco residual é contido de
    // outro jeito: token aleatório de 32 bytes, uso ÚNICO com claim atômico,
    // validade de 72h, Referrer-Policy: no-referrer e Cache-Control: no-store
    // acima. Um token vazado em log já foi queimado no primeiro uso.
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Token é obrigatório',
      });
    }

    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado',
      });
    }

    const tokenRecord = await getTableRow('download_tokens', {
      select: 'token,order_id,product_id,used,expires_at',
      filters: [{ column: 'token', value: token }],
    });

    if (!tokenRecord) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.DOWNLOAD_TOKEN_INVALID,
        message: 'Token inválido',
      });
    }

    if (tokenRecord.used === true) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.DOWNLOAD_TOKEN_USED,
        message: 'Token já utilizado',
      });
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at).getTime() < Date.now()) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED,
        message: 'Token expirado',
      });
    }

    const product = await getTableRow('products', {
      select: 'id,name,download_url',
      filters: [{ column: 'id', value: tokenRecord.product_id }],
    });

    if (!product) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.PRODUCT_NOT_FOUND,
        message: 'Produto não encontrado',
      });
    }

    if (!product.download_url) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.DOWNLOAD_UNAVAILABLE,
        message: 'Link de download não encontrado',
      });
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
      return fail(res, {
        status: 500,
        code: ERROR_CODES.DOWNLOAD_UNAVAILABLE,
        message: 'Arquivo indisponível. Fale com o suporte.',
      });
    }

    // Uso único ATÔMICO: marca used=false → true condicionando no próprio UPDATE.
    // Só prossegue quem "ganhar" a transição; requisições concorrentes com o
    // mesmo token recebem 0 linhas afetadas e são barradas (evita download duplo).
    // Feito ANTES de gerar a signed URL, mas só depois de validar o produto para
    // não consumir o token por erro de dado.
    const claimed = await updateTable(
      'download_tokens',
      { token: `eq.${tokenRecord.token}`, used: 'is.false' },
      { used: true, used_at: new Date().toISOString() },
    );

    if (!Array.isArray(claimed) || claimed.length === 0) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.DOWNLOAD_TOKEN_USED,
        message: 'Token já utilizado',
      });
    }

    // Signed URL temporário (5 min) para o objeto privado do Storage.
    const signedUrl = await createSignedDownloadUrl(product.download_url);
    if (!signedUrl) {
      // Falha na API de assinatura (rede/Storage), não erro de cadastro: o token
      // já foi reivindicado, então devolvemos o claim para o comprador poder
      // repetir. Seguro contra corrida: só quem venceu o claim chega aqui.
      try {
        await updateTable(
          'download_tokens',
          { token: `eq.${tokenRecord.token}` },
          { used: false, used_at: null },
        );
      } catch (revertErr) {
        log.error('falha_ao_devolver_o_claim_do_token', { reason: revertErr.message });
      }
      return fail(res, {
        status: 502,
        code: ERROR_CODES.DOWNLOAD_UNAVAILABLE,
        message: 'Não foi possível preparar o download. Tente novamente.',
      });
    }

    const finalUrl = signedUrl;

    // Log de auditoria BEST-EFFORT, e a ordem dos fatos explica por quê: neste
    // ponto o token já foi reivindicado (irreversível — devolver o claim aqui
    // liberaria um segundo download) e a URL assinada já existe. Se este INSERT
    // subisse a exceção, ele cairia no catch geral, o comprador receberia 500 e
    // a próxima tentativa bateria em "Token já utilizado": o cliente PAGOU e
    // nunca baixa o arquivo, por causa de uma escrita que não decide nada.
    //
    // A troca é deliberada: uma linha de auditoria a menos custa menos que uma
    // entrega perdida, e o fato do uso não se perde — `download_tokens.used_at`
    // já foi carimbado no claim atômico acima, que é o registro que importa para
    // a regra de uso único. A falha vai para o stdout (capturado pela Vercel)
    // para não sumir em silêncio.
    try {
      await insertIntoTable('download_logs', {
        order_id: tokenRecord.order_id,
        product_id: tokenRecord.product_id,
        token,
        ip_address: extractClientIp(req) || '',
        user_agent: String(req.headers['user-agent'] || ''),
        downloaded_at: new Date().toISOString(),
      });
    } catch (logErr) {
      log.error('falha_ao_gravar_download_logs_entrega_segue', { reason: logErr.message });
    }

    // Referrer-Policy: no-referrer e Cache-Control: no-store já foram postos no
    // topo do handler (valem para todas as respostas, não só para este redirect).
    res.setHeader('X-Download-Mode', 'signed-storage');
    return res.redirect(finalUrl);
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao processar download',
    });
  }
};
