// ════════════════════════════════════════════════════════════════════
// ARITMÉTICA DE DINHEIRO EM CENTAVOS INTEIROS (regra E3).
//
// ── A CORREÇÃO DA REGRA (13/08/2026) ────────────────────────────────
// A redação original de E3 dizia "centavo inteiro — inclusive na coluna do
// banco, quando der para migrar". Ao ir aplicar, a premissa se mostrou errada:
// as colunas já são `numeric(12,2)` (supabase/schema.sql), que no Postgres é
// decimal EXATO, não ponto flutuante. Não há nada a migrar — e migrar para
// `integer` seria uma piora: perderia legibilidade em SQL e quebraria toda
// consulta e relatório existente, para consertar um problema que não está lá.
//
// O drift é 100% do lado JavaScript. `numeric` chega ao Node como número IEEE
// 754, e a partir daí `0.1 + 0.2 !== 0.3`. Foi por isso que
// `lib/payment-integrity.js` precisou de uma tolerância explícita de 1 centavo
// na conferência de pagamento: o rateio de desconto de cupom em
// `applyDiscountToItems` produz sobra que "absorve o drift no último item
// elegível". Essa tolerância é a assinatura do problema, e é literalmente uma
// margem de erro aceita na porta que entrega produto pago.
//
// ── A DECISÃO ───────────────────────────────────────────────────────
// Converter para centavos inteiros na ENTRADA do cálculo, fazer toda a
// aritmética em inteiro (onde JS é exato até 2^53, ou seja, ~90 trilhões de
// reais), e voltar para reais só na saída — banco, Mercado Pago e tela.
//
// O que NÃO muda: o tipo das colunas, o formato do payload da API, nem o que o
// Mercado Pago recebe. É uma mudança de como se soma, não de como se guarda.
// ════════════════════════════════════════════════════════════════════

/**
 * Reais (número, string ou `numeric` do PostgREST) → centavos inteiros.
 *
 * `Math.round` e não `Math.trunc`: `19.99 * 100` dá 1998.9999999999998 em IEEE
 * 754, e truncar produziria 1998 — um centavo a menos por item, silenciosamente.
 *
 * @param {unknown} value
 * @returns {number} centavos, ou `NaN` se o valor não for utilizável.
 *   NaN é deliberado: quem consome decide o que fazer com "não consigo ler
 *   este valor", e a política do projeto nessa situação é fail-closed
 *   (ver lib/payment-integrity.js). Coerção para 0 é justamente o bug que
 *   transformava total ausente em "pedido de R$ 0,00, qualquer coisa paga".
 */
function toCents(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return Number.NaN;
  return Math.round(asNumber * 100);
}

/**
 * Centavos inteiros → reais, para gravar/enviar/exibir.
 * @param {number} cents
 * @returns {number} valor com 2 casas
 */
function toReais(cents) {
  if (!Number.isFinite(cents)) return Number.NaN;
  return Math.round(cents) / 100;
}

/** `toCents` que devolve 0 em vez de NaN. Use APENAS onde 0 é o valor correto. */
function toCentsOrZero(value) {
  const cents = toCents(value);
  return Number.isFinite(cents) ? cents : 0;
}

/**
 * Soma o total de uma lista de itens, em centavos.
 *
 * @param {Array<{price:unknown, quantity:unknown}>} items
 * @returns {number} centavos
 */
function sumItemsCents(items) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => {
    const unit = toCentsOrZero(item?.price);
    const qty = Math.max(0, Math.trunc(Number(item?.quantity) || 0));
    return total + unit * qty;
  }, 0);
}

/**
 * Percentual sobre um valor em centavos, arredondado ao centavo.
 *
 * @param {number} cents
 * @param {number} percent  0..100
 * @returns {number} centavos
 */
function percentOfCents(cents, percent) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.round((cents * pct) / 100);
}

/**
 * Rateia `discountCents` entre itens elegíveis, garantindo que a soma dos
 * descontos seja EXATAMENTE `discountCents`.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────
 * É a versão exata de `applyDiscountToItems` (api/create-payment.js), que
 * escalava preços por um fator fracionário e depois empurrava a sobra para o
 * último item. Aquela sobra é o drift que obrigou a tolerância de 1 centavo em
 * `lib/payment-integrity.js`.
 *
 * Aqui o rateio é proporcional em inteiros e a sobra da divisão é distribuída
 * um centavo por vez, do maior para o menor resto — o método de maior resto,
 * que é o mesmo usado para distribuir assentos proporcionalmente. A soma fecha
 * por construção, não por correção posterior.
 *
 * @param {number[]} weightsCents  peso de cada item (preço × quantidade), em centavos
 * @param {number} discountCents   total a ratear, em centavos
 * @returns {number[]} desconto de cada item, em centavos; soma === discountCents
 */
function allocateDiscountCents(weightsCents, discountCents) {
  const weights = weightsCents.map((w) => Math.max(0, Math.trunc(w) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.min(Math.trunc(discountCents) || 0, total));

  if (total === 0 || target === 0) return weights.map(() => 0);

  // Parte inteira do rateio proporcional, e o resto de cada divisão.
  const exact = weights.map((w) => (w * target) / total);
  const base = exact.map((v) => Math.floor(v));
  let remaining = target - base.reduce((a, b) => a + b, 0);

  // Maior resto primeiro; empate desempata pelo maior peso, e depois pelo
  // índice — determinístico, para que o mesmo carrinho produza sempre o mesmo
  // rateio (senão dois cálculos do mesmo pedido divergiriam por um centavo).
  const order = exact
    .map((v, i) => ({ i, rest: v - Math.floor(v), weight: weights[i] }))
    .sort((a, b) => b.rest - a.rest || b.weight - a.weight || a.i - b.i);

  for (const { i } of order) {
    if (remaining <= 0) break;
    base[i] += 1;
    remaining -= 1;
  }

  return base;
}

module.exports = {
  allocateDiscountCents,
  percentOfCents,
  sumItemsCents,
  toCents,
  toCentsOrZero,
  toReais,
};
