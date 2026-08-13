const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, insertIntoTable, updateTable },
} = require('../lib/supabase');
const { sanitizeAttribution } = require('../lib/attribution-sanitize');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { ERROR_CODES, fail, methodNotAllowed, preflight } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('abandoned-cart');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 20;
const MAX_EMAIL_LEN = 200;
const MAX_SESSION_LEN = 64;
const MAX_PRICE = 1_000_000; // teto sanitário; o preço real vem do banco no checkout

// Tudo aqui é entrada anônima gravada com service role, então cada campo tem
// teto de tamanho E de valor. Sem o clamp numérico, `price`/`quantity`
// NaN/Infinity/negativos vazariam para `total_amount` (coluna numérica) e para
// o corpo do e-mail de recuperação, que é montado a partir deste JSON.
function toBoundedNumber(value, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === 'object')
    .slice(0, MAX_ITEMS)
    .map((item) => ({
      productId: String(item.productId || item.id || '').slice(0, 64),
      name: String(item.name || '').slice(0, 200),
      price: toBoundedNumber(item.price, { min: 0, max: MAX_PRICE }),
      quantity: Math.round(toBoundedNumber(item.quantity, { min: 1, max: 99 })),
    }))
    .filter((item) => item.productId);
}

/**
 * Salva (ou atualiza) o estado de um carrinho com e-mail capturado.
 *
 * Estratégia: upsert manual por (email, session_id). Quando o cliente
 * digita o e-mail e tem itens no carrinho, o frontend chama isso.
 * Um job futuro (Fase 3 / cron) varre `abandoned_carts` onde:
 *   recovered_at IS NULL
 *   AND reminder_sent_at IS NULL
 *   AND updated_at < now() - interval '1 hour'
 * e dispara o e-mail de recuperação.
 *
 * Não bloqueia o checkout: se falhar, o front simplesmente ignora.
 *
 * ── LIMITES DE CONFIANÇA (achado M1) ──────────────────────────────────
 * Este endpoint é PÚBLICO e não tem como provar que quem envia é dono do
 * e-mail informado — é um campo digitado num formulário anônimo. Portanto o
 * que está gravado aqui NÃO é consentimento de contato: quem decide se pode
 * enviar marketing é api/cron-email-jobs.js, que exige opt-in positivo
 * (registro confirmado em `email_subscribers`) antes de qualquer disparo.
 * Antes dessa correção, POSTar o e-mail de um terceiro aqui bastava para a
 * loja mandar marketing para ele.
 *
 * As duas guardas que ficam DESTE lado:
 * - rate limit de 30/min por IP (paridade com o abandonedCartLimiter do
 *   Express de dev — em produção não havia limite nenhum). O front chama isto
 *   a cada digitação com debounce, então 30/min é folgado para um humano e
 *   corta o script que inflaria a tabela com endereços colhidos;
 * - teto de tamanho/valor em todo campo persistido (ver sanitizeItems).
 */
module.exports = async function abandonedCartHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  const gate = await enforceRateLimit(req, res, RATE_LIMITS.abandonedCart);
  if (gate.blocked) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST', 'OPTIONS']);
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(204).end();
    }

    const body = req.body || {};
    // O slice vem ANTES do regex de propósito: um endereço de 1 MB não deve nem
    // chegar ao regex (o `[^\s@]+` faria backtracking sobre a string inteira).
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
      .slice(0, MAX_EMAIL_LEN);
    if (!email || !EMAIL_REGEX.test(email)) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'E-mail inválido.',
      });
    }

    const items = sanitizeItems(body.items);
    if (items.length === 0) {
      return res.status(204).end();
    }

    const sessionId = String(body.sessionId || body.session_id || '').slice(0, MAX_SESSION_LEN);
    // Já limitado por construção (20 itens × 99 × MAX_PRICE), mas o clamp final
    // deixa explícito que nada fora da faixa chega à coluna numérica.
    const totalAmount = toBoundedNumber(
      items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      { min: 0, max: MAX_ITEMS * 99 * MAX_PRICE },
    );
    const attribution = sanitizeAttribution(body.attribution);

    // Upsert manual: tenta achar registro existente, atualiza; senão insere
    const existing = await getTableRow('abandoned_carts', {
      select: 'id',
      filters: [
        { column: 'email', value: email },
        ...(sessionId ? [{ column: 'session_id', value: sessionId }] : []),
      ],
    });

    if (existing) {
      await updateTable(
        'abandoned_carts',
        { id: `eq.${existing.id}` },
        {
          items,
          total_amount: totalAmount,
          attribution_data: attribution,
          // Reset reminder se carrinho foi atualizado — ciclo recomeça
          reminder_sent_at: null,
        },
      );
    } else {
      await insertIntoTable('abandoned_carts', {
        email,
        session_id: sessionId || null,
        items,
        total_amount: totalAmount,
        attribution_data: attribution,
      });
    }

    return res.status(204).end();
  } catch (error) {
    // Falha silenciosa — tracking de carrinho não pode quebrar checkout
    log.warn('handler_failed', { reason: error.message });
    return res.status(204).end();
  }
};
