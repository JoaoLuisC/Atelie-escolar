# 0003 — Reconciliação de pagamento em módulo único

**Status:** aceito · **Data:** 2026-08-13 (registro de decisão já vigente no código)

## Contexto

Existem exatamente **duas portas** que transicionam um pedido para `approved` e emitem
`download_tokens`, ou seja, que entregam o produto pago:

- `handlers/webhook.js` — notificação do Mercado Pago;
- `handlers/verify-payment.js` — polling do frontend.

O achado P0-1 (revisão de 2026-08-12) foi que a única condição para liberar o produto era
`payment.status === 'approved'` mais um `external_reference` que resolvesse para um pedido
existente. `transaction_amount`, `currency_id` e `live_mode` não eram lidos em lugar nenhum.
**O sistema confiava no gateway para dizer QUE foi pago e nunca perguntava QUANTO** — um
pagamento de R$ 0,01 apontado para o `order_code` de um pedido de R$ 200 entregava o produto.

A correção foi implementada nas duas portas — **com rigor diferente**. O webhook ficou
fail-closed no total; o verify-payment lia `Number(order?.total_amount || 0)`, ou seja,
fail-**open**: um pedido com total ilegível fazia `due` virar 0, e aí qualquer centavo
satisfazia a checagem.

## Decisão

A regra de reconciliação vive em **`lib/payment-integrity.js`**, e as duas portas a chamam.
Não existe cópia.

As regras, todas fail-closed:

- **moeda** precisa ser BRL (sem isso, 200 unidades de moeda fraca compram R$ 200);
- **campo ausente ou ilegível** — do pagamento ou do pedido — nunca significa "libera";
- **tolerância de 1 centavo**, e só, para absorver o arredondamento do rateio de cupom em
  `applyDiscountToItems`;
- **pagamento a maior não bloqueia** (é caso de suporte, não falha de segurança);
- **`live_mode === false` em produção** recusa: seria entregar produto real contra dinheiro
  que não existe.

## Consequências

**Boas.** Um atacante não escolhe por onde a defesa é forte — ele escolhe a porta mais fraca.
Com as duas portas funcionalmente equivalentes, a proteção valia o que valia a mais frouxa.
Com um módulo só, isso deixa de ser possível por construção.

Também destravou um aperto que estava represado: mudar `due < 0` para `due <= 0` só de um
lado teria recriado a assimetria.

**Ruins.** A tolerância de 1 centavo é dívida herdada da aritmética em ponto flutuante (ver
regra E3): ela existe porque o rateio de desconto produz drift. Com dinheiro em centavos
inteiros, a tolerância poderia ser zero — e enquanto ela existir, é uma margem de erro aceita
na conferência de pagamento.

## Alternativas descartadas

**Manter as duas cópias "com atenção".** Duas cópias que precisam concordar são duas cópias
que vão divergir na próxima edição. Já divergiram uma vez, na própria correção do achado.

**Testar as duas portas e confiar nos testes.** Os testes de paridade em
`handlers/__tests__/payment-integrity.test.js` continuam existindo e valendo — mas eles pegam
divergência no **encaixe** (uma porta que chame a função no lugar errado do fluxo, ou ignore
o `reason`), que é a classe de bug que sobra depois da extração. Não substituem a extração.
