# 01 — Modelo de negócio

## Os dois produtos

**Marketplace.** Professores se cadastram, publicam seus materiais e vendem. Compradores se
cadastram do mesmo jeito que na loja atual (conta única no ecossistema: quem comprou de um
professor usa o mesmo login para comprar de outro). A plataforma fica com uma comissão por venda.

**White label.** O professor contrata um site próprio, parecido com a loja atual (a v1 é, na
prática, o primeiro white label). Ele continua dentro do ecossistema: mesmo cadastro de cliente,
mesmo meio de pagamento, mesma comissão. O desenvolvimento e a manutenção do site são cobrados à
parte.

## Requisitos respondidos (09/10/2026)

| Pergunta                                         | Resposta                                  | Consequência                                                     |
| ------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| Carrinho com produtos de professores diferentes? | **Sim, essencial**                        | Elimina o Mercado Pago 1:1 (um vendedor por pagamento)           |
| Quem vende?                                      | **Pessoa física e CNPJ**                  | Provedor precisa aceitar vendedor PF em produto digital          |
| Meios obrigatórios                               | **Pix, cartão à vista, cartão parcelado** | Stripe não confirma parcelamento no Brasil                       |
| Prazo de repasse ao professor                    | **Na hora / poucos dias**                 | Cartão no Brasil é ~30 dias por padrão: exige antecipação (paga) |
| Chargeback / reembolso                           | **Professor arca**                        | Favorece split que estorna automático de quem recebeu (Asaas)    |
| Cobrança da plataforma                           | **% por venda + white label à parte**     | Comissão no split; contrato do white label fora do provedor      |
| Venda no white label passa pela plataforma?      | **Sim, com comissão**                     | White label usa o mesmo split do marketplace                     |
| Escala no primeiro ano                           | **Até 50 professores**                    | Facilidade de integração pesa mais que taxa negociada            |

## Domínio

**Atualização 26/10/2026:** `ateliedaescola.com.br` foi registrado e a loja atual responde em `professoramarcia.ateliedaescola.com.br`. Registro anterior: o `profamarciarcardoso.com.br` que o código citava **não estava registrado** (registro.br 404 em
09/10/2026). Para a plataforma, a sugestão é **`ateliedaescola.com.br`** (estava livre em
09/10/2026):

- `ateliedaescola.com.br` → marketplace (todos os professores)
- `professoramarcia.ateliedaescola.com.br` → loja de cada professor (subdomínio, grátis)
- `www.lojadocliente.com.br` → domínio próprio do cliente white label, apontando para o mesmo site

Regras: subdomínio fica **à esquerda** do domínio comprado; sem espaço, sem acento; maiúscula não
existe em domínio. Comprar `ateliedaescola.com.br` já para a v1 serve aos dois momentos.

## Fora do código, mas necessário

- **Termos de uso para professores:** comissão, repasse, estorno, chargeback (professor arca).
- **Nota fiscal:** em princípio, cada professor emite a da própria venda e a plataforma a da
  comissão — validar com contador.
- **LGPD:** a plataforma é controladora das contas de cliente; o professor vê só os compradores dos
  próprios pedidos.
- **Titularidade do domínio:** decidir em nome de quem fica.
