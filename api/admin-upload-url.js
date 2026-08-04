const crypto = require('node:crypto');
const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { getSupabaseConfig } = require('../lib/supabase');

const BUCKETS = {
  image: { name: 'product_images', isPublic: true, maxSize: 10 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'] },
  video: { name: 'product_videos', isPublic: false, maxSize: 50 * 1024 * 1024, mimes: ['video/mp4', 'video/webm', 'video/quicktime'] },
  download: { name: 'product_files', isPublic: false, maxSize: 50 * 1024 * 1024, mimes: null },
};

// Extensões aceitas por bucket com whitelist (image/video). Para 'download'
// usamos denylist das extensões web-renderáveis/executáveis (o bucket é
// privado, mas defesa em profundidade).
const EXT_ALLOW = {
  image: new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']),
  video: new Set(['mp4', 'webm', 'mov', 'quicktime']),
};
const EXT_DENY = new Set(['svg', 'svgz', 'html', 'htm', 'xhtml', 'shtml', 'xml', 'js', 'mjs', 'php', 'phtml', 'phar', 'htaccess', 'exe', 'bat', 'cmd', 'sh']);

function getExtension(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function slugifyFilename(name) {
  const cleaned = String(name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || 'arquivo';
}

module.exports = async function handler(req, res) {
  setAdminCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!ensureAdminSession(req, res)) return;

  const { kind, filename, mimeType } = req.body || {};
  const bucket = BUCKETS[kind];
  if (!bucket) return res.status(400).json({ success: false, error: 'kind inválido (image|video|download)' });
  if (!filename || typeof filename !== 'string') return res.status(400).json({ success: false, error: 'filename obrigatório' });

  const ext = getExtension(filename);
  const normalizedMime = String(mimeType || '').toLowerCase();

  // Validação por EXTENSÃO (sempre roda — não depende do mimeType, que o cliente
  // pode omitir). Buckets com whitelist exigem extensão permitida; 'download'
  // apenas barra extensões perigosas.
  if (EXT_ALLOW[kind]) {
    if (!ext || !EXT_ALLOW[kind].has(ext)) {
      return res.status(400).json({ success: false, error: `Extensão de arquivo não suportada para ${kind}.` });
    }
  } else if (ext && EXT_DENY.has(ext)) {
    return res.status(400).json({ success: false, error: 'Tipo de arquivo não permitido.' });
  }

  // Se o mimeType for enviado, ele também precisa bater com a whitelist do bucket.
  if (bucket.mimes && normalizedMime && !bucket.mimes.includes(normalizedMime)) {
    return res.status(400).json({ success: false, error: `Tipo de arquivo não suportado: ${mimeType}` });
  }

  // Cinturão e suspensório: nunca deixar SVG/HTML entrar no bucket público
  // (renderizados pelo navegador executam <script> → stored XSS no domínio do storage).
  if (bucket.isPublic && (ext === 'svg' || ext === 'svgz' || normalizedMime === 'image/svg+xml' || normalizedMime.includes('html'))) {
    return res.status(400).json({ success: false, error: 'Tipo de arquivo não permitido em bucket público.' });
  }

  const config = getSupabaseConfig();
  if (!config) return res.status(500).json({ success: false, error: 'Supabase não configurado' });

  const safe = slugifyFilename(filename);
  const ts = Date.now();
  const rand = crypto.randomBytes(3).toString('hex');
  const path = `${ts}-${rand}-${safe}`;
  const base = config.url.replace(/\/+$/, '');

  try {
    const r = await fetch(
      `${base}/storage/v1/object/upload/sign/${encodeURIComponent(bucket.name)}/${path.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    );

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[admin-upload-url] storage sign falhou:', r.status, body.slice(0, 200));
      return res.status(500).json({ success: false, error: 'Falha ao gerar URL de upload' });
    }

    const data = await r.json();
    const signedRel = data?.url || '';
    if (!signedRel) {
      return res.status(500).json({ success: false, error: 'Resposta inválida do Storage' });
    }

    const uploadUrl = `${base}/storage/v1${signedRel.startsWith('/') ? '' : '/'}${signedRel}`;
    const finalUrl = bucket.isPublic
      ? `${base}/storage/v1/object/public/${bucket.name}/${path}`
      : `${bucket.name}/${path}`;

    return res.status(200).json({
      success: true,
      uploadUrl,
      finalUrl,
      bucket: bucket.name,
      path,
      isPublic: bucket.isPublic,
      maxSize: bucket.maxSize,
    });
  } catch (err) {
    console.error('[admin-upload-url] erro:', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};
