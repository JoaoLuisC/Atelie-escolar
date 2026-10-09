# E-commerce Ateliê da Escola — a plataforma (v2)

> **Status: ADIADO.** A v1 é a loja da Profa. Márcia, como está no código hoje. Esta pasta guarda o
> que foi decidido e pesquisado em 09/10/2026 sobre transformar o projeto numa plataforma, para
> retomar depois que a v1 estiver no ar. O checklist de fechamento da v1 está em
> [13-ROADMAP-PENDENCIAS](../ProjectDocs/13-ROADMAP-PENDENCIAS.md#próximo-passo-concreto--checklist-de-fechamento-08102026).

## A ideia em uma frase

O Ateliê da Escola vira um **marketplace** em que professores cadastram e vendem os próprios
materiais, e um **white label** em que o professor contrata um site próprio parecido com a loja
atual — os dois dentro do mesmo ecossistema, com o mesmo cadastro de cliente e o mesmo jeito de
pagar, e a plataforma ficando com uma comissão por venda.

## Documentos

| #   | Documento                                          | O que tem                                                                   |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| 01  | [Modelo de negócio](./01-MODELO-DE-NEGOCIO.md)     | Marketplace + white label, os requisitos respondidos, domínio               |
| 02  | [Split de pagamentos](./02-SPLIT-DE-PAGAMENTOS.md) | Mercado Pago × Asaas × Stripe, recomendação, custos, perguntas ao comercial |
| 03  | [Multi-tenant](./03-MULTI-TENANT.md)               | Por que não multi-repo, o que criar no banco/backend/front, ordem de obra   |

## Decisões até aqui

| Decisão               | Situação                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Arquitetura           | **Multi-tenant num repositório só** (não um repo por cliente). Ver [03](./03-MULTI-TENANT.md)                                        |
| Provedor de split     | **Asaas, provisório** — sujeito às respostas do comercial. Stripe descartado pelos requisitos. Ver [02](./02-SPLIT-DE-PAGAMENTOS.md) |
| Domínio da plataforma | Sugerido `ateliedaescola.com.br`, com subdomínio por professor (`professoramarcia.ateliedaescola.com.br`)                            |
| Comissão              | % por venda; white label cobrado à parte                                                                                             |

## Antes de retomar

1. A v1 no ar, com venda real — é ela que vira a "loja nº 1" na migração.
2. Respostas do comercial do Asaas (e, se possível, do Mercado Pago 1:N) às perguntas de
   [02 §Perguntas](./02-SPLIT-DE-PAGAMENTOS.md#perguntas-para-o-comercial).
3. Conversa com contador sobre nota fiscal (professor emite a da venda, plataforma a da comissão?)
   e termos de uso para professores.
4. Registrar as decisões finais como ADR em [`docs/adr/`](../adr/README.md).

> ⚠️ Taxas e condições de provedores mudam. Os números daqui são de 09/10/2026 — reconfira antes de
> decidir.
