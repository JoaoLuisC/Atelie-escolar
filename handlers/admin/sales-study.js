const { ensureStoreSession } = require('../../lib/admin-session');
const { logAdminAction } = require('../../lib/admin-audit');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { createLogger } = require('../../lib/logger');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('../../lib/supabase');
const {
  ERROR_CODES,
  fail,
  guardMethod,
  ok,
  setAdminCorsHeaders,
  setCachePolicy,
} = require('../../lib/http');
const { readSettingValue } = require('../../lib/store-content');
const { buildSalesStudyData, generateInsights, hasEnoughData } = require('../../lib/sales-study');
const { getSellerScope } = require('../../lib/seller-scope');

const log = createLogger('admin-sales-study');

// A última análise fica salva em `settings` (chave abaixo): abrir a aba não
// gasta cota da IA, só o botão "Gerar nova análise" gasta.
const SETTING_KEY = 'salesStudy';

// Cota grátis do Gemini é por minuto/dia; 10 gerações por hora sobram para o
// uso real (uma por dia, no máximo algumas) e barram um clique em laço.
const STUDY_RATE_LIMIT = Object.freeze({
  bucket: 'admin-sales-study',
  limit: 10,
  windowSeconds: 60 * 60,
  message: 'Muitas análises em pouco tempo. Aguarde alguns minutos e tente de novo.',
});

const AI_MESSAGES = Object.freeze({
  AI_NOT_CONFIGURED:
    'A IA ainda não está configurada neste ambiente (GEMINI_API_KEY). Os números abaixo continuam valendo.',
  AI_QUOTA: 'A cota gratuita da IA acabou por agora. Tente de novo mais tarde.',
  AI_FAILED: 'A IA não conseguiu responder agora. Tente de novo em alguns minutos.',
});

// Cada professora tem a SUA análise guardada (só com os números dela); a do
// admin, da plataforma inteira, fica na chave sem sufixo.
function studyKey(scope) {
  return scope ? `${SETTING_KEY}:${scope.sellerId}` : SETTING_KEY;
}

async function writeStudy(value, key) {
  const payload = { setting_key: key, setting_value: value };
  const existing = await getTableRow('settings', {
    select: 'setting_key',
    filters: [{ column: 'setting_key', value: key }],
  });
  if (existing) {
    await updateTable('settings', { setting_key: `eq.${key}` }, payload);
    return;
  }
  await insertIntoTable('settings', payload);
}

module.exports = async function adminSalesStudyHandler(req, res) {
  setAdminCorsHeaders(req, res);
  setCachePolicy(res, 'adminReport');
  if (guardMethod(req, res, ['GET', 'POST'])) return;
  if (!ensureStoreSession(req, res)) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const aiConfigured = Boolean(String(process.env.GEMINI_API_KEY || '').trim());
    const scope = getSellerScope(req);
    const key = studyKey(scope);

    if (req.method === 'GET') {
      const study = await readSettingValue(key);
      return ok(res, { study: study || null, aiConfigured });
    }

    const gate = await enforceRateLimit(req, res, STUDY_RATE_LIMIT);
    if (gate.blocked) return;

    const days = Number.parseInt(req.body?.days, 10) || 30;
    const data = await buildSalesStudyData({ days, scope });

    let insights = null;
    let model = null;
    let aiError = null;

    if (!hasEnoughData(data)) {
      aiError = 'INSUFFICIENT_DATA';
    } else {
      try {
        ({ insights, model } = await generateInsights(data));
      } catch (error) {
        aiError = error?.code || 'AI_FAILED';
      }
    }

    const study = {
      generatedAt: new Date().toISOString(),
      days: data.periodoDias,
      data,
      insights,
      model,
      aiError,
      aiMessage:
        aiError === 'INSUFFICIENT_DATA'
          ? 'Ainda há poucos dados para uma análise confiável (são precisos pelo menos 3 pedidos aprovados ou 30 visitas no período). Os números abaixo já estão corretos.'
          : AI_MESSAGES[aiError] || null,
    };

    await writeStudy(study, key);
    await logAdminAction({
      req,
      action: 'generate',
      targetType: 'sales_study',
      targetId: key,
      after: { days: study.days, model, aiError },
    });

    return ok(res, { study, aiConfigured });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao gerar o estudo de vendas.',
    });
  }
};
