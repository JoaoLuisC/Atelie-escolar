const { ensureStoreSession } = require('../../lib/admin-session');
const { getSupabaseConfig } = require('../../lib/supabase');
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
const { logAdminAction } = require('../../lib/admin-audit');
const { TASK_NAMES, runAiAssist } = require('../../lib/ai-assist');

// POST /api/admin/ai-assist { task, input } — sugestão de texto pela IA
// (lib/ai-assist.js). Só sai quando o professor clica no botão: nada é gerado
// sozinho nem gravado; a resposta volta para a tela revisar.

const log = createLogger('admin-ai-assist');

// Cada clique é uma chamada paga em cota do Gemini (gratuita, mas finita).
const AI_ASSIST_RATE_LIMIT = Object.freeze({
  bucket: 'admin-ai-assist',
  limit: 30,
  windowSeconds: 60 * 60,
  message: 'Muitas sugestões em pouco tempo. Aguarde alguns minutos e tente de novo.',
});

const AI_MESSAGES = Object.freeze({
  AI_NOT_CONFIGURED: 'A IA ainda não está configurada neste ambiente (GEMINI_API_KEY).',
  AI_QUOTA: 'A cota gratuita da IA acabou por agora. Tente de novo mais tarde.',
  AI_FAILED: 'A IA não conseguiu responder agora. Tente de novo em alguns minutos.',
});

module.exports = async function adminAiAssistHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['POST'])) return;
  if (!ensureStoreSession(req, res)) return;

  const task = String(req.body?.task || '').trim();
  if (!TASK_NAMES.includes(task)) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Tipo de sugestão inválido.',
    });
  }
  const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
  if (task !== 'homeCopy' && !String(input.name || '').trim()) {
    return fail(res, {
      status: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Escreva o nome do material antes de pedir a sugestão.',
    });
  }
  if (!getSupabaseConfig()) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Supabase não configurado.',
    });
  }

  const gate = await enforceRateLimit(req, res, AI_ASSIST_RATE_LIMIT);
  if (gate.blocked) return;

  try {
    const { model, suggestion } = await runAiAssist(task, input);
    await logAdminAction({
      req,
      action: 'ai_assist',
      targetType: 'ai',
      targetId: task,
      after: { model },
    });
    return ok(res, { task, suggestion });
  } catch (error) {
    const message = AI_MESSAGES[error?.code];
    if (message) {
      return fail(res, {
        status: error.code === 'AI_QUOTA' ? 429 : 503,
        code:
          error.code === 'AI_QUOTA' ? ERROR_CODES.RATE_LIMITED : ERROR_CODES.SERVICE_UNAVAILABLE,
        message,
      });
    }
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível gerar a sugestão agora.',
    });
  }
};
