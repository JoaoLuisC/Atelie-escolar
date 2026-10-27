# 08 — Segurança

> Modelo de ameaça, camadas de defesa, RLS, secrets, auditoria, LGPD, pen-test.

> 🔒 **Auditoria de segurança fechada em 2026-05-24** — 16 ações priorizadas (A1–A16) entregues + 6 melhorias extras. Este documento é a **referência viva**; o histórico das auditorias fica no git e em [`docs/reviews/`](../reviews/).

---

## 1. Modelo de ameaça

| Ator                                 | Acesso esperado                                   | Como bloqueamos                                                                                                                |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Visitante anônimo                    | Catálogo público, criar pedido                    | RLS `public read` em `categories`/`products` com `active=true`                                                                 |
| Cliente logado                       | Próprios pedidos, downloads dos próprios produtos | Cookie `customer_session` + handler filtrando `customer_id` = uid da sessão (RLS por `auth.uid()` como defesa em profundidade) |
| Admin                                | Tudo via painel `/admin`                          | Cookie `admin_session` + `service_role` no backend                                                                             |
| Atacante com anon key                | **NADA além do catálogo público**                 | RLS bloqueia; sem policy = sem acesso                                                                                          |
| Atacante com SERVICE_ROLE_KEY vazado | **Acesso total ao banco**                         | NUNCA expor no front; rotação trimestral; alerta em vazamento                                                                  |
| Atacante com webhook spoofado        | —                                                 | HMAC-SHA256 valida assinatura; falha = 401 + log                                                                               |
| Atacante enumerando `order_code`     | —                                                 | 128 bits de entropia + email obrigatório + rate-limit + resposta uniforme                                                      |

---

## 2. Camadas de defesa

### 2.1 Network / Headers

Configurado em `lib/security-headers.js`, montado por `lib/express-app.js` (o mesmo app em dev, via `server.js`, e na função `api/index.js` de produção):

- `helmet()` — CSP **estrita explícita** (script-src whitelist GA4/Meta/MP), HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff. Em produção (Vercel), headers equivalentes também são aplicados pela rota `/(.*)` do `vercel.json`, igualmente com `X-Frame-Options: DENY` e `frame-ancestors 'none'`.
- `cors()` — allowlist explícita em prod (`CORS_ORIGINS`); permissivo só para `localhost:*` em dev
- `express-rate-limit` de borda — 250 req / 15 min em `/api` (`RATE_LIMIT_MAX`), **só no Express de desenvolvimento**. Não é a política: a política é `enforceRateLimit` no handler, com contador no Postgres, válida nos dois ambientes (regra E1 / [ADR 0007](../adr/0007-um-mecanismo-de-rate-limit.md))
- **HTTPS obrigatório em produção:** o build da Vercel **falha** (`scripts/check-env.js`, chamado pelo `buildCommand` do `vercel.json`) se `APP_URL` não começar com `https://`. O `server.js` local repete a checagem no boot quando `APP_ENV=production`. Cookies `Secure` dependem disso.

### 2.2 Rate limits específicos

Um mecanismo só: `enforceRateLimit` **dentro do handler**, com contador atômico no Postgres
(`rpc/rate_limit_hit`). Os limiters de `express-rate-limit` que existiam por rota foram removidos em
`f5b43da` — eles não rodavam em produção e desenhavam uma segunda política que mentia. Ver
[ADR 0007](../adr/0007-um-mecanismo-de-rate-limit.md).

| Endpoint                         | Balde                         | Limite                        | Indisponível |
| -------------------------------- | ----------------------------- | ----------------------------- | ------------ |
| `/auth/customer/login`           | `customer-login` (IP+conta)   | 5 / 10 min                    | **recusa**   |
| ⤷ teto por conexão               | `customer-login-scan` (IP)    | 20 contas distintas / 10 min  | **recusa**   |
| `/auth/customer/register`        | `customer-register`           | 5 / 10 min                    | **recusa**   |
| `/auth/customer/google/start`    | `customer-google-start`       | 20 / 10 min                   | passa        |
| `/auth/customer/google/callback` | `customer-google-callback`    | 20 / 10 min                   | passa        |
| `/admin/login` (senha)           | `admin-login`                 | 5 / 10 min                    | passa        |
| `/admin/login` (2º fator)        | `admin-login-2fa` (IP+conta)  | 5 / 10 min                    | **recusa**   |
| `/verify-payment`                | `verify-payment` (por pedido) | 600 / 10 min                  | passa        |
| ⤷ teto por conexão               | `verify-payment-scan` (IP)    | 40 pedidos distintos / 10 min | passa        |
| `/download`                      | `download` (por token)        | 20 / 10 min                   | passa        |
| ⤷ teto por conexão               | `download-scan` (IP)          | 30 tokens distintos / 10 min  | passa        |
| `/create-payment`                | `create-payment`              | 20 / min                      | passa        |
| `/track-event`                   | `track-event`                 | 120 / min                     | passa        |
| `/validate-coupon`               | `validate-coupon`             | 20 / min                      | passa        |
| ⤷ com `quote: true` (cotação)    | `catalog`                     | 120 / min                     | passa        |
| `/abandoned-cart`                | `abandoned-cart`              | 30 / min                      | passa        |
| `/subscribe`                     | `subscribe`                   | 5 / min                       | passa        |
| `/unsubscribe`                   | `unsubscribe`                 | 20 / min                      | passa        |
| `/confirm-subscription`          | `confirm-subscription`        | 20 / min                      | passa        |
| `/send-confirmation-email`       | `send-confirmation-email`     | 5 / 10 min                    | passa        |
| `/me-delete-account`             | `me-delete-account`           | 5 / min                       | passa        |
| `/me-export-data`                | `me-export-data`              | 5 / 5 min                     | passa        |
| `/admin/settings` (reaut. 2FA)   | `admin-settings-2fa`          | 5 / 10 min                    | passa        |
| catálogo público                 | `catalog`                     | 120 / min                     | passa        |

> Valores conferidos contra `lib/rate-limit.js` em 01/09/2026; em 16/10/2026 entraram
> `me-export-data`, o gate `admin-settings-2fa` (declarado em `handlers/admin/settings.js`) e a
> cotação do `/validate-coupon`. A tabela anterior citava
> `/verify-payment 60/min` e um `/auth/* 30/15min` que não existem — eram do desenho de
> `express-rate-limit`, removido em `f5b43da`.

Sobra **um** limiter de borda genérico (`/api`, 250 / 15 min) apenas no `server.js` local: rede
contra loop acidental de script, declarado no código como não sendo política.

**Coluna "Indisponível"** — o que acontece quando o contador no Postgres não responde. O default é
_passar_ (fail-open): a mesma queda já derrubaria o endpoint adiante, e trancar o `/admin/login`
deixaria a dona fora do painel durante um incidente. Os baldes marcados **recusa** (`failMode:
'closed'`, resposta **503 SERVICE_UNAVAILABLE**) são a exceção deliberada: eles guardam verificação
de credencial contra serviços que continuam de pé sem o contador — `customerLogin`/`customerRegister`
falam com o **GoTrue**, e o anti-replay do TOTP é ele próprio uma chamada de `rate_limit_hit`. Nos
dois modos o evento `rate_limit_unavailable` é emitido.

> **Cuidado ao mexer na montagem das rotas.** Entre `660fe74` e `244226c` os cinco endpoints de auth
> de cliente rodaram **sem contador nenhum**: `routes/auth.routes.js` importava a lógica crua de
> `lib/customer-auth-handlers` em vez dos módulos de `handlers/auth/customer/**`, que são os que
> carregam `enforceRateLimit`. Os testes passavam porque liam o arquivo no disco, não o que estava
> montado. Hoje `routes/__tests__/api-route-parity.test.js` compara **identidade de módulo** e
> `handlers/__tests__/rate-limit-coverage.test.js` parte do conjunto **montado**.

### 2.3 Autenticação

- **Cookies HttpOnly** — `customer_session` e `admin_session`. JavaScript não acessa.
- **SameSite=Strict** em ambos os cookies (CSRF mitigation). Além disso, escritas admin e logouts exigem request **same-origin** (`isSameOriginRequest` checa `Origin`/`Referer` contra allowlist; sem os dois headers → bloqueia, fail-closed).
- **HMAC-SHA256** com secrets de 32 bytes (rotacionáveis; `lib/env-secret.js` é fail-closed — fora de dev/test, secret ausente faz a requisição falhar em vez de cair em fallback; o deploy é barrado antes, no build, por `scripts/check-env.js`).
- **TTL 8h** em ambos cookies, sem renovação e **sem revogação individual** — o único jeito de derrubar sessões é rotacionar o secret (ver §11.2).
- **CORS** — `CORS_ORIGINS` é obrigatório fora de `development`/`test`: sem ele o boot falha, em vez de herdar o default de dev (que aceita qualquer `localhost` **com credenciais**). Origem fora da allowlist não recebe os headers e segue para o handler, onde a guarda de origem responde 403 — nunca 500.
- **Senhas** — mín 8 chars (server) + maiúscula + minúscula + dígito (client; o Supabase Auth rejeita senha fraca, mapeada para mensagem amigável — defense in depth).
- **2FA opcional para admin** — TOTP com janela ±1 step + PIN de recuperação; challenge token HMAC com **TTL de 120s** (`FACTOR_CHALLENGE_TTL_SECONDS`), reemitido quando expira, com binding de IP e e-mail e consumo único; código TOTP também é de uso único (anti-replay via `rate_limit_hit` com `p_limit=1`).
- **Código por e-mail (opcional, `allowEmailCode`)** — 6 dígitos (CSPRNG) enviados ao e-mail do admin. O código **não é armazenado**: vai selado no desafio como `HMAC(nonce + código)` com o segredo de sessão, então só confere com aquele desafio e herda o uso único dele. O desafio com código por e-mail vale **10 min**; chutes e reenvios contam no balde do 2º fator (5 / 10 min). Nunca é o único método: sem TOTP ou PIN ao lado ele não entra na lista (`extractSecondFactorMethods`), e o painel recusa gravar a combinação. Não serve para a reautenticação da aba Segurança (lá não há desafio onde o código esteja selado). E-mail que não sai vira o evento `admin_2fa_email_failed` e o desafio sai sem selo.
- **Segredos de 2FA em repouso** (`lib/admin-2fa.js`) — `totpSecret` é **cifrado** com AES-256-GCM (chave em `ADMIN_2FA_ENC_KEY`); ele não pode ser hasheado porque o servidor precisa dele para recalcular o HMAC de cada janela. `fallbackPin` é **hasheado** com scrypt + sal, porque só é comparado. Nenhum dos dois é devolvido no GET nem aparece no audit log, e a conferência é timing-safe. Leitura aceita o formato antigo em texto puro; qualquer salvamento no painel migra.

- **Papéis na sessão de staff** (`lib/admin-session.js`) — o cookie `admin_session` carrega `role` e `userId`. `ensureAdminSession` aceita admin/master; `ensureRoleSession(req, res, ['seller'])` guarda `/api/teacher/*`. O professor só toca produtos com `seller_id` = o próprio `userId` (filtro no handler, porque a escrita é com service role). A professora **dona da loja** (`settings.storeOwner`) recebe `storeOwner: true` no cookie assinado e passa em `ensureStoreSession` (painel da loja: pedidos, clientes, produtos); Usuários, Segurança e gestão de professores seguem em `ensureAdminSession`. A marca só vem do login, então forjá-la exige o segredo de sessão. Dentro do painel da loja, os dados vêm recortados pelo servidor para a professora (`lib/seller-scope.js`): pedidos, clientes e produtos só dos materiais dela. O 2º fator ainda não é cobrado do professor — nem da dona da loja, que vê pedidos e clientes: 2FA por conta é pendência (13-ROADMAP, checklist F). O professor também entra com Google (`handlers/admin/login-google.js`): o token é conferido no Supabase e só o perfil `SELLER` recebe o cookie — admin/master são barrados (403) para o Google não pular o 2º fator. A volta do Google do professor usa o marcador `?oauth=staff`, que o fluxo do cliente ignora, para o mesmo `code` não abrir também uma sessão de cliente.

### 2.4 Autorização (RLS no Postgres)

18 tabelas, todas com RLS habilitado (baseline das 17 primeiras versionado na migration `20260702000000_phase6_db_rls_hardening.sql`, espelhado em `supabase/security-hardening.sql`; `rate_limit_hit` nasce com RLS na `20260813000000_rate_limit.sql`). Resumo (detalhes em [04-BANCO-DE-DADOS §RLS](./04-BANCO-DE-DADOS.md)):

| Tabela                                 | Quem lê                                     | Quem escreve                                                                             |
| -------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `categories`                           | anon + auth (active=true)                   | service_role                                                                             |
| `products`                             | anon + auth (active=true)                   | service_role                                                                             |
| `orders`                               | auth (próprios: `customer_id = auth.uid()`) | service_role                                                                             |
| `order_items`                          | auth (via parent order)                     | service_role                                                                             |
| `profiles`                             | auth (próprio)                              | auth (linha própria; `id`/`email`/`role`/`provider` travados por trigger) + service_role |
| `user_products`                        | auth (próprios)                             | service_role                                                                             |
| `download_tokens`                      | —                                           | service_role                                                                             |
| `download_logs`                        | —                                           | service_role                                                                             |
| `security_events`                      | —                                           | service_role                                                                             |
| `settings`                             | —                                           | service_role                                                                             |
| `coupons`                              | —                                           | service_role                                                                             |
| `abandoned_carts`                      | —                                           | service_role                                                                             |
| `email_subscribers` / `email_sent_log` | —                                           | service_role                                                                             |
| `admin_audit_log`                      | —                                           | service_role, só INSERT (append-only: UPDATE/DELETE bloqueados até para service_role)    |
| `analytics_events`                     | —                                           | service_role (INSERT público removido — W1-04; o front grava via `/api/track-event`)     |
| `page_views`                           | —                                           | service_role (INSERT público removido — RLS-04)                                          |
| `rate_limit_hit`                       | —                                           | service_role (só via função `rate_limit_hit()`)                                          |

**Princípio**: `service_role` bypassa RLS, então o **backend pode tudo**. Browser usando anon key fica restrito ao que está nas policies.

### 2.5 Funções com `SECURITY DEFINER`

```sql
alter function public.set_updated_at()  set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;

-- Não podem ser executadas diretamente pela API pública
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

As demais funções privilegiadas — `purge_old_logs()`, `cleanup_old_analytics_events()`, `cleanup_old_email_logs()`, `purge_stale_email_subscribers()`, `cleanup_old_abandoned_carts()`, `increment_coupon_usage()`, `rate_limit_hit()`, `purge_old_rate_limit_hits()`, `product_sales_counts()`, `find_profile_id_by_email()`, `release_stale_coupon_reservations()` e a trigger fn `reclaim_coupon_on_approval()` (estas duas últimas ⚠️ pendentes em produção) — já nascem nas migrations como `SECURITY DEFINER` com `set search_path = public, pg_temp` **e** `revoke execute` de `public/anon/authenticated`. `increment_coupon_usage`, `rate_limit_hit`, `purge_old_rate_limit_hits`, `product_sales_counts`, `find_profile_id_by_email` e `release_stale_coupon_reservations` têm `EXECUTE` concedido só a `service_role`. Lista com o que cada uma faz em [04-BANCO-DE-DADOS §Triggers e funções](./04-BANCO-DE-DADOS.md).

### 2.6 Privilege escalation bloqueado em `profiles`

RLS sozinho não impede um cliente autenticado de fazer `UPDATE profiles SET role='ADMIN' WHERE id=auth.uid()` — a policy `profiles_own_update` libera a linha mas não as colunas. Por isso usamos um trigger guard (RLS-01, `supabase/security-hardening.sql` / migration phase6):

```sql
create trigger profiles_guard_privileged_cols
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_cols();
-- A função (invoker) preserva OLD.id/email/role/provider quando
-- current_user não é service_role/postgres/supabase_admin.
```

Resultado: `role`, `email`, `provider`, `id` só podem ser modificados via `service_role` (backend); o cliente só consegue alterar o próprio `display_name`. Cliente não consegue se promover.

### 2.7 `auth.users.instance_id` em projetos hospedados

Em projeto Supabase single-tenant, `auth.users.instance_id` deve sempre ser `00000000-0000-0000-0000-000000000000`. Inserir usuário direto via SQL (sem usar Auth API ou trigger) deixa esse campo NULL e o GoTrue **passa a ignorar** o usuário em `listUsers`/recover/login.

Se acontecer:

```sql
update auth.users
set instance_id = '00000000-0000-0000-0000-000000000000'
where instance_id is null;
```

### 2.8 Validação de input com Zod

Schemas em `validation/`:

- `common.schemas.js` — primitivos de borda (`uuid`, `email`, `quantity` inteira 1–99, preço de prévia etc.)
- `payment.schemas.js` — `createPaymentSchema` (`items` 1–100 com `productId` UUID obrigatório, `customer` com tetos de nome/e-mail/telefone/CPF, `couponCode`), `validateCouponSchema` e `verifyPaymentSchema`
- `admin.schemas.js` — CRUD do painel (categorias, cupons, produtos, pedidos, usuários); `productCreateSchema` valida só `name` e `price`

Aplicados **dentro do handler**, nunca em middleware: `parseOrFail` (`validation/index.js`) em `create-payment`, `validate-coupon` e `verify-payment`; `parse` nos handlers de `handlers/admin/`.

```js
const parsed = parseOrFail(res, createPaymentSchema, req.body || {});
if (!parsed.ok) return;
```

Em `handlers/create-payment.js` o schema garante `productId` obrigatório, quantidade inteira 1–99 e máx. 100 itens (anti-DoS); o **preço sempre vem do banco** (nunca do client). A atribuição passa por `lib/attribution-sanitize.js` (whitelist de 9 campos, strings clipadas a 200 chars).

> ⚠️ **Pendência — URLs de produto sem validação de esquema.** Nenhum schema nem handler restringe
> `images`, `videos` ou `download_url` a `http(s)://` hoje: o admin grava a string aparada como veio
> (`handlers/admin/products.js`). Um `javascript:` ou `data:` cadastrado no painel não é barrado no
> servidor. (`download_url` só é **entregue** se for do Storage — ver §6 —, mas isso não valida o
> que é gravado.)

---

## 3. Dados sensíveis nunca expostos

| Dado                                 | Onde está                          | Cliente acessa?                                                               |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`          | `.env` backend / Vercel Production | ❌                                                                            |
| `MERCADOPAGO_ACCESS_TOKEN`           | idem                               | ❌                                                                            |
| `WEBHOOK_SECRET`                     | idem                               | ❌                                                                            |
| `ADMIN_SESSION_SECRET`               | idem                               | ❌                                                                            |
| `CUSTOMER_SESSION_SECRET`            | idem                               | ❌                                                                            |
| `ADMIN_2FA_ENC_KEY`                  | idem                               | ❌                                                                            |
| `CRON_SECRET`                        | idem                               | ❌                                                                            |
| `RESEND_API_KEY` (via SMTP_PASS)     | idem                               | ❌                                                                            |
| `settings.adminConfig.totpSecret`    | tabela `settings`                  | ❌ (RLS service-only; redigido no GET e no audit log)                         |
| `settings.adminConfig.fallbackPin`   | tabela `settings`                  | ❌ (RLS service-only; redigido no GET e no audit log; comparação timing-safe) |
| `VITE_SUPABASE_ANON_KEY`             | `.env` frontend                    | ✅ (por design, pública)                                                      |
| `VITE_SUPABASE_URL`                  | `.env` frontend                    | ✅ (por design, pública)                                                      |
| `VITE_GA4_ID` / `VITE_META_PIXEL_ID` | `.env` frontend                    | ✅ (por design, públicas)                                                     |

---

## 4. Webhook do Mercado Pago

Toda requisição em `/api/webhook` é validada via HMAC:

```js
const manifest = `id:${paymentId};request-id:${xRequestId};ts:${timestamp};`;
const expectedHash = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(manifest)
  .digest('hex');

if (!timingSafeEqual(hash, expectedHash)) {
  await recordSecurityEvent({ eventName: 'webhook_invalid_signature', ... });
  return res.status(401).json({ error: 'Invalid signature' });
}
```

Sem assinatura válida → 401 + evento em `security_events`.

A validação é **fail-closed**: sem `WEBHOOK_SECRET` configurado, toda requisição é rejeitada (nunca reutiliza o `MERCADOPAGO_ACCESS_TOKEN` como chave HMAC).

---

## 5. E-mail transacional (Resend)

Dois sistemas de envio separados, ambos via Resend:

**a) E-mails do Supabase Auth** (signup confirm, reset de senha, magic link) — configurado no nível do projeto via Management API ou Dashboard:

```
smtp_host       = smtp.resend.com
smtp_port       = 465
smtp_user       = resend
smtp_pass       = <RESEND_API_KEY>
smtp_admin_email= <onboarding@resend.dev OU pedidos@seudominio.com.br>
```

Rate limits relevantes: `rate_limit_email_sent=30/h` (Supabase) + limites do Resend (100/dia free).

**b) E-mails transacionais do app** (confirmação de compra, abandoned cart, newsletter, sequência pós-compra, reativação) — `handlers/send-confirmation-email.js` + `handlers/cron-email-jobs.js` usam nodemailer com `SMTP_HOST/PORT/USER/PASS/FROM` em `.env.local`.

**Modo sandbox vs domínio verificado:**

- Sem verificar domínio no Resend ([resend.com/domains](https://resend.com/domains)): só entrega para o e-mail dono da conta Resend (uso dev).
- Com domínio verificado (SPF + DKIM + DMARC nos DNS): entrega para qualquer destinatário; usar `pedidos@seudominio.com.br` como `from`.

---

## 6. Download tokens (proteção dos arquivos)

- Gerados pelo backend após pagamento aprovado (`crypto.randomBytes(32)` em hex — token opaco de 256 bits)
- Salvos em `download_tokens` com `expires_at` (TTL 72h); UNIQUE `(order_id, product_id)` torna a criação idempotente em webhooks reentregues
- URL pública: `/api/download?token=XYZ`
- Backend valida: token existe + não expirou + não usado
- **Uso único atômico**: o claim `used=false → true` é feito no próprio UPDATE condicionado; requisições concorrentes ou repetidas recebem 401 "Token já utilizado"
- **Reemissão de link gasto**: para pedido aprovado, o `/api/verify-payment` (order_code + e-mail) troca o token usado ou expirado por um novo na mesma linha (`used=false`, mais 72h), até 5 downloads por item contados em `download_logs`. O token antigo continua queimado
- Loga em `download_logs` (IP + user agent + timestamp; best-effort — falha no log não impede a entrega)
- Gera signed URL temporária do Supabase Storage (5 min; não expõe URL direta), só para os buckets `product_images`/`product_videos`/`product_files` e sem travessia de path. `download_url` externo (Drive etc.) é **recusado**: 500 + evento `download_url_not_storage`, sem consumir o token
- Resposta inclui `Referrer-Policy: no-referrer` + `Cache-Control: no-store` antes do redirect — token não vaza no `Referer` para destino externo

---

## 7. Verify-payment exige email (anti enumeração)

`/api/verify-payment` exige `orderId` **e** `email` (LGPD: defesa contra enumeração).

- `order_code` tem 128 bits de entropia (`crypto.randomBytes(16).toString('hex')`)
- Comparação do email usa `crypto.timingSafeEqual` para não vazar diferenças por tempo
- Resposta **uniforme** `404 "Pedido não encontrado"` em ambos os casos (order não existe vs email não bate)
- Rate-limit em dois baldes: 600 / 10 min por pedido (cobre o polling) e 40 pedidos distintos / 10 min por IP (anti-enumeração) — ver §2.2
- Em mismatch, gera `security_events.verify_payment_email_mismatch`

---

## 8. Retenção de logs (LGPD princípio da minimização)

A função `public.purge_old_logs()` nasceu na migration [`20260526100000_phase2_log_retention.sql`](../../supabase/migrations/20260526100000_phase2_log_retention.sql); a versão final está na [`20260702000000_phase6_db_rls_hardening.sql`](../../supabase/migrations/20260702000000_phase6_db_rls_hardening.sql):

| Tabela                                                         | Retenção | Purga por                                                           |
| -------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `download_logs`                                                | 12 meses | `purge_old_logs()` — cobre auditoria de fraude e disputas           |
| `security_events`                                              | 6 meses  | `purge_old_logs()` — suficiente para investigar incidentes recentes |
| `page_views`                                                   | 6 meses  | `purge_old_logs()`                                                  |
| `admin_audit_log`                                              | 18 meses | `purge_old_logs()`                                                  |
| `analytics_events`                                             | 180 dias | `cleanup_old_analytics_events()` (regra D7), job mensal             |
| `email_sent_log`                                               | 90 dias  | `cleanup_old_email_logs()`, job mensal                              |
| `email_subscribers` (não confirmados >30d / desinscritos >90d) | —        | `purge_stale_email_subscribers()`, job mensal                       |
| `abandoned_carts` (não recuperados)                            | 90 dias  | `cleanup_old_abandoned_carts()`, job mensal                         |
| `rate_limit_hit`                                               | 24 h     | `purge_old_rate_limit_hits()`, job de hora em hora                  |

Jobs `pg_cron`: `purge_old_logs_daily` (diário 03:00 UTC), `cleanup-analytics-events` (mensal), `cleanup-email-logs-monthly` (mensal), `purge-stale-subscribers-monthly` (mensal), `cleanup-abandoned-carts-monthly` (mensal, dia 1 às 03:20 UTC) e `purge-rate-limit-hits-hourly` (`20 * * * *`). Fora da retenção, `release-stale-coupon-reservations` (a cada 15 min) devolve usos de cupom parados — aplicada em 26/10/2026. Se `pg_cron` não estiver habilitado no Supabase (`create extension pg_cron;`), a migration cai num `notice` e o purge precisa ser rodado manualmente:

```sql
select public.purge_old_logs();
```

---

## 9. Monitoramento de tentativas de fraude

Eventos passam por `lib/security-logger.js` que escreve em **três** destinos:

1. **stdout estruturado JSON** (`{ level, event, severity, ip, ... }`) — Vercel/Supabase captura.
2. **Tabela `public.security_events`** (RLS service-role only) — queryable via SQL no Supabase. (A aba **Segurança** do admin só configura o 2FA — não existe endpoint/tela que liste esses eventos.)
3. **`SECURITY_ALERT_WEBHOOK_URL`** (env opcional) — POST JSON pra Slack/Discord/Sentry. Em branco → pula.

### Eventos emitidos hoje

| `event_name`                         | Origem                                               | Severidade | Quando dispara                                                                                     |
| ------------------------------------ | ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `webhook_invalid_signature`          | `handlers/webhook.js`                                | warn       | HMAC do MP não bate (ou header ausente)                                                            |
| `admin_login_failed`                 | `handlers/admin/login.js`                            | warn       | Credencial inválida **ou** conta sem role `admin`/`master` (resposta HTTP idêntica nos dois casos) |
| `verify_payment_email_mismatch`      | `handlers/verify-payment.js`                         | warn       | Order existe mas email não bate                                                                    |
| `account_self_deleted`               | `handlers/me-delete-account.js`                      | info       | Exclusão de conta LGPD confirmada pelo cliente                                                     |
| `admin_audit_write_failed`           | `lib/admin-audit.js`                                 | error      | Insert no `admin_audit_log` falhou (para não passar silencioso)                                    |
| `rate_limit_exceeded`                | `lib/rate-limit.js`                                  | warn       | Algum balde estourou (429); alerta limitado a um por balde por minuto, por instância               |
| `rate_limit_unavailable`             | `lib/rate-limit.js`                                  | error      | O contador no Postgres não respondeu (fail-open ou fail-closed, conforme o balde)                  |
| `admin_2fa_email_failed`             | `handlers/admin/login.js`                            | warn       | Código por e-mail não pôde ser enviado (o login segue pelos outros métodos)                        |
| `admin_2fa_failed`                   | `handlers/admin/login.js`                            | warn       | Código de 2º fator inválido                                                                        |
| `admin_2fa_code_replayed`            | `handlers/admin/login.js`                            | error      | Código TOTP já usado (anti-replay)                                                                 |
| `admin_2fa_challenge_replayed`       | `handlers/admin/login.js`                            | error      | Challenge token de 2º fator reutilizado                                                            |
| `admin_2fa_replay_guard_degraded`    | `handlers/admin/login.js`                            | error      | Marca de uso único do 2FA indisponível no Postgres (fail-open)                                     |
| `admin_2fa_settings_reauth_failed`   | `handlers/admin/settings.js`                         | error      | Reautenticação com o 2º fator falhou ao mudar campos de segurança                                  |
| `payment_amount_mismatch`            | `handlers/webhook.js` / `handlers/verify-payment.js` | error      | Valor pago no MP não bate com o pedido; o pedido fica `pending`                                    |
| `download_url_not_storage`           | `handlers/download.js`                               | error      | Produto com `download_url` fora do Storage (entrega recusada)                                      |
| `storage_bucket_unexpectedly_public` | `handlers/admin/upload-url.js`                       | error      | Bucket que deveria ser privado está público                                                        |
| `customer_data_exported`             | `handlers/me-export-data.js`                         | info       | Titular exportou os próprios dados (sem PII no evento)                                             |
| `account_deletion_anonymize_failed`  | `handlers/me-delete-account.js`                      | error      | Anonimização dos pedidos falhou durante a exclusão de conta                                        |

Email do usuário **nunca** é gravado em claro — só `sha256(email).slice(0, 16)` para correlação cross-event sem violar LGPD.

---

## 10. LGPD / Privacidade

### Princípios aplicados

- **Finalidade declarada** — Política de Privacidade em `/privacidade`
- **Minimização** — coletamos nome + email no checkout. CPF apenas se necessário para nota futura. Endereço não coletado (produto digital, regra H6)
- **Consentimento informado** — banner com Aceitar / Rejeitar / Personalizar (`ConsentBanner.jsx`)
- **Direito de oposição** — link de descadastro 1-clique em todo e-mail de marketing (+ headers RFC 8058 `List-Unsubscribe`)
- **Direito de exclusão** — self-service via `/api/me-delete-account` (2 passos: solicitação autenticada por cookie → confirmação por link no e-mail com token HMAC de 1h). Exclui o usuário do Supabase Auth, anonimiza o PII dos pedidos (histórico fiscal preservado), apaga tokens de download e carrinhos abandonados, limpa e-mails legados em `analytics_events` e desinscreve da newsletter
- **Direito de acesso/portabilidade** — `GET /api/me-export-data` devolve o dossiê do titular (pedidos, newsletter, carrinhos), autenticado pelo cookie `customer_session`, com `Cache-Control: no-store`
- **Retenção limitada** — logs purgam automaticamente
- **Transferência internacional** — Supabase em região `sa-east-1`, Resend em US — disclosed nos termos

### Dados pessoais que tratamos

- Email (PII)
- Nome (PII)
- CPF (opcional)
- IP + user agent (uso operacional, auditoria, segurança)
- Histórico de compra (PII transacional)
- UTM/attribution (não PII)

### Não tratamos

- Endereço físico
- Telefone
- Dados de cartão (passam direto para Mercado Pago, não tocamos)
- Dados sensíveis (saúde, etnia, religião, etc.)

### Em logs

- Email aparece como `sha256(email).slice(0, 16)` em `security_events`
- IP fica em claro nos logs (necessário para mitigação de ataques)
- User agent fica em claro

### Banner de consentimento

- Bloqueia GA4 e Meta Pixel até consentimento
- Eventos essenciais (carrinho, checkout, `purchase`) podem rodar como `first-party only` sem consent
- Estado em `localStorage` via `src/utils/consent.js`

---

## 11. Auditoria periódica

### 11.1 Security Advisor do Supabase

```bash
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/check-advisor.js
```

Deve retornar **0 CRITICAL**. Os INFO "RLS Enabled No Policy" em `settings`, `download_tokens`, `download_logs`, `security_events`, `page_views`, `coupons`, `abandoned_carts`, `email_*`, `admin_audit_log`, `analytics_events`, `rate_limit_hit` são **intencionais** (apenas service role acessa).

### 11.2 Rotação de secrets

**Cadência mínima: trimestral.** Marcar no calendário do administrador (Q1 jan, Q2 abr, Q3 jul, Q4 out).

Secrets a rotacionar (todos no `.env.local` + Vercel):

| Secret                      | Impacto da rotação                                    | Ação extra                                          |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `ADMIN_SESSION_SECRET`      | Logout forçado de admins                              | Avisar a equipe                                     |
| `CUSTOMER_SESSION_SECRET`   | Logout forçado de clientes                            | Sem ação                                            |
| `ADMIN_2FA_ENC_KEY`         | Invalida o `totpSecret` cifrado em `settings`         | Recadastrar o 2FA no painel logo após o redeploy    |
| `WEBHOOK_SECRET`            | Precisa sincronizar com painel MP                     | Atualizar no painel MP **antes** do redeploy        |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role muda — rotacionar via dashboard Supabase | Atualizar Vercel imediatamente                      |
| `MERCADOPAGO_ACCESS_TOKEN`  | Pagamentos param se desincronizar                     | Gerar novo no painel MP **antes** de atualizar prod |
| `CRON_SECRET`               | Workflow falha 401 até atualizar                      | Sincronizar GitHub Secrets                          |

Passo a passo:

1. Gere novo secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Para `WEBHOOK_SECRET` e `MERCADOPAGO_ACCESS_TOKEN`: gere/copie do painel MP primeiro.
3. Atualize `.env.local` (dev) e Vercel (prod) — em prod, atualize **Production** e **Preview** separadamente.
4. Redeploy em produção.
5. Verifique: webhook MP entrega 200, login admin funciona, criação de pedido funciona.

Em caso de incidente (segredo vazado): rotacione tudo na hora, mesmo fora do trimestre.

### 11.2.1 Pendência aberta — credenciais no histórico do git

Um arquivo de handoff versionado no `main` chegou a conter dois PATs do Supabase
(`sbp_…`) e as senhas do admin e das contas de teste. Os valores foram redigidos do arquivo e o
arquivo foi removido, mas **continuam recuperáveis no histórico** — remover o arquivo não remove
os commits anteriores.

Nesta ordem, e a ordem importa:

1. **Revogar** os PATs em https://supabase.com/dashboard/account/tokens e **trocar** a senha do
   admin e das contas de teste.
2. Só então expurgar o histórico (`git filter-repo --replace-text`) e forçar re-clone.

Expurgar sem rotacionar apenas avisa quem já tem o dado de que ele valia a pena. Enquanto o
passo 1 não estiver feito, trate esses segredos como comprometidos.

### 11.3 Pen-test focado (TODO externo)

**Próxima janela:** prévia a cada release maior (mínimo anual).

Escopo mínimo recomendado:

- Enumeração de `order_code` em `/verify-payment` (com e sem email)
- IDOR em `/api/admin/*` (cookie de cliente tentando acessar endpoints de admin)
- CSRF em endpoints POST que dependem só de cookie (`/auth/customer/login`, `/admin-login`)
- Injeção em campos de produto (nome, descrição) → XSS armazenado
- Bypass de RLS pelo cliente usando o anon key publicado
- Replay de webhook MP (assinatura válida + body antigo)

Resultados ficam em arquivo cifrado fora do repositório.

### 11.4 Atualização de dependências

```bash
npm audit
npm outdated
```

- Patch crítico → atualizar imediatamente
- Minor → mensal
- Major → planejado

---

## 12. Checklist pré-produção

Antes de cada release maior:

- [ ] Todos os secrets em `.env.local` foram gerados (não cópias do `.env.example`)
- [ ] `MERCADOPAGO_ACCESS_TOKEN` é de PRODUÇÃO (`APP_USR-...` não `TEST-...`)
- [ ] `CORS_ORIGINS` lista exatamente os domínios de produção
- [ ] `APP_URL` é `https://...` (não localhost)
- [ ] `APP_ENV=production` (o runtime usa `APP_ENV || NODE_ENV`)
- [ ] Security Advisor: 0 CRITICAL
- [ ] 2FA habilitado para conta admin
- [ ] Backup do banco testado (Supabase Pro)
- [ ] Webhook MP configurado com URL pública HTTPS
- [ ] Email SMTP funcionando: reset de senha **e** confirmação de compra (teste manual)
- [ ] Domínio verificado no Resend (SPF + DKIM + DMARC) — sem isso, só entrega no email da conta Resend
- [ ] `smtp_admin_email` e `SMTP_FROM` apontam para domínio verificado (não `onboarding@resend.dev`)
- [ ] Plano HIBP avaliado (Supabase Pro feature; sem isso, política de senha atual mitiga)
- [ ] Conferir `auth.users.instance_id` não-NULL em todos os usuários (§2.7)
- [ ] Logs de retenção rodando (verificar `cron.job` ativo)
- [ ] Lighthouse Performance ≥ 90 mobile, SEO ≥ 95 (regra F1)
- [ ] Migrations aplicadas (validações em [04-BANCO-DE-DADOS §validação](./04-BANCO-DE-DADOS.md))

---

## 13. Resumo rápido (poster do dev)

```
✅ HttpOnly cookies + HMAC-SHA256 + SameSite=Strict + same-origin em escritas
✅ RLS em TODAS as 18 tabelas
✅ Service role NUNCA no frontend
✅ CSP estrita + HSTS + frame-ancestors 'none' + X-Frame-Options: DENY
✅ Rate-limit em todo endpoint público (contador no Postgres, vale em produção — ADR 0007)
✅ Webhook MP com HMAC fail-closed + idempotência
✅ Download token de uso único (claim atômico) + TTL 72h + signed URL Supabase (só Storage) + Referrer-Policy
✅ Senha: 8+ chars (server) + upper, lower, digit (client + Supabase Auth)
✅ 2FA admin opcional (TOTP + PIN)
✅ Email mascarado em logs (sha256.slice(0,16))
✅ Logs com retenção: 12m (download), 180d (analytics), 6m (security/page views), 18m (audit), 90d (carrinhos, e-mail log), 24h (rate limit)
✅ Audit log de admin append-only (nem service_role altera/apaga)
✅ Exclusão de conta LGPD self-service em 2 passos
✅ Banner LGPD bloqueando GA4/Pixel sem consent
✅ Privilege escalation bloqueado por trigger guard de colunas em profiles
✅ Privilege definer functions com search_path fixo + revoke execute

🔁 Rotação de secrets: trimestral
🎯 Pen-test: anual (mínimo)
📅 Audit Security Advisor: a cada release
```
