const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, updateTable },
} = require('../lib/supabase');
const { sendEmail, getAppUrl } = require('../lib/email-sender');
const { unsubscribeSuccess } = require('../lib/email-templates');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resposta única para TODOS os caminhos que envolvem um e-mail digitado —
// existente, inexistente, já descadastrado. Uma mensagem diferente por caso
// transformaria o endpoint em oráculo de enumeração da lista.
const NEUTRAL_EMAIL_MESSAGE =
  'Se este e-mail estiver na nossa lista, enviamos um link para concluir o cancelamento. '
  + 'Abra o e-mail e clique no link.';

/**
 * Unsubscribe (regra D2 — link de descadastro obrigatório).
 *
 * Aceita:
 * - GET  ?token=...   → unsubscribe pelo link no e-mail (1-click)
 * - POST ?token=... / { token } → mesma coisa para clients que respeitam
 *                       RFC 8058 (Gmail/Outlook fazem POST automático em
 *                       "Cancelar inscrição")
 * - POST { email }    → NÃO descadastra. Envia para o próprio endereço um link
 *                       com o token real; o efeito só acontece quando o link
 *                       for clicado.
 *
 * POR QUE O RAMO POR E-MAIL CRU FOI REMOVIDO (achado M2):
 * a versão anterior aceitava `POST { email }` e descadastrava na hora, sem
 * nenhuma prova de posse do endereço. Como a lista é enumerável (qualquer
 * endereço plausível serve de chute) e o e-mail de cliente aparece em
 * confirmação de compra, nota fiscal e conversa de suporte, qualquer pessoa
 * podia derrubar a lista inteira com um laço de POSTs — e ainda fazia a loja
 * mandar um e-mail de confirmação a cada acerto, virando também um amplificador
 * de envio. Descadastro é uma escrita destrutiva sobre um dado de terceiro:
 * exige prova de posse, exatamente como a inscrição exige (double opt-in de
 * /api/subscribe + /api/confirm-subscription).
 *
 * O token continua sendo o `unsubscribe_token` estável da linha em
 * `email_subscribers` — o MESMO que lib/email-sender.js já embute no rodapé de
 * marketing e no cabeçalho `List-Unsubscribe` (RFC 8058). Portanto todo link de
 * unsubscribe já entregue em e-mails antigos continua funcionando sem alteração:
 * o caminho `?token=` é idêntico ao de antes. Só o rodapé de fallback
 * `?email=...` (usado quando não havia token) deixa de descadastrar sozinho —
 * ele agora cai no fluxo de "enviamos o link", e a correção M1 em
 * api/cron-email-jobs.js garante que nenhum envio de marketing sai sem token.
 *
 * Rate limit: 20/min por IP (paridade com unsubscribeLimiter de
 * routes/api-compat.routes.js). Segura tanto a varredura de tokens quanto o
 * disparo em massa do e-mail com o link.
 */
module.exports = async function unsubscribeHandler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const gate = await enforceRateLimit(req, res, RATE_LIMITS.unsubscribe);
  if (gate.blocked) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const token = String(req.query?.token || req.body?.token || '').trim();
    // E-mail só pelo CORPO, nunca por query string. Um GET que dispara envio
    // seria acionado por prefetch de browser e por scanner de link de e-mail —
    // e o endereço ficaria em log de acesso e no Referer (mesma política de
    // api/me-delete-account.js). O slice antecede o regex para não jogar
    // entrada gigante no backtracking.
    const emailInput = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);

    // ── Caminho 1: token (única forma de EFETIVAR o descadastro) ──────
    if (token) {
      return await unsubscribeByToken(token, res);
    }

    // ── Caminho 2: e-mail digitado na página /desinscrever ────────────
    if (emailInput && EMAIL_REGEX.test(emailInput)) {
      return await requestUnsubscribeLink(emailInput, res);
    }

    // Nem token nem e-mail utilizável: erro de forma da requisição, não de
    // dados — não revela nada sobre a lista.
    return res.status(400).json({
      success: false,
      error: 'Informe um e-mail válido ou use o link de cancelamento do e-mail.',
    });
  } catch (error) {
    console.error('[unsubscribe]', error.message);
    return res.status(500).json({ success: false, error: 'Erro ao processar cancelamento.' });
  }
};

/**
 * Descadastro efetivo. Só aqui `unsubscribed_at` é gravado, e só mediante um
 * token de 32 bytes que o titular recebeu no próprio endereço.
 */
async function unsubscribeByToken(token, res) {
  const subscriber = await getTableRow('email_subscribers', {
    select: 'id,email,unsubscribed_at',
    filters: [{ column: 'unsubscribe_token', value: token }],
  });

  // Token desconhecido responde igual a token válido: quem varre não aprende
  // quais tokens existem. (E o link de e-mail antigo de alguém já removido
  // continua "funcionando" do ponto de vista do usuário.)
  if (!subscriber) {
    return res.status(200).json({
      success: true,
      message: 'Inscrição cancelada. Você não receberá mais e-mails de marketing.',
    });
  }

  if (!subscriber.unsubscribed_at) {
    await updateTable('email_subscribers', { id: `eq.${subscriber.id}` }, {
      unsubscribed_at: new Date().toISOString(),
    });

    // Confirmação visual do unsub (kind transacional, sem rodapé de marketing).
    const { subject, html } = unsubscribeSuccess();
    await sendEmail({
      to: subscriber.email,
      subject,
      html,
      kind: 'unsubscribe_success',
      entityId: String(subscriber.id),
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Inscrição cancelada. Você não receberá mais e-mails de marketing.',
  });
}

/**
 * Fluxo "esqueci o link": manda o link REAL (com token) para o endereço
 * informado, sem nenhum efeito imediato na lista.
 *
 * Três guardas contra transformar isto num canhão de e-mail:
 * 1. só envia se o endereço já existe em `email_subscribers` — não é relay para
 *    terceiros;
 * 2. não envia para quem já está descadastrado — nada a fazer, e evita
 *    mailbomb de quem já saiu;
 * 3. `entityId` inclui o dia corrente, então o log de idempotência de
 *    lib/email-sender.js (unique em email+kind+entity_id) limita a 1 envio por
 *    dia por endereço, por mais que o formulário seja submetido.
 * O rate limit de 20/min por IP fecha o resto.
 */
async function requestUnsubscribeLink(email, res) {
  const subscriber = await getTableRow('email_subscribers', {
    select: 'id,email,unsubscribe_token,unsubscribed_at',
    filters: [{ column: 'email', value: email }],
  });

  if (subscriber && !subscriber.unsubscribed_at && subscriber.unsubscribe_token) {
    const url = `${getAppUrl()}/desinscrever?token=${encodeURIComponent(subscriber.unsubscribe_token)}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;color:#0f172a;">
        <p style="margin:0 0 16px;">Recebemos um pedido para cancelar sua inscrição na nossa lista de e-mails.</p>
        <p style="margin:0 0 16px;">Para concluir, clique no link abaixo:</p>
        <p style="margin:0 0 16px;"><a href="${url}" style="color:#be185d;font-weight:600;">Confirmar cancelamento</a></p>
        <p style="margin:0;font-size:13px;color:#64748b;">
          Se não foi você quem pediu, ignore este e-mail — nada muda sem o clique.
        </p>
      </div>`;

    await sendEmail({
      to: subscriber.email,
      subject: 'Confirme o cancelamento da sua inscrição',
      html,
      kind: 'unsubscribe_request',
      // Bucket diário: no máximo 1 pedido por dia por assinante.
      entityId: `${subscriber.id}:${new Date().toISOString().slice(0, 10)}`,
      // Passa o token também aqui para que o rodapé automático aponte para o
      // link certo (kind não catalogado em lib/email-sender.js recebe rodapé).
      unsubscribeToken: subscriber.unsubscribe_token,
    });
  }

  // `success: false` de propósito: a página /desinscrever (src/pages/
  // SubscriptionPages.jsx) troca o título para "Pronto, você foi removido"
  // quando `success === true`, e aqui NADA foi removido ainda. Com false ela
  // mantém o formulário e exibe a mensagem — que é exatamente o estado real.
  // `code` deixa o front distinguir isto de um erro de verdade sem parsear texto.
  return res.status(200).json({
    success: false,
    code: 'confirmation_required',
    message: NEUTRAL_EMAIL_MESSAGE,
    error: NEUTRAL_EMAIL_MESSAGE,
  });
}
