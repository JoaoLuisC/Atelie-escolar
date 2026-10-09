# 02 — Split de pagamentos

Pesquisa de 09/10/2026. Com vários professores vendendo, o dinheiro de cada venda precisa cair
direto na conta de quem vendeu, com a comissão da plataforma descontada no ato. Receber tudo e
repassar depois faria a plataforma guardar dinheiro de terceiros e pagar imposto sobre o valor
cheio — o split existe para evitar isso.

## As opções

| Requisito                      | Mercado Pago 1:1             | Mercado Pago 1:N                     | Asaas                              | Stripe Connect                                        |
| ------------------------------ | ---------------------------- | ------------------------------------ | ---------------------------------- | ----------------------------------------------------- |
| Carrinho misto (essencial)     | ❌ um vendedor por pagamento | ✅                                   | ✅ sem limite de recebedores       | ✅ _separate charges and transfers_, Brasil suportado |
| Acesso                         | Autoatendimento              | **Só via time comercial**            | Autoatendimento                    | Autoatendimento                                       |
| Pix                            | ✅                           | ✅                                   | ✅                                 | ✅ (2 dias)                                           |
| Cartão parcelado (obrigatório) | ✅                           | ✅                                   | ✅                                 | ❌ **não confirmado no Brasil**                       |
| Prazo do cartão                | Conhecido                    | Conhecido                            | ~D+32; antecipação em 2 dias úteis | **30 dias** (oficial); antecipação via parceiro       |
| Chargeback pago pelo professor | —                            | A confirmar                          | ✅ split estornado automático      | ⚠️ debita a plataforma; recupera estornando o repasse |
| Professor PF e CNPJ            | ✅                           | ✅                                   | ✅ subcontas                       | ✅ (verificação mais rígida no Brasil desde 2026)     |
| Esforço de integração          | Pequeno (já existe)          | Troca de API (Orders + Transparente) | Troca de provedor                  | Troca de provedor                                     |

## Recomendação (provisória)

1. **Asaas** — único que atende hoje, em autoatendimento, todos os obrigatórios.
2. **Mercado Pago 1:N** — alternativa se o comercial liberar nessa escala; o comprador já conhece
   o checkout.
3. **Stripe** — só se confirmar parcelamento no Brasil **e** o repasse de 30 dias for aceitável
   **e** a plataforma aceitar o risco de chargeback quando o professor já sacou. Com os requisitos
   de [01](./01-MODELO-DE-NEGOCIO.md), descartado.

Qualquer que seja, trocar de provedor reescreve `create-payment`, `webhook`, `verify-payment` e a
checagem de valor. A reconciliação já mora num módulo só
([ADR 0003](../adr/0003-reconciliacao-de-pagamento-em-modulo-unico.md)) — manter assim é o que
deixa uma troca futura contida.

## Custos do Asaas (tabela oficial, 09/10/2026)

Sem mensalidade e sem adesão. Paga por cobrança **recebida**. Entre parênteses, a promoção dos 3
primeiros meses da conta.

| Meio                  | Taxa                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Pix                   | **R$ 1,99 fixo** (R$ 0,99)                                                                        |
| Cartão à vista        | 2,99% + R$ 0,49 (1,99% + R$ 0,49)                                                                 |
| Cartão 2–6x           | 3,49% + R$ 0,49 (2,49% + R$ 0,49)                                                                 |
| Cartão 7–12x          | 3,99% + R$ 0,49 (2,99% + R$ 0,49)                                                                 |
| Antecipação de cartão | 1,25% a.m. à vista · 1,70% a.m. parcelado                                                         |
| Saque do professor    | Pix grátis (PF); PJ 30 grátis/mês, depois R$ 2,00; TED R$ 5,00                                    |
| Notificações do Asaas | E-mail/SMS R$ 0,99; WhatsApp R$ 0,55 — **desligar pela API**, o projeto manda os próprios e-mails |
| Subconta e split      | **Não constam na tabela** — perguntar                                                             |

### Por venda

| Venda     | Pix               | Cartão à vista | Cartão 3x      |
| --------- | ----------------- | -------------- | -------------- |
| R$ 12,90  | R$ 1,99 (**15%**) | R$ 0,88 (6,8%) | R$ 0,94 (7,3%) |
| R$ 50,00  | R$ 1,99 (4,0%)    | R$ 1,99 (4,0%) | R$ 2,24 (4,5%) |
| R$ 100,00 | R$ 1,99 (2,0%)    | R$ 3,48 (3,5%) | R$ 3,98 (4,0%) |

O Pix fixo pesa no ticket baixo. Atenuantes: o carrinho misto gera **uma** cobrança (uma taxa) para
vários professores; e negociar Pix percentual é o primeiro pedido ao comercial.

### Um mês ilustrativo

50 professores, 300 vendas/mês, ticket R$ 30, 60% Pix / 40% cartão à vista:
Pix 180 × R$ 1,99 = R$ 358 · cartão 120 × R$ 1,39 = R$ 167 → **≈ R$ 525/mês sobre R$ 9.000
(5,8%)**.

### Quem paga a taxa

O split do Asaas é calculado sobre o valor **líquido** (depois da taxa). O mais simples: a
comissão da plataforma (ex.: 12–15%) cobre a taxa, e o professor recebe o resto sem surpresa.

## Perguntas para o comercial

Para o Asaas (e, se possível, o Mercado Pago 1:N):

1. Taxa de Pix, cartão à vista e parcelado — e quem paga os juros do parcelado.
2. **Pix percentual** para ticket baixo, em vez de R$ 1,99 fixo.
3. Custo de **subconta** e de **split**.
4. Prazo real de cada meio e custo/possibilidade de **antecipação automática**.
5. Aceitam **marketplace de produto digital** com subcontas **pessoa física**?
6. Como fica o split numa **compra parcelada** e num **reembolso parcial** (só o item de um
   professor do carrinho)?
7. Chargeback quando o professor **já sacou** o saldo.
8. A taxa promocional pode virar permanente nessa escala?

## Fontes

- [Mercado Pago — Split 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)
- [Mercado Pago — Split 1:1, pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites)
- [Mercado Pago — Split 1:N](https://www.mercadopago.com.br/developers/en/docs/split-payments-1-n/overview)
- [Asaas — Preços e taxas](https://www.asaas.com/precos-e-taxas)
- [Asaas — Split de pagamento](https://docs.asaas.com/docs/split-de-pagamento)
- [Asaas — Checkout com split](https://docs.asaas.com/docs/checkout-com-split-de-pagamento)
- [Asaas — Dúvidas frequentes do split](https://docs.asaas.com/docs/duvidas-frequentes-split)
- [Asaas — Antecipação de recebíveis](https://www.asaas.com/antecipacao-de-recebiveis)
- [Stripe — Prazo de repasse no Brasil](https://support.stripe.com/questions/payout-schedule-and-payment-availability-for-accounts-in-brazil)
- [Stripe — Antecipação via parceiro no Brasil](https://support.stripe.com/questions/partner-based-brazil-anticipations)
- [Stripe — Separate charges and transfers](https://docs.stripe.com/docs/connect/separate-charges-and-transfers)
- [Stripe — Disputas no Connect](https://docs.stripe.com/connect/disputes)
- [Stripe — Pix](https://docs.stripe.com/payments/pix)
- [Stripe — Verificação de contas conectadas no Brasil](https://support.stripe.com/questions/brazil-updates-to-verification-requirements-for-connected-accounts-of-platforms)
