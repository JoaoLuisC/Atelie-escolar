# Prompt de execução — correções de padronização + otimização

> Diferente de [REVIEW-PROMPTS.md](./REVIEW-PROMPTS.md), que é **read-only**: este prompt é de
> **execução**. Cole o bloco inteiro numa sessão nova do Claude Opus com esforço máximo, na raiz
> do repositório.
>
> Fonte: [PADRONIZACAO-CORRECOES.md](./PADRONIZACAO-CORRECOES.md) (26 itens `P0.1`–`P6.3`) e
> [reviews/OTIMIZACAO-CODIGO-2026-08-18.md](./reviews/OTIMIZACAO-CODIGO-2026-08-18.md)
> (13 itens `1.1`–`5.2`), ambos medidos em 18/08/2026 sobre o commit `4b42fe8`.

---

## Prompt (copiar daqui para baixo)

Você vai **executar** correções já levantadas e priorizadas neste repositório — não é uma nova
revisão. O trabalho de diagnóstico está feito; o seu é aplicar, provar que fechou e não inventar
escopo.

### Contexto

`Ateliê da Escola`: React 19 + Vite no front (`src/`), funções serverless em `api/*.js` na Vercel,
Express 5 (`server.js` + `routes/`) só em desenvolvimento, Supabase/Postgres com RLS, Mercado Pago,
Nodemailer/Resend. Backend em CommonJS, front em ESM (ADR 0001).

### Leia antes de tocar em qualquer arquivo

1. `CONTRIBUTING.md` — as 25 regras (`A1`–`F3`). É o padrão; **nenhuma regra nova sai daqui.**
2. `docs/PADRONIZACAO-CORRECOES.md` — dívida contra as regras, itens `P0.1`–`P6.3`, cada um com
   "Como provar que fechou".
3. `docs/reviews/OTIMIZACAO-CODIGO-2026-08-18.md` — bundle, tetos de escala, duplicação, código
   morto, itens `1.1`–`5.2`.
4. `docs/adr/` — ADRs 0001 a 0004.

Os dois documentos se cruzam em quatro assuntos (envelope A1, `guardMethod` A3, suíte instável D2,
`--max-warnings` D5). **Onde divergirem, o `PADRONIZACAO-CORRECOES.md` vence** — está escrito na
nota de fronteira do topo do doc de otimização.

### Regras de trabalho — não negociáveis

- **Remeça antes de corrigir.** Todos os números são de 18/08/2026 sobre `4b42fe8`. Antes de cada
  bloco, rode o `grep`/comando do item e confirme que o achado ainda existe e que as linhas
  citadas ainda são aquelas. Se divergir, **relate a divergência e siga pelo código**, não pelo doc.
- **Nada fecha sem prova executável.** Cada item traz "Como provar que fechou" — rode o comando ou
  escreva o teste. Item sem prova rodada continua `⬜ aberto`. Foi exatamente assim que os gates da
  rodada anterior viraram documentação de algo que não acontecia.
- **Um commit por bloco**, na ordem abaixo, com o identificador na mensagem:
  `fix(P0.1): admin-session emite ADMIN_SESSION_INVALID`. Commits em português, no estilo do
  histórico. **Não faça push.** Não use `--no-verify`.
- **Marque a tabela de acompanhamento** do `PADRONIZACAO-CORRECOES.md` (e o Status do doc de
  otimização) **no mesmo commit** que fecha o item.
- **`npm run check` verde antes de cada commit.** Se um bloco deixar o gate vermelho, conserte
  antes de seguir — não empilhe.
- **Não amplie o escopo.** Se encontrar algo fora dos dois documentos, anote no relatório final;
  não corrija junto.
- Regra que a medição mostrar errada se corrige **editando o `CONTRIBUTING.md`**, nunca abrindo
  exceção no código.

### Pare e pergunte (não decida sozinho)

Seis itens são decisão de quem opera o produto, não digitação. **Antes de começar o bloco C7**,
junte as perguntas abaixo numa mensagem só, com a sua recomendação e o custo de cada saída, e
espere resposta. Siga tocando os blocos que não dependem delas.

| #   | Decisão                                                                                                                 | Onde         |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | CORS: reescrever a regra A3 para "só quando cross-origin" **ou** criar `setPublicCorsHeaders` e aplicar nos 26 handlers | `P3.2`       |
| 2   | Rate limit: adotar `enforceRateLimit` e remover os limitadores do Express, **ou** mantê-los como borda genérica de dev  | `P2.3`       |
| 3   | Trocar `@supabase/supabase-js` por `@supabase/auth-js` (ganho extra de ~28 KB gz, risco de PKCE em produção)            | §1.1 passo 2 |
| 4   | Ícones: self-host com subset dos 66 glifos **ou** sprite SVG inline                                                     | §1.4         |
| 5   | `/admin/dashboard`: parar no piso (limit + aviso de truncamento + janela de data) ou ir até agregação server-side       | §2.1         |
| 6   | Ajustar a redação da regra C6 para "componente **que recebe props** declara `propTypes`"                                | `P5.4`       |

Decisão que atravessa arquivos vira **ADR** (regra F3): as de nº 1, 2 e a factory do bloco C7
rendem um ADR cada, numerados a partir de `docs/adr/0005-`.

### Ordem de execução — plano fundido dos dois documentos

Os dois docs têm ordens próprias e elas **colidem em dois pontos**: compartilham o primeiro commit
(`P0.3` = §5.1), e os cinco handlers CRUD admin são tocados por `P1.2`/`P2.1`/`P2.2` de um doc e
pelo §3.1/§3.2 do outro — **têm de sair no mesmo commit**, senão os mesmos cinco arquivos são
reescritos duas vezes. O plano abaixo já resolve isso.

**C1 · A suíte volta a ser confiável** — `P0.3` + §5.1

Separar runtimes com `test.projects` no `vite.config.js` (`node` para `api/**` e `lib/**`, `jsdom`
para `src/**`) e cortar a rede na raiz (`vi.stubGlobal('fetch', …)` no setup do projeto `node`;
`lib/security-logger.js` é a origem do `fetch failed`). **Não** aumente o `testTimeout` — mascara a
causa. Duas armadilhas já verificadas: `environmentMatchGlobs` **não existe no Vitest 4**, e o bloco
`coverage` **fica na raiz**, fora de `projects`, ou os thresholds da regra D2 param de valer.

_Prova:_ `npx vitest run` verde três vezes seguidas, `environment` abaixo de 30s no relatório, zero
`insert_falhou` na saída.

**C2 · Os gates passam a valer** — `P0.2` + `P3.3`

Passo dedicado de cobertura no `.github/workflows/test.yml` (`npm run test:coverage`) e
`test:coverage` dentro do `npm run check`, para o gate local e o do CI serem a mesma coisa. Corrigir
o comentário `--max-warnings=21` do workflow para `19` e anotar nele a regra do ratchet: **ao
corrigir um aviso, baixe o teto no mesmo commit.**

_Prova:_ baixar um threshold de propósito num commit descartável e ver o CI ficar vermelho. Há folga
real (`27,65 / 21,34 / 23,55 / 28,12` contra piso `25 / 19 / 21 / 25`): o gate liga sem exigir teste
novo.

**C3 · O bug de produção** — `P0.1`

`lib/admin-session.js:202,210` e `lib/customer-session.js` passam a responder por `fail()` com
`ADMIN_SESSION_INVALID` / `FORBIDDEN` / `CUSTOMER_SESSION_INVALID` — os códigos já existem no
catálogo de `lib/http.js` **e** no espelho de `src/constants/error-codes.js`, e nunca foram emitidos.
Hoje o re-login da dona da loja não dispara porque `isSessionError` compara `'sessao admin'` sem
acento contra `'Sessão admin inválida ou expirada.'`. Ao fechar, **remova o fallback por texto** de
`src/components/admin/utils/format.js`.

_Prova:_ teste em `lib/__tests__/admin-session.test.js` afirmando
`body.error.code === 'ADMIN_SESSION_INVALID'` **e** — este é o elo que quebrou — um teste em
`src/pages/__tests__/` afirmando que `onAuthExpired` (`src/pages/AdminPage.jsx:165`) dispara diante
desse envelope.

**C4 · O espelho de rotas para de divergir** — `P0.4`

Teste que lê `api/**/*.js` do disco e afirma que cada arquivo tem rota montada em
`routes/api-compat.routes.js` e vice-versa; montar os dois que faltam (`api/sitemap.xml.js` e
`api/notfound.js`, hoje servidos em produção e ausentes em `npm run dev:api`).

_Prova:_ criar um `api/exemplo-temporario.js` vazio, ver o teste falhar, apagar.

**C5 · Os cinco endpoints públicos sem teto** — `P3.1`

`api/send-confirmation-email.js` **primeiro** (é o único que gasta dinheiro e reputação de domínio
por requisição, contra a cota de 3.000/mês do Resend), depois `api/auth/customer/register.js`,
`api/auth/customer/google/start.js`, `api/auth/customer/google/callback.js` e
`api/confirm-subscription.js`. Os perfis já existem em `RATE_LIMITS` (`lib/rate-limit.js`); falta
aplicar. Não inflar o escopo: `api/webhook.js` (HMAC), `api/customer-orders.js` e
`api/auth/customer/session.js` (atrás de sessão) ficam de fora deste bloco.

**C6 · Bundle: −35% do caminho crítico** — §1.1 passo 1 + §1.2

`src/services/supabase-browser.js` perde o import estático e ganha `getSupabaseBrowserClient()`
assíncrona **memoizando a promessa** (não só o cliente, ou dois fluxos concorrentes criam dois
clientes com PKCE state separado). As duas funções de URL continuam síncronas. Ajustar os três
consumidores; `src/pages/ResetPasswordPage.jsx:42` precisa de refactor real — resolver dentro do
`useEffect` e guardar em `useRef`, senão o toast de "Configuração ausente" dispara no intervalo.

Junto, reescrever o `manualChunks` do `vite.config.js` casando por fronteira de pacote
(`react|react-dom|scheduler` juntos, `react-router`, `@supabase/`, resto em `vendor`) e **sem bucket
para `react-hook-form`**, que é usado só no `CheckoutPage` e hoje viaja no chunk que todos importam.

_Prova (é o `dist`, não a função):_ `npm run build`; `supabase` fora dos `modulepreload` do
`dist/index.html`; `grep -l "shouldUnregister" dist/assets/*.js` só no `CheckoutPage-*.js`;
`grep -l "react.transitional" dist/assets/*.js` só no `react-*.js`; tabela de gzip antes/depois
(158 KB → ~103 KB). Deixe os dois `grep` como comentário no `vite.config.js`.

**C7 · Factory dos CRUD admin** — §3.1 + §3.2 + `P1.2` + `P2.1` (nos 5) + `P2.2`

`lib/admin-resource-handler.js` com
`createAdminResourceHandler({ targetType, errorMessage, operations })` concentrando CORS,
`guardMethod`, `ensureAdminSession`, auditoria (regra I1) e catch. Os cinco handlers (`products`,
`categories`, `coupons`, `orders`, `users`) perdem ~275 linhas idênticas e passam a devolver
`{ status, body }` no sucesso e `{ error: { status, code, message } }` na falha — o que fecha de
graça os 31 sites de envelope legado do `P1.2` (com `api/admin/products.js` no pior caso: seis
respostas **sem `success: false`**). No mesmo passe, migrar a coerção manual desses cinco para
`validation/` + zod (`P2.2`); os primitivos `id`, `slug` e `money` já estão em
`validation/common.schemas.js`. `allowed` sai do próprio mapa de operações, então o header `Allow` do
405 para de divergir. **Gera ADR** `docs/adr/0005-factory-para-recursos-crud-do-admin.md`, com
"Alternativas descartadas" registrando por que não virou router genérico dirigido por config.

_Atenção:_ isto muda corpos de erro que o front consome — rode
`src/pages/__tests__/CheckoutPage.test.jsx` e `DownloadsPage.test.jsx` no mesmo commit.

**C8 · Fechar o contrato HTTP e apagar o shim** — `P1.1` `P1.3` `P1.4` `P1.5` + `P2.1` (restante)

- `P1.1`: `lib/customer-auth-handlers.js`, 14 sites — é o BFF de login/cadastro/Google e a razão de
  os seis arquivos de `api/auth/customer/**` marcarem zero adoção. A tabela do item já mapeia linha
  → código (`VALIDATION_FAILED`, `CREDENTIALS_INVALID`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`).
- `P1.3`: `api/me-delete-account.js` (5 sites) e **`api/create-payment.js:389`** — o `catch` do
  endpoint que cria o pagamento, sem `success`, no caminho do dinheiro.
- `P1.4`: `message` do `express-rate-limit` em `routes/api-compat.routes.js:91,115,146,155,166` e
  `routes/auth.routes.js:24`. Hoje `RATE_LIMITED` está no espelho do front, o cliente tem um `if`
  para ele, e o backend nunca o emite.
- `P1.5`: `lib/rate-limit.js:566` → `RATE_LIMITED`; `api/admin/settings.js:459` →
  `SECOND_FACTOR_REQUIRED`; `api/unsubscribe.js:213` `confirmation_required` **não tem equivalente**
  — decida o nome e registre no catálogo de `lib/http.js` e no espelho do front.
- `P2.1`: substituir o par `OPTIONS`/`methodNotAllowed` manual por
  `if (guardMethod(req, res, ['GET'])) return;` nos handlers restantes (40 têm o bloco manual, em
  duas variantes de estilo que não conversam).
- **Fim do bloco:** migrar os consumidores de `data.error` para `data.error.message` e **apagar o
  shim de achatamento em `src/utils/api.js:29-32`** — o `CONTRIBUTING` elegeu isso como o marco
  verificável do fim da migração A1.

_Prova:_ `grep -rn "error: '" api lib routes --include='*.js'` sem resultado fora de comentário;
`grep -rn "req.method === 'OPTIONS'" api/` sem resultado; `src/utils/api.js` sem o ramo de
achatamento.

Cuidado com os `{ error }` internos de `api/admin/settings.js:156,168,187` — são retorno de função de
coerção, **não** viram corpo HTTP; só a linha 408 é violação.

**C9 · Tetos de escala do backend** — §2.2, depois §2.1, depois §2.3 + §4

- §2.2: memoizar o transporter em `lib/email-sender.js` com `pool: true`, `maxConnections: 3`
  (confirme o limite de conexões simultâneas do Resend antes de subir), `maxMessages: 100`. Hoje cada
  e-mail paga TCP+TLS+AUTH do zero, mais 3 round-trips ao Supabase, sob `maxDuration: 60` do
  `vercel.json`, num cron horário — a fila nunca esvazia se a entrada superar a saída. **Registre no
  PR por que isto não viola a regra E2**: E2 é sobre estado de decisão; pool de conexões é recurso de
  I/O local à instância. Segundo passo, se faltar folga: lotes com concorrência limitada (5 por vez)
  nos quatro `for` de `api/cron-email-jobs.js:372` — **não** `Promise.all` no array inteiro.
- §2.1: `api/admin/dashboard.js:65-105` varre 7 tabelas sem `limit` nem filtro de data. Piso
  imediato: `limit` explícito em toda chamada e `log.warn('possivel_truncamento', { table, limit })`
  quando `rows.length === limit` — hoje o corte do PostgREST aconteceria **sem erro**, com o
  faturamento aparecendo menor do que é. Depois: janela de data em
  `orders`/`order_items`/`download_logs`. Agregação server-side conforme a decisão nº 5; o caminho já
  existe em `/admin/kpis`, `/admin/abc-*`, `/admin/cohort` e `/admin/funnel`, com
  `setCachePolicy(res, 'adminReport')` (regra E4).
- §2.3.a: `createTokensForOrder` (`api/verify-payment.js:149`) insere token a token dentro da
  confirmação de pagamento — trocar por lote com `upsertIntoTable`. ⚠️ **Verifique antes de subir**
  se o `Prefer: resolution=merge-duplicates` de `lib/supabase.js:172` sobrescreve a coluna `token`:
  se o webhook já criou a linha, um token novo **invalida um link de download já enviado por e-mail**
  — nesse caso use `ignore-duplicates`. Trave isso em `download-single-use.test.js`.
- §2.3.b: `findUserByEmail` (`lib/customer-account-provisioning.js:41`) pagina até 2.000 usuários e
  devolve `null` para quem existe acima disso — trocar por consulta indexada em `profiles(email)`,
  **com migration criando índice em `lower(email)`**, senão a troca é cosmética.
- §4: remover os exports sem consumidor de `lib/supabase.js` (`buildSupabaseHeaders`,
  `getSupabaseRestUrl`, `getSupabaseStorageUrl`, `selectFromTable`, `buildTableQuery`).
  **`upsertIntoTable` não sai** — ganha uso no §2.3.a. `getSupabaseStorageUrl` monta URL **pública**
  ao lado da assinada de `lib/storage-signed-url.js`: removê-lo é ganho de segurança, não só de
  linhas.

**C10 · Cobertura, e então queimar os avisos** — `P4.1` `P4.2` + §5.2/`D5`

Suítes de `lib/` na ordem de risco do `P4.1`: `security-logger`, `customer-account-provisioning`,
`email-sender` primeiro (os dois primeiros rodam dentro do caminho do dinheiro; o terceiro fecha o C1
de quebra), depois os outros sete. No front, `src/services/` é o alvo mais barato (8 arquivos, sem
JSX) e é a fronteira que o bloco C11 alarga. **A ordem aqui é a inversa da intuitiva:** escrever
teste para os 13 componentes com aviso `react-hooks/set-state-in-effect` **antes** de refatorá-los —
é isso que trava a regra D5 hoje. A cada aviso corrigido, **baixe `--max-warnings` no mesmo commit**.
`setReduced(mq.matches)` em `src/pages/HomePage.jsx:115` é o exemplar do padrão; vários resolvem com
`useSyncExternalStore` ou inicializador lazy do `useState`.

**C11 · Frontend** — `P5.1` `P5.2` `P5.3` `P5.4` + §1.3

- `P5.1`: criar `src/services/checkout.js`, `downloads.js` e `subscription.js`; as três páginas
  (`CheckoutPage.jsx:11`, `DownloadsPage.jsx:9`, `SubscriptionPages.jsx:5`) param de importar
  `apiRequest` direto. São justamente as telas do caminho do dinheiro e da entrega.
  `src/components/ErrorBoundary.jsx:26` usa `fetch` cru **de propósito** (telemetria de erro): fica
  fora, com um comentário no código dizendo isso para não virar precedente.
- `P5.2`: `formatPercent` e `formatCount` em `src/utils/` absorvem os 15 sites inline
  (`AnalysisTab:455`, `ComparisonTab:9,17`, `DashboardTab:683`, `FunnelTab:28,90,179,187,195`,
  `SegmentsTab:91,99,107,115,142,152`). `AnalysisTab:455` já reimplementa o `.replace('.', ',')` de
  `src/utils/currency.js`.
- `P5.3`: mover `isSessionError` para junto de `src/constants/error-codes.js` e apagar
  `src/components/admin/utils/format.js` (exporta uma função só, que não formata nada). Se
  `derive.js` e `tabs.js` ficarem onde estão, **escreva a exceção nomeada no `CONTRIBUTING`** — C4.
- `P5.4`: só `HomePage`, `ProductsPage` e `SubscriptionPages` recebem props; os outros 11 seriam
  cerimônia vazia. Depende da decisão nº 6.
- §1.3: `src/pages/AdminPage.jsx:9-23` importa 14 abas e 2 wizards estaticamente (147 KB / 36,2 KB
  gz). Trocar por `lazy()` no mesmo padrão do `App.jsx:5`, com `<Suspense>` envolvendo só a área de
  conteúdo do `AdminLayout` (a navegação lateral continua instantânea). Bônus no mesmo arquivo:
  condicionar as 12 derivações de `AdminPage.jsx:176-205` à aba que as consome, usando o
  `TABS_NEEDING_DASHBOARD` que já existe em `tabs.js:18`.
- §1.4 conforme a decisão nº 4; com o CDN fora, remova `cdn.jsdelivr.net` de `style-src` **e**
  `font-src` no CSP de `vercel.json:18`.

**C12 · Markdown e documentação** — `P3.4` `P6.1` `P6.2` `P6.3` + §4 (docs)

**A ordem importa:** normalizar os 56 arquivos `.md` num commit isolado que não muda uma palavra de
conteúdo (e entra no `.git-blame-ignore-revs`, mecanismo que o repo já usa) **e só então** estender
`format`/`format:check` para `**/*.{md,json}` — estender o gate antes deixa o CI vermelho por 56
arquivos que ninguém tocou. Depois: cabeçalho de "retrato histórico" nos relatórios pré-padronização
(`P6.1`); mover os relatórios para `docs/reviews/` com zero à esquerda, deixando só o
`REVIEW-PROMPTS.md` na raiz de `docs/` (`P6.2`); apagar os 4 documentos "em retirada" (1.143 linhas)
**redirecionando as menções a `docs/SETUP.md` no `README.md` e no `docs/README.md` no mesmo commit**;
e trocar o "as 25 regras estão aplicadas" do `CONTRIBUTING` por um ponteiro honesto, com a tabela de
medidas atualizada (`P6.3`).

### O que não fazer

- Não aumentar `testTimeout` para "resolver" o C1.
- Não mover `coverage` para dentro de `test.projects`.
- Não trocar `@supabase/supabase-js` por `auth-js` sem validar Google OAuth completo, link de
  recuperação de senha e logout — a `storageKey` do PKCE quebra **só em produção**, depois do
  redirect do Google.
- Não usar `Promise.all` sem teto no cron de e-mail.
- Não remover `upsertIntoTable`.
- Não reescrever os cinco handlers CRUD em dois commits separados.
- Não normalizar markdown junto com mudança de conteúdo no mesmo commit.

### Relatório final

Ao terminar (ou ao parar por dependência de decisão), entregue:

1. **Tabela item → estado** (`✅ fechado` / `⬜ aberto` / `⛔ descartado, com motivo`), cobrindo os
   26 itens do `PADRONIZACAO-CORRECOES.md` e os 13 do doc de otimização.
2. **Prova rodada por item fechado** — o comando e a saída, não a afirmação de que passaria.
3. **Antes/depois medido** do bundle (tabela de gzip do caminho crítico) e da suíte (tempo de
   `environment`, três execuções).
4. **Lista de commits** com identificador e arquivos tocados.
5. **Divergências encontradas** entre os documentos e o código atual.
6. **O que ficou aberto e por quê** — separando "depende de decisão" de "não coube".
