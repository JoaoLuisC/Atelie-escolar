const crypto = require('node:crypto');
const { ensureAdminSession } = require('../../lib/admin-session');
const { getSupabaseConfig } = require('../../lib/supabase');
const { isSafeObjectPath } = require('../../lib/storage-signed-url');
const { recordSecurityEvent } = require('../../lib/security-logger');
const {
  ERROR_CODES,
  fail,
  methodNotAllowed,
  ok,
  preflight,
  setAdminCorsHeaders,
} = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-upload-url');

// ════════════════════════════════════════════════════════════════════
// LIMITE DA API DE SIGNED UPLOAD (achado M4) — leia antes de mexer.
//
// `POST /storage/v1/object/upload/sign/<bucket>/<path>` devolve um token que
// autoriza um PUT naquele caminho. O token codifica bucket, path, dono e
// expiração — e SÓ isso. Não existe campo para fixar Content-Type nem tamanho
// máximo: quem faz o PUT escolhe o header `Content-Type` e envia quantos bytes
// quiser. Ou seja, o `mimeType` e o `filename` que este handler valida são
// DECLARAÇÕES do cliente, e o `maxSize` que ele devolve é apenas um aviso para
// a UI — nada disso vincula o upload.
//
// O que fazemos a respeito, em três camadas:
//   1. Validação da declaração (extensão/MIME) — barra o erro honesto e o
//      atacante preguiçoso, e define o path final (sempre com extensão da
//      whitelist no bucket público, para não servir conteúdo ativo).
//   2. Política NO BUCKET (ensureBucketPolicy) — é o único ponto onde o
//      Storage realmente impõe tamanho e content-type. `file_size_limit` e
//      `allowed_mime_types` são verificados pelo storage-api no momento do PUT,
//      inclusive em upload assinado, e valem para qualquer cliente.
//   3. Confirmação PÓS-upload (action: 'confirm') — lê os metadados reais do
//      objeto gravado e apaga o que violar a política, antes que a URL entre em
//      products. É a rede que pega o que passou pelas duas anteriores.
// ════════════════════════════════════════════════════════════════════

// `enforcePrivate` só em product_files: é conteúdo PAGO, cujo único caminho
// legítimo de entrega é o signed URL de api/download.js (que funciona com o
// bucket privado). Bucket público ali torna o arquivo alcançável por adivinhação
// de path, contornando o gate de pagamento — por isso este é o único caso em que
// mexemos na visibilidade. Em product_images/product_videos a visibilidade real
// é apenas conferida e reportada: o front serve essas mídias direto pela URL
// (<img>/<video>), então virar o flag aqui quebraria a vitrine.
const BUCKETS = {
  image: {
    name: 'product_images',
    isPublic: true,
    maxSize: 10 * 1024 * 1024,
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
  },
  video: {
    name: 'product_videos',
    isPublic: false,
    maxSize: 50 * 1024 * 1024,
    mimes: ['video/mp4', 'video/webm', 'video/quicktime'],
  },
  download: {
    name: 'product_files',
    isPublic: false,
    enforcePrivate: true,
    maxSize: 50 * 1024 * 1024,
    mimes: null,
  },
};

// Extensões aceitas por bucket com whitelist (image/video). Para 'download'
// usamos denylist das extensões web-renderáveis/executáveis (o bucket é
// privado, mas defesa em profundidade).
const EXT_ALLOW = {
  image: new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']),
  video: new Set(['mp4', 'webm', 'mov', 'quicktime']),
};
const EXT_DENY = new Set([
  'svg',
  'svgz',
  'html',
  'htm',
  'xhtml',
  'shtml',
  'xml',
  'js',
  'mjs',
  'php',
  'phtml',
  'phar',
  'htaccess',
  'exe',
  'bat',
  'cmd',
  'sh',
]);

// MIMEs que o navegador RENDERIZA como documento ativo. Nunca podem ficar
// gravados no bucket público: o Storage serve o objeto no domínio do projeto
// Supabase, então um text/html ou image/svg+xml ali é XSS armazenado.
const ACTIVE_CONTENT_MIMES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
]);

// O XHR do painel só manda Content-Type quando o browser reconhece o arquivo
// (`if (file.type)` em src/services/admin-panel.js). Sem isso o storage-api
// grava como octet-stream — que o navegador BAIXA em vez de renderizar, logo é
// inofensivo. Precisa estar na allowlist do bucket para não quebrar o upload
// legítimo de um arquivo cujo tipo o browser não soube identificar.
const NEUTRAL_MIME = 'application/octet-stream';

function getExtension(name) {
  const match = String(name || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

/**
 * Slug do nome SEM extensão: pontos viram hífen para que o objeto gravado tenha
 * exatamente UMA extensão — a que foi validada. Sem isso, "planilha.html.png"
 * chegaria ao bucket com uma extensão intermediária que servidores mal
 * configurados (e humanos) leem como o tipo do arquivo.
 */
function slugifyBase(name) {
  const withoutExt = String(name || '').replace(/\.[a-z0-9]+$/i, '');
  const cleaned = withoutExt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || 'arquivo';
}

function storageBase(config) {
  return config.url.replace(/\/+$/, '');
}

function storageHeaders(config, extra = {}) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    ...extra,
  };
}

function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

// ─── Camada 2: política imposta pelo próprio Storage ─────────────────
// Cache por processo: em serverless isso roda uma vez por cold start da função
// de upload, não a cada requisição. Best-effort — se a API de buckets recusar
// (versão antiga, permissão, bucket inexistente), o upload continua funcionando
// com as camadas 1 e 3; o que não pode é a tela do admin quebrar por causa de
// uma convergência de configuração.
const bucketPolicyApplied = new Set();

async function fetchBucketConfig(config, bucketName) {
  const response = await fetch(
    `${storageBase(config)}/storage/v1/bucket/${encodeURIComponent(bucketName)}`,
    {
      method: 'GET',
      headers: storageHeaders(config),
    },
  );
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/**
 * Decide a visibilidade a enviar no PUT. O flag `public` vai SEMPRE no corpo,
 * com o valor atual quando não há motivo para mudá-lo: omitir um campo num PUT
 * de bucket depende do comportamento da versão do storage-api, e não vale
 * arriscar tornar um bucket público por acidente de serialização.
 */
async function resolveBucketVisibility(bucket, current) {
  const currentPublic = current?.public === true;

  if (bucket.enforcePrivate && currentPublic) {
    await recordSecurityEvent({
      eventName: 'storage_bucket_unexpectedly_public',
      severity: 'error',
      properties: { bucket: bucket.name, action: 'forced_private' },
    });
    return false;
  }

  if (currentPublic !== bucket.isPublic) {
    // Divergência sem risco de entrega paga: apenas reportar. Trocar o flag
    // aqui mudaria como o site serve mídia de vitrine.
    log.warn('visibilidade_divergente', {
      bucket: bucket.name,
      esperado: bucket.isPublic,
      atual: currentPublic,
    });
  }

  return currentPublic;
}

async function ensureBucketPolicy(config, bucket) {
  if (bucketPolicyApplied.has(bucket.name)) return;
  // Marca ANTES do await: duas requisições concorrentes no mesmo processo não
  // precisam repetir a convergência. Se falhar, a próxima tentativa acontece no
  // próximo cold start — é configuração, não caminho crítico.
  bucketPolicyApplied.add(bucket.name);

  try {
    const current = await fetchBucketConfig(config, bucket.name);
    if (!current) {
      log.warn('nao_foi_possivel_ler_a_config_do_bucket', { bucket: bucket.name });
      return;
    }

    const response = await fetch(
      `${storageBase(config)}/storage/v1/bucket/${encodeURIComponent(bucket.name)}`,
      {
        method: 'PUT',
        headers: storageHeaders(config, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          public: await resolveBucketVisibility(bucket, current),
          file_size_limit: bucket.maxSize,
          allowed_mime_types: bucket.mimes ? [...bucket.mimes, NEUTRAL_MIME] : null,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.warn('politica_do_bucket_nao_aplicada', {
        bucket: bucket.name,
        status: response.status,
        body: body.slice(0, 200),
      });
    }
  } catch (err) {
    log.warn('politica_do_bucket_falhou', { bucket: bucket.name, reason: err.message });
  }
}

/** Metadados reais do objeto gravado (tamanho e content-type). */
async function fetchObjectMetadata(config, bucket, path) {
  const response = await fetch(
    `${storageBase(config)}/storage/v1/object/list/${encodeURIComponent(bucket.name)}`,
    {
      method: 'POST',
      headers: storageHeaders(config, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: '', limit: 100, offset: 0, search: path }),
    },
  );

  if (!response.ok) return null;

  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) return null;

  // A busca do Storage é por ILIKE; só serve o objeto com o nome EXATO.
  const row = rows.find((item) => item?.name === path);
  if (!row) return null;

  return {
    size: Number(row?.metadata?.size ?? row?.metadata?.contentLength ?? 0),
    mime: String(row?.metadata?.mimetype ?? row?.metadata?.mimeType ?? '').toLowerCase(),
  };
}

async function deleteObject(config, bucket, path) {
  try {
    await fetch(`${storageBase(config)}/storage/v1/object/${encodeURIComponent(bucket.name)}`, {
      method: 'DELETE',
      headers: storageHeaders(config, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [path] }),
    });
  } catch (err) {
    log.warn('falha_ao_remover_objeto_rejeitado', {
      bucket: bucket.name,
      path,
      reason: err.message,
    });
  }
}

function buildFinalUrl(config, bucket, path) {
  return bucket.isPublic
    ? `${storageBase(config)}/storage/v1/object/public/${bucket.name}/${path}`
    : `${bucket.name}/${path}`;
}

/** Validação das DECLARAÇÕES do cliente (camada 1). */
function rejectDeclaredFile(kind, bucket, filename, mimeType) {
  const ext = getExtension(filename);
  const normalizedMime = String(mimeType || '').toLowerCase();

  // Validação por EXTENSÃO (sempre roda — não depende do mimeType, que o cliente
  // pode omitir). Buckets com whitelist exigem extensão permitida; 'download'
  // apenas barra extensões perigosas.
  if (EXT_ALLOW[kind]) {
    if (!ext || !EXT_ALLOW[kind].has(ext)) {
      return `Extensão de arquivo não suportada para ${kind}.`;
    }
  } else if (ext && EXT_DENY.has(ext)) {
    return 'Tipo de arquivo não permitido.';
  }

  // Se o mimeType for enviado, ele também precisa bater com a whitelist do bucket.
  if (bucket.mimes && normalizedMime && !bucket.mimes.includes(normalizedMime)) {
    return `Tipo de arquivo não suportado: ${mimeType}`;
  }

  // Cinturão e suspensório: nunca deixar SVG/HTML entrar no bucket público
  // (renderizados pelo navegador executam <script> → stored XSS no domínio do storage).
  if (
    bucket.isPublic &&
    (ext === 'svg' ||
      ext === 'svgz' ||
      ACTIVE_CONTENT_MIMES.has(normalizedMime) ||
      normalizedMime.includes('html'))
  ) {
    return 'Tipo de arquivo não permitido em bucket público.';
  }

  return null;
}

// ─── Ação 1: emitir a URL assinada ───────────────────────────────────
async function handleSign(req, res, { kind, bucket, config }) {
  const { filename, mimeType } = req.body || {};
  if (!filename || typeof filename !== 'string') {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'filename obrigatório',
    });
  }

  const declaredError = rejectDeclaredFile(kind, bucket, filename, mimeType);
  if (declaredError) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: declaredError,
    });
  }

  await ensureBucketPolicy(config, bucket);

  const ext = getExtension(filename);
  const ts = Date.now();
  const rand = crypto.randomBytes(3).toString('hex');
  const path = `${ts}-${rand}-${slugifyBase(filename)}${ext ? `.${ext}` : ''}`;
  const base = storageBase(config);

  try {
    const r = await fetch(
      `${base}/storage/v1/object/upload/sign/${encodeURIComponent(bucket.name)}/${encodePath(path)}`,
      {
        method: 'POST',
        headers: storageHeaders(config, { 'Content-Type': 'application/json' }),
        body: '{}',
      },
    );

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      log.error('storage_sign_falhou', { status: r.status, body: body.slice(0, 200) });
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Falha ao gerar URL de upload',
      });
    }

    const data = await r.json();
    const signedRel = data?.url || '';
    if (!signedRel) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Resposta inválida do Storage',
      });
    }

    return ok(res, {
      success: true,
      uploadUrl: `${base}/storage/v1${signedRel.startsWith('/') ? '' : '/'}${signedRel}`,
      finalUrl: buildFinalUrl(config, bucket, path),
      bucket: bucket.name,
      path,
      isPublic: bucket.isPublic,
      // maxSize continua sendo só um aviso para a UI abortar cedo — a imposição
      // real está no bucket (camada 2) e na confirmação (camada 3).
      maxSize: bucket.maxSize,
      // Contrato para o painel: depois do PUT, chame este mesmo endpoint com
      // { action: 'confirm', kind, path } e só grave finalUrl no produto se a
      // confirmação responder success. Ver nota no topo do arquivo.
      confirmRequired: true,
    });
  } catch (err) {
    log.error('handler_failed', { reason: err.message });
    return fail(res, { status: 500, code: ERROR_CODES.INTERNAL_ERROR, message: 'Erro interno' });
  }
}

// ─── Ação 2: conferir o que REALMENTE foi gravado ────────────────────
async function handleConfirm(req, res, { bucket, config }) {
  const path = String(req.body?.path || '').trim();

  // O path é escolhido pelo servidor no sign; aceitar um path arbitrário aqui
  // transformaria a confirmação numa primitiva de LEITURA/EXCLUSÃO de qualquer
  // objeto do bucket. Só o formato que handleSign gera passa.
  if (!isSafeObjectPath(path) || !/^\d{13}-[0-9a-f]{6}-[a-z0-9\-_]+(\.[a-z0-9]+)?$/.test(path)) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'path inválido',
    });
  }

  const meta = await fetchObjectMetadata(config, bucket, path);
  if (!meta) {
    return fail(res, {
      status: 404,
      code: ERROR_CODES.NOT_FOUND,
      message: 'Objeto não encontrado no Storage.',
    });
  }

  const reasons = [];
  if (meta.size > bucket.maxSize) {
    reasons.push('tamanho acima do limite');
  }
  if (
    bucket.mimes &&
    meta.mime &&
    meta.mime !== NEUTRAL_MIME &&
    !bucket.mimes.includes(meta.mime)
  ) {
    reasons.push(`content-type não permitido (${meta.mime})`);
  }
  if (bucket.isPublic && ACTIVE_CONTENT_MIMES.has(meta.mime)) {
    reasons.push('conteúdo ativo em bucket público');
  }

  if (reasons.length > 0) {
    // Apagar é obrigatório, não cosmético: o objeto já está no bucket e, no
    // bucket público, já é alcançável por quem souber o path.
    await deleteObject(config, bucket, path);
    log.warn('objeto_rejeitado_e_removido', {
      bucket: bucket.name,
      path,
      reasons: reasons.join('; '),
    });
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Upload rejeitado (${reasons.join('; ')}). O arquivo foi removido.`,
    });
  }

  return ok(res, {
    success: true,
    verified: true,
    bucket: bucket.name,
    path,
    finalUrl: buildFinalUrl(config, bucket, path),
    size: meta.size,
    contentType: meta.mime || null,
    isPublic: bucket.isPublic,
  });
}

module.exports = async function adminUploadUrlHandler(req, res) {
  setAdminCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return preflight(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);
  if (!ensureAdminSession(req, res)) return;

  const { kind, action } = req.body || {};
  const bucket = BUCKETS[kind];
  if (!bucket)
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'kind inválido (image|video|download)',
    });

  const config = getSupabaseConfig();
  if (!config)
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Supabase não configurado',
    });

  const normalizedAction = String(action || 'sign').toLowerCase();
  if (normalizedAction === 'confirm') {
    try {
      return await handleConfirm(req, res, { bucket, config });
    } catch (err) {
      log.error('handler_failed', { reason: err.message });
      return fail(res, { status: 500, code: ERROR_CODES.INTERNAL_ERROR, message: 'Erro interno' });
    }
  }

  if (normalizedAction !== 'sign') {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'action inválida (sign|confirm)',
    });
  }

  return handleSign(req, res, { kind, bucket, config });
};
