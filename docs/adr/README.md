# ADRs — Architecture Decision Records

Uma página por decisão **estrutural**: aquela que atravessa vários arquivos e cuja
ausência de explicação faz alguém "consertar" o código de volta para o estado errado.

## Por que existe

A regra F3 do [CONTRIBUTING.md](../../CONTRIBUTING.md) nasceu de um achado específico: as
decisões estruturais deste projeto estavam documentadas em **comentários longos e
genuinamente bons** dentro de `eslint.config.js`, `lib/payment-integrity.js` e `server.js`.

O conteúdo era o certo; o lugar não. Quem chega no projeto não sabe que precisa abrir esses
três arquivos primeiro — e uma decisão que vale para o repositório inteiro não pode morar
dentro de um dos arquivos que ela governa.

Os comentários **continuam onde estão**: eles explicam o código local para quem está
editando aquele arquivo. O ADR é o índice: ele responde "por que o projeto é assim" para
quem ainda não sabe onde olhar, e aponta de volta para o código.

## O que vira ADR (e o que não vira)

| Vira ADR                                            | Não vira                                           |
| --------------------------------------------------- | -------------------------------------------------- |
| Decisão que amarra vários arquivos                  | Detalhe de implementação de um arquivo             |
| Escolha entre alternativas com trade-off real       | Convenção de estilo (isso é regra no CONTRIBUTING) |
| Algo que alguém tentaria "consertar" sem o contexto | Bug corrigido (isso é commit + teste)              |

## Formato

Arquivo `NNNN-titulo-em-kebab.md` com quatro seções: **Contexto** (o que era verdade quando
a decisão foi tomada), **Decisão** (no imperativo), **Consequências** (incluindo as ruins) e
**Alternativas descartadas** — esta última é a que mais economiza tempo depois, porque é ela
que impede a discussão de recomeçar do zero.

ADR não se edita para mudar de ideia: cria-se um novo que **substitui** o anterior, e o
antigo é marcado como substituído. O histórico é o valor.

## Índice

| ADR                                                          | Decisão                                      |
| ------------------------------------------------------------ | -------------------------------------------- |
| [0001](./0001-commonjs-no-backend-esm-no-frontend.md)        | CommonJS no backend, ESM no frontend         |
| [0002](./0002-handler-unico-para-vercel-e-express.md)        | Um handler serve a Vercel e o Express de dev |
| [0003](./0003-reconciliacao-de-pagamento-em-modulo-unico.md) | Reconciliação de pagamento em módulo único   |
| [0004](./0004-envelope-de-resposta-e-codigo-de-erro.md)      | Envelope de resposta e código de erro        |
| [0005](./0005-factory-para-recursos-crud-do-admin.md)        | Factory para os recursos CRUD do admin       |
| [0006](./0006-cors-so-quando-cross-origin.md)                | CORS só quando o endpoint é cross-origin     |
| [0007](./0007-um-mecanismo-de-rate-limit.md)                 | Um mecanismo de rate limit, não dois         |
