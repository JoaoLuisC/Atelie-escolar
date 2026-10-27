// ════════════════════════════════════════════════════════════════════
// CARRINHO RECUPERADO — marca `abandoned_carts.recovered_at` na aprovação.
//
// O cron de e-mails (handlers/cron-email-jobs.js) pula carrinho com
// `recovered_at`, mas nada preenchia a coluna: quem digitava o e-mail no
// checkout e pagava em seguida recebia, uma hora depois, "você esqueceu algo
// no carrinho". Agora a PRIMEIRA aprovação do pedido (webhook ou polling de
// verify-payment) marca os carrinhos em aberto daquele e-mail.
//
// BEST-EFFORT: nunca lança. Falha aqui custa no máximo um lembrete a mais;
// não pode atrasar a liberação de um pedido pago.
// ════════════════════════════════════════════════════════════════════

const {
  serviceRoleHelpers: { updateTable },
} = require('./supabase');
const { createLogger } = require('./logger');

const log = createLogger('cart-recovery');

/**
 * @param {string} email e-mail do pedido aprovado
 * @returns {Promise<{marked: boolean, reason?: string}>}
 */
async function markCartsRecovered(email) {
  // O carrinho grava o e-mail em minúsculas (handlers/abandoned-cart.js).
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return { marked: false, reason: 'missing_email' };

  try {
    await updateTable(
      'abandoned_carts',
      { email: `eq.${normalized}`, recovered_at: 'is.null' },
      { recovered_at: new Date().toISOString() },
    );
    return { marked: true };
  } catch (error) {
    log.warn('falha_ao_marcar_carrinho_recuperado', { reason: error?.message || String(error) });
    return { marked: false, reason: 'update_failed' };
  }
}

module.exports = { markCartsRecovered };
