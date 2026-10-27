// ════════════════════════════════════════════════════════════════════
// CHAMADA AO GEMINI com resposta em JSON de formato fechado.
//
// Saiu de lib/sales-study.js quando a IA passou a ter outros usos (textos de
// produto e da página, lib/ai-assist.js). Um lugar só para: chave e modelo
// vindos do ambiente, tempo-limite, resposta obrigatoriamente JSON pelo
// `responseSchema`, e erros com `code` que os handlers traduzem para a tela:
//   AI_NOT_CONFIGURED — sem GEMINI_API_KEY
//   AI_QUOTA          — 429, a cota gratuita acabou por agora
//   AI_FAILED         — qualquer outra falha (rede, 5xx, JSON ilegível)
// ════════════════════════════════════════════════════════════════════

const { createLogger } = require('./logger');

const log = createLogger('gemini');

const GEMINI_TIMEOUT_MS = 25_000;
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function aiError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * @param {object} request
 * @param {string} request.systemPrompt
 * @param {unknown} request.input        vai como JSON na mensagem do usuário
 * @param {object} request.schema        responseSchema do Gemini
 * @param {number} [request.temperature]
 * @param {object} [options]             injeção para teste
 * @returns {Promise<{ model: string, data: object }>}
 */
async function callGeminiJson(
  { systemPrompt, input, schema, temperature = 0.3 },
  { apiKey = process.env.GEMINI_API_KEY, fetchImpl = fetch } = {},
) {
  const key = String(apiKey || '').trim();
  if (!key) throw aiError('GEMINI_API_KEY não configurada.', 'AI_NOT_CONFIGURED');

  const model = String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    log.warn('gemini_falhou', { status: response.status, reason: payload?.error?.status || '' });
    throw aiError('A IA não respondeu agora.', response.status === 429 ? 'AI_QUOTA' : 'AI_FAILED');
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  try {
    return { model, data: JSON.parse(text) };
  } catch {
    throw aiError('A IA devolveu uma resposta ilegível.', 'AI_FAILED');
  }
}

/** Texto vindo da IA vira dado do painel: sem caracteres de controle, com teto. */
function cleanText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // eslint-disable-line no-control-regex
    .trim()
    .slice(0, max);
}

function cleanList(value, maxItems = 5, maxLength = 400) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

module.exports = { DEFAULT_GEMINI_MODEL, callGeminiJson, cleanList, cleanText };
