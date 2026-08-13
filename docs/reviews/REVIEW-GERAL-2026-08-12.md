# Revisão geral — Ateliê da Escola (2026-08-12)

> Revisão de arquitetura, segurança e processos feita sobre o commit `e085971`
> (`fix(security): corrige IDOR por curinga ILIKE, vazamento de download_url e bypass de max_uses`).
> Objetivo: responder à ressalva sobre o "monolito", listar o que ainda falta endurecer
> depois das correções de Supabase, e apontar buracos de processo/deploy.
>
> Complementa (não substitui) `REVIEW-GERAL-2026-07-03.md` e `docs/REVIEW-AREA-9-TESTES.md`.
> Itens marcados **[confirmado no código]** foram verificados linha a linha nesta revisão;
> os demais vêm de varredura com evidência em arquivo:linha.

---

## 0. TL;DR

**O monolito não é o seu problema.** Em produção o projeto já é publicado como ~43 funções
serverless independentes na Vercel — cada endpoint de `api/*.js` escala e falha isolado. Isso
já é mais granular que a maioria dos "microserviços" reais. Estado está externalizado
corretamente (Supabase para dados, cookies HMAC stateless para sessão, Storage assinado para
arquivos). Para 1 admin e catálogo pequeno, a arquitetura está **certa**. Não separe serviços,
não adicione fila, ORM, React Query ou troque a Vercel — nada disso resolve um problema real que
você tenha hoje.

**O problema real é duplicação dev/prod e três buracos que valem dinheiro/dados.** O que precisa
de atenção, em ordem:

| # | Item | Tipo | Esforço |
|---|---|---|---|
| P0-1 | Pagamento aprovado sem conferir o valor pago | Segurança/$ | ~5 linhas em 2 arquivos |
| P0-2 | Segredos de produção ainda recuperáveis no histórico do git | Segurança | rotacionar + expurgar |
| P0-3 | Deploy fica "verde" sem os segredos configurados e quebra no 1º cliente | Processo | script de validação |
| P1-1 | IDOR por e-mail sobrevive em 2 endpoints (o mesmo padrão que a wave1 corrigiu no banco) | Segurança | trocar coluna de escopo |
| P1-2 | `security-hardening.sql` regride o fix da wave1 se reexecutado | Segurança | sincronizar arquivo |
| P1-3 | Zero rate limiting em produção (login admin, 2FA, cupom) | Segurança | contador no Postgres |
| P1-4 | Migrations "não confirmadas em produção" — inclui idempotência de pagamento | Processo | aplicar + confirmar |
| P1-5 | Webhook aceita replay indefinido e ecoa tokens de download | Segurança | freshness + parar de ecoar |
| P2 | Sessão admin não revogável; cron 401/h; sem lint/coverage; caches em memória incoerentes | Vários | ver §4/§5 |

---

## 1. Veredito arquitetural — a ressalva do "monolito"

### Por que não é problema

- **Não existe um monolito de deploy.** `vercel.json:12-13` compila `api/**/*.js` com
  `@vercel/node` — cada arquivo vira uma função. `products`, `webhook`, `admin-dashboard`…
  são 43 lambdas independentes. Deploy = `git push`. Evoluir = adicionar um arquivo em `api/`
  e uma linha em `routes/api-compat.routes.js`.
- **Estado externalizado.** Sessões são cookies HMAC stateless (`lib/admin-session.js`,
  `lib/customer-session.js`), não `Map` em memória. Dados no Supabase. Arquivos em Storage
  assinado. Isso é o que permite serverless funcionar — e está certo.
- **Maturidade acima do porte.** 14 migrations versionadas, CI rodando `npm run check`,
  ~17 suítes de teste, documentação extensa.

### O que realmente incomoda (e tem evidência)

O runtime é **dual**: em dev roda um Express (`server.js` + `routes/`), em prod rodam as
funções Vercel. Três mecanismos de segurança têm **duas implementações**, e só a de dev roda
localmente enquanto só a de prod vale no ar:

| Mecanismo | Dev (Express) | Prod (Vercel) | Divergência |
|---|---|---|---|
| Rate limit | `server.js:115-130` + 8 limiters em `api-compat` | **nenhum** | prod não tem nada — ver P1-3 |
| Headers | `lib/security-headers.js` (helmet) | `vercel.json:17-26` | `X-Frame-Options: DENY` (dev) vs `SAMEORIGIN` (prod); CSP duplicada em 2 lugares |
| CORS | `server.js:75-107` | `lib/admin-session.js:200-212` | `api-compat.routes.js:47-53` apaga o CORS admin em dev → o código de prod nunca roda local |

Consequência: você testa localmente um comportamento e publica outro. Foi assim que o
`X-Frame-Options` divergiu sem ninguém notar. **Esse é o eixo de refatoração que dá retorno —
não "quebrar o monolito".**

### Dívida técnica concreta (não é escala, é duplicação)

- **Guard de admin copiado em 15 handlers.** O bloco `setAdminCorsHeaders → OPTIONS →
  ensureAdminSession → dispatch → logAdminAction` é textualmente repetido. Já há inconsistências:
  `admin-dashboard.js:203` faz 405 antes do guard; `admin-categories.js:137` faz depois;
  `admin-upload-url.js:37` responde 204 no OPTIONS enquanto 17 outros respondem 200. Um handler
  novo pode simplesmente **esquecer** `ensureAdminSession` e ninguém percebe.
  → Extrair `lib/admin-handler.js` com `withAdminGuard(handler, { methods, targetType })`.
- **Helpers HMAC/cookie/base64url triplicados** em `lib/admin-session.js`, `lib/customer-session.js`
  e `api/admin-login.js`. Um bug de padding base64url precisa ser corrigido em 3 lugares.
  → `lib/hmac-token.js` + `lib/cookie.js`.
- **`loadOrder`/`loadOrderItems` duplicados** entre `webhook.js` e `verify-payment.js` — o domínio
  mais crítico (dinheiro + entrega) copiado com `select` divergente. → `lib/orders.js`.
- **Stack BFF morto.** `routes/products.routes.js:32` (`POST /produtos`, Bearer + zod +
  `checkRole`), `routes/auth.routes.js:32` (`/auth/me`, "o frontend não consome"),
  `routes/payment.routes.js` (router vazio), `middleware/auth.middleware.js`,
  `middleware/validate.middleware.js`, `validation/payment.schemas.js` (não importado por nada),
  `DOWNLOAD_TOKEN_SECRET` (exigido no boot, usado em lugar nenhum). Tudo isso desenha um **modelo
  de segurança que o sistema não usa** — risco de leitura errada por um avaliador de TCC. → Apagar.
- **6 caches em `Map` em memória** (`admin-kpis`, `admin-abc-*`, `admin-cohort`, `admin-funnel`,
  `admin-segments`) que em serverless dão números diferentes a cada refresh. Com 1 admin, o
  `Cache-Control` do browser resolve o mesmo. → Apagar os `Map` ou extrair `lib/response-cache.js`.

---

## 2. Segurança — P0 (parar tudo e corrigir)

### P0-1 — Pagamento aprovado sem conferir o valor pago **[confirmado no código]**

`api/webhook.js:124` · `api/verify-payment.js:16-18`

A única checagem para liberar o produto é `payment.status === 'approved'` +
`external_reference === orderId`. `transaction_amount`, `currency_id` e `live_mode`
**não são lidos em nenhum lugar** de `api/` ou `lib/`. `orders.total_amount` é carregado
(`webhook.js:10`) mas só entra em analytics (`webhook.js:165`).

**Risco:** não há reconciliação entre o que foi cobrado e o que o pedido vale. Um pagamento de
valor arbitrário (ex.: R$ 0,01) com `external_reference` apontando para um pedido de R$ 200
transiciona o pedido para `approved` e emite os `download_tokens` — entrega completa do produto
digital. É a classe de falha "confie no gateway, mas verifique o valor".

**Correção:** antes de qualquer transição para `approved`, nos dois handlers:
```js
const paid = Number(payment.transaction_amount || 0);
const due = Number(order.total_amount || 0);
if (payment.currency_id !== 'BRL' || paid + 0.01 < due) {
  // registrar security_event 'payment_amount_mismatch' e NÃO aprovar
}
```
(tolerância de 1 centavo para arredondamento). Este é o item de maior retorno da lista inteira:
~5 linhas, fecha perda financeira direta, e vira material de capítulo 5 do TCC ("decisão de
reconciliar valor server-side").

### P0-2 — Segredos de produção recuperáveis no histórico do git **[confirmado no código]**

O working tree está limpo hoje, mas o histórico **não foi reescrito**. Repositório é público
(`https://github.com/JoaoLuisC/Atelie-escolar`, HTTP 200 anônimo):

- commit `1eab297` versionou `.env.production` e `.env.test` com `MERCADOPAGO_ACCESS_TOKEN`
  (**de produção**, `APP_USR-…`), `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET` e `FIREBASE_PRIVATE_KEY`.
- revisões antigas de `HANDOFF.md` (ex.: `ec33134`) contêm PAT do Supabase (`sbp_4ab0…`).

`WEBHOOK_SECRET` é exatamente a chave HMAC de `validateWebhookSignature`
(`lib/mercadopago-config.js`). Com ela + P0-1, dá para forjar um POST válido em `/api/webhook`.
O `MERCADOPAGO_ACCESS_TOKEN` de produção dá acesso a cobranças/estornos reais.

**Correção (nesta ordem):**
1. Rotacionar **tudo**: MP access token, `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET`, chave Firebase,
   PAT(s) Supabase, `SUPABASE_SERVICE_ROLE_KEY`, e trocar senha do admin/contas de teste.
2. **Só depois** expurgar o histórico (`git filter-repo --invert-paths` para os `.env*` e
   `--replace-text` para os tokens no `HANDOFF.md`) e force-push. Rotacionar antes de expurgar —
   o expurgo sozinho só avisa quem já clonou.
3. Considerar tornar o repositório privado até concluir (1) e (2).

Isso já está registrado como pendência C-1/C-2 em `REVIEW-GERAL-2026-07-03.md:31` e no topo do
`HANDOFF.md` — continua aberto.

### P0-3 — Deploy fica "verde" sem segredos e quebra no primeiro cliente

`server.js:39-59` valida os segredos obrigatórios **no boot** — mas `server.js` não roda na
Vercel. Em produção, a falta de `ADMIN_SESSION_SECRET`/`WEBHOOK_SECRET`/`CUSTOMER_SESSION_SECRET`
derruba a **requisição** em runtime (fail-closed em `lib/env-secret.js`), não o deploy. Além
disso, `vercel.json` só declara 11 das ~20 variáveis que o código lê — os secrets de sessão,
`CRON_SECRET`, `APP_ENV` e `SMTP_*` estão fora.

**Risco:** publica-se um deploy que passa no build, e o primeiro checkout/login/ webhook responde
500. Sem smoke test pós-deploy, isso só aparece via cliente reclamando.

**Correção:** `scripts/check-env.js` que valida a presença dos segredos e roda como step no CI
antes do build; e um smoke test pós-deploy (`GET /api/products` + `GET /health` no preview).

---

## 3. Segurança — P1 (endurecer logo)

### P1-1 — IDOR por e-mail em `customer-orders` e `me-delete-account` **[confirmado no código]**

`api/customer-orders.js:58,72` · `api/me-delete-account.js:149-152`

A wave1 (`20260812000000_security_hardening_wave1.sql:75-93`) tirou a policy de `orders` do claim
`email` e passou para `customer_id = auth.uid()`, com a justificativa correta: *"o claim `email`
não prova posse do endereço"*. Mas esses dois endpoints usam `serviceRoleHelpers` (que **ignora
RLS**) e continuam escopando por `session.email` → `customer_email eq`. A correção de policy não
os alcança.

**Risco (condicional a "Confirm email" estar OFF no Supabase):** um atacante registra
`vitima@x.com`, recebe sessão com o e-mail da vítima e:
- `GET /api/customer-orders` devolve pedidos, itens **e os `download_tokens` válidos** da vítima;
- `POST /api/me-delete-account` anonimiza destrutivamente o PII dos pedidos de convidado da vítima.

**Correção:** ancorar os dois em `session.uid` → `orders.customer_id` (o backfill já foi feito na
wave1) e confirmar **"Confirm email = ON"** no projeto hospedado (a própria migration lista isso
em "NÃO cobre").

### P1-2 — `security-hardening.sql` regride o fix da wave1 **[confirmado no código]**

`supabase/security-hardening.sql:82-101` ainda contém a policy antiga
(`customer_email = auth.jwt() ->> 'email'`) com `drop policy if exists` + `create policy`. O nome
do arquivo ("hardening") e `docs/SECURITY.md:102` convidam a rodá-lo em troubleshooting — e ao
rodar, ele **sobrescreve** a policy endurecida da wave1, reabrindo o IDOR no banco.

**Correção:** replicar nesse arquivo as policies da wave1 (escopo por `customer_id`), ou reduzi-lo
a um ponteiro para as migrations. 10 minutos, evita regressão silenciosa do que você acabou de
corrigir.

### P1-3 — Zero rate limiting em produção

Todos os limiters vivem em `server.js` / `routes/` (não implantados). `api/admin-login.js` não tem
contador de tentativas nem lockout próprio. Em produção:
- brute force ilimitado de senha em `/api/admin-login`; o `challengeToken` do 2FA é reemitível e a
  validação do 2º fator não tem contador → o `fallbackPin` (mín. 6 chars) é força-brutável;
- `/api/validate-coupon` é oráculo de enumeração; `/api/verify-payment` permite varredura de
  `order_code`.

Documentado como "API-03" em `docs/SECURITY.md:23-37`. **Correção:** contador atômico no Postgres
(tabela `rate_limit_hit` + upsert) chamado pelos handlers de `api/`, cobrindo pelo menos
`admin-login`, `create-payment`, `verify-payment`, `validate-coupon` e `subscribe`; opcionalmente
o Vercel Firewall como contenção de borda.

### P1-4 — Migrations "não confirmadas em produção"

`docs/ProjectDocs/13-ROADMAP-PENDENCIAS.md:289` diz literalmente *"aplicação em prod não
confirmada"*. Entre as 14 migrations estão `20260701000001_phase5_payment_hardening`
(idempotência de `download_tokens` via `UNIQUE(order_id, product_id)` + `increment_coupon_usage()`
atômico) e a `20260812000000` (a wave1 que fecha o IDOR e o vazamento de `download_url`). **Se
essas não estiverem aplicadas, suas correções de pagamento e de IDOR estão incompletas no ar.**

Sinais de drift: `20260526120000` é uma migration corretiva (habilita `pg_cron` que as anteriores
esqueceram); `20260701000001` faz `DELETE` de duplicatas pré-existentes antes de criar a constraint;
os docs falam em 13 migrations, há 14 no disco.

**Correção:** rodar `npm run supabase:db:push`, confirmar via Security Advisor (`scripts/check-advisor.js`,
deve dar 0 CRITICAL), e atualizar a contagem nos docs. Idealmente, um job de CI com `supabase db diff`
para detectar drift.

### P1-5 — Webhook aceita replay indefinido e ecoa tokens de download

`lib/mercadopago-config.js:104-132` põe o `ts` no manifesto HMAC mas **nunca compara com
`Date.now()`** — não há janela de tolerância nem store de `request-id` processados. Uma notificação
legítima capturada é replayável para sempre. As guardas `neq.approved` tornam o replay idempotente
quanto ao estado, mas cada replay passa por `getPaymentInfo` e **devolve `downloadTokens` no corpo
da resposta 200** (`webhook.js:174-177`) — quem capturou uma notificação relê os tokens sem sessão.

**Correção:** rejeitar `|now - ts| > 300s` e **não** ecoar `downloadTokens` na resposta do webhook
(o cliente pega os tokens por `verify-payment`/`customer-orders`, autenticados).

---

## 4. Segurança — P2 (fila normal)

- **A4 — Sessão admin não revogável.** `lib/admin-session.js` é HMAC apátrida sem `jti`. Logout só
  apaga o cookie; o token segue válido pelos 8h de TTL. `hasValidAdminSession` nunca reconsulta
  `profiles.role` → admin rebaixado/demitido mantém acesso por até 8h. Mesma propriedade no
  `customer_session`. Correção: store de `jti` revogáveis (uma tabela pequena) ou aceitar o risco
  e reduzir o TTL.
- **M3 — 2FA admin frágil.** Código TOTP replayável na janela (`window=1`, ~90s, sem store de
  usados); challenge token reutilizável (nonce gerado mas nunca persistido); `totpSecret`/`fallbackPin`
  em texto puro e **globais** em `settings`; `mergeAdminConfig` faz `{...incoming}` → qualquer admin
  logado pode `PUT adminConfig {"requireSecondFactor": false}` e desligar o 2FA de todos.
- **M1 — `/api/abandoned-cart`** é relay de e-mail não autenticado: POST de e-mails arbitrários +
  o cron dispara marketing para quem nunca deu opt-in (fura o double opt-in; queima reputação Resend).
- **M2 — `/api/unsubscribe`** descadastra qualquer e-mail sem token (ramo de fallback por e-mail cru).
- **M4 — Upload assinado:** validação de MIME/extensão é sobre o `filename` declarado no body; a
  signed URL não vincula `Content-Type` nem tamanho. **E não há policy de Storage versionada** —
  confirmar `public=false` em `product_files`/`product_videos` (TODO em `20260812000000:30`); se
  `product_files` estiver público, o gate de pagamento de `download.js` é contornável por adivinhação
  de path.
- **M6 — E-mail em query string** em `verify-payment` (`?email=…`) e token em `download.js` (`?token=…`)
  — vazam por Referer/logs/histórico. O próprio `me-delete-account.js:258` já adota a política oposta
  (token só no corpo POST). Alinhar.
- **M5/M7 — Escrita pública sem limite de PII** em `create-payment` (schema zod só roda no Express);
  endpoints públicos (`products`, `home-sections`, `cross-sell`) varrem `orders`/`order_items`
  **sem `limit`** com service-role a cada hit não-cacheado.
- **B-itens:** `in.()` montado por template string (`create-payment.js:135` — validar `productId` com
  `/^\d+$/`); `parseStorageRef` aceita `..` no path; login/registro de cliente sem checagem de origem
  (só `SameSite=Strict` mitiga); auditoria grava `req.body` bruto com redação por lista fixa.

### O que já está correto (não reabrir)

Preço sempre do banco em `create-payment.js:152`; cupom revalidado e consumido atomicamente via
`increment_coupon_usage` **antes** de aplicar o desconto; `download.js` com claim atômico
`used=false→true` e rollback se a assinatura falhar; `send-confirmation-email` sempre usa o e-mail
do pedido; escalada via `profiles.role` fechada por trigger (não só RLS); secrets fail-closed fora
de dev; cookies `HttpOnly`+`SameSite=Strict`+`Secure`; CSP sem `unsafe-inline` em `script-src`;
webhook HMAC fail-closed; open redirect pós-OAuth fechado; templates de e-mail escapam HTML.

---

## 5. Processos e pipeline

### Pipeline (o que falta para confiar num deploy)

- **CI** (`test.yml`) roda `npm run check` (vitest + build) em push/PR — **só na branch `main`**.
  Sem `timeout-minutes`, sem `concurrency`, sem `npm audit`/Dependabot/CODEOWNERS.
- **Sem lint em CI, e sem nem script.** ESLint é devDependency mas nunca é invocado; não há
  `npm run lint`/`format`/`typecheck`. Prettier está configurado (`.prettierrc.json`) mas **nem
  instalado** em `devDependencies`. `.npmrc` tem `legacy-peer-deps=true` global, que mascara
  incompatibilidades de peer no `npm ci` da CI. → Adicionar `lint` (com `eslint:recommended`,
  separando globals browser vs node), instalar Prettier + `--check`, trocar a flag global por
  `overrides` pontual do `react-helmet-async`.
- **Sem coverage nem threshold** no `vite.config.js` → as lacunas de teste abaixo são invisíveis
  para o CI.
- **`vercel.json` usa `builds` legado** → é impossível definir `functions.maxDuration`; o
  `cron-email-jobs` (sequencial, SMTP por envio, até 100 candidatos) corre risco de ser cortado no
  timeout. → Migrar `builds` → `functions`.
- **`.vercelignore`** só exclui testes; `docs/`, `tcc-build/`, `TCC-Atelie-Escolar.docx`, `scripts/`,
  `supabase/`, `HANDOFF.md` vão todos no bundle.

### Testes — o fluxo do dinheiro está quase descoberto

~118 casos em 17 arquivos, mas os módulos críticos:

| Módulo | Cobertura hoje |
|---|---|
| `webhook.js` caminho `approved` (único ponto que libera o produto pago) | **zero** (só a assinatura HMAC é testada) |
| reentrega do MP não recria tokens / reenvia e-mail | **zero** |
| `create-payment.js` (preço do banco, cupom, rateio) | 1 assert de borda |
| `verify-payment.js` (anti-enumeração, timing-safe) | 1 assert de borda |
| `download.js` (uso único atômico) | 1 assert de borda |
| `validate-coupon.js` + `lib/coupons.js` | **zero** |
| `admin-login.js` (TOTP/challenge/gate de role) | **zero** |
| `ensureAdminSession` (guard de 16+ rotas) | **zero** (só `verifySessionToken` é testado) |

Há esqueletos AAA prontos (TEST-A1…A10) em `docs/REVIEW-AREA-9-TESTES.md:677+`. Prioridade:
o caminho `approved` do webhook + idempotência de reentrega + uso único do download.

### Pendências operacionais já reconhecidas e ainda abertas

1. Migrations não confirmadas em prod (P1-4). 2. Segredos no histórico (P0-2). 3. Rate limit (P1-3).
4. `CRON_SECRET` + `APP_URL` nos GitHub Secrets — sem eles o `email-cron.yml` retorna **401 de hora
em hora, para sempre**. 5. DKIM/SPF/DMARC no Resend (e-mail de marketing inerte). 6. `VITE_GA4_ID` /
`VITE_META_PIXEL_ID` vazios (Fase 0 de mensuração inteira parada). 7. Cupom `VOLTEI15` referenciado
pelo cron mas inexistente no banco. 8. `og-default.png` ausente. 9. Nenhum checkbox de validação
pós-deploy (§6 dos docs de pendências) marcado.

### Higiene do repo

Repo enxuto (278 arquivos, `.git` 5,6 MB), `.env*`/`dist/`/`.claude/` corretamente ignorados. Pontos
menores: `tcc-build/` e `TCC-Atelie-Escolar.docx` (binário regenerável) versionados; 7 dos últimos 15
commits têm mensagem `.`; sem `.nvmrc`/`engines`; trabalho parece cair direto em `main` sem PR.

---

## 6. Plano de ação sugerido

**Semana 1 — parar sangria (P0):**
1. P0-1: validar `transaction_amount` em `webhook.js` e `verify-payment.js` (~5 linhas).
2. P0-2: rotacionar todos os segredos → expurgar histórico → force-push (repo privado enquanto isso).
3. P0-3: `scripts/check-env.js` + step no CI; smoke test pós-deploy.

**Semana 2 — endurecer (P1):**
4. P1-2: sincronizar `security-hardening.sql` (10 min, evita regressão).
5. P1-4: aplicar/confirmar migrations em prod; Security Advisor 0 CRITICAL; corrigir contagem nos docs.
6. P1-1: escopar `customer-orders`/`me-delete-account` por `customer_id`; ligar "Confirm email".
7. P1-5: freshness do `ts` no webhook + parar de ecoar `downloadTokens`.
8. P1-3: `rate_limit_hit` no Postgres para os 5 endpoints sensíveis.

**Semana 3 — dívida de duplicação (o que responde à ressalva do monolito):**
9. `lib/admin-handler.js` (`withAdminGuard`) — uniformiza 15 handlers, fecha o buraco do guard esquecido.
10. Apagar o stack BFF morto (`routes/products.routes.js`, `/auth/me`, middleware/validation órfãos,
    `DOWNLOAD_TOKEN_SECRET`).
11. `lib/orders.js` + `lib/hmac-token.js`/`lib/cookie.js` (desduplicar o domínio de pagamento e sessão).
12. Testes AAA do caminho do dinheiro (webhook approved, reentrega, download uso único).

**Contínuo:** script `lint`, Prettier instalado + `--check`, coverage com threshold, e-mail fora da
query string, gerar o valor de CSP do `vercel.json` a partir de `lib/security-headers.js` (fonte única).

Nada aqui é "quebrar o monolito". É tirar a duplicação dev/prod, fechar 3 buracos que valem
dinheiro/dados, e dar ao deploy uma rede de segurança. A arquitetura, essa, pode ficar como está.
