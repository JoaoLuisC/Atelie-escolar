const { getSupabaseConfig } = require('../lib/supabase');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');
const { CATALOG_CACHE_CONTROL } = require('../lib/public-catalog');
const { readSettingValue, sanitizeHomeContent } = require('../lib/store-content');

const log = createLogger('home-content');

// Textos e blocos da página inicial, editados na aba "Página inicial" do
// painel. Devolve SÓ o que a admin salvou, já limpo — o front completa com os
// textos padrão o que estiver ausente (src/constants/home-content.js). Sem nada
// salvo, `content` sai `{}` e a home mostra o padrão inteiro.
module.exports = async function homeContentHandler(req, res) {
  if (guardMethod(req, res, ['GET'])) return;

  // Regra E1 — mesmo perfil dos outros endpoints públicos do catálogo.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.catalog);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado',
      });
    }

    // Limpa de novo na leitura: uma linha gravada à mão no banco não fura a
    // regra de formato que o painel aplica na escrita.
    const { value } = sanitizeHomeContent(await readSettingValue('homeContent'));

    // Mesmo cache do catálogo: a admin vê a mudança no ar em até ~1 min.
    res.setHeader('Cache-Control', CATALOG_CACHE_CONTROL);
    return ok(res, { content: value });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao carregar a página inicial',
    });
  }
};
