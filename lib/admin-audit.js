const {
  getSupabaseConfig,
  serviceRoleHelpers: { insertIntoTable },
} = require('./supabase');
const { extractClientIp, recordSecurityEvent } = require('./security-logger');
const { getAdminIdentity } = require('./admin-session');
const { createLogger } = require('./logger');

const log = createLogger('admin-audit');

// ════════════════════════════════════════════════════════════════════
// Audit log do painel admin (regra I1). Best-effort: NUNCA lança — uma
// falha de auditoria não pode derrubar a operação que a disparou.
// Tabela: public.admin_audit_log (migration phase4_admin_audit_log).
// ════════════════════════════════════════════════════════════════════

// Campos sensíveis que não vão pro audit em texto puro.
const REDACT_KEYS = new Set([
  'password',
  'factorCode',
  'challengeToken',
  'token',
  'accessToken',
  'secret',
]);

function sanitize(value) {
  if (!value || typeof value !== 'object') {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value;
  }
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = REDACT_KEYS.has(key) ? '[redacted]' : val;
  }
  return out;
}

/**
 * Registra uma ação de escrita do admin.
 *
 * @param {object} params
 * @param {object} [params.req]        request (para extrair IP)
 * @param {string} params.action       create | update | patch | delete
 * @param {string} params.targetType   product | category | coupon | order | user | setting
 * @param {string|number} [params.targetId]
 * @param {object} [params.before]     estado anterior (quando disponível)
 * @param {object} [params.after]      estado novo / payload enviado
 */
async function logAdminAction({
  req,
  action,
  targetType,
  targetId = null,
  before = null,
  after = null,
} = {}) {
  if (!action || !targetType) return;
  if (!getSupabaseConfig()) return;

  try {
    await insertIntoTable('admin_audit_log', {
      // Identidade individual do admin (e-mail) extraída da sessão;
      // 'admin' genérico só para tokens antigos sem identidade.
      admin_id: (req && getAdminIdentity(req)) || 'admin',
      action: String(action).slice(0, 32),
      target_type: String(targetType).slice(0, 32),
      target_id: targetId != null && targetId !== '' ? String(targetId).slice(0, 128) : null,
      before: before ? sanitize(before) : null,
      after: after ? sanitize(after) : null,
      ip: req ? extractClientIp(req) : null,
    });
  } catch (err) {
    log.warn('insert_falhou', { reason: err.message });
    // Falha de auditoria não pode passar silenciosa: emite evento de
    // segurança (stdout estruturado + alerta externo) para detecção.
    await recordSecurityEvent({
      eventName: 'admin_audit_write_failed',
      severity: 'error',
      ip: req ? extractClientIp(req) : null,
      userAgent: req?.headers?.['user-agent'],
      properties: {
        action: String(action).slice(0, 32),
        targetType: String(targetType).slice(0, 32),
        error: String(err?.message || '').slice(0, 200),
      },
    }).catch(() => {});
  }
}

module.exports = { logAdminAction };
