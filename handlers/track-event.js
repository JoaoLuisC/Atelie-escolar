const { isClientEventAllowed, recordEvent } = require('../lib/analytics-events');
const { getSupabaseConfig } = require('../lib/supabase'); // helpers vêm de lib/analytics-events.js
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { guardMethod } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('track-event');

module.exports = async function trackEventHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // RATE_LIMITS.trackEvent existia desde a rodada do P1-3, mas nenhum handler o
  // chamava — o preset era configuração morta e este endpoint seguia sem teto
  // nenhum em produção (o trackEventLimiter de 120/min mora em
  // routes/api-compat.routes.js, que só roda no Express de dev).
  //
  // Importa mais aqui do que parece: a migration de hardening REVOGOU o INSERT
  // anônimo em analytics_events justamente para que esta função, com service
  // role, fosse o único caminho de escrita. Isso concentrou toda a superfície de
  // flood em um endpoint público e sem autenticação — sem contador, um laço
  // simples enche a tabela e a conta do Supabase.
  //
  // O 429 daqui não quebra o cliente: o front dispara tracking como efeito
  // colateral e ignora o resultado, exatamente como já ignora os 204.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.trackEvent);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      // Falha silenciosa: tracking não pode quebrar o cliente.
      return res.status(204).end();
    }

    const body = req.body || {};
    const eventName = String(body.event_name || '').slice(0, 64);

    if (!eventName || !isClientEventAllowed(eventName)) {
      return res.status(204).end();
    }

    await recordEvent({
      eventName,
      sessionId: body.session_id,
      properties: body.properties || {},
      source: 'web',
    });

    return res.status(204).end();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      log.warn('handler_failed', { reason: error.message });
    }
    return res.status(204).end();
  }
};
