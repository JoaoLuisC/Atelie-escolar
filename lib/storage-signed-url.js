const { getSupabaseConfig } = require('./supabase');

// Reconhece URLs do Storage no formato:
//   https://<ref>.supabase.co/storage/v1/object/{public|sign}/<bucket>/<path>?...
// e também o formato simplificado armazenado pelo admin: "<bucket>/<path>".
const STORAGE_HOST_PATTERN = /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/?#]+)\/([^?#]+)/i;
const STORAGE_PATH_PATTERN = /^([a-z0-9_-]+)\/(.+)$/i;

const DEFAULT_TTL_SECONDS = 300; // 5 minutos

/**
 * Tenta extrair { bucket, path } a partir do download_url cru salvo em products.
 * Retorna null para URLs externas (Google Drive, links arbitrários).
 */
function parseStorageRef(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return null;
  const raw = downloadUrl.trim();
  if (!raw) return null;

  const hostMatch = raw.match(STORAGE_HOST_PATTERN);
  if (hostMatch) {
    return { bucket: hostMatch[1], path: decodeURIComponent(hostMatch[2]) };
  }

  // Formato curto: "<bucket>/<path>" (sem protocolo) — útil quando o admin
  // colar só o caminho do arquivo dentro do bucket.
  if (!/^https?:\/\//i.test(raw)) {
    const pathMatch = raw.match(STORAGE_PATH_PATTERN);
    if (pathMatch) {
      return { bucket: pathMatch[1], path: pathMatch[2] };
    }
  }

  return null;
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
};
