const crypto = require('node:crypto');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { deleteFromTable, getTableRow, listTableRows, updateTable },
} = require('../lib/supabase');
const { getCustomerSessionFromRequest, clearCustomerSessionCookie } = require('../lib/customer-session');
const { getAdminClient } = require('../services/supabase-auth');
const { sendEmail, getAppUrl } = require('../lib/email-sender');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');
const { resolveSecret, isLocalDevOrTest } = require('../lib/env-secret');

// ════════════════════════════════════════════════════════════════════
// LGPD — direito ao esquecimento self-service (pendência §3.8).
//
// Fluxo em 2 passos (confirmação por e-mail antes de executar):
//   1. POST sem token (autenticado por cookie) → gera token assinado e
//      envia link de confirmação para o e-mail do cliente.
//   2. POST com token (o token É a autorização) → executa a exclusão.
//
// A exclusão, NESTA ORDEM (a ordem é o controle de segurança — ver
// executeDeletion): resolve os pedidos do titular por customer_id + e-mail
// exato → anonimiza o PII em orders endereçando por id (falha aqui aborta
// tudo) → apaga download_tokens desses pedidos → só então deleta o usuário
// em auth.users (cascateia profiles + user_products e zera
// orders.customer_id — ver supabase/schema.sql) → marca unsubscribe na
// newsletter → registra security_events 'account_self_deleted'.
// ════════════════════════════════════════════════════════════════════

const TOKEN_TTL_SECONDS = 60 * 60; // 1h

function getSecret() {
  return resolveSecret('CUSTOMER_SESSION_SECRET', 'dev-customer-session-secret-change-me');
}

function signDeletionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    purpose: 'account_deletion',
    uid: String(user.uid || '').trim(),
    email: String(user.email || '').trim().toLowerCase(),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyDeletionToken(token) {
  if (!token || !String(token).includes('.')) return null;
  const [encoded, signature] = String(token).split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  const a = Buffer.from(String(signature || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.purpose !== 'account_deletion') return null;
    if (Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return { uid: String(payload.uid || '').trim(), email: String(payload.email || '').trim().toLowerCase() };
  } catch {
    return null;
  }
}

function anonymizeEmail(email, uid) {
  const hash = crypto.createHash('sha256').update(`${email}:${uid}`).digest('hex').slice(0, 12);
  return `deleted-${hash}@anonimizado.local`;
}

function buildConfirmationEmail(confirmUrl) {
  const subject = 'Confirme a exclusão da sua conta — Ateliê da Escola';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b;">
      <h1 style="font-size:20px;color:#0f172a;">Exclusão de conta</h1>
      <p style="font-size:14px;line-height:1.6;">
        Recebemos um pedido para excluir permanentemente a sua conta no Ateliê da Escola.
        Seus dados pessoais serão removidos (LGPD). Os pedidos já feitos são mantidos de forma
        <strong>anonimizada</strong> apenas para fins fiscais.
      </p>
      <p style="font-size:14px;line-height:1.6;">
        Se foi você, confirme abaixo. <strong>Esta ação é irreversível.</strong>
      </p>
      <p style="margin:24px 0;">
        <a href="${confirmUrl}" style="background:#e11d48;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">
          Excluir minha conta
        </a>
      </p>
      <p style="font-size:12px;color:#64748b;line-height:1.6;">
        O link vale por 1 hora. Se você não pediu isso, ignore este e-mail — nada será alterado.
      </p>
    </div>`;
  return { subject, html };
}

async function requestDeletion(user) {
  const token = signDeletionToken(user);
  const confirmUrl = `${getAppUrl()}/conta?delete_token=${encodeURIComponent(token)}`;
  const { subject, html } = buildConfirmationEmail(confirmUrl);

  await sendEmail({
    to: user.email,
    subject,
    html,
    kind: 'account_deletion_confirmation',
    // entityId estável por janela de 10 min: a idempotência do email-sender
    // colapsa rajadas (anti mail-bomb) mas ainda permite reenvio legítimo
    // após a janela.
    entityId: `${user.uid}:${Math.floor(Date.now() / 1000 / 600)}`,
  });

  const body = {
    success: true,
    message: 'Enviamos um e-mail para confirmar a exclusão da sua conta. O link vale 1 hora.',
  };
  // Afford de dev/testes (sem SMTP, o e-mail não é enviado de verdade).
  // Nunca vaza o token fora de desenvolvimento/teste local.
  if (isLocalDevOrTest()) {
    body.devConfirmUrl = confirmUrl;
  }
  return { status: 200, body };
}

async function executeDeletion({ uid, email, req, res }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const admin = getAdminClient();
  if (!admin) {
    return { status: 500, body: { success: false, error: 'Configuração do Supabase ausente.' } };
  }

  // ORDEM CRÍTICA: identificar e anonimizar os pedidos ANTES de apagar a
  // identidade. O deleteUser cascateia e zera orders.customer_id — fazê-lo
  // primeiro destruía a chave forte e obrigava a casar por e-mail, que era o
  // que introduzia o curinga ILIKE (`_`/`%` do e-mail viravam metacaracteres e
  // a anonimização atingia pedidos de OUTROS clientes, com service_role).

  // 1. Resolve os pedidos do titular: por customer_id (chave forte) e, para
  //    pedidos feitos como convidado, por e-mail exato (eq, nunca ilike).
  let ownOrderIds = [];
  try {
    const [byId, byEmail] = await Promise.all([
      uid
        ? listTableRows('orders', {
            select: 'id',
            filters: [{ column: 'customer_id', operator: 'eq', value: uid }],
          })
        : Promise.resolve([]),
      listTableRows('orders', {
        select: 'id',
        filters: [{ column: 'customer_email', operator: 'eq', value: normalizedEmail }],
      }),
    ]);
    ownOrderIds = [...new Set([...byId, ...byEmail].map((order) => order.id).filter(Boolean))];
  } catch (err) {
    console.error('[me-delete-account] falha ao resolver pedidos do titular:', err.message);
    return {
      status: 500,
      body: { success: false, error: 'Não foi possível excluir a conta. Tente novamente.' },
    };
  }

  const ordersAffected = ownOrderIds.length;
  const orderIdFilter = ordersAffected ? `in.(${ownOrderIds.join(',')})` : null;

  // 2. Anonimiza o PII dos pedidos (mantém histórico fiscal), endereçando por id
  //    — precisão exata, sem nenhum casamento por padrão. Falha aqui é FATAL: se
  //    o PII não saiu, não apagamos a identidade (perderíamos a chave para sempre
  //    e devolveríamos "excluída" com o dado pessoal intacto).
  if (orderIdFilter) {
    try {
      await updateTable('orders', { id: orderIdFilter }, {
        customer_email: anonymizeEmail(normalizedEmail, uid),
        customer_name: '',
        customer_cpf: null,
        customer_phone: null,
      });
    } catch (err) {
      console.error('[me-delete-account] anonimização falhou:', err.message);
      await recordSecurityEvent({
        eventName: 'account_deletion_anonymize_failed',
        severity: 'error',
        ip: extractClientIp(req),
        userAgent: req.headers?.['user-agent'],
        properties: { ordersPending: ordersAffected },
      });
      return {
        status: 500,
        body: {
          success: false,
          error: 'Não foi possível concluir a exclusão dos seus dados. Nada foi apagado — tente novamente.',
        },
      };
    }

    // 3. Apaga os download_tokens dos pedidos do titular (best-effort: o pedido
    //    já está anonimizado, e o token expira em 72h de todo modo).
    try {
      await deleteFromTable('download_tokens', { order_id: orderIdFilter });
    } catch (err) {
      console.warn('[me-delete-account] limpeza de tokens falhou:', err.message);
    }
  }

  // 4. Só agora remove a identidade em auth.users (cascateia profiles +
  //    user_products; orders.customer_id -> null).
  if (uid) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error && !/not\s*found/i.test(String(error.message || ''))) {
      console.error('[me-delete-account] deleteUser falhou:', error.message);
      return { status: 500, body: { success: false, error: 'Não foi possível excluir a conta. Tente novamente.' } };
    }
  }

  // 5. Marca unsubscribe na newsletter (best-effort).
  try {
    const subscriber = await getTableRow('email_subscribers', {
      select: 'id,unsubscribed_at',
      filters: [{ column: 'email', value: normalizedEmail }],
    });
    if (subscriber && !subscriber.unsubscribed_at) {
      await updateTable('email_subscribers', { id: `eq.${subscriber.id}` }, {
        unsubscribed_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('[me-delete-account] unsubscribe falhou:', err.message);
  }

  // 6. Log de segurança (sem PII).
  await recordSecurityEvent({
    eventName: 'account_self_deleted',
    severity: 'info',
    ip: extractClientIp(req),
    userAgent: req.headers?.['user-agent'],
    properties: { ordersAnonymized: ordersAffected },
  });

  // 7. Encerra a sessão do cliente.
  clearCustomerSessionCookie(res);

  return { status: 200, body: { success: true, message: 'Sua conta foi excluída. Sentiremos sua falta.' } };
}

module.exports = async function meDeleteAccountHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    // Token aceito SOMENTE no corpo POST (nunca na query string, que vaza
    // por Referer/logs/histórico).
    const token = String(req.body?.token || '').trim();

    // Passo 2: confirmação via token. Exige TAMBÉM a sessão do próprio dono
    // da conta — a posse do token sozinho não basta (defende contra token
    // vazado por e-mail encaminhado/interceptado).
    if (token) {
      const verified = verifyDeletionToken(token);
      if (!verified) {
        return res.status(400).json({ success: false, error: 'Link inválido ou expirado. Solicite a exclusão novamente.' });
      }
      const sessionUser = getCustomerSessionFromRequest(req);
      if (!sessionUser || !sessionUser.uid || sessionUser.uid !== verified.uid) {
        return res.status(401).json({
          success: false,
          error: 'Faça login na conta que deseja excluir para confirmar a exclusão.',
        });
      }
      const result = await executeDeletion({ uid: verified.uid, email: verified.email, req, res });
      return res.status(result.status).json(result.body);
    }

    // Passo 1: requisição (precisa de sessão de cliente).
    const user = getCustomerSessionFromRequest(req);
    if (!user || !user.email) {
      return res.status(401).json({ success: false, error: 'Faça login para excluir sua conta.' });
    }
    const result = await requestDeletion(user);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[me-delete-account]', error.message);
    return res.status(500).json({ success: false, error: 'Erro ao processar exclusão de conta.' });
  }
};
