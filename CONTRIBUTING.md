# Padrões de código — Ateliê da Escola

Convenções de engenharia deste repositório. **25 regras**, agrupadas em 6 áreas.

Cada regra existe porque uma divergência foi **medida no código**, não por preferência estética.
Toda regra traz a evidência que a motivou, para que dê para discordar com dados na mão.

> **Como usar em review**: cite o identificador da regra (`A1`, `E3`…) no comentário do PR.
> Se a regra estiver errada, o caminho é editar este arquivo — não abrir exceção no código.

---

## Estado da padronização

Levantamento em 13/08/2026 sobre o commit `97be97f`; aplicação na mesma data.

| Medida                                             |      Antes |                                 Agora |
| -------------------------------------------------- | ---------: | ------------------------------------: |
| Arquivos que reprovam `prettier --check`           |        189 |                                 **0** |
| Formatos concorrentes de resposta de erro na API   |          3 |                                 **1** |
| Endpoints públicos sem rate limit                  |          5 |                                 **0** |
| Handlers com cache em memória em função serverless |          6 |                                 **0** |
| Chamadas de `console.*` no backend                 |         79 |                                 **0** |
| Caminhos de rota literais no JSX                   |         50 |                                 **0** |
| Convenções de URL no mesmo produto                 |          2 |                                 **1** |
| Usos do `zod`, que é dependência declarada         |          0 |           **3 endpoints de dinheiro** |
| Erros de lint                                      |          0 |                                 **0** |
| Avisos de lint                                     |         30 |                **19** (catraca no CI) |
| Testes                                             |        274 |                               **387** |
| Cobertura medida                                   | não rodava |     **27,3% statements** (piso no CI) |
| Pares de documento duplicados                      |          4 | **0 ativos** (4 marcados em retirada) |

### As 25 regras estão aplicadas

`A1`–`A6` · `B1`¹ `B2`¹ `B3` · `C1`–`C6` · `D1`–`D7`² · `E1`–`E4` · `F1`–`F3`

> **Remedição em 18/08/2026 (commit `4b42fe8`): dez regras têm dívida aberta.**
> `A1` `A2` `A3` `C2` `C3` `C4` `C6` `D2` `D3` `E1`. Entre os achados: 58 sites ainda devolvem
> `error` como string, `guardMethod` tem zero adoções em 44 handlers, o gate de cobertura nunca
> executou no CI, e o re-login do admin está quebrado justamente pela falha que a regra `A2`
> descreve. As regras continuam certas; o que falta é aplicação.
>
> A lista completa — com arquivo, linha, prioridade e a prova executável que fecha cada item —
> está em [docs/PADRONIZACAO-CORRECOES.md](./docs/PADRONIZACAO-CORRECOES.md). A tabela de
> medidas acima é o retrato de 13/08 e só volta a valer quando aquele documento zerar
> (item `P6.3`).

¹ O schema declarativo cobre o caminho do dinheiro (`create-payment`,
`validate-coupon`, `verify-payment`). Os demais endpoints seguem validando à mão — o
contrato B1 vale dali para frente, endpoint novo entra com schema.

² `D5` está com **catraca**, não com zero: os 19 avisos restantes são diagnósticos do React
Compiler (`setState` dentro de efeito) em 13 componentes. Corrigi-los é refatorar renderização,
com só 3 testes de componente no repositório para segurar — decisão que precisa de quem
conhece as telas. `npm run lint` roda com `--max-warnings=19`, então o número não pode
crescer; ao corrigir um, **baixe o teto no `package.json` no mesmo commit**.

### Três regras foram corrigidas ao serem aplicadas

Estão anotadas em bloco de citação na própria regra. O resumo:

| Regra | O que a medição errou                                                  |
| ----- | ---------------------------------------------------------------------- |
| `A1`  | O sucesso aninhado sob `data` custava mais que valia; ficou plano      |
| `C3`  | Os 7 sites "de dinheiro mal formatado" eram CSV e JSON-LD, não tela    |
| `E3`  | Não havia migration a fazer — as colunas já são `numeric(12,2)`, exato |

### Achado encontrado pelos testes, e corrigido

A suíte da regra D3 revelou que `lib/abc-classification.js` classificava um catálogo de **um
item só** como classe C: o acumulado é 100%, a faixa `> 95` o jogava na cauda longa, e o
produto que gera toda a receita aparecia no painel como o menos relevante. Não é hipotético
para esta loja — catálogo pequeno, e qualquer recorte por categoria ou período curto pode
devolver um item só.

Corrigido em 13/08/2026 com `rank === 1` sempre `A`. O tratamento é **mínimo de propósito**:
mexer nas faixas reclassificaria distribuições de 3+ itens que já estavam certas.

O mesmo cálculo existia duplicado em `src/components/admin/utils/derive.js`, com as duas
versões alimentando a MESMA tela (widget do DashboardTab × abas de Curva ABC). O comentário no
topo do módulo já pedia que ficassem consistentes — pedir por comentário não impede divergir.
Agora a versão do browser mora em `src/utils/abc.js` e
`src/utils/__tests__/abc-parity.test.js` compara as duas sobre 13 distribuições e sobre toda a
faixa de 0 a 100%.

**O diagnóstico original era: "o problema não é falta de padrão — é padrão não executado".** As
configurações deste repositório (`eslint.config.js`, `vite.config.js`, `.prettierrc.json`) já eram
de qualidade acima da média e explicavam o porquê de cada decisão; o que faltava era o CI
**exigir** o que elas descreviam.

É isso que `npm run check` faz agora — env, formatação, lint, testes e build, na mesma ordem do
workflow do GitHub.

---

## Índice

| Área                           | Assunto               | Regras |
| ------------------------------ | --------------------- | ------ |
| [A](#a--contrato-http)         | Contrato HTTP         | A1–A6  |
| [B](#b--validação-e-erros)     | Validação e erros     | B1–B3  |
| [C](#c--frontend)              | Frontend              | C1–C6  |
| [D](#d--qualidade-e-automação) | Qualidade e automação | D1–D7  |
| [E](#e--dinheiro-e-runtime)    | Dinheiro e runtime    | E1–E4  |
| [F](#f--log-e-documentação)    | Log e documentação    | F1–F3  |

Prioridades: **P0** risco aberto agora · **P1** dívida que cresce · **P2** consistência.

---

## A · Contrato HTTP

Os 44 handlers de `api/` foram escritos em momentos diferentes e cada um inventou seu próprio
contrato. Quem paga a conta é o frontend, que hoje carrega código só para reconciliar as diferenças.

### A1 · Um envelope de resposta só, para toda a API — `P0`

**Regra.** Toda resposta JSON carrega `success`. O erro é **sempre** um objeto:

```js
// sucesso — payload plano ao lado do flag
{ success: true, products: [...], total: 12 }

// erro — objeto, sempre com code
{ success: false, error: { code: 'COUPON_NOT_FOUND', message: 'Cupom inválido.' } }
```

Sem exceção, sem variante "só neste endpoint". Vale para respostas JSON; `sitemap.xml` (XML),
`download` (redirect 302) e `track-event` (204 sem corpo) não têm corpo JSON e ficam de fora.

> **Nota de decisão (13/08/2026).** A primeira redação desta regra aninhava o sucesso sob
> `data`. Foi trocada por payload plano: o ganho de `{ success, data }` sobre `{ success, ...payload }`
> é pequeno, e o custo era reescrever todo consumidor do frontend e ~100 asserções de teste no
> caminho do checkout. A dor real medida estava no **erro** — o shim de `parseJson` e o
> `includes('sessao admin')` —, e é lá que a padronização foi aplicada por inteiro.

**O que motivou.** Três formatos convivem:

| Formato                                        | Ocorrências                      |
| ---------------------------------------------- | -------------------------------- |
| `{ success: false, error: 'texto' }`           | 32 handlers                      |
| `{ error: 'texto' }`                           | 9 handlers                       |
| `{ success: false, error: { message, code } }` | `middleware/error.middleware.js` |

O custo já está visível: `src/utils/api.js` tem um _shim_ em `parseJson` que detecta `error` como
objeto e achata para string, existindo **apenas** para o cliente sobreviver aos dois formatos.
Quando A1 estiver aplicada, esse shim sai — é a prova de que a migração terminou.

### A2 · Todo erro carrega um `code` estável em SCREAMING_SNAKE — `P1`

**Regra.** A mensagem é para humano e pode mudar de redação a qualquer momento. O `code` é o
contrato de máquina: é nele que o frontend ramifica.

**O que motivou.** Só `api/validate-coupon.js` devolve `code`, e em minúsculo (`not_found`,
`not_eligible`). Nos outros o frontend é forçado a comparar texto em português —
`src/components/admin/utils/format.js` decide se a sessão expirou com:

```js
String(error?.message || '')
  .toLowerCase()
  .includes('sessao admin');
```

Trocar uma palavra da mensagem quebra o fluxo de re-login em silêncio, sem teste que pegue.

### A3 · Ordem fixa no topo de todo handler — `P1`

**Regra.** CORS **quando cross-origin** → `OPTIONS` → método → rate limit → autenticação →
validação de schema → `try`.

Ordem fixa transforma "esqueceram o rate limit" num bloco visivelmente ausente, em vez de um
detalhe enterrado no meio do arquivo.

**O que motivou.** `api/admin-kpis.js` segue exatamente essa ordem em cinco linhas — é o modelo
a copiar. `api/products.js` não tem nem CORS nem rate limit. A cobertura de CORS administrativo é
boa (19 arquivos chamam `setAdminCorsHeaders` para 18 handlers `admin-*`); a de rate limit não (ver E1).

> **Correção da regra (18/08/2026).** A primeira redação abria a ordem com "CORS", sem
> qualificação, e a remedição mediu **26 de 44 handlers sem tocar em CORS**. A regra estava
> errada, não o código: em produção o front e a API são **same-origin** na Vercel, e em
> desenvolvimento o `cors` do Express resolve. Os únicos que precisam emitir CORS são os
> **administrativos**, por causa do `credentials: 'include'` do painel — e esses 18 já emitiam.
>
> Aplicar `setPublicCorsHeaders` nos 26 restantes teria acrescentado cabeçalho que nenhum
> navegador consome, em 26 arquivos, para fazer a regra valer literalmente. Regra que ninguém
> segue e nada quebra é a que ensina que as outras 24 também são opcionais — mas o conserto é
> **corrigir a regra**, não fingir que o código a obedece.
>
> Junto, `setAdminCorsHeaders` saiu de `lib/admin-session.js` — um módulo de **sessão** — para
> `lib/http.js`, onde vivem os outros helpers de resposta. Ver
> [ADR 0006](./docs/adr/0006-cors-so-quando-cross-origin.md).

### A4 · Preflight `OPTIONS` sempre responde 204 — `P2`

**Regra.** 204 é a resposta correta para um preflight: não há corpo a devolver.

**O que motivou.** 23 handlers respondem `204` e 17 respondem `200`.

### A5 · Nome do handler = nome do arquivo em camelCase + `Handler` — `P2`

**Regra.** `api/admin-kpis.js` exporta `adminKpisHandler`.

O nome da função é o que aparece no stack trace da Vercel. `handler` genérico transforma oito
arquivos em oito frames indistinguíveis.

**O que motivou.** 36 arquivos seguem a convenção. 8 exportam `handler` puro:
`api/admin-upload-url.js`, `api/notfound.js` e os seis de `api/auth/customer/`.

### A6 · Uma convenção de URL, não duas — `P2`

**Regra.** Escolher entre recurso aninhado (`/api/admin/orders`) e plano em kebab-case
(`/api/admin-orders`) e aplicar a escolha ao produto inteiro.

Mudança de URL é _breaking_: fazer via rota de compatibilidade, sem pressa.

**O que motivou.** 18 endpoints administrativos são planos (`api/admin-orders.js`) enquanto os 6 de
autenticação de cliente são aninhados (`api/auth/customer/login.js`). O mesmo produto expõe dois
estilos de API.

---

## B · Validação e erros

O projeto tem duas abstrações de validação e tratamento de erro instaladas e **nenhuma das duas
está em uso**. Enquanto isso, cada handler improvisa com coerção manual.

### B1 · Toda entrada passa por um schema declarativo na borda — `P0`

**Regra.** `body`, `query` e `params` são validados por um schema antes da primeira linha de lógica.
O `zod` já está no `package.json`; falta usá-lo.

**O que motivou.** `zod@^4.3.6` é dependência de produção com **zero** imports em todo o repositório.
A pasta `validation/` que hospedava os schemas não existe mais, mas ainda é referenciada em **três**
configurações:

| Arquivo            | Referência                                                |
| ------------------ | --------------------------------------------------------- |
| `package.json`     | script `format` / `format:check`                          |
| `eslint.config.js` | `NODE_FILES`                                              |
| `vite.config.js`   | `coverage.include` — mede cobertura de um diretório vazio |

`api/create-payment.js` documenta o buraco na própria linha 15: _"os `max()` do zod em
`validation/payment.schemas.js` NUNCA valeram neste caminho"_.

Ordem sugerida ao recriar `validation/`: os endpoints de dinheiro primeiro — `create-payment`,
`validate-coupon`, `webhook`.

### B2 · Coerção defensiva não é validação — `P1`

**Regra.** Depois do schema (B1), o handler confia no tipo. `Number(x || 0)` no meio da lógica
transforma entrada inválida em zero silencioso.

**O que motivou.** O padrão `Number(row.total_amount || 0)` aparece em 17 pontos de `api/` e `lib/`.
O comentário de `lib/payment-integrity.js` já registra a consequência exata:

> `Number('')` e `Number(null)` são 0, não NaN, e foi exatamente esse coerce que transformava
> total ausente em "pedido de R$ 0,00, qualquer coisa paga".

### B3 · Ou o `AppError` vira o mecanismo real, ou sai do repositório — `P1`

**Regra.** Abstração instalada e não usada é pior que ausente: quem lê o código acredita que existe
uma política central de erro que não existe.

**O que motivou.** `utils/app-error.js` e `middleware/error.middleware.js` estão montados no
`server.js`, mas **nenhum** handler de `api/` lança `AppError` — a busca fora desses dois arquivos
não retorna nada.

E em produção o middleware nem roda: na Vercel cada função é isolada e o Express não está no
caminho. O tratamento de erro real hoje é o `try/catch` repetido em cada arquivo. Decidir:
padronizar o `AppError` dentro dos handlers (e não só no Express), ou remover os dois arquivos.

---

## C · Frontend

A camada React é a parte mais consistente do projeto — export nomeado, `propTypes` e hooks já são
regra de fato. O que falta é fechar as fugas: acesso à API, rotas e formatação.

### C1 · Um cliente HTTP: `apiRequest`. `fetch` cru não passa em review — `P1`

**Regra.** `apiRequest` (`src/utils/api.js`) aplica timeout de 15s via `AbortController` e normaliza
a resposta. Quem chama `fetch` direto está abrindo mão das duas coisas.

**O que motivou.** 7 arquivos usam `apiRequest`; 6 usam `fetch` cru:

- `src/services/products.js`
- `src/components/CouponField.jsx`
- `src/components/CrossSellSection.jsx`
- `src/components/NewsletterSignup.jsx`
- `src/pages/SubscriptionPages.jsx`
- `src/pages/DownloadsPage.jsx` — usa **os dois** no mesmo arquivo

Nenhuma chamada por `fetch` cru tem timeout: numa rede ruim, a tela fica carregando para sempre.

### C2 · Componente não fala com a API; `src/services/` fala — `P1`

**Regra.** O componente chama uma função de serviço nomeada pelo domínio.

É isso que torna a troca de contrato (A1) uma edição em um arquivo, e não uma caçada por JSX.

**O que motivou.** `CouponField`, `CrossSellSection` e `NewsletterSignup` montam URL e chamam a API
de dentro do componente, ignorando a camada `src/services/` que já existe com seis módulos.

### C3 · Todo valor formatado sai de uma função nomeada — `P1` · aplicada em 13/08/2026

**Regra.** Três destinos, três funções em `src/utils/currency.js`. Qual usar é decidido pelo
**destino**, não pelo gosto:

| Destino                         | Função               | Saída         |
| ------------------------------- | -------------------- | ------------- |
| Tela (pessoa lê)                | `formatPrice`        | `R$ 1.234,56` |
| CSV para Excel pt-BR            | `formatCsvNumber`    | `1234,56`     |
| Dado estruturado (JSON-LD, API) | `formatMachinePrice` | `1234.56`     |

> **Correção da regra (13/08/2026).** A primeira redação dizia "dinheiro na tela só através de
> `formatPrice`" e apontava 7 sites como violação. **A varredura estava errada: nenhum dos 7 era
> tela.** Seis eram colunas de CSV — e `R$ 1.234,56` num CSV quebra a leitura numérica do Excel
> pt-BR — e um era o `price` do JSON-LD de produto, que o `schema.org/Offer` exige com ponto
> decimal. Unificar os três teria sido regressão em SEO e em exportação.
>
> O problema real era outro, e esse existia mesmo: só o formato de tela tinha nome. Os outros dois
> eram expressões inline repetidas, sem nada explicando por que divergem — que é exatamente o
> convite para alguém "consertar" a divergência. Agora os três têm nome e a diferença está escrita.

### C4 · Uma casa por tipo de utilitário — `P2`

**Regra.** `src/utils/` para o browser, `lib/` para o servidor. Utilitário de um componente
específico mora junto do componente; utilitário genérico não.

**O que motivou.** Existem três casas:

| Pasta                         | Escopo   | Arquivos |
| ----------------------------- | -------- | -------- |
| `utils/` (raiz)               | backend  | 1        |
| `src/utils/`                  | frontend | 8        |
| `src/components/admin/utils/` | admin    | 3        |

`src/components/admin/utils/format.js` tem `formatDateTime`, que não é específico do admin.

### C5 · Rota vem de `src/constants/routes.js` — `P2`

**Regra.** Caminho literal em JSX é uma rota que ninguém consegue renomear com segurança.

**O que motivou.** O arquivo define 2 constantes e é importado por 5 arquivos, contra **50** rotas
literais em `to="/…"` e `navigate('/…')`. O caso que dói: o caminho obscurecido do painel
(`ADMIN_LOGIN_PATH`) só é seguro enquanto for único e centralizado.

### C6 · Import nomeado do React, export nomeado do componente, `propTypes` sempre — `P2`

**Regra.** Já é a prática do repositório; falta escrever e travar no lint.

**O que motivou.** Praticamente aplicada:

- 34 arquivos com `import { useState }` contra 3 com `import React` — destes, dois são legítimos
  (`ErrorBoundary` é classe, `main.jsx` é a raiz). Sobra só `src/providers/CartProvider.jsx`.
- 59 exports nomeados contra 1 default.
- `propTypes` falta em três componentes: `ConsentBanner.jsx`, `admin/tabs/CouponsTab.jsx`,
  `admin/tabs/SegmentsTab.jsx`.

---

## D · Qualidade e automação

Toda a ferramenta certa está instalada e configurada com cuidado. O que falta é o CI **exigir** o
que a configuração descreve — padrão que ninguém executa é sugestão.

### D1 · Formatação é automática e bloqueante — `P0`

**Regra.** O Prettier decide o estilo; ninguém discute formatação em review.

Aplicar em três passos:

```bash
npm run format                                    # 1. um commit único, só formatação
git rev-parse HEAD >> .git-blame-ignore-revs      # 2. preserva o git blame
# 3. adicionar `npm run format:check` ao npm run check e ao .github/workflows/test.yml
```

**O que motivou.** **189 arquivos** reprovam `prettier --check` — na prática, o repositório inteiro.
O `.prettierrc.json` pede `printWidth: 100` e existem 545 linhas acima de 120 colunas
(387 em `src/`, 93 em `api/`, 65 em `lib/`).

Os scripts `format` e `format:check` existem no `package.json` e **nada** os executa: o
`npm run check` roda env, teste, build e lint, mas não formatação, e o workflow do GitHub espelha
essa mesma lista.

### D2 · Cobertura precisa rodar antes de virar meta — `P1`

**Regra.** Instalar `@vitest/coverage-v8`, medir, e ligar os thresholds no valor medido menos uma
folga (~2pp). O piso trava regressão; não é meta de salto.

**O que motivou.** `npm run test:coverage` **quebra**: o pacote `@vitest/coverage-v8` não está em
`node_modules/@vitest/`. O bloco `thresholds` em `vite.config.js` está comentado com um roteiro de
três passos esperando exatamente essa instalação.

### D3 · Todo módulo de `lib/` tem suíte — `P1`

**Regra.** `lib/` é onde mora a regra de negócio compartilhada entre handlers — é o lugar de melhor
retorno por teste escrito, porque um bug ali se manifesta em vários endpoints.

**O que motivou.** 8 de 21 módulos têm suíte. Sem teste direto, entre outros: `coupons.js` (desconto),
`sales-counts.js`, `mercadopago-config.js`, `supabase.js`, `email-sender.js`, `abc-classification.js`.

Onde já é forte: as 9 suítes de `api/__tests__/` cobrem o caminho do dinheiro — integridade de
pagamento, idempotência de webhook, assinatura, download de uso único. Essa priorização é a certa;
falta estendê-la a `lib/`.

### D4 · Config não referencia caminho que não existe — `P2`

**Regra.** Referência morta em configuração é armadilha: sugere cobertura que não acontece e esconde
a real.

**O que motivou.** `validation/**` aparece em três configurações apontando para uma pasta apagada
(ver tabela em B1). O `coverage.include` em especial mede cobertura de um diretório vazio.

### D5 · Zerar os avisos de lint e proibir novos — `P2`

**Regra.** Zerar primeiro, depois rodar `eslint . --max-warnings=0` no CI.

Aviso que sobrevive a um deploy ensina o time a ignorar a saída inteira do lint.

**O que motivou.** 0 erros e 30 avisos. Nove são `eslint-disable` inúteis — o próprio
`eslint.config.js` documenta que os registrou como _no-op_ justamente para que apareçam e sejam
apagados. Outros apontam `setState` dentro de `useEffect`, que é backlog real de performance.

### D6 · Arquivo é UTF-8 sem BOM, sempre — `P2`

**Regra.** Um `.gitattributes` e uma checagem no CI.

O projeto já tem histórico de corrupção de acento a ponto de existirem `scripts/check-utf8.js` e
`scripts/fix-utf8.js`. `docs/RELEASE-CHECKLIST.md` está inteiro sem acentuação pela mesma razão.

**O que motivou.** `src/services/products.js` começa com BOM (`EF BB BF`) — é o único arquivo do
repositório nessa condição.

### D7 · Hook de pré-commit roda lint e format no que mudou — `P2`

**Regra.** Com `lint-staged`, o custo é de milissegundos e o erro nunca chega ao CI. Depois de D1,
é o que impede a formatação de divergir de novo.

**O que motivou.** Não há `.husky/`, `lint-staged` nem `simple-git-hooks`.

---

## E · Dinheiro e runtime

Aqui as regras não são cosméticas. As três primeiras têm consequência direta em receita, entrega de
produto pago ou conta de infraestrutura.

### E1 · Rate limit em todo endpoint público, sem exceção — `P0`

**Regra.** `enforceRateLimit` **no handler** — nunca só no Express.

O limiter global do `server.js` não existe em produção, então proteção que mora lá é proteção que só
funciona na máquina do desenvolvedor.

**O que motivou.** 11 handlers chamam `enforceRateLimit`. Ficam descobertos em produção:

| Endpoint                 | Observação                 |
| ------------------------ | -------------------------- |
| `api/download.js`        | **entrega o arquivo pago** |
| `api/products.js`        |                            |
| `api/product-details.js` |                            |
| `api/cross-sell.js`      |                            |
| `api/home-sections.js`   |                            |

O projeto já pagou por essa divergência antes. O comentário em `api/validate-coupon.js` registra
que o limiter de cupom _"só existia no Express de desenvolvimento"_ e que **a divergência dev/prod
era a causa raiz do achado**. Os cinco acima são a mesma causa raiz, ainda aberta.

### E2 · Nada de estado em memória dentro de função serverless — `P1`

**Regra.** Cache de leitura vai para `Cache-Control` com CDN, ou para tabela. O que a instância
guarda na RAM morre com ela.

**O que motivou.** `api/admin-kpis.js`, `api/admin-abc-customers.js` e `api/admin-abc-products.js`
mantêm `const cache = new Map()` com TTL de 1 hora. Na Vercel cada invocação pode cair numa
instância nova: o acerto é acidental e por instância.

Pior, os três respondem `X-Cache: HIT` — um header que afirma algo que o runtime não garante.

### E3 · Aritmética de dinheiro em centavos inteiros — `P1` · aplicada em 13/08/2026

**Regra.** Toda soma, rateio e comparação de valor passa por `lib/money.js`, em centavos
inteiros. Float só na fronteira: banco, Mercado Pago e tela.

E o corolário que é o real ganho: **o total do pedido é derivado da soma efetivamente
cobrada**, nunca calculado em paralelo.

> **Correção da regra (13/08/2026).** A redação original mandava migrar também _"a coluna do
> banco, quando der para migrar"_. A premissa estava errada: as colunas já são
> `numeric(12,2)`, que no Postgres é decimal **exato**. Não havia nada a migrar — e migrar
> para `integer` seria piora: perderia legibilidade em SQL e quebraria toda consulta e
> relatório existente, para consertar um problema que não está no banco.
>
> O drift é 100% do lado JavaScript: `numeric` chega ao Node como IEEE 754, e a partir daí
> `0.1 + 0.2 !== 0.3`. Nenhuma migration foi escrita.

**O que mudou.** `api/create-payment.js` calculava `total_amount = subtotal - desconto` de um
lado e, do outro, rateava o desconto escalando preços por um fator fracionário, absorvendo a
sobra no último item elegível. Os dois números batiam por aproximação — e a diferença entre
eles é exatamente a tolerância de 1 centavo que `lib/payment-integrity.js` precisou aceitar na
porta que entrega o produto pago.

Agora o rateio é por **unidade**, em centavos, pelo método de maior resto
(`allocateDiscountCents`), e o total do pedido sai da soma real dos itens cobrados. Os testes
em `api/__tests__/checkout-money.test.js` travam o invariante sem folga:

```
subtotal − desconto === total === soma(unit_price × quantity) da preference
```

A tolerância de 1 centavo **continua** em `lib/payment-integrity.js`, e o comentário lá agora
explica por quê: a causa interna sumiu, mas zerar a folga trocaria um risco irrelevante
(entregar por 1 centavo a menos) por um caro (recusar quem pagou certo — e pedido recusado no
webhook não é reprocessado). Zerar depois de observar volume real.

### E4 · Política de cache declarada por classe de endpoint — `P2`

**Regra.** Endpoint novo escolhe uma das três:

| Classe                   | `Cache-Control`                                                  |
| ------------------------ | ---------------------------------------------------------------- |
| Catálogo público         | `public, max-age=300, s-maxage=300, stale-while-revalidate=3600` |
| Relatório administrativo | `private, max-age=3600`                                          |
| Entrega de arquivo       | `no-store, max-age=0`                                            |

**O que motivou.** As três políticas já existem e são coerentes onde aplicadas — falta estarem
escritas e cobrirem os endpoints que hoje não mandam `Cache-Control` nenhum. Resolver E2 depende
disto: é o cache de CDN que substitui o `Map` em memória.

---

## F · Log e documentação

A documentação do projeto é volumosa e de qualidade alta. O problema não é falta — é duplicação, que
faz duas versões da mesma verdade divergirem sem ninguém notar.

### F1 · Um formato de log: JSON estruturado com nível e contexto — `P1`

**Regra.** Um `logger` em `lib/` emitindo `{ level, event, ...contexto }`, e nenhum `console` solto
fora dele. Log de servidor é dado consultável, não frase.

**O que motivou.** 79 chamadas de `console.*` no backend, das quais 22 sem nem o prefixo `[modulo]`
que as outras adotaram. Em paralelo, `lib/security-logger.js` emite JSON estruturado adequado —
dois formatos de log na mesma stack, e só um deles é filtrável nos logs da Vercel.

### F2 · Um documento por assunto — `P1`

**Regra.** Cada tema tem exatamente um arquivo canônico. O que sobrar vira link para ele, ou é apagado.

**O que motivou.** 11.756 linhas de markdown com quatro pares sobrepostos:

| Versão curta           | Linhas | Versão longa                         | Linhas |
| ---------------------- | -----: | ------------------------------------ | -----: |
| `docs/ARCHITECTURE.md` |     81 | `docs/ProjectDocs/02-ARQUITETURA.md` |    385 |
| `docs/SETUP.md`        |    390 | `docs/ProjectDocs/03-SETUP.md`       |    478 |
| `docs/FLOWS.md`        |    244 | `docs/ProjectDocs/05-FLUXOS.md`      |    354 |
| `docs/SECURITY.md`     |    352 | `docs/ProjectDocs/08-SEGURANCA.md`   |    424 |

São 1.067 linhas na versão curta de cada par que ninguém sabe se ainda valem. O `docs/README.md`
inclusive já anuncia que `ProjectDocs/` está _"substituindo os MDs avulsos abaixo"_ — falta concluir
a substituição. Documento de setup desatualizado custa uma tarde de quem chega.

### F3 · Decisão que atravessa arquivos vira ADR; o resto fica no código — `P2`

**Regra.** Este `CONTRIBUTING.md` para as regras, e `docs/adr/` com uma página por decisão
estrutural. Candidatas imediatas:

- Por que CommonJS no backend e ESM no frontend
- Por que os handlers da Vercel são os mesmos módulos servidos pelo Express
- Por que a reconciliação de pagamento é módulo único (`lib/payment-integrity.js`)

**O que motivou.** Não existe `docs/adr/`. As decisões estruturais estão em comentários longos e
genuinamente bons dentro de `eslint.config.js`, `lib/payment-integrity.js` e `server.js` — o
conteúdo é o certo, o lugar não é, porque quem chega não sabe abrir esses três arquivos primeiro.

---

## Ordem de execução

Sequência escolhida por dois critérios: risco aberto primeiro, e mudança grande depois da mudança
que a torna revisável.

| #   | Regras                                          | Por quê nesta posição                                                                                          |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | **E1** — rate limit nos cinco endpoints         | Única regra com risco em aberto agora, e `download` entrega produto pago. Meia hora de trabalho.               |
| 2   | **D1** — formatar tudo num commit               | Antes de qualquer refatoração, senão os diffs das etapas seguintes ficam ilegíveis.                            |
| 3   | **D4 + D6** — referências mortas e o BOM        | Minutos, e destrava a leitura correta de cobertura.                                                            |
| 4   | **A1 + A2** — envelope único com `code`         | Um helper `respond()`/`fail()` em `lib/`, migração handler a handler. O shim de `src/utils/api.js` sai no fim. |
| 5   | **B1** — schemas zod na borda                   | Recria `validation/`, começando pelos endpoints de dinheiro.                                                   |
| 6   | **C1 + C2 + C3** — fugas do frontend            | Depende de A1: com o contrato estável, vira mecânico.                                                          |
| 7   | **D2 + D3** — cobertura medida e `lib/` testada | Mede, usa o número como piso, sobe as suítes de `lib/`.                                                        |
| 8   | **E2 + E4**, depois **E3**                      | Cache de CDN substitui os `Map`. Centavos por último: mais invasivo, mais dependente dos testes.               |
| 9   | **F2 + F3** — consolidar docs e ADRs            | No fim, porque só aqui o documento descreve o que existe, não o que se pretende.                               |

> **A ordem foi seguida, e o documento a manteve.** Ela não descreve mais trabalho pendente —
> fica registrada porque explica **por que cada regra foi aplicada nesta sequência**, que é a
> informação útil se alguma precisar ser revertida. O único desvio: E3 não exigiu migration
> (ver a correção na própria regra).

---

## Metodologia

Levantamento por leitura estática do repositório em 13/08/2026, branch `main`, commit `97be97f`.
Aplicação na mesma data. Os números são reproduzíveis — por exemplo:

```bash
npm run check          # env + format + lint + testes + build, na ordem do CI
npm run test:coverage  # cobertura contra o piso de vite.config.js
npx eslint .           # 0 erros; 19 avisos, todos do React Compiler
```

### Sobre a seção "O que motivou" de cada regra

Ela guarda a **divergência medida** que fez a regra existir, no estado em que o repositório
estava antes. Não é um relatório de pendência — é a justificativa, e é o que permite discordar
da regra com dados na mão em vez de opinião.

Ela **não se apaga** quando a regra é aplicada. Apagar transformaria o documento numa lista de
mandamentos sem origem, e a primeira pessoa a achar a regra incômoda não teria como avaliar se
o motivo ainda vale. Quando uma medição se mostrar errada ao ser aplicada, o caminho é a nota
em bloco de citação — como está em A1, C3 e E3.

O estado atual de cada número vive num lugar só: a tabela em **Estado da padronização**, no
topo. É ela que se atualiza.
