# 0006 — CORS só quando o endpoint é cross-origin

**Status:** aceito · **Data:** 2026-08-18

## Contexto

A regra A3 do [CONTRIBUTING.md](../../CONTRIBUTING.md) fixava a ordem do topo de todo handler
começando por **CORS**. A remedição de 18/08/2026 (item `P3.2`) mediu o que o código faz:

| Medida                                    |  Valor |
| ----------------------------------------- | -----: |
| Handlers em `api/`                        |     44 |
| Handlers que chamam `setAdminCorsHeaders` |     18 |
| Handlers que **não tocam em CORS**        | **26** |

Os 18 são exatamente os administrativos. Os 26 restantes são o catálogo público, o checkout, o
download, os webhooks e a auth de cliente.

E isso **não é um bug**:

- Em **produção**, o front e a API são servidos pela mesma origem na Vercel (`/api/*` e o SPA
  saem do mesmo domínio). Requisição same-origin não dispara CORS: o navegador não pede
  preflight nem exige `Access-Control-Allow-Origin`.
- Em **desenvolvimento**, o front roda em `localhost:5173` e a API em `localhost:3000` — aí É
  cross-origin, e quem resolve é o middleware `cors` do Express em `server.js`, que não existe
  em produção justamente porque lá não é preciso.
- Os administrativos são a exceção real: o painel chama a API com `credentials: 'include'`, e
  nesse modo o navegador exige origem **explícita** (`*` é recusado) e
  `Access-Control-Allow-Credentials: true`. Por isso eles emitem CORS mesmo hoje.

Ou seja: a regra descrevia algo que o código não fazia, e **nada quebrava por isso**. Esse é o
pior tipo de regra que um repositório pode ter — ela ensina que as outras 24 também são
opcionais.

## Decisão

**Reescrever a regra A3** para "CORS **quando cross-origin**", registrando na própria regra que
em produção é same-origin e que o caso credenciado do painel é a exceção que exige o cabeçalho.

**Mover `setAdminCorsHeaders` e `getAllowedOrigins`** de `lib/admin-session.js` para
`lib/http.js`. CORS não é sessão: é cabeçalho de resposta, e o lugar dos helpers de resposta é
`lib/http.js`, junto de `ok()`, `fail()`, `preflight()` e `setCachePolicy()`.

`getAllowedOrigins` vai junto e continua sendo **uma allowlist só**: ela também é a base da
defesa anti-CSRF de `isSameOriginRequest`, que ficou em `lib/admin-session.js` e passou a
importá-la de `lib/http.js`. Duas allowlists divergentes seriam a forma mais silenciosa de abrir
exatamente o CSRF que aquela função existe para fechar.

## Consequências

**Boas.**

- A regra A3 volta a descrever o repositório que existe, e um handler novo não precisa mais
  decidir se copia um bloco de CORS que não faz nada.
- `lib/http.js` passa a ser a casa única dos cabeçalhos de resposta; `lib/admin-session.js` volta
  a ser só sessão.
- 26 arquivos **não** foram tocados — o diff da decisão é uma função movida e 13 imports
  reapontados, em vez de 26 handlers reescritos para emitir cabeçalho inerte.

**Ruins.**

- Se um dia a API for servida de um domínio próprio (`api.exemplo.com` contra `exemplo.com`), os
  26 handlers públicos passam a precisar de CORS **de uma vez**, e a decisão terá de ser
  revisitada. É o custo aceito: pagar hoje por um cenário que não existe é o oposto do que a
  medição recomenda. O gatilho está escrito aqui para não ser descoberto em produção.
- `lib/http.js` deixa de ter zero dependências: passa a exigir `./env-secret` por causa de
  `isLocalDevOrTest()`. Não há ciclo (`env-secret` não conhece `http`), mas é uma aresta nova no
  grafo do módulo mais importado do backend.

## Alternativas descartadas

**Criar `setPublicCorsHeaders` e aplicar nos 26** — faria a regra A3 valer literalmente e deixaria
o caminho pronto para um domínio de API separado.

Descartada porque acrescentaria cabeçalho que **nenhum navegador consome hoje** em 26 arquivos, e
porque um `Access-Control-Allow-Origin` genérico em endpoint público é a superfície que alguém
depois afrouxa para `*` "porque já estava lá". Além disso, mais código no topo de cada handler é
exatamente o contrário do objetivo declarado da A3, que é fazer uma guarda **ausente** saltar aos
olhos: um bloco de CORS inerte em 26 arquivos é ruído que treina o olho a pular o topo.

**Deixar a regra como estava e aceitar a divergência** — descartada pelo motivo que abre este ADR:
uma regra que ninguém segue e cuja violação não quebra nada é a que desmoraliza as outras. O
`CONTRIBUTING.md` já traz duas correções do mesmo tipo (A1 e C3, ambas de 13/08/2026), e o
mecanismo é o mesmo: quando a medição mostra que a regra está errada, **a regra muda**.
