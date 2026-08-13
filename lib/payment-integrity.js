// ════════════════════════════════════════════════════════════════════
// RECONCILIAÇÃO DE VALOR PAGO × VALOR DO PEDIDO — porta única.
//
// Achado P0-1 da revisão 2026-08-12; extraído para cá na rodada de 2026-08-13
// depois que a DUPLICAÇÃO desta lógica produziu, sozinha, a regressão R3.
//
// ── O QUE ESTAVA ERRADO NO SISTEMA (o achado original) ───────────────
// A única condição para liberar o produto era `payment.status === 'approved'`
// somada a um `external_reference` que resolvesse para um pedido existente.
// `transaction_amount`, `currency_id` e `live_mode` não eram lidos em lugar
// nenhum do projeto; `total_amount` era carregado mas só alimentava analytics.
// Ou seja: o sistema confiava no gateway para dizer QUE foi pago e nunca
// perguntava QUANTO. Um pagamento de R$ 0,01 apontado para o order_code de um
// pedido de R$ 200 transicionava o pedido para approved e emitia os
// download_tokens — entrega completa do produto digital.
//
// ── POR QUE ISTO É UM MÓDULO, E NÃO DUAS CÓPIAS ─────────────────────
// Existem exatamente DUAS portas que transicionam um pedido para `approved` e
// emitem `download_tokens`: api/webhook.js (notificação do Mercado Pago) e
// api/verify-payment.js (polling do frontend). A correção do P0-1 foi
// implementada nas duas — com rigor DIFERENTE. O webhook ficou fail-closed no
// total do pedido; o verify-payment lia `Number(order?.total_amount || 0)`,
// ou seja, fail-OPEN: um pedido com `total_amount` null/ilegível fazia `due`
// virar 0, e então qualquer pagamento de R$ 0,01 satisfazia `paid + 0.01 >= 0`.
//
// O ponto que generaliza: um atacante não escolhe por onde a defesa é forte,
// ele escolhe a porta mais fraca. Como as duas portas são funcionalmente
// equivalentes (ambas entregam o produto), a proteção valia exatamente o que
// valia a MAIS FROUXA das duas — que era nada, no caso do total ilegível.
// Duas cópias que precisam concordar são duas cópias que vão divergir na
// próxima edição, então elas deixaram de ser duas.
//
// Os testes de paridade em api/__tests__/payment-integrity.test.js continuam
// valendo mesmo com a lógica unificada: eles exercitam os dois HANDLERS de
// ponta a ponta, então pegam divergência no encaixe (uma porta que chame esta
// função no lugar errado do fluxo, ou que ignore o `reason`) — que é a classe
// de bug que sobra depois da extração.
//
// ── AS REGRAS, E O PORQUÊ DE CADA UMA ────────────────────────────────
// • MOEDA: a loja só vende em BRL e `orders.total_amount` é sempre BRL. Sem
//   esta checagem, 200 unidades de uma moeda fraca satisfariam `paid >= due`
//   e comprariam um produto de R$ 200.
// • FAIL-CLOSED em todo campo ausente/ilegível, do pagamento OU do pedido:
//   "não consegui conferir o valor" nunca pode significar "libera o produto".
//   Repare no `toNumber` abaixo — `Number('')` e `Number(null)` são 0, não
//   NaN, e foi exatamente esse coerce que transformava total ausente em
//   "pedido de R$ 0,00, qualquer coisa paga".
// • TOLERÂNCIA de 1 centavo: `applyDiscountToItems` (api/create-payment.js)
//   rateia o desconto do cupom entre os itens com arredondamento por unidade e
//   absorve o drift no último item elegível, então a soma da preference pode
//   diferir do total do pedido por frações de centavo. Um centavo cobre o
//   arredondamento e não cobre nenhum ataque plausível.
// • PAGAMENTO A MAIOR não bloqueia: cobrar mais que o devido é caso de
//   suporte/estorno, não falha de segurança na entrega, e travar puniria o
//   cliente que já pagou.
// • SANDBOX EM PRODUÇÃO: `live_mode === false` significa que o deploy está com
//   credencial de teste e que estaríamos entregando produto real contra
//   dinheiro que não existe. Deliberadamente não há env de escape: o jeito
//   suportado de rodar em sandbox é publicar com APP_ENV=preview/development,
//   que é justamente o que faz esta checagem não se aplicar.
//
// ── LIMITE CONHECIDO ─────────────────────────────────────────────────
// A checagem assume UM pagamento por pedido, que é o que a preference atual
// produz (`installments: 1`, sem pagamento com dois cartões). Se um dia
// habilitarmos pagamento fracionado, isto precisa SOMAR os pagamentos do
// mesmo `external_reference` em vez de olhar um só.
// ════════════════════════════════════════════════════════════════════

const AMOUNT_TOLERANCE = 0.01;
const EXPECTED_CURRENCY = 'BRL';

/**
 * Precedência APP_ENV > VERCEL_ENV > NODE_ENV, a mesma de scripts/check-env.js.
 * NODE_ENV sozinho não serve: a Vercel o define como 'production' também nos
 * builds de preview, e um preview em sandbox passaria a recusar todo pagamento.
 */
function isProductionRuntime() {
  const env = String(process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  return env === 'production';
}

/**
 * Confere se o pagamento aprovado pelo MP corresponde de fato ao pedido.
 *
 * PRÉ-CONDIÇÃO DE USO: o resultado tem que ser consultado ANTES de qualquer
 * escrita — antes do UPDATE que marca o pedido como pago e antes de qualquer
 * download_token existir. Chamar depois transforma a checagem em auditoria de
 * um produto já entregue.
 *
 * @param {object} payment linha do Mercado Pago (getPaymentInfo ou search)
 * @param {object} order   linha de `orders`
 * @returns {{ok: boolean, reason: string|null, currency: string, paid: number, due: number}}
 *   `reason` é o vocabulário compartilhado pelas duas portas no evento de
 *   segurança `payment_amount_mismatch`: currency_mismatch,
 *   order_total_unusable, payment_amount_unusable, amount_below_order_total,
 *   test_payment_in_production.
 */
function checkPaymentIntegrity(payment, order) {
  const currency = String(payment?.currency_id || '').trim().toUpperCase();

  const toNumber = (value) => (
    value === null || value === undefined || value === '' ? Number.NaN : Number(value)
  );
  const due = toNumber(order?.total_amount);
  const paid = toNumber(payment?.transaction_amount);

  if (currency !== EXPECTED_CURRENCY) {
    return { ok: false, reason: 'currency_mismatch', currency, paid, due };
  }

  // `due <= 0` e não `due < 0` — aperto aplicado na extração, e este é o
  // momento em que ele passou a ser seguro: enquanto a checagem era duplicada,
  // apertar só um dos lados recriaria a assimetria que causou a R3 (o MP
  // notifica o webhook automaticamente em todo pagamento, então a porta frouxa
  // aprovaria de qualquer jeito e o efeito líquido seria uma divergência nova).
  //
  // O que o zero abria: `orders` PODE conter uma linha com `total_amount = 0` —
  // api/create-payment.js:346 calcula `Math.max(0, subtotal - desconto)` e
  // INSERE o pedido (linha 351) ANTES de criar a preference (linha 383), então
  // um cupom de 100% deixa a linha zerada gravada mesmo quando o MP recusa a
  // preference de valor zero. Com `due < 0`, esse pedido aceitava qualquer
  // pagamento: `0.01 + 0.01 >= 0`.
  //
  // Não há falso positivo a temer: NENHUM caminho do projeto aprova pedido sem
  // passar pelo Mercado Pago, e o MP não aprova cobrança de R$ 0,00. Se um dia
  // existir um fluxo de pedido gratuito de verdade, ele vai precisar de um
  // caminho de aprovação próprio — e vai aparecer aqui como um
  // `order_total_unusable` com severity 'error', que é falha ALTA, não
  // silenciosa.
  if (!Number.isFinite(due) || due <= 0) {
    return { ok: false, reason: 'order_total_unusable', currency, paid, due };
  }

  if (!Number.isFinite(paid) || paid < 0) {
    return { ok: false, reason: 'payment_amount_unusable', currency, paid, due };
  }

  // Comparação em CENTAVOS INTEIROS, não em reais de ponto flutuante. A forma
  // óbvia — `paid + AMOUNT_TOLERANCE < due` — erra para o lado caro em valores
  // perfeitamente comuns: com due=2.29 e paid=2.28, `2.28 + 0.01` vale
  // 2.2899999999999996 em IEEE-754, que é MENOR que 2.29, e um pagamento
  // exatamente dentro da folga era recusado como divergência. O erro cai sempre
  // no falso NEGATIVO (recusar quem pagou certo), que é justamente o lado que
  // não podemos escolher: a outra porta é o webhook, e um pedido recusado ali
  // não é reprocessado — vira cliente pago sem produto.
  //
  // Arredondar cada lado para centavos antes de subtrair elimina a classe
  // inteira: `Math.round(x * 100)` é exato para qualquer valor monetário que o
  // Mercado Pago produz (2 casas), e a diferença passa a ser aritmética de
  // inteiros. O limite continua sendo o MESMO 1 centavo — as bordas testadas
  // (199,99 aprova / 199,98 recusa para um pedido de 200) não se movem.
  const shortfallCents = Math.round(due * 100) - Math.round(paid * 100);
  if (shortfallCents > Math.round(AMOUNT_TOLERANCE * 100)) {
    return { ok: false, reason: 'amount_below_order_total', currency, paid, due };
  }

  if (isProductionRuntime() && payment?.live_mode === false) {
    return { ok: false, reason: 'test_payment_in_production', currency, paid, due };
  }

  return { ok: true, reason: null, currency, paid, due };
}

module.exports = {
  checkPaymentIntegrity,
  isProductionRuntime,
  AMOUNT_TOLERANCE,
  EXPECTED_CURRENCY,
};
