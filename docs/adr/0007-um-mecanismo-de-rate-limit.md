# 0007 — Um mecanismo de rate limit, não dois

**Status:** aceito · **Data:** 2026-08-18

## Contexto

O projeto tinha **dois** mecanismos de rate limit vivos ao mesmo tempo, medidos em 18/08/2026
(item `P2.3`):

| Mecanismo                                | Onde                  | Vale em        |
| ---------------------------------------- | --------------------- | -------------- |
| `enforceRateLimit` (`lib/rate-limit.js`) | 18 handlers de `api/` | dev **e** prod |
| `express-rate-limit`                     | 11 rotas de `routes/` | **só dev**     |

Em produção a Vercel não executa `server.js` nem os routers de `routes/` — cada handler de `api/`
é uma função isolada ([ADR 0002](./0002-handler-unico-para-vercel-e-express.md)). Então os 11
limitadores do Express **não existiam** onde as clientes estão.

O efeito prático era pior do que "proteção ausente", porque a proteção ausente ao menos é
visível: o desenvolvedor testava contra um comportamento que a cliente nunca encontra. Nos
endpoints de **login** isso é especialmente ruim, porque ali limite é controle de segurança, não
de custo — e os dois limitadores tinham formas completamente diferentes:

- Express (dev): 5 tentativas / 10 min por **IP puro**.
- `RATE_LIMITS.customerLogin` (prod): 5 por **(IP + e-mail)** mais um balde de varredura que conta
  **contas distintas** por IP. O comentário daquele perfil explica em detalhe por que o teto por
  IP puro erra nos dois sentidos: pune quatro professoras atrás do mesmo CGNAT e não vê credential
  stuffing, que varre muitas contas com uma senha cada.

Ou seja: quem "testasse o rate limit" em desenvolvimento estava exercitando um desenho que foi
deliberadamente **rejeitado** para produção.

O projeto já pagou por essa classe de divergência antes. O comentário em `handlers/validate-coupon.js`
registra que o limitador de cupom _"só existia no Express de desenvolvimento"_ e que a divergência
dev/prod **era a causa raiz do achado**.

## Decisão

**`enforceRateLimit` é o mecanismo de rate limit do produto.** Ele roda dentro do handler, com
contador atômico no Postgres, e vale nos dois ambientes.

Os **11 limitadores por rota saíram**: nove de `routes/api-compat.routes.js`, um de
`routes/auth.routes.js` e o `authLimiter` de `/api/auth` em `server.js`. Todas as rotas que eles
cobriam já tinham perfil em `RATE_LIMITS` — nenhuma proteção real foi removida, porque nenhuma
delas rodava em produção.

**Sobra um limitador de borda genérico** em `server.js` (`/api`, 250 req/15 min,
`RATE_LIMIT_MAX`). Ele fica declarado no código como o que é: rede contra loop acidental de script
local, **não** a política. Um limitador de borda que não tem opinião sobre endpoint nenhum não
pode ser confundido com a política; um limitador de `/api/auth` mais apertado, sim — e por isso
`AUTH_RATE_LIMIT_MAX` saiu junto.

Esse limitador de borda passou a responder no **envelope da regra A1**, com
`code: RATE_LIMITED` (regra A2). Sem isso ele devolvia texto puro (`"Too many requests…"`), um
formato que não existe em nenhum outro lugar da API — que era o item `P1.4`.

## Consequências

**Boas.**

- O que se testa em desenvolvimento é o que roda em produção, que é o corolário nº 1 do ADR 0002.
- `RATE_LIMITED` deixou de ser um código morto no espelho do front: o cliente já tinha um `if`
  para ele e o backend nunca o emitia.
- `routes/api-compat.routes.js` voltou a ser só montagem de rota, sem comportamento — que é o que
  o ADR 0002 diz que ele deve ser. Foram 93 linhas a menos nos dois routers.

**Ruins.**

- Em desenvolvimento **sem Supabase configurado**, `enforceRateLimit` é fail-open (ele desiste da
  contagem em 2,5s e deixa passar, por decisão registrada no próprio módulo). Então o
  desenvolvedor local sem `.env` completo não vê limite nenhum além dos 250/15 min de borda. É o
  preço de ter uma política só: a alternativa era manter uma segunda política que mente.
- O contador de dev grava no mesmo Postgres do projeto Supabase apontado pelo `.env`. Quem
  desenvolve contra o banco de produção compartilha baldes com as clientes — o que já era verdade
  para os 18 handlers que usavam `enforceRateLimit` antes desta decisão, mas agora vale para
  todos.

## Alternativas descartadas

**Manter os 11 como defesa em profundidade** — o argumento seria "duas camadas são melhores que
uma".

Descartada porque as duas camadas não são independentes: a de baixo não existe onde importa. Uma
camada que só roda na máquina do desenvolvedor não é defesa em profundidade, é **falso conforto**
— e pior, ela é a que o desenvolvedor observa, então é a que ele acredita ser o comportamento do
sistema. As formas divergentes do login são a prova: manter as duas significa manter duas
respostas diferentes para "quantas tentativas você pode fazer", e só uma delas é a verdadeira.

**Remover todos, inclusive o de borda** — mais puro, e foi considerado.

Descartada porque um `for` de teste com erro, rodando contra `localhost:3000`, chega a milhares de
requisições em segundos e — com o contador no Postgres — cada uma delas é uma escrita no banco. O
limitador de borda custa uma linha e evita isso, desde que fique escrito que ele não é a política.
É essa a diferença entre borda genérica e política falsa.

## Adendo — 01/09/2026: política de indisponibilidade por balde

`enforceRateLimit` sempre foi **fail-open**: contador inacessível, requisição passa. A decisão
está documentada no próprio módulo e se apoiava em dois argumentos.

1. A mesma indisponibilidade de Postgres que derruba a contagem já derrubaria o endpoint logo
   adiante — negar não protege nada, só troca um 500 por um 429 enganoso.
2. Fail-closed no `/api/admin-login` trancaria a dona para fora justamente durante um incidente,
   que é quando ela mais precisa entrar.

**O argumento (1) não vale para verificação de credencial.** `customerLogin` e `customerRegister`
autenticam contra o **GoTrue** (`lib/customer-auth-handlers.js`), que é um serviço distinto do
PostgREST que serve a RPC do contador; e o anti-replay do TOTP em `handlers/admin/login.js` é ele
próprio uma chamada de `rate_limit_hit`. Nos três casos o alvo pode estar de pé com o contador
fora do ar — e aí "passar" significa brute force sem teto contra um serviço funcionando, além de
um código TOTP interceptado voltar a ser reutilizável.

Ficou, então, `failMode` **por balde**, default `'open'`:

| Balde                               | Política           | Por quê                                                  |
| ----------------------------------- | ------------------ | -------------------------------------------------------- |
| `customerLogin`, `customerRegister` | `closed` → **503** | GoTrue continua de pé sem o contador                     |
| `adminLoginSecondFactor`            | `closed` → **503** | o anti-replay do TOTP mora no mesmo contador             |
| `adminLogin`                        | `open`             | o argumento (2) continua de pé, e o 2º fator segue atrás |
| todos os demais                     | `open`             | comportamento inalterado                                 |

**503 e não 429**: 429 afirmaria "você excedeu o limite", que é falso, e mandaria o cliente esperar
a janela inteira. 503 com `Retry-After: 30` diz o que houve — a verificação não pôde ser feita — e
convida a tentar de novo quando o contador voltar.

Isto **não** reintroduz um segundo mecanismo, que é o que este ADR proíbe: continua havendo um só
contador, um só ponto de decisão e um só lugar onde a política é lida. O que muda é que a resposta
à indisponibilidade passou a ser uma escolha explícita por endpoint, em vez de uma regra implícita
uniforme que estava certa para a maioria dos baldes e errada exatamente para os de credencial.

Nos dois modos o evento `rate_limit_unavailable` continua sendo emitido: recusar não pode ser mais
silencioso do que passar.
