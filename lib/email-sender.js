const nodemailer = require('nodemailer');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('./supabase');
const { createLogger } = require('./logger');

const log = createLogger('email-sender');

/**
 * Wrapper único para enviar email transacional/marketing.
 *
 * - Reusa SMTP do Resend (já configurado em SMTP_HOST/USER/PASS).
 * - Toda chamada passa por idempotência via `email_sent_log`:
 *   (email, kind, entity_id) é única — se já existe `sent`, pula.
 * - Falha silenciosa: nunca lança exceção para o caller. Loga em
 *   `email_sent_log.status = 'failed'` com a mensagem.
 * - Footer com link de unsubscribe é auto-appendado em emails de
 *   marketing (regra D2 — link obrigatório). Transacionais (confirmação
 *   de pedido) **não** levam unsubscribe — é comunicação operacional.
 */

const MARKETING_KINDS = new Set([
  'post_purchase_d3',
  'post_purchase_d15',
  'post_purchase_d45',
  'abandoned_cart_1h',
  'abandoned_cart_24h',
  'reactivation_90d',
  'newsletter_sazonal',
]);

const TRANSACTIONAL_KINDS = new Set([
  'order_confirmation',
  'opt_in_confirmation',
  'unsubscribe_success',
  'account_deletion_confirmation',
]);

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function getAppUrl() {
  return String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function getFromAddress() {
  return process.env.SMTP_FROM || `"Ateliê da Escola" <${process.env.SMTP_USER}>`;
}

/**
 * Adiciona footer com link de unsubscribe em emails de marketing.
 * O token vem do subscriber; emails que não têm subscriber (ex: alguém
 * que comprou sem se inscrever na newsletter) recebem um fallback
 * para a página `/desinscrever` que pede o email novamente.
 */
function buildMarketingFooter({ email, unsubscribeToken } = {}) {
  const appUrl = getAppUrl();
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/desinscrever?token=${encodeURIComponent(unsubscribeToken)}`
    : `${appUrl}/desinscrever?email=${encodeURIComponent(email || '')}`;

  return `
    <div style="border-top:1px solid #e2e8f0;margin-top:32px;padding-top:20px;text-align:center;font-size:12px;color:#94a3b8;">
      <p style="margin:0 0 8px;">
        Você recebe este email porque se cadastrou no Ateliê da Escola.
      </p>
      <p style="margin:0;">
        <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">
          Cancelar inscrição
        </a>
        &nbsp;·&nbsp;
        <a href="${appUrl}/privacidade" style="color:#94a3b8;text-decoration:underline;">
          Política de privacidade
        </a>
      </p>
      <p style="margin:8px 0 0;">
        Ateliê da Escola — Profa. Marciar Cardoso
      </p>
    </div>`;
}

async function findExistingSentLog(email, kind, entityId) {
  if (!getSupabaseConfig()) return null;
  try {
    return await getTableRow('email_sent_log', {
      select: 'id,status',
      filters: [
        { column: 'email', value: String(email || '').toLowerCase() },
        { column: 'kind', value: kind },
        ...(entityId
          ? [{ column: 'entity_id', value: String(entityId) }]
          : [{ column: 'entity_id', operator: 'is', value: 'null' }]),
      ],
    });
  } catch {
    return null;
  }
}

async function recordSentLog({ email, kind, entityId, status, error }) {
  if (!getSupabaseConfig()) return null;
  try {
    return await insertIntoTable('email_sent_log', {
      email: String(email || '').toLowerCase(),
      kind,
      entity_id: entityId ? String(entityId) : null,
      status,
      error: error || null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });
  } catch {
    return null;
  }
}

async function updateSentLogStatus(logId, status, error) {
  if (!logId || !getSupabaseConfig()) return;
  try {
    await updateTable(
      'email_sent_log',
      { id: `eq.${logId}` },
      {
        status,
        error: error || null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      },
    );
  } catch {
    /* swallow */
  }
}

/**
 * Envia um email idempotente.
 *
 * @param {object} params
 * @param {string} params.to - destinatário
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} params.kind - tipo do envio (chave da idempotência)
 * @param {string|number} [params.entityId] - id do pedido/carrinho/subscriber
 * @param {string} [params.unsubscribeToken] - obrigatório se kind é marketing
 * @returns {Promise<{ sent: boolean, skipped?: boolean, reason?: string }>}
 */
async function sendEmail({ to, subject, html, kind, entityId = null, unsubscribeToken = null }) {
  const email = String(to || '')
    .trim()
    .toLowerCase();
  if (!email || !subject || !html || !kind) {
    return { sent: false, reason: 'invalid_payload' };
  }

  // Idempotência: já enviado com sucesso? pula
  const existing = await findExistingSentLog(email, kind, entityId);
  if (existing && existing.status === 'sent') {
    return { sent: false, skipped: true, reason: 'already_sent' };
  }

  // SMTP não configurado em dev: log + pula
  if (!isSmtpConfigured()) {
    await recordSentLog({ email, kind, entityId, status: 'skipped', error: 'smtp_not_configured' });
    if (process.env.NODE_ENV !== 'production') {
      log.info('envio_pulado_sem_smtp', { kind, email });
    }
    return { sent: false, reason: 'smtp_not_configured' };
  }

  // Insere log com status 'queued' antes do envio
  const insertedLog = !existing
    ? await recordSentLog({ email, kind, entityId, status: 'queued' })
    : null;
  const logId = insertedLog?.[0]?.id || existing?.id;

  // Auto-append footer de marketing (regra D2)
  let finalHtml = html;
  if (MARKETING_KINDS.has(kind)) {
    finalHtml = `${html}${buildMarketingFooter({ email, unsubscribeToken })}`;
  } else if (!TRANSACTIONAL_KINDS.has(kind)) {
    // kind desconhecido — adiciona footer por segurança
    finalHtml = `${html}${buildMarketingFooter({ email, unsubscribeToken })}`;
  }

  try {
    const transporter = buildTransporter();
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject,
      html: finalHtml,
      headers: unsubscribeToken
        ? {
            // RFC 8058 — One-Click Unsubscribe para Gmail/Outlook
            'List-Unsubscribe': `<${getAppUrl()}/desinscrever?token=${encodeURIComponent(unsubscribeToken)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined,
    });

    await updateSentLogStatus(logId, 'sent');
    return { sent: true };
  } catch (error) {
    log.error('envio_falhou', { kind, email, reason: error.message });
    await updateSentLogStatus(logId, 'failed', error.message);
    return { sent: false, reason: 'smtp_error', error: error.message };
  }
}

module.exports = {
  MARKETING_KINDS,
  TRANSACTIONAL_KINDS,
  buildMarketingFooter,
  getAppUrl,
  isSmtpConfigured,
  sendEmail,
};
