const crypto = require('node:crypto');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { deleteFromTable, getTableRow, listTableRows, updateTable },
} = require('../lib/supabase');
const {
  getCustomerSessionFromRequest,
  clearCustomerSessionCookie,
} = require('../lib/customer-session');
const { getAdminClient } = require('../services/supabase-auth');
const { sendEmail, getAppUrl } = require('../lib/email-sender');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { resolveSecret, isLocalDevOrTest } = require('../lib/env-secret');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('me-delete-account');

/**
 * Despacha o resultado interno pela porta única do envelope (regra A1).
 *
 * As funções abaixo devolvem `{ status, body }` no sucesso e
 * `{ error: { status, code, message } }` na falha — nunca escrevem em `res`.
 * Antes elas montavam o corpo à mão e o handler fazia
 * `res.status(result.status).json(result.body)`, driblando o `fail()`: eram
 * cinco dos sites do item P1.3, todos no fluxo de exclusão de conta, que é
 * irreversível.
 */
function respond(res, result) {
  return result?.error ? fail(res, result.error) : ok(res, result.body, { status: result.status });
}

// ════════════════════════════════════════════════════════════════════
// LGPD — direito ao esquecimento self-service (pendência §3.8).
//
// Fluxo em 2 passos (confirmação por e-mail antes de executar):
//   1. POST sem token (autenticado por cookie) → gera token assinado e
//      envia link de confirmação para o e-mail do cliente.
//   2. POST com token (o token É a autorização) → executa a exclusão.
//
// A exclusão, NESTA ORDEM (a ordem é o controle de segurança — ver
// executeDeletion): resolve a identidade autoritativa em auth.users pelo uid
// → adota os pedidos ÓRFÃOS daquele e-mail (checkout de convidado; só órfãos,
// nunca pedido já vinculado a outro uid) → resolve os pedidos do titular
// EXCLUSIVAMENTE por customer_id = uid → anonimiza o PII em orders
// endereçando por id (falha aqui aborta tudo) → apaga download_tokens desses
// pedidos → só então deleta o usuário em auth.users (cascateia profiles +
// user_products e zera orders.customer_id — ver supabase/schema.sql) → marca
// unsubscribe na newsletter → registra security_events 'account_self_deleted'.
//
// POR QUE customer_id E NÃO customer_email (achado P1-1): a wave1
// (20260812000000_security_hardening_wave1.sql, W1-02) tirou a policy de
// orders do claim `email` porque ele não prova posse do endereço — com
// "Confirm email" OFF, um atacante registra o e-mail da vítima e recebe uma
// sessão com aquele e-mail. Este handler usa serviceRoleHelpers, que BYPASSA
// RLS, então a policy corrigida não o alcançava: escopar a exclusão por
// customer_email deixava o atacante DESTRUIR o PII dos pedidos de convidado
// da vítima. Aqui a operação é irreversível, então o escopo é o mais estreito
// possível: só o que está provadamente vinculado ao uid da sessão.
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
    email: String(user.email || '')
      .trim()
      .toLowerCase(),
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
    return {
      uid: String(payload.uid || '').trim(),
      email: String(payload.email || '')
        .trim()
        .toLowerCase(),
    };
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
    message: 'Enviamos um e-mail para confirmar a exclusão da sua conta. O link vale 1 hora.',
  };
  // Afford de dev/testes (sem SMTP, o e-mail não é enviado de verdade).
  // Nunca vaza o token fora de desenvolvimento/teste local.
  if (isLocalDevOrTest()) {
    body.devConfirmUrl = confirmUrl;
  }
  return { status: 200, body };
}

// Identidade AUTORITATIVA do titular: lida de auth.users pelo uid, nunca do
// cookie nem do token. Os dois são assinados por nós (não são forjáveis pelo
// cliente), mas ambos carregam uma CÓPIA do e-mail feita no login/na
// solicitação; o que vale numa operação destrutiva é o estado atual de
// auth.users. Retorna { email } só com o e-mail confirmado — com "Confirm
// email" ON (obrigatório; a wave1 lista isso em "NÃO cobre"), email_confirmed_at
// é a única evidência que o Supabase produz de que o endereço é deste uid.
// `missing: true` significa que o usuário não existe mais (conta já excluída).
async function resolveAuthIdentity(admin, uid) {
  const { data, error } = await admin.auth.admin.getUserById(uid);
  if (error) {
    if (error.status === 404 || /not\s*found/i.test(String(error.message || ''))) {
      return { missing: true };
    }
    throw new Error(error.message || 'auth.getUserById falhou');
  }

  // Resposta sem erro E sem usuário é estado impossível: NÃO tratamos como
  // "já excluído", senão devolveríamos "conta excluída" sem ter apagado nada.
  const user = data?.user;
  if (!user?.id) {
    throw new Error('auth.getUserById devolveu resposta vazia');
  }
  if (String(user.id) !== String(uid)) {
    return null;
  }

  const email = String(user.email || '')
    .trim()
    .toLowerCase();
  const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  if (!email || !confirmed) {
    return null;
  }

  return { email };
}

// Reconciliação do checkout de CONVIDADO, idêntica à de api/customer-orders.js:
// api/create-payment.js grava o pedido sem customer_id e
// ensureCustomerAccountFromCheckout cria a conta depois sem voltar para
// vincular. Sem isto, escopar por customer_id deixaria o PII dos pedidos de
// convidado para trás numa exclusão LGPD.
//
// O segundo predicado é o controle de segurança: `customer_id=is.null`
// restringe a adoção a pedidos ÓRFÃOS — pedido já vinculado a outro uid é
// intocável, então ninguém anonimiza pedido de quem tem conta. O e-mail não
// autoriza nada por si: ele só casa órfão com dono, e vem de auth.users
// (uid → e-mail), não da sessão crua.
//
// RISCO RESIDUAL, assumido: com "Confirm email" OFF e uma vítima que nunca
// criou conta (pedidos órfãos), quem registrar o e-mail dela adota — e aqui,
// destrói — esses órfãos. Não existe prova de posse melhor na camada de
// aplicação para um pedido feito sem conta; o fecho é "Confirm email = ON".
async function adoptOrphanGuestOrders(uid, email) {
  const adopted = await updateTable(
    'orders',
    { customer_email: `eq.${email}`, customer_id: 'is.null' },
    { customer_id: uid },
  );
  return Array.isArray(adopted) ? adopted.length : 0;
}

async function executeDeletion({ uid, email, req, res }) {
  const tokenEmail = String(email || '')
    .trim()
    .toLowerCase();

  const admin = getAdminClient();
  if (!admin) {
    return {
      error: {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Configuração do Supabase ausente.',
      },
    };
  }

  // ORDEM CRÍTICA: identificar e anonimizar os pedidos ANTES de apagar a
  // identidade. O deleteUser cascateia e zera orders.customer_id — fazê-lo
  // primeiro destruiria a chave forte e obrigaria a casar por e-mail, que era o
  // que introduzia o curinga ILIKE (`_`/`%` do e-mail viravam metacaracteres e
  // a anonimização atingia pedidos de OUTROS clientes, com service_role).

  // 0. Identidade autoritativa. FALHA FECHADA: sem ela não sabemos o escopo,
  //    e numa operação irreversível preferimos não apagar nada — o cliente
  //    tenta de novo.
  let identity;
  try {
    identity = await resolveAuthIdentity(admin, uid);
  } catch (err) {
    log.error('falha_ao_resolver_identidade', { reason: err.message });
    return {
      error: {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Não foi possível excluir a conta. Tente novamente.',
      },
    };
  }

  if (identity?.missing) {
    // Idempotência: a conta já não existe. Nada a apagar, só encerra a sessão.
    clearCustomerSessionCookie(res);
    return {
      status: 200,
      body: { message: 'Sua conta foi excluída. Sentiremos sua falta.' },
    };
  }

  if (!identity) {
    return {
      error: {
        status: 409,
        code: ERROR_CODES.CONFLICT,
        message:
          'Confirme seu e-mail antes de excluir a conta. Se o problema persistir, fale com o suporte.',
      },
    };
  }

  const normalizedEmail = identity.email;

  // Divergência entre o e-mail do token e o atual em auth.users significa que
  // a conta mudou de e-mail depois da solicitação. Numa exclusão irreversível,
  // o desvio invalida a autorização: exigimos uma solicitação nova.
  if (tokenEmail && tokenEmail !== normalizedEmail) {
    return {
      error: {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Link inválido ou expirado. Solicite a exclusão novamente.',
      },
    };
  }

  // 1. Vincula os pedidos de convidado ao uid (só os órfãos) e então resolve o
  //    escopo EXCLUSIVAMENTE por customer_id — a única chave que prova posse.
  //    Falhar na adoção também fecha: nada foi tocado ainda.
  let ownOrderIds = [];
  try {
    await adoptOrphanGuestOrders(uid, normalizedEmail);
    const ownOrders = await listTableRows('orders', {
      select: 'id',
      filters: [{ column: 'customer_id', operator: 'eq', value: uid }],
    });
    ownOrderIds = [...new Set(ownOrders.map((order) => order.id).filter(Boolean))];
  } catch (err) {
    log.error('falha_ao_resolver_pedidos_do_titular', { reason: err.message });
    return {
      error: {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Não foi possível excluir a conta. Tente novamente.',
      },
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
      await updateTable(
        'orders',
        { id: orderIdFilter },
        {
          customer_email: anonymizeEmail(normalizedEmail, uid),
          customer_name: '',
          customer_cpf: null,
          customer_phone: null,
        },
      );
    } catch (err) {
      log.error('anonimizacao_falhou', { reason: err.message });
      await recordSecurityEvent({
        eventName: 'account_deletion_anonymize_failed',
        severity: 'error',
        ip: extractClientIp(req),
        userAgent: req.headers?.['user-agent'],
        properties: { ordersPending: ordersAffected },
      });
      return {
        error: {
          status: 500,
          code: ERROR_CODES.INTERNAL_ERROR,
          message:
            'Não foi possível concluir a exclusão dos seus dados. Nada foi apagado — tente novamente.',
        },
      };
    }

    // 3. Apaga os download_tokens dos pedidos do titular (best-effort: o pedido
    //    já está anonimizado, e o token expira em 72h de todo modo).
    try {
      await deleteFromTable('download_tokens', { order_id: orderIdFilter });
    } catch (err) {
      log.warn('limpeza_de_tokens_falhou', { reason: err.message });
    }
  }

  // 3b. Apaga o carrinho abandonado do titular.
  //
  // `abandoned_carts` guarda o e-mail DIGITADO no checkout junto com o
  // conteúdo do carrinho, e não pendura em `customer_id` — some do alcance
  // do cascade de auth.users e não estava em nenhum passo acima. Resultado
  // antes disto: quem pedia exclusão continuava com e-mail e carrinho
  // gravados por tempo indeterminado. A migration que criou a tabela promete
  // limpeza "após 7 dias", mas nenhuma função de purga foi escrita — então
  // esta era a única remoção possível, e ela não existia.
  //
  // `eq` e não `ilike`: handlers/abandoned-cart.js grava o e-mail já em
  // minúsculas, e `ilike` trataria `_` como coringa — o mesmo IDOR silencioso
  // que api/customer-orders.js já pagou (ver o cabeçalho de lá).
  //
  // Best-effort como os outros passos não-fatais: a identidade já vai embora
  // no passo 4, e falhar aqui não pode reverter uma exclusão em andamento —
  // mas o log deixa o rastro para reprocessar.
  try {
    await deleteFromTable('abandoned_carts', { email: `eq.${normalizedEmail}` });
  } catch (err) {
    log.warn('limpeza_de_carrinho_falhou', { reason: err.message });
  }

  // 4. Só agora remove a identidade em auth.users (cascateia profiles +
  //    user_products; orders.customer_id -> null). O uid já foi validado no
  //    passo 0 (resolveAuthIdentity), então não há guarda condicional aqui.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(uid);
  if (deleteUserError && !/not\s*found/i.test(String(deleteUserError.message || ''))) {
    log.error('delete_user_falhou', { reason: deleteUserError.message });
    return {
      error: {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Não foi possível excluir a conta. Tente novamente.',
      },
    };
  }

  // 5. Marca unsubscribe na newsletter (best-effort).
  try {
    const subscriber = await getTableRow('email_subscribers', {
      select: 'id,unsubscribed_at',
      filters: [{ column: 'email', value: normalizedEmail }],
    });
    if (subscriber && !subscriber.unsubscribed_at) {
      await updateTable(
        'email_subscribers',
        { id: `eq.${subscriber.id}` },
        {
          unsubscribed_at: new Date().toISOString(),
        },
      );
    }
  } catch (err) {
    log.warn('unsubscribe_falhou', { reason: err.message });
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

  return {
    status: 200,
    body: { message: 'Sua conta foi excluída. Sentiremos sua falta.' },
  };
}

module.exports = async function meDeleteAccountHandler(req, res) {
  if (guardMethod(req, res, ['POST'])) return;

  // RATE_LIMITS.meDeleteAccount existia mas nunca era chamado — o preset
  // prometia paridade com o meDeleteAccountLimiter de 5/min do Express de dev e
  // entregava zero em produção. O passo 1 deste fluxo DISPARA E-MAIL
  // (requestDeletion), então sem contador um cliente autenticado em laço vira
  // mail bomb contra o próprio endereço e queima a reputação do domínio de
  // envio; e a verificação de token do passo 2 roda HMAC + consulta ao Auth por
  // requisição, sem teto. É ação rara e irreversível: 5/min é folga enorme para
  // uso legítimo e corta o abuso.
  const gate = await enforceRateLimit(req, res, RATE_LIMITS.meDeleteAccount);
  if (gate.blocked) return;

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
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
        return fail(res, {
          status: 400,
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Link inválido ou expirado. Solicite a exclusão novamente.',
        });
      }
      const sessionUser = getCustomerSessionFromRequest(req);
      if (!sessionUser || !sessionUser.uid || sessionUser.uid !== verified.uid) {
        return fail(res, {
          status: 401,
          code: ERROR_CODES.CUSTOMER_SESSION_INVALID,
          message: 'Faça login na conta que deseja excluir para confirmar a exclusão.',
        });
      }
      const result = await executeDeletion({ uid: verified.uid, email: verified.email, req, res });
      return respond(res, result);
    }

    // Passo 1: requisição (precisa de sessão de cliente). O uid é exigido
    // aqui, e não só o e-mail: ele é a âncora de toda a exclusão (passo 2 e
    // executeDeletion), então um token emitido sem uid seria inutilizável.
    const user = getCustomerSessionFromRequest(req);
    if (!user || !user.uid || !user.email) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.CUSTOMER_SESSION_INVALID,
        message: 'Faça login para excluir sua conta.',
      });
    }
    const result = await requestDeletion(user);
    return respond(res, result);
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao processar exclusão de conta.',
    });
  }
};
