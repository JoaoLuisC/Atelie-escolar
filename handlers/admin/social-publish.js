const { ensureStoreSession } = require('../../lib/admin-session');
const { logAdminAction } = require('../../lib/admin-audit');
const { enforceRateLimit } = require('../../lib/rate-limit');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const { createLogger } = require('../../lib/logger');
const { parseOrFail } = require('../../validation');
const { socialPublishSchema } = require('../../validation/admin.schemas');

const log = createLogger('social-publish');

const LIMIT = Object.freeze({
  bucket: 'admin-social-publish',
  limit: 20,
  windowSeconds: 60 * 60,
  message: 'Limite de publicações atingido. Aguarde antes de tentar novamente.',
});

const ENV_BY_PLATFORM = Object.freeze({
  facebook: ['META_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'],
  instagram: ['META_PAGE_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ID'],
  pinterest: ['PINTEREST_ACCESS_TOKEN', 'PINTEREST_BOARD_ID'],
  tiktok: ['TIKTOK_ACCESS_TOKEN'],
  whatsapp: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
});

function configured(platform) {
  return ENV_BY_PLATFORM[platform].every((key) => String(process.env[key] || '').trim());
}

// Erro de entrada que o schema não enxerga sozinho (mídia ausente para a rede,
// imagem/vídeo grande, privacidade que a conta não permite): 400, antes de
// publicar. Antes saía como 502, como se a rede tivesse caído.
class InputError extends Error {}

// TikTok: arquivo de até 64 MB vai num pedaço só (`total_chunk_count: 1`); acima
// disso a API exige upload em partes, que este endpoint não faz.
const TIKTOK_MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
// Instagram recusa imagem acima de 8 MB; o Pinterest aceita mais, mas 8 MB já
// cobre qualquer imagem de vitrine.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Tamanho anunciado pela URL pública (HEAD). Desconhecido = não bloqueia. */
async function remoteSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5_000) });
    const length = Number(response.headers.get('content-length'));
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
}

/**
 * Mensagem clara por tipo de falha externa, sem repassar a resposta crua da
 * API (que pode trazer ids internos). 401/403 = token vencido ou escopo
 * faltando; 429 = limite da própria rede.
 */
function externalFailure(error) {
  const status = Number(error?.statusCode);
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return {
      status: 502,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'A rede social não respondeu a tempo. Tente de novo.',
    };
  }
  if (status === 401 || status === 403) {
    return {
      status: 422,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message:
        'A rede recusou a autorização: o acesso venceu ou falta permissão. Reconecte a conta e tente de novo.',
    };
  }
  if (status === 429) {
    return {
      status: 429,
      code: ERROR_CODES.RATE_LIMITED,
      message: 'A rede social limitou as publicações agora. Tente mais tarde.',
    };
  }
  if (status >= 400 && status < 500) {
    return {
      status: 422,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'A rede social recusou a publicação. Confira a mídia e o texto.',
    };
  }
  return {
    status: 502,
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
    message: 'A rede social está indisponível agora. Tente de novo.',
  };
}

async function jsonRequest(url, { token, method = 'POST', body }) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data?.error && data.error.code !== 'ok')) {
    const error = new Error(
      data?.error?.message || data?.message || `API externa respondeu ${response.status}.`,
    );
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

module.exports = async function socialPublishHandler(req, res) {
  // Ordem da regra A3: CORS → método → autenticação → rate limit → schema → try.
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['GET', 'POST'])) return;
  if (!ensureStoreSession(req, res)) return;

  if (req.method === 'GET') {
    return ok(res, {
      platforms: Object.fromEntries(
        Object.keys(ENV_BY_PLATFORM).map((name) => [name, configured(name)]),
      ),
    });
  }

  const gate = await enforceRateLimit(req, res, LIMIT);
  if (gate.blocked) return;

  // Regra B1: forma e tetos validados antes de qualquer chamada externa — o
  // HEAD da imagem e as APIs das redes só rodam com entrada já aceita.
  const parsed = parseOrFail(res, socialPublishSchema, req.body || {});
  if (!parsed.ok) return;
  const { platform, caption, mediaUrl, link, recipient, videoSize, title } = parsed.data;
  const privacy = parsed.data.privacy || 'SELF_ONLY';

  if (!configured(platform)) {
    return fail(res, {
      status: 503,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Conecte e autorize esta rede nas variáveis do ambiente antes de publicar.',
    });
  }

  try {
    if (mediaUrl && ['facebook', 'instagram', 'pinterest'].includes(platform)) {
      const bytes = await remoteSize(mediaUrl);
      if (bytes && bytes > MAX_IMAGE_BYTES) throw new InputError('A imagem precisa ter até 8 MB.');
    }
    const graphVersion = String(process.env.META_GRAPH_VERSION || 'v24.0');
    const graph = `https://graph.facebook.com/${graphVersion}`;
    let result;

    if (platform === 'facebook') {
      const id = process.env.FACEBOOK_PAGE_ID;
      result = mediaUrl
        ? await jsonRequest(`${graph}/${id}/photos`, {
            token: process.env.META_PAGE_ACCESS_TOKEN,
            body: { url: mediaUrl, caption },
          })
        : await jsonRequest(`${graph}/${id}/feed`, {
            token: process.env.META_PAGE_ACCESS_TOKEN,
            body: { message: caption, ...(link ? { link } : {}) },
          });
    } else if (platform === 'instagram') {
      if (!mediaUrl) throw new InputError('O Instagram exige uma imagem pública em HTTPS.');
      const account = process.env.INSTAGRAM_BUSINESS_ID;
      const container = await jsonRequest(`${graph}/${account}/media`, {
        token: process.env.META_PAGE_ACCESS_TOKEN,
        body: { image_url: mediaUrl, caption },
      });
      result = await jsonRequest(`${graph}/${account}/media_publish`, {
        token: process.env.META_PAGE_ACCESS_TOKEN,
        body: { creation_id: container.id },
      });
    } else if (platform === 'pinterest') {
      if (!mediaUrl) throw new InputError('O Pinterest exige uma imagem pública em HTTPS.');
      result = await jsonRequest('https://api.pinterest.com/v5/pins', {
        token: process.env.PINTEREST_ACCESS_TOKEN,
        body: {
          board_id: process.env.PINTEREST_BOARD_ID,
          title: title || caption.slice(0, 100),
          description: caption,
          ...(link ? { link } : {}),
          media_source: { source_type: 'image_url', url: mediaUrl },
        },
      });
    } else if (platform === 'whatsapp') {
      // Mensagem de texto não tem campo de link: ele vai NO corpo, e
      // `preview_url` só pede ao WhatsApp a prévia do link que está lá.
      result = await jsonRequest(`${graph}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        token: process.env.WHATSAPP_ACCESS_TOKEN,
        body: {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { preview_url: Boolean(link), body: link ? `${caption}\n${link}` : caption },
        },
      });
    } else {
      // O schema já garante inteiro positivo quando a rede é o TikTok.
      const size = videoSize;
      if (size > TIKTOK_MAX_SINGLE_CHUNK)
        throw new InputError('O vídeo para o TikTok precisa ter até 64 MB.');
      // A API exige consultar o criador antes de postar e só aceita uma das
      // privacidades que ele devolve (cliente não auditado: só SELF_ONLY).
      const creator = await jsonRequest(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        {
          token: process.env.TIKTOK_ACCESS_TOKEN,
          body: {},
        },
      );
      const allowed = creator?.data?.privacy_level_options || [];
      if (!allowed.includes(privacy)) {
        throw new InputError(
          `Esta conta do TikTok só permite publicar como: ${allowed.join(', ') || 'nenhuma opção disponível'}.`,
        );
      }
      result = await jsonRequest('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        token: process.env.TIKTOK_ACCESS_TOKEN,
        body: {
          post_info: {
            title: caption,
            privacy_level: privacy,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            brand_content_toggle: false,
            brand_organic_toggle: true,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: size,
            chunk_size: size,
            total_chunk_count: 1,
          },
        },
      });
    }

    const externalId = String(
      result?.id || result?.data?.publish_id || result?.messages?.[0]?.id || 'accepted',
    );
    await logAdminAction({
      req,
      action: 'publish',
      targetType: 'social_post',
      targetId: `${platform}:${externalId}`,
      after: {
        platform,
        externalId,
        hasMedia: Boolean(mediaUrl || videoSize),
        hasLink: Boolean(link),
      },
    });
    return ok(res, { platform, result });
  } catch (error) {
    if (error instanceof InputError) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: error.message,
      });
    }
    // O cliente recebe a tradução; o motivo cru fica no log (regra F1), que é
    // onde dá para ver se foi token vencido, limite da rede ou mídia recusada.
    log.warn('publicacao_falhou', {
      platform,
      status: Number(error?.statusCode) || null,
      reason: error?.message || String(error),
    });
    return fail(res, externalFailure(error));
  }
};
