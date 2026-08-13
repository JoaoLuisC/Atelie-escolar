const { getSupabaseConfig } = require('./supabase');

// Reconhece URLs do Storage no formato:
//   https://<ref>.supabase.co/storage/v1/object/{public|sign}/<bucket>/<path>?...
// e também o formato simplificado armazenado pelo admin: "<bucket>/<path>".
const STORAGE_HOST_PATTERN = /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/?#]+)\/([^?#]+)/i;
const STORAGE_PATH_PATTERN = /^([a-z0-9_-]+)\/(.+)$/i;

const DEFAULT_TTL_SECONDS = 300; // 5 minutos

// ─── Allowlist de buckets (achado B2) ────────────────────────────────
// O regex de bucket é `[^/?#]+` / `[a-z0-9_-]+`: aceitava QUALQUER nome. Como
// quem assina é a service role (que enxerga todos os buckets do projeto), um
// download_url cadastrado como "storage/…/object/public/<outro-bucket>/<path>"
// virava uma primitiva de leitura arbitrária do Storage inteiro a partir de um
// campo de texto do painel. Aqui só existem três buckets reais — fixá-los é
// mais barato e mais seguro do que confiar no que está gravado em products.
const ALLOWED_BUCKETS = new Set(['product_images', 'product_videos', 'product_files']);

/**
 * Buckets aceitos: os três do projeto + o de SUPABASE_STORAGE_BUCKET quando
 * configurado (é valor de ambiente, definido pelo operador — nunca pelo
 * cliente nem pelo conteúdo do banco).
 */
function isAllowedBucket(bucket) {
  const name = String(bucket || '').trim();
  if (!name) return false;
  if (ALLOWED_BUCKETS.has(name)) return true;
  return name === String(process.env.SUPABASE_STORAGE_BUCKET || '').trim();
}

/**
 * Recusa travessia de diretório e segmentos vazios.
 *
 * POR QUE encodeURIComponent NÃO BASTA: ele não escapa '.', então
 * "a/../../b".split('/').map(encodeURIComponent).join('/') continua sendo
 * "a/../../b" — a normalização de path acontece do outro lado (no storage-api),
 * não aqui. A checagem tem de ser por SEGMENTO e depois do decode, senão
 * "%2e%2e" passa por cima dela.
 */
function isSafeObjectPath(path) {
  const raw = String(path || '');
  if (!raw || raw.includes('\0')) return false;

  // Checa a forma crua E a forma percent-decodificada: "%2e%2e" e "a%2f..%2fb"
  // só viram travessia depois do decode, e nem todo chamador decodifica antes
  // (o formato curto "<bucket>/<path>" chega literal do banco).
  const variants = [raw];
  if (raw.includes('%')) {
    try {
      variants.push(decodeURIComponent(raw));
    } catch {
      return false;
    }
  }

  return variants.every((variant) => variant
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..'));
}

/**
 * Tenta extrair { bucket, path } a partir do download_url cru salvo em products.
 * Retorna null para URLs externas (Google Drive, links arbitrários), para
 * buckets fora da allowlist e para paths com travessia.
 */
function parseStorageRef(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return null;
  const raw = downloadUrl.trim();
  if (!raw) return null;

  let candidate = null;

  const hostMatch = raw.match(STORAGE_HOST_PATTERN);
  if (hostMatch) {
    let decodedPath;
    try {
      // decodeURIComponent joga em sequência percent inválida ("%zz"); um dado
      // malformado no banco não pode derrubar o handler de download.
      decodedPath = decodeURIComponent(hostMatch[2]);
    } catch {
      return null;
    }
    candidate = { bucket: hostMatch[1], path: decodedPath };
  } else if (!/^https?:\/\//i.test(raw)) {
    // Formato curto: "<bucket>/<path>" (sem protocolo) — útil quando o admin
    // colar só o caminho do arquivo dentro do bucket.
    const pathMatch = raw.match(STORAGE_PATH_PATTERN);
    if (pathMatch) {
      candidate = { bucket: pathMatch[1], path: pathMatch[2] };
    }
  }

  if (!candidate) return null;
  if (!isAllowedBucket(candidate.bucket)) return null;
  if (!isSafeObjectPath(candidate.path)) return null;

  return candidate;
}

/**
 * Gera signed URL temporário (default 5 minutos) para um objeto do Storage.
 * Retorna null se a URL não é Storage ou se o serviço de assinatura falhar
 * — chamador faz fallback pro redirect legado.
 */
async function createSignedDownloadUrl(downloadUrl, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const ref = parseStorageRef(downloadUrl);
  if (!ref) return null;

  const config = getSupabaseConfig();
  if (!config) return null;

  const endpoint = `${config.url.replace(/\/+$/, '')}/storage/v1/object/sign/${encodeURIComponent(ref.bucket)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: Math.max(60, Math.min(3600, Math.round(ttlSeconds))) }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[storage-signed-url] sign falhou:', res.status, body.slice(0, 200));
      return null;
    }

    const data = await res.json();
    // Resposta da Storage API: { signedURL: "/object/sign/bucket/path?token=..." }
    const relative = data?.signedURL || data?.signedUrl;
    if (!relative) return null;

    return `${config.url.replace(/\/+$/, '')}/storage/v1${relative.startsWith('/') ? '' : '/'}${relative}`;
  } catch (err) {
    console.warn('[storage-signed-url] erro:', err.message);
    return null;
  }
}

module.exports = {
  parseStorageRef,
  createSignedDownloadUrl,
  DEFAULT_TTL_SECONDS,
  // Exportados para teste e para quem precisar validar um par bucket/path
  // antes de gravá-lo (ex.: cadastro de produto).
  isAllowedBucket,
  isSafeObjectPath,
};
