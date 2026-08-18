# Resultados de Review — Ateliê da Escola

> ## 📅 Retrato histórico — 12/08/2026
>
> Levantamento anterior às rodadas de padronização de 13/08 e 18/08/2026.
> **Vários achados foram corrigidos.** Este documento não se atualiza — ele é o
> retrato do dia. Estado atual: [CONTRIBUTING.md](../../CONTRIBUTING.md) e
> [PADRONIZACAO-CORRECOES.md](../PADRONIZACAO-CORRECOES.md).

> Documento **companheiro** de [`REVIEW-PROMPTS.md`](../REVIEW-PROMPTS.md). Cada área
> (1 a 10) escreve **sua seção aqui** conforme roda o prompt correspondente. Ao
> consolidar, **deduplique** achados que aparecerem em mais de uma área (a
> sobreposição entre lentes é intencional).

## Como preencher (padrão para todas as áreas)

Cada seção de área deve conter:

1. **Metodologia** — como o review foi feito e ressalvas (ex.: partes não cobertas).
2. **Tabela de achados** — `ID | Severidade | Confiança | Local | Status`.
3. **Detalhe + correção** — 1 parágrafo por achado (o quê, impacto, o que foi feito).
4. **Não alterado (e por quê)** — achados deixados de fora de propósito.
5. **Verificado-OK** — hipóteses checadas que se mostraram seguras (refutadas).
6. **Arquivos alterados / Ações pendentes** (migrations, rotação de segredo, infra).

**Legendas**

- Severidade: `CRÍTICO` · `ALTO` · `MÉDIO` · `BAIXO` · `INFO`
- Status: ✅ Corrigido · 🟡 Parcial · ⛔ Não alterado (ver motivo) · 🏗 Infra/fora do código · 🔎 Verificado-OK

---

## Índice / Progresso

| #   | Área                                | Status                  | Achados (C/A/M/B)       |
| --- | ----------------------------------- | ----------------------- | ----------------------- |
| 1   | Pagamentos & Webhook (Mercado Pago) | ✅ Revisada + corrigida | 0 / 3 / 5 / 2           |
| 2   | Autenticação & Sessões              | ⏳ Pendente             | —                       |
| 3   | Banco de Dados & RLS (Supabase)     | ✅ Revisada + corrigida | 1 / 2 / 5 / 2 (+1 INFO) |
| 4   | API Backend / Handlers Serverless   | ⏳ Pendente             | —                       |
| 5   | Frontend React                      | ⏳ Pendente             | —                       |
| 6   | LGPD / Privacidade & Compliance     | ⏳ Pendente             | —                       |
| 7   | Segurança de Aplicação / AppSec     | ⏳ Pendente             | —                       |
| 8   | Qualidade de Código & Arquitetura   | ⏳ Pendente             | —                       |
| 9   | Testes & Confiabilidade             | ⏳ Pendente             | —                       |
| 10  | DevOps, Deploy & Configuração       | ⏳ Pendente             | —                       |

---

## Área 1 — Pagamentos & Webhook (Mercado Pago)

**Data:** 2026-07-01 · **Modo:** review + correção (saiu do read-only a pedido) · **Testes após correção:** 12 arquivos / 110 testes ✅

### Metodologia

Review multi-agente (8 dimensões + verificação adversarial) com reconciliação
manual. Durante a execução, 5 dimensões de busca (`price-calc`, `coupons`,
`download-tokens`, `signed-url`, `input-validation`) e vários verificadores
sofreram _rate-limiting_ transitório da API; essas lacunas foram fechadas
**relendo à mão, por inteiro, todos os arquivos do escopo**. Toda referência
`arquivo:linha` foi confirmada no código.

**Fato estrutural que amplifica vários achados:** na Vercel, `vercel.json` roteia
`/api/*` direto para as funções serverless — **`server.js` não roda em produção**.
Logo, em prod não há nenhum middleware do Express (rate limiting, `limit: '1mb'`,
guard `REQUIRED_PRODUCTION_SECRETS`). Além disso, `WEBHOOK_SECRET` **não está** no
bloco `env` do `vercel.json` (só `MERCADOPAGO_ACCESS_TOKEN`), tornando o fallback do
AREA1-01 muito provável em produção.

### Achados

| ID       | Sev.  | Conf. | Local                                                                | Status          |
| -------- | ----- | ----- | -------------------------------------------------------------------- | --------------- |
| AREA1-01 | ALTO  | Alta  | `lib/mercadopago-config.js:112`                                      | ✅ Corrigido    |
| AREA1-02 | ALTO  | Alta  | `api/webhook.js:68-70`                                               | ✅ Corrigido    |
| AREA1-03 | ALTO  | Alta  | `api/webhook.js:104-112`, `api/verify-payment.js:46-119`             | ✅ Corrigido    |
| AREA1-04 | MÉDIO | Alta  | `api/create-payment.js` (sem zod no path real; `quantity` sem clamp) | ✅ Corrigido    |
| AREA1-05 | MÉDIO | Alta  | `api/webhook.js:114-119` (UPDATE incondicional)                      | ✅ Corrigido    |
| AREA1-07 | MÉDIO | Alta  | `api/create-payment.js:166-178` (corrida `used_count`)               | ✅ Corrigido    |
| AREA1-09 | MÉDIO | Alta  | `api/download.js:29-60` (uso único não-atômico)                      | ✅ Corrigido    |
| AREA1-10 | MÉDIO | Alta  | `server.js:115-130`; `api/verify-payment.js:159-182`                 | ⛔/🏗 Ver motivo |
| AREA1-06 | BAIXO | Alta  | `lib/mercadopago-config.js:104-129` (replay `ts`)                    | ⛔ Ver motivo   |
| AREA1-08 | BAIXO | Alta  | `api/create-payment.js:32-43` (rateio de desconto)                   | ✅ Corrigido    |

### Detalhe + correção aplicada

- **AREA1-01 — Fallback de `WEBHOOK_SECRET` → `MERCADOPAGO_ACCESS_TOKEN`.** O HMAC do
  webhook usava o access token quando `WEBHOOK_SECRET` faltava (segredo errado →
  webhooks legítimos rejeitados; segredo crítico exposto logicamente).
  **Fix:** removido o fallback; sem `WEBHOOK_SECRET` a validação é _fail-closed_.

- **AREA1-02 — Bypass da assinatura com `APP_ENV`/`NODE_ENV = 'test'`.** Único gate de
  autenticidade do webhook era desligável por env var comum, aceitando webhooks
  forjados em ambiente exposto. **Fix:** removida a condição `runtimeEnv !== 'test'`;
  assinatura inválida → 401 em qualquer ambiente. Teste de regressão atualizado.

- **AREA1-03 — Corrida cria download tokens DUPLICADOS.** Padrão check-then-create
  não-atômico no webhook e no `verify-payment`; sem `UNIQUE(order_id, product_id)`,
  retries do MP / polling concorrente geravam tokens extras (= downloads extras).
  **Fix:** migration com `UNIQUE(order_id, product_id)` + criação idempotente que
  engole 409/23505 e recarrega o conjunto canônico (nos dois handlers).

- **AREA1-04 — Schema zod morto + `quantity` sem validação.** `processPaymentSchema` só
  roda na rota não usada `/payments/process` e está dessincronizado do payload real;
  o handler processa `quantity` sem clamp e `items` sem teto (N+1/DoS-leve). **Fix:**
  validação no próprio handler (vale no serverless): teto de `items` (≤100), `productId`
  obrigatório (evita produto arbitrário) e `quantity` inteiro em 1..99.

- **AREA1-05 — UPDATE do pedido incondicional.** Reentregas reescreviam `completed_at`
  e re-emitiam o evento `payment_approved`. **Fix:** transição virou **UPDATE
  condicional atômico** (`payment_status=neq.approved`) usado como trava de
  idempotência — só o "vencedor" emite analytics/provisiona conta.

- **AREA1-07 — Corrida no `coupons.used_count`.** Read-modify-write permitia furar
  `max_uses` sob concorrência. **Fix:** função SQL atômica `increment_coupon_usage`
  (respeita `max_uses` no próprio UPDATE) chamada via RPC.

- **AREA1-08 — Desconto de cupom restrito rateado sobre TODOS os itens.** Sem impacto
  financeiro (total certo), mas itens não-elegíveis apareciam com preço reduzido na
  preference do MP. **Fix:** `applyDiscountToItems` passa a ratear só os itens
  elegíveis; os demais mantêm preço cheio.

- **AREA1-09 — Uso único do download token não-atômico.** Check-then-update permitia
  baixar o mesmo token N vezes em corrida (signed URL gerada antes da marcação).
  **Fix:** claim atômico `UPDATE … WHERE used IS false RETURNING`; 0 linhas → 401;
  feito antes de gerar a signed URL (e depois de validar o produto).

### ⛔ / 🏗 Não alterado (de propósito)

- **AREA1-06 (janela de replay do `ts`):** **não** foi adicionada rejeição por
  timestamp. O Mercado Pago reentrega webhooks legítimos **com atraso**; uma janela
  estrita rejeitaria retries válidos. O risco prático de replay já é neutralizado
  pela trava de idempotência (AREA1-05). Reforço opcional: dedup por `x-request-id`.

- **AREA1-10 (rate limiting em produção):** é **infra**, não código de app. Na Vercel o
  `express-rate-limit` não roda; precisaria de rate limiting na borda (middleware
  Vercel + KV/Upstash). Fica registrado como pendência de infra. O oráculo de timing
  do `verify-payment` (evento de segurança `await`-ado só no ramo email-errado) também
  fica pendente — corrigir tornaria a resposta simétrica (registro _fire-and-forget_).

### 🔎 Verificado-OK (hipóteses refutadas)

- **Preço é server-authoritative:** `create-payment.js:73-89` busca `products.price` no
  banco; o client só envia `productId`/`quantity`. **Sem fraude de preço.**
- **`order_code` não é enumerável:** `create-payment.js:135` usa 128 bits de entropia
  (`crypto.randomBytes(16)`) — o hot point de enumeração por prefixo de timestamp está
  **refutado**.
- **Signed URL do Storage limpa:** TTL clampado 60–3600s; service-role key nunca volta
  ao client; `download_url` é admin-controlado (não é entrada do atacante) → sem path
  traversal explorável.
- **Construção/comparação do HMAC correta** (`mercadopago-config.js:117-129`): manifesto
  e `timingSafeEqual` com checagem de comprimento estão certos — o problema era o
  _segredo_ (AREA1-01) e o _replay_ (AREA1-06), não o algoritmo.

### Correção ao próprio review

A afirmação inicial de que `verify-payment` não tinha limiter dedicado estava
**errada**: `routes/api-compat.routes.js:162-169` tem `verifyPaymentLimiter` (60/min) e
`validateCouponLimiter` (20/min). O ponto correto (mais estreito) é que esses limiters
do Express **não rodam no serverless da Vercel** (AREA1-10).

### Arquivos alterados

- `lib/mercadopago-config.js` — AREA1-01
- `api/webhook.js` — AREA1-02, AREA1-03, AREA1-05
- `api/verify-payment.js` — AREA1-03, AREA1-05
- `api/download.js` — AREA1-09
- `api/create-payment.js` — AREA1-04, AREA1-07, AREA1-08
- `api/__tests__/webhook-signature.test.js` — regressão do bypass (AREA1-02)
- `supabase/migrations/20260701000000_phase5_payment_hardening.sql` — **novo** (AREA1-03, AREA1-07)

### ⚠️ Ações pendentes

- **Aplicar a migration:** `npm run supabase:db:push`. Até lá, o `UNIQUE` de
  `download_tokens` e a função `increment_coupon_usage` não existem no banco; o código
  degrada com segurança (incremento vira best-effort, dedup não dispara), mas a
  proteção completa (AREA1-03/AREA1-07) só vale após aplicar.
- **Configurar `WEBHOOK_SECRET`** no ambiente de produção (Vercel) — não está no
  `vercel.json`. Sem ele, com o fix da AREA1-01, todo webhook é rejeitado (fail-closed).
- **Infra (AREA1-10):** avaliar rate limiting na borda para os endpoints de pagamento.

---

## Área 3 — Banco de Dados & RLS (Supabase)

**Data:** 2026-07-01 · **Modo:** review + correção (saiu do read-only a pedido) · **Escopo:** 12 arquivos SQL (`supabase/schema.sql`, `security-hardening.sql`, `seed-sample-data.sql`, 9 migrations) + `lib/supabase.js`, `services/supabase-auth.js`, com consulta a `api/*`, `middleware/*`, `routes/*` para caminhos de exploração.

### Metodologia

Iniciado como review multi-agente (workflow de 4 fases: mapear → revisar 9 dimensões → verificação adversarial → síntese). A orquestração **abortou duas vezes** por _rate-limiting transitório do servidor_ ("Server is temporarily limiting requests — not your usage limit", não limite de conta) — todos os 13 subagentes falharam em ~20s nas duas tentativas. O review foi então **concluído inline**, lendo por inteiro todos os arquivos do escopo e confirmando cada `arquivo:linha` no código atual (inclusive o caminho de autorização que usa `profiles.role`).

**Modelo de acesso (base para todos os achados):** `lib/supabase.js` usa **anon por default**; só o namespace `serviceRoleHelpers` bypassa RLS ([lib/supabase.js:91,192-200](../lib/supabase.js#L91-L200)). Logo, toda tabela cujas policies liberem `anon`/`authenticated` é atacável **direto no PostgREST** com a chave anon pública (embutida no front), sem passar pelo backend.

### Achados

| ID     | Sev.    | Conf. | Local                                                                                                                           | Status                    |
| ------ | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| RLS-01 | CRÍTICO | Alta  | `security-hardening.sql:42-47` (+ `middleware/auth.middleware.js:77`, `api/admin-login.js:234`, `routes/products.routes.js:32`) | ✅ Corrigido              |
| RLS-02 | ALTO    | Alta  | `migrations/…phase2_conversion.sql:84-95`                                                                                       | ✅ Corrigido              |
| RLS-03 | ALTO    | Alta  | `security-hardening.sql:9-18` (fora das migrations)                                                                             | ✅ Corrigido              |
| RLS-04 | MÉDIO   | Alta  | `security-hardening.sql:85-89` + ausência em `purge_old_logs`                                                                   | ✅ Corrigido              |
| RLS-05 | MÉDIO   | Alta  | `handle_new_user` não definida no SQL versionado                                                                                | ✅ Corrigido              |
| RLS-06 | MÉDIO   | Alta  | `admin_audit_log`/`email_subscribers` sem purge; `cleanup_old_email_logs` não agendada                                          | ✅ Corrigido              |
| RLS-07 | MÉDIO   | Alta  | `schema.sql:249-290` (FKs sem índice)                                                                                           | ✅ Corrigido              |
| RLS-08 | MÉDIO   | Média | `schema.sql:78` (`orders.customer_id ON DELETE SET NULL`)                                                                       | ⛔ Camada de app (Área 6) |
| RLS-09 | BAIXO   | Alta  | `purge_old_logs` (24m) × `cleanup_old_analytics_events` (180d)                                                                  | ✅ Corrigido              |
| RLS-10 | BAIXO   | Alta  | `schema.sql` × migrations (constraints/defaults)                                                                                | ✅ Corrigido              |
| RLS-11 | INFO    | Média | `migrations/…phase0_analytics.sql:49-66` (`properties`/`source` livres)                                                         | ⛔ Camada de app          |

### Detalhe + correção aplicada

- **RLS-01 — Cliente se auto-promove a ADMIN via `profiles.role` (escalonamento de privilégio).** A policy `profiles_own_update` só checa `id = auth.uid()` e RLS **não filtra colunas**; não havia `revoke`/trigger. Como `profiles.role` é fonte de autorização (`checkRole` no [middleware/auth.middleware.js:77-86](../middleware/auth.middleware.js#L77-L86), gate do [api/admin-login.js:234](../api/admin-login.js#L234)), um cliente qualquer fazia `PATCH /rest/v1/profiles?id=eq.<uid>` com `{"role":"ADMIN"}` (chave anon + JWT próprio) e passava a ser aceito em `POST /produtos` (`checkRole('ADMIN')`, [routes/products.routes.js:32](../routes/products.routes.js#L32)) — **caminho direto, sem 2FA**. **Fix:** trigger `profiles_guard_privileged_cols` (BEFORE UPDATE, _invoker_ → `current_user`) que preserva `id/email/role/provider` para qualquer papel que não seja `service_role`/DBA; o backend (service-role) segue livre. Adicionado à migration e ao `security-hardening.sql`.

- **RLS-02 — `abandoned_carts` com escrita/edição pública irrestrita.** `abandoned_carts_public_insert (with check(true))` + `abandoned_carts_public_update (using(true) with check(true))` deixavam qualquer `anon` **inserir e sobrescrever qualquer linha** (adulteração cross-user, supressão de e-mails de recuperação, relay de e-mail semeando carrinhos, e possível leitura de PII via `UPDATE … RETURNING`). O backend grava só via service-role ([api/abandoned-cart.js](../api/abandoned-cart.js#L3)); não há escrita direta do front. **Fix:** `drop policy` nas duas → tabela vira service-role only.

- **RLS-03 — RLS das tabelas núcleo morava fora da sequência de migrations.** `enable row level security` + policies de `categories/products/orders/order_items/profiles/user_products/…` só existiam em `security-hardening.sql` (aplicado à mão). Um deploy/DR só-migrations deixaria essas tabelas **sem RLS** → `anon` lê `orders` (e-mail/CPF/telefone) direto no PostgREST. **Fix:** baseline de RLS (enable em 17 tabelas + policies essenciais, já corrigidas) versionado na migration `phase6`; `security-hardening.sql` marcado como espelho.

- **RLS-04 — `page_views` INSERT anônimo `true` + sem retenção.** Permitia forjar `ip/user_agent/path/referrer` (envenenamento de log) e crescer sem limite (nenhum código escreve a tabela hoje). **Fix:** `drop policy page_views_public_insert` (service-role only) + `page_views` incluído no `purge_old_logs()` (6 meses).

- **RLS-05 — `handle_new_user()` referenciada/alterada mas nunca DEFINIDA no versionado.** `security-hardening.sql` fazia `alter function`/`revoke` de algo que o SQL versionado nunca cria, e não havia trigger em `auth.users` → em DB novo, o hardening falha e signups não geram `profiles`. **Fix:** função versionada (corpo documentado: `role='CUSTOMER'`, `SECURITY DEFINER`, `search_path` fixo, `revoke execute`) + criação do trigger `on_auth_user_created` **guardada** (só cria se ainda não houver trigger chamando `handle_new_user` → no-op em prod, cria em DB novo).

- **RLS-06 — Retenção incompleta.** `admin_audit_log` (guarda IP) e `email_subscribers` (PII + _unconfirmed_) sem purge; `cleanup_old_email_logs()` existia mas **nunca era agendada**. **Fix:** `purge_old_logs()` agora inclui `admin_audit_log` (18m); nova `purge_stale_email_subscribers()` (unconfirmed >30d, unsubscribed >90d); jobs `cleanup-email-logs-monthly` e `purge-stale-subscribers-monthly` agendados no pg_cron.

- **RLS-07 — FKs sem índice.** `order_items.product_id`, `download_logs.order_id`, `analytics_events.{order_id,product_id}`, `user_products.{user_id,product_id,order_id}` faziam seq scan em joins e em `ON DELETE` (inclui exclusão de conta LGPD via `user_products.user_id`). **Fix:** 7 `create index if not exists` na migration + no `schema.sql`.

- **RLS-09 — Retenção de `analytics_events` duplicada/conflitante.** `purge_old_logs` (24m, diário) × `cleanup_old_analytics_events` (180d, mensal) — a de 180d dominava, deixando o "24m" letra morta. **Fix:** `purge_old_logs` deixou de tocar `analytics_events`; retenção passa a ser só a de 180d (regra D7), que também alimenta o endpoint `admin-cleanup-events`.

- **RLS-10 — Divergências `schema.sql` × migrations.** Como `schema.sql` roda **antes** das migrations num setup zero, o `create table if not exists` fazia a migration ser pulada — então DBs novos **não recebiam** as CHECKs de `coupons` nem o `NOT NULL` de `abandoned_carts.email`. **Fix:** alinhado `schema.sql` às migrations: `coupons` (`discount_type in ('percent','fixed')`, `discount_value > 0`, `applies_to default '{}'`), `abandoned_carts.email NOT NULL`, e FK indexes de RLS-07.

### ⛔ Não alterado (de propósito)

- **RLS-08 (`orders.customer_id ON DELETE SET NULL` deixa PII órfã):** ao apagar `auth.users`, `orders` mantém `customer_name/email/cpf/phone`. A remoção/anonimização correta pertence ao fluxo de exclusão de conta (`api/me-delete-account.js`, **Área 6**), não a um `CASCADE` cego no banco (que apagaria histórico fiscal/contábil). Registrado para a Área 6 confirmar que a anonimização cobre `orders` e `download_logs`.
- **RLS-11 (`analytics_events.properties`/`source` livres no INSERT anon):** a policy já bloqueia `customer_email`/`order_id` e aplica whitelist de `event_name`; restringir o `jsonb` livre é validação de **camada de app** (`lib/analytics-events.js`), fora do escopo de RLS.

### 🔎 Verificado-OK (hipóteses refutadas)

- **"Client grava PII em `analytics_events`" → REFUTADO.** A policy de INSERT exige `order_id is null AND customer_email is null` + whitelist de `event_name` ([…phase0_analytics.sql:49-66](../supabase/migrations/20260524000000_phase0_analytics.sql#L49-L66)). Bem projetada.
- **"Alguma tabela sensível ficou sem RLS" → REFUTADO.** As 17 tabelas têm RLS habilitado (10 no hardening, 7 nas migrations). O problema era _policies permissivas_ e _onde_ o RLS é ligado (RLS-03), não ausência de RLS.
- **`security_events`/`download_logs`/`download_tokens`/`settings`/`coupons`/`email_*`/`admin_audit_log`** confirmados **service-role only** (RLS ON, zero policy).
- **`user_products`/`orders`/`order_items`** só têm policy de SELECT amarrada a `auth.uid()`/jwt email; escrita é service-role only. Sem caminho de escrita cross-user.

### Arquivos alterados

- `supabase/migrations/20260702000000_phase6_db_rls_hardening.sql` — **novo** (RLS-01 a 07, 09; baseline de RLS-03).
- `supabase/security-hardening.sql` — RLS-01 (trigger), RLS-04 (remove page_views insert), nota de sincronia (RLS-03).
- `supabase/schema.sql` — RLS-07 (índices FK) e RLS-10 (CHECKs de `coupons`, `abandoned_carts.email NOT NULL`, `applies_to '{}'`).

### ⚠️ Ações pendentes

- **Aplicar a migration:** `npm run supabase:db:push` (ou rodar `20260702000000_phase6_db_rls_hardening.sql` no SQL Editor). Até lá, o banco em prod **continua vulnerável** ao RLS-01/02 — priorizar.
- **Confirmar leitura via `UPDATE … RETURNING` sem policy de SELECT (RLS-02):** teste empírico para saber se a exfiltração em massa de `abandoned_carts` se concretizava (a adulteração já estava confirmada). Após o fix isso deixa de importar, mas vale para dimensionar o impacto retroativo/incidente.
- **Config Supabase Auth (RLS-08 correlato):** confirmar que "Confirm email" está **ON** — senão a policy `orders_own_read` por `customer_email = jwt.email` permite reivindicar pedidos de convidado de qualquer e-mail não verificado.
- **Área 6:** validar que `api/me-delete-account.js` anonimiza `orders`/`download_logs` (RLS-08) e revisar `analytics_events.properties` (RLS-11).
- **Após aplicar:** rodar o Security Advisor do Supabase e checar que `purge_old_logs_daily`, `cleanup-analytics-events`, `cleanup-email-logs-monthly` e `purge-stale-subscribers-monthly` aparecem em `cron.job`.

---

<!-- As áreas 2–10 escrevem suas seções abaixo, seguindo o mesmo padrão. -->
