# 04 — Banco de dados

> Schema Postgres no Supabase, tabelas, relacionamentos, RLS, migrations.

---

## Visão geral

- **Engine:** Postgres (Supabase managed); dev local usa Postgres 17 (`supabase/config.toml`, `major_version = 17`)
- **Schemas:** `public` (app) + `auth` (Supabase Auth) + `storage` (Supabase Storage)
- **RLS:** ativado em **todas** as 18 tabelas do app
- **Service role:** bypassa RLS (usada apenas pelo backend); browser nunca tem service role
- **Anon key:** respeita RLS; só acessa o que as policies permitem
- **Extensões:** `pgcrypto` (gen_random_uuid), `unaccent` (slugify), `pg_cron` (purges agendados)

Arquivos:

- [`supabase/schema.sql`](../../supabase/schema.sql) — DDL canônico (14 tabelas; as 4 restantes — `email_subscribers`, `email_sent_log`, `admin_audit_log` e `rate_limit_hit` — nascem em migrations)
- [`supabase/security-hardening.sql`](../../supabase/security-hardening.sql) — RLS + policies + funções + grants (espelho fora da sequência de migrations)
- [`supabase/seed-sample-data.sql`](../../supabase/seed-sample-data.sql) — dados de exemplo
- [`supabase/migrations/`](../../supabase/migrations/) — 21 migrations versionadas
- [`supabase/config.toml`](../../supabase/config.toml) — config do Supabase CLI/local

---

## Tabelas (18)

### `categories`

Categorização de produtos. Acesso público read-only quando `active=true`.

| Coluna        | Tipo        | Notas                           |
| ------------- | ----------- | ------------------------------- |
| `id`          | uuid PK     |                                 |
| `name`        | text        |                                 |
| `slug`        | text uniq   | Usado em URLs                   |
| `color`       | text        | Hex para badge na vitrine       |
| `active`      | boolean     | Falso esconde da home           |
| `featured`    | boolean     | Aparece na vitrine principal    |
| `badge_label` | text        | Selo do tipo "Novo", "Promoção" |
| `sort_order`  | int         | Ordem na home                   |
| `created_at`  | timestamptz |                                 |
| `updated_at`  | timestamptz | Trigger `set_updated_at`        |

### `products`

Catálogo. Núcleo do app. Acesso público read-only quando `active=true`.

| Coluna           | Tipo                   | Notas                                                                                                                                                                                                                         |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid PK                |                                                                                                                                                                                                                               |
| `name`           | text                   |                                                                                                                                                                                                                               |
| `slug`           | text uniq              | URL canônica + trigger auto-gerador (`products_ensure_slug`)                                                                                                                                                                  |
| `category_id`    | uuid FK → `categories` | ON DELETE SET NULL                                                                                                                                                                                                            |
| `description`    | text                   | Markdown / texto rico                                                                                                                                                                                                         |
| `price`          | numeric(12,2)          | Preço atual                                                                                                                                                                                                                   |
| `original_price` | numeric(12,2)          | Preço "de" — opcional para mostrar desconto                                                                                                                                                                                   |
| `image_url`      | text                   | Imagem primária (compat)                                                                                                                                                                                                      |
| `images`         | jsonb                  | Array de URLs (galeria)                                                                                                                                                                                                       |
| `videos`         | jsonb                  | Array de URLs (YouTube/Vimeo embed)                                                                                                                                                                                           |
| `download_url`   | text                   | Path no Supabase Storage (`<bucket>/<path>` ou URL `…/storage/v1/object/…`, bucket na allowlist), que vira signed URL de 5 min. URL externa (Drive) é recusada: 500 + evento `download_url_not_storage`, sem consumir o token |
| `tags`           | jsonb                  | Para busca / filtros futuros                                                                                                                                                                                                  |
| `product_type`   | text                   | `individual` \| `kit`                                                                                                                                                                                                         |
| `is_kit`         | boolean                | Flag de kit                                                                                                                                                                                                                   |
| `kit_items`      | jsonb                  | Itens que compõem o kit                                                                                                                                                                                                       |
| `panel_sizes`    | jsonb                  | Tamanhos de painel disponíveis                                                                                                                                                                                                |
| `page_size`      | text                   | `A4`, `A3`, etc                                                                                                                                                                                                               |
| `paper_type`     | text                   | Sugestão de impressão                                                                                                                                                                                                         |
| `active`         | boolean                | Falso esconde do catálogo                                                                                                                                                                                                     |
| `featured`       | boolean                | Destaque na home                                                                                                                                                                                                              |
| `faq`            | jsonb                  | `[{ question, answer }]`                                                                                                                                                                                                      |
| `reviews`        | jsonb                  | `[{ author, role, location, text, rating }]`                                                                                                                                                                                  |
| `seller_id`      | uuid FK → `profiles`   | Professor dono do produto (`ON DELETE RESTRICT`, índice `products_seller_id_idx`). NULL só no catálogo legado ainda não atribuído — migration `20261026000001`                                                                |
| `benefits`       | jsonb                  | `[{ icon, label }]`                                                                                                                                                                                                           |
| `created_at`     | timestamptz            |                                                                                                                                                                                                                               |
| `updated_at`     | timestamptz            | Trigger `set_updated_at`                                                                                                                                                                                                      |

> `faq`, `reviews` e `benefits` são editáveis pelo admin via `ProductWizard` (aba Produtos) — ver [07-DASHBOARD-ADMIN](./07-DASHBOARD-ADMIN.md).

### `orders`

Pedidos. Acesso restrito ao próprio cliente (via `customer_id = auth.uid()`; o claim `email` do JWT foi removido na wave1) ou admin (via service_role).

| Coluna                                                                      | Tipo                            | Notas                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                        | uuid PK                         |                                                                                                                                                |
| `order_code`                                                                | text uniq                       | `ORD-<timestamp>-<hex>` com 128 bits de entropia (`crypto.randomBytes(16).toString('hex')`) — usado como `external_reference` no MP            |
| `customer_id`                                                               | uuid FK → `auth.users` nullable | ON DELETE SET NULL; pode ser convidado (anônimo + email)                                                                                       |
| `customer_email`                                                            | text                            | Sempre presente                                                                                                                                |
| `customer_name`                                                             | text                            |                                                                                                                                                |
| `customer_cpf`                                                              | text nullable                   | Para emissão de nota futuramente                                                                                                               |
| `customer_phone`                                                            | text nullable                   |                                                                                                                                                |
| `total_amount`                                                              | numeric(12,2)                   |                                                                                                                                                |
| `status`                                                                    | text                            | `pending` → `completed` (aprovado) ou `failed` (rejeitado/cancelado), setado por webhook/verify-payment; admin pode ajustar via painel         |
| `payment_status`                                                            | text                            | `pending` \| `approved` \| `rejected` \| `cancelled` (gravados pelo webhook); demais estados do MP (`refunded` etc.) via admin                 |
| `payment_provider`                                                          | text                            | `mercadopago` (default)                                                                                                                        |
| `payment_id`                                                                | text                            | ID do pagamento no MP                                                                                                                          |
| `preference_id`                                                             | text                            | ID da preference no MP                                                                                                                         |
| `mercadopago_preference_id` / `mercadopago_payment_id` / `mercadopago_data` | text / text / jsonb             | Colunas legadas — código atual usa `preference_id`/`payment_id`                                                                                |
| `download_tokens`                                                           | jsonb                           | Legado — tokens vivem na tabela `download_tokens`                                                                                              |
| `metadata`                                                                  | jsonb                           | Legado                                                                                                                                         |
| `coupon_code`                                                               | text nullable                   |                                                                                                                                                |
| `discount_amount`                                                           | numeric(12,2)                   |                                                                                                                                                |
| `coupon_released_at`                                                        | timestamptz nullable            | Quando o uso do cupom reservado foi devolvido (pedido não pago); NULL = uso ainda contado. Migration `20261008000000` (aplicada em 26/10/2026) |
| `attribution_data`                                                          | jsonb                           | UTM + referrer + sessão                                                                                                                        |
| `created_at`                                                                | timestamptz                     |                                                                                                                                                |
| `updated_at`                                                                | timestamptz                     | Trigger `set_updated_at`                                                                                                                       |
| `completed_at`                                                              | timestamptz nullable            | Setado quando `approved`                                                                                                                       |

### `order_items`

Itens do pedido.

| Coluna         | Tipo                 | Notas                                                 |
| -------------- | -------------------- | ----------------------------------------------------- |
| `id`           | uuid PK              |                                                       |
| `order_id`     | uuid FK → `orders`   | ON DELETE CASCADE                                     |
| `product_id`   | uuid FK → `products` | ON DELETE RESTRICT (impede excluir produto com venda) |
| `product_name` | text                 | Snapshot do nome no momento da compra                 |
| `unit_price`   | numeric(12,2)        | Snapshot                                              |
| `quantity`     | int                  |                                                       |
| `total_price`  | numeric(12,2)        | `unit_price * quantity`                               |
| `created_at`   | timestamptz          |                                                       |

### `profiles`

Perfil de usuário Supabase Auth. Criado por trigger `handle_new_user` quando alguém se registra.

| Coluna         | Tipo                      | Notas                                                                                                                                                                      |
| -------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid PK FK → `auth.users` | ON DELETE CASCADE                                                                                                                                                          |
| `email`        | text uniq                 | Espelho de `auth.users.email`                                                                                                                                              |
| `display_name` | text                      | Editável pelo cliente (única coluna que ele consegue alterar de fato)                                                                                                      |
| `role`         | text                      | `CUSTOMER` \| `SELLER` \| `ADMIN` \| `MASTER` (CHECK `check_valid_role`, versionada na `20261008000001` — aplicada em 26/10/2026). O painel só atribui `CUSTOMER`/`SELLER` |
| `provider`     | text                      | `email` \| `google`                                                                                                                                                        |
| `created_at`   | timestamptz               |                                                                                                                                                                            |
| `updated_at`   | timestamptz               |                                                                                                                                                                            |

> 🔒 **Privilege escalation bloqueado:** o trigger `profiles_guard_privileged_cols` preserva `id/email/role/provider` do valor antigo quando quem grava não é service_role — impede cliente de fazer `UPDATE profiles SET role='ADMIN'`. Ver [08-SEGURANCA §2.6](./08-SEGURANCA.md).

### `user_products`

Vinculação usuário ↔ produto comprado. 1 row por (usuário, produto, pedido).

| Coluna         | Tipo                   | Notas              |
| -------------- | ---------------------- | ------------------ |
| `id`           | uuid PK                |                    |
| `user_id`      | uuid FK → `auth.users` | ON DELETE CASCADE  |
| `product_id`   | uuid FK → `products`   | ON DELETE CASCADE  |
| `order_id`     | uuid FK → `orders`     | ON DELETE SET NULL |
| `purchased_at` | timestamptz            |                    |

### `download_tokens`

Tokens efêmeros de download. Acesso apenas via service_role.

| Coluna         | Tipo                 | Notas                                                                                                                                             |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`        | text PK              | 256 bits hex (`crypto.randomBytes(32)`)                                                                                                           |
| `order_id`     | uuid FK → `orders`   | ON DELETE CASCADE; UNIQUE `(order_id, product_id)` — idempotente a webhooks reentregues                                                           |
| `product_id`   | uuid FK → `products` | ON DELETE CASCADE                                                                                                                                 |
| `product_name` | text                 | Snapshot                                                                                                                                          |
| `used`         | boolean              | `true` após o download (claim atômico via UPDATE condicional). O `verify-payment` pode reemitir a linha com token novo (até 5 downloads por item) |
| `used_at`      | timestamptz nullable |                                                                                                                                                   |
| `expires_at`   | timestamptz          | TTL de 72h a partir da emissão (aprovação ou reemissão)                                                                                           |
| `created_at`   | timestamptz          |                                                                                                                                                   |

### `download_logs`

Auditoria de downloads. Retenção 12 meses (LGPD).

| Coluna          | Tipo                 | Notas              |
| --------------- | -------------------- | ------------------ |
| `id`            | uuid PK              |                    |
| `order_id`      | uuid FK → `orders`   | ON DELETE SET NULL |
| `product_id`    | uuid FK → `products` | ON DELETE SET NULL |
| `token`         | text                 | snapshot           |
| `ip_address`    | text                 |                    |
| `user_agent`    | text                 |                    |
| `downloaded_at` | timestamptz          |                    |

### `analytics_events`

Eventos do funil. RLS sem policies (service-only): o INSERT público foi removido na wave1 (W1-04). O front posta em `/api/track-event`, que valida a whitelist de [`lib/analytics-events.js`](../../lib/analytics-events.js) e grava com service role. Retenção 180 dias.

| Coluna           | Tipo               | Notas                                                                                                                                                                                                                                                           |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | bigint identity PK |                                                                                                                                                                                                                                                                 |
| `event_name`     | text               | Cliente (via `/api/track-event`): `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `view_catalog`, `begin_checkout`, `client_error`; backend: `checkout_initiated`, `payment_approved`, `payment_rejected`, `payment_cancelled`, `webhook_received` |
| `session_id`     | text               | UUID gerado client-side                                                                                                                                                                                                                                         |
| `customer_email` | text nullable      | Legado — nenhum código grava mais (`recordEvent` não recebe e-mail); linhas antigas são zeradas na exclusão de conta                                                                                                                                            |
| `order_id`       | uuid nullable FK   | ON DELETE SET NULL                                                                                                                                                                                                                                              |
| `product_id`     | uuid nullable FK   | ON DELETE SET NULL                                                                                                                                                                                                                                              |
| `properties`     | jsonb              | UTM, referrer, valor, etc (sanitizado, sem PII)                                                                                                                                                                                                                 |
| `source`         | text               | `web` \| `server` \| `webhook`                                                                                                                                                                                                                                  |
| `created_at`     | timestamptz        |                                                                                                                                                                                                                                                                 |

### `security_events`

Eventos de segurança. RLS service-only (cliente não consegue ler nem escrever). Retenção 6 meses.

| Coluna       | Tipo               | Notas                                                                                                                                   |
| ------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | bigint identity PK |                                                                                                                                         |
| `event_name` | text               | Ex.: `webhook_invalid_signature`, `admin_login_failed`, `rate_limit_exceeded`… — lista completa em [08-SEGURANCA §9](./08-SEGURANCA.md) |
| `severity`   | text               | `info` \| `warn` \| `error` (default `warn`)                                                                                            |
| `ip`         | text               |                                                                                                                                         |
| `user_agent` | text               |                                                                                                                                         |
| `request_id` | text               |                                                                                                                                         |
| `properties` | jsonb              |                                                                                                                                         |
| `created_at` | timestamptz        |                                                                                                                                         |

### `page_views`

Page views via tracker básico. RLS sem policies — o INSERT público foi removido no hardening (RLS-04) e hoje nenhum código grava nela. Retenção 6 meses.

| Coluna       | Tipo        | Notas |
| ------------ | ----------- | ----- |
| `id`         | uuid PK     |       |
| `path`       | text        |       |
| `ip_address` | text        |       |
| `user_agent` | text        |       |
| `referrer`   | text        |       |
| `viewed_at`  | timestamptz |       |

### `coupons`

Cupons. RLS service-only.

| Coluna             | Tipo                   | Notas                                                                                                                                                                                                                              |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | bigint identity PK     |                                                                                                                                                                                                                                    |
| `code`             | text uniq              | Case-insensitive na validação                                                                                                                                                                                                      |
| `discount_type`    | text                   | `percent` \| `fixed` (CHECK)                                                                                                                                                                                                       |
| `discount_value`   | numeric(12,2)          | 15 = 15% ou R$ 15 (CHECK > 0)                                                                                                                                                                                                      |
| `valid_from`       | timestamptz nullable   |                                                                                                                                                                                                                                    |
| `valid_until`      | timestamptz nullable   |                                                                                                                                                                                                                                    |
| `max_uses`         | int nullable           | NULL = ilimitado                                                                                                                                                                                                                   |
| `used_count`       | int                    | Reservado no checkout via `increment_coupon_usage()` (atômico); devolvido por `release_stale_coupon_reservations()` após 2h sem pagamento e recontado pelo trigger se o pagamento chegar depois (devolução aplicada em 26/10/2026) |
| `applies_to`       | jsonb                  | `{ category_ids: [...], product_ids: [...] }` — vazio = qualquer                                                                                                                                                                   |
| `min_order_amount` | numeric(12,2) nullable |                                                                                                                                                                                                                                    |
| `active`           | boolean                |                                                                                                                                                                                                                                    |
| `created_at`       | timestamptz            |                                                                                                                                                                                                                                    |
| `updated_at`       | timestamptz            | Trigger `set_updated_at`                                                                                                                                                                                                           |

> CRUD de cupons no admin: aba **Cupons** (`CouponWizard` + `/api/admin/coupons`). Validação no checkout via `/api/validate-coupon` (prévia) e revalidação no `create-payment`.

### `abandoned_carts`

Carrinhos abandonados. Capturado quando email é fornecido no checkout mas pagamento não confirma; lembretes em ~1h e ~24h via cron.

| Coluna             | Tipo                 | Notas                                                                    |
| ------------------ | -------------------- | ------------------------------------------------------------------------ |
| `id`               | bigint identity PK   |                                                                          |
| `email`            | text                 | UNIQUE `(lower(email), coalesce(session_id,''))`                         |
| `session_id`       | text nullable        |                                                                          |
| `items`            | jsonb                | Snapshot dos itens                                                       |
| `total_amount`     | numeric(12,2)        |                                                                          |
| `attribution_data` | jsonb                |                                                                          |
| `reminder_sent_at` | timestamptz nullable | Setado pelo cron                                                         |
| `recovered_at`     | timestamptz nullable | Reservada — nenhum fluxo grava hoje; o cron só a lê para pular lembretes |
| `created_at`       | timestamptz          |                                                                          |
| `updated_at`       | timestamptz          | Trigger `set_updated_at`                                                 |

### `email_subscribers` + `email_sent_log`

Newsletter com double opt-in, 1-click unsubscribe e log de envios (criadas pela migration phase3).

`email_subscribers`:

| Coluna                      | Tipo                 | Notas                                                      |
| --------------------------- | -------------------- | ---------------------------------------------------------- |
| `id`                        | bigint identity PK   |                                                            |
| `email`                     | text                 | UNIQUE em `lower(email)`                                   |
| `confirmed`                 | boolean              | Double opt-in                                              |
| `confirmation_token`        | text uniq            | Para link no e-mail                                        |
| `confirmation_sent_at`      | timestamptz          |                                                            |
| `confirmed_at`              | timestamptz nullable |                                                            |
| `unsubscribe_token`         | text uniq            | Estável — vai em todos os e-mails (1-click unsubscribe)    |
| `unsubscribed_at`           | timestamptz nullable |                                                            |
| `source`                    | text                 | Origem (`footer`, `checkout`, `admin`, etc)                |
| `attribution_data`          | jsonb                |                                                            |
| `tags`                      | jsonb                | Segmentação computada (cliente_ativo, vip, inativo_*, etc) |
| `tags_updated_at`           | timestamptz nullable | Atualizado pelo cron de segmentação                        |
| `created_at` / `updated_at` | timestamptz          |                                                            |

`email_sent_log` (idempotência dos e-mails automáticos; retenção 90 dias):

| Coluna       | Tipo                 | Notas                                                                                           |
| ------------ | -------------------- | ----------------------------------------------------------------------------------------------- |
| `id`         | bigint identity PK   |                                                                                                 |
| `email`      | text                 | UNIQUE `(lower(email), kind, coalesce(entity_id,''))`                                           |
| `kind`       | text                 | `abandoned_cart_1h`, `abandoned_cart_24h`, `post_purchase_d3/d15/d45`, `reactivation_90d`, etc. |
| `entity_id`  | text nullable        | Ex.: id do carrinho / pedido                                                                    |
| `status`     | text                 | `queued` \| `sent` \| `failed` \| `skipped` (CHECK)                                             |
| `error`      | text nullable        |                                                                                                 |
| `sent_at`    | timestamptz nullable |                                                                                                 |
| `created_at` | timestamptz          |                                                                                                 |

### `admin_audit_log`

Auditoria de escrita do painel admin (criada pela migration phase4). **Append-only**: UPDATE/DELETE bloqueados por REVOKE + triggers, inclusive para service_role. Retenção 18 meses.

| Coluna             | Tipo               | Notas                                                                                                           |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `id`               | bigint identity PK |                                                                                                                 |
| `admin_id`         | text               | E-mail do admin da sessão (fallback e default `'admin'`)                                                        |
| `action`           | text               | `create` \| `update` \| `patch` \| `delete`                                                                     |
| `target_type`      | text               | `product` \| `category` \| `coupon` \| `order` \| `user` \| `setting` \| `analytics_events` \| `storage_object` |
| `target_id`        | text nullable      |                                                                                                                 |
| `before` / `after` | jsonb              | Snapshot (settings sensíveis passam por redação)                                                                |
| `ip`               | text nullable      |                                                                                                                 |
| `created_at`       | timestamptz        |                                                                                                                 |

### `settings`

Configurações chave-valor JSON. Service-only.

| Coluna          | Tipo        | Notas                                                           |
| --------------- | ----------- | --------------------------------------------------------------- |
| `setting_key`   | text PK     | `adminConfig`, `homeSections`, `homeContent`, `productDefaults` |
| `setting_value` | jsonb       |                                                                 |
| `updated_at`    | timestamptz |                                                                 |

`adminConfig` guarda `totpSecret` (cifrado com AES-256-GCM, chave `ADMIN_2FA_ENC_KEY`) e `fallbackPin` (hash scrypt com sal) — a API nunca os devolve no GET, a conferência é timing-safe e valores legados em texto claro migram no próximo salvamento —, além de preferências do admin. `homeSections` guarda as seções da vitrine da home.

### `rate_limit_hit`

Contador de rate limit. É o que faz a regra E1 valer **em produção**: as funções serverless da
Vercel não compartilham memória, então o contador mora no único estado que todas enxergam — o
Postgres. Janela fixa, uma linha por `(bucket, identificador, janela)`. Service-only.

| Coluna         | Tipo            | Notas                                                                                                                                   |
| -------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `bucket`       | text PK¹        | Nome do limite: `admin-login`, `validate-coupon`, `download`, …                                                                         |
| `identifier`   | text PK¹        | IP resolvido na borda, ou `IP\|hash` do escopo (sha256 truncado do e-mail de login, `order_code` ou token de download — nunca em claro) |
| `window_start` | timestamptz PK¹ | Início da janela                                                                                                                        |
| `count`        | integer         | Acessos na janela                                                                                                                       |
| `updated_at`   | timestamptz     |                                                                                                                                         |

¹ PK composta `(bucket, identifier, window_start)`.

Escrita só pela função `rate_limit_hit()` (`SECURITY DEFINER`, `EXECUTE` só para `service_role`),
que faz `insert … on conflict do update` atômico. Chamada por `enforceRateLimit` em
[`lib/rate-limit.js`](../../lib/rate-limit.js). Ver [ADR 0007](../adr/0007-um-mecanismo-de-rate-limit.md).

Retenção 24h via `purge_old_rate_limit_hits()` (pg_cron de hora em hora, `20 * * * *`).

---

## Relacionamentos

```
auth.users (1) ─── (0..1) profiles          [id é PK+FK]
auth.users (1) ─── (0..n) orders.customer_id
auth.users (1) ─── (0..n) user_products

categories (1) ─── (0..n) products
products   (1) ─── (0..n) order_items      [RESTRICT delete]
products   (1) ─── (0..n) user_products
products   (1) ─── (0..n) download_tokens
products   (1) ─── (0..n) download_logs

orders     (1) ─── (1..n) order_items      [CASCADE delete]
orders     (1) ─── (0..n) download_tokens
orders     (1) ─── (0..n) download_logs
orders     (1) ─── (0..n) user_products
```

`coupons`, `abandoned_carts`, `email_subscribers`, `email_sent_log`, `admin_audit_log`, `analytics_events`, `security_events`, `page_views`, `settings`, `rate_limit_hit` não têm FKs duras entre si — vivem isoladas (`analytics_events` tem FKs opcionais para `orders`/`products` com SET NULL).

---

## Resumo de policies (RLS)

| Tabela              | Quem lê (SELECT)                                                                     | Quem escreve (INSERT/UPDATE)                                                                  |
| ------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `categories`        | anon + auth (active=true)                                                            | service_role                                                                                  |
| `products`          | anon + auth (active=true)                                                            | service_role                                                                                  |
| `orders`            | auth (próprios via `customer_id = auth.uid()`; o claim `email` do JWT saiu na wave1) | service_role                                                                                  |
| `order_items`       | auth (via FK ao parent order)                                                        | service_role                                                                                  |
| `profiles`          | auth (próprio via `id = auth.uid()`)                                                 | auth (UPDATE próprio; `id/email/role/provider` travados por trigger) + service_role           |
| `user_products`     | auth (próprios)                                                                      | service_role                                                                                  |
| `download_tokens`   | —                                                                                    | service_role                                                                                  |
| `download_logs`     | —                                                                                    | service_role                                                                                  |
| `analytics_events`  | —                                                                                    | service_role (INSERT público removido na wave1, W1-04 — o front grava via `/api/track-event`) |
| `security_events`   | —                                                                                    | service_role                                                                                  |
| `page_views`        | —                                                                                    | service_role (INSERT público removido no hardening)                                           |
| `coupons`           | —                                                                                    | service_role                                                                                  |
| `abandoned_carts`   | —                                                                                    | service_role (INSERT/UPDATE públicos removidos no hardening)                                  |
| `email_subscribers` | —                                                                                    | service_role                                                                                  |
| `email_sent_log`    | —                                                                                    | service_role                                                                                  |
| `admin_audit_log`   | —                                                                                    | service_role (só INSERT; UPDATE/DELETE bloqueados até para service_role)                      |
| `settings`          | —                                                                                    | service_role                                                                                  |
| `rate_limit_hit`    | —                                                                                    | service_role (só via função `rate_limit_hit()`)                                               |

**Princípio**: o backend (com service_role) pode tudo. O browser (com anon key) só vê o que está liberado em policy. Quando uma tabela é "service-role only", clientes nunca acessam direto — só via API que valida e age em nome deles.

Detalhes em [08-SEGURANCA §2.4](./08-SEGURANCA.md).

---

## Triggers e funções

### `handle_new_user()` (SECURITY DEFINER)

Trigger em `auth.users` AFTER INSERT (versionado na migration phase6, criado condicionalmente). Cria `profiles` com `role='CUSTOMER'`, `display_name` do `raw_user_meta_data` e `provider` do `raw_app_meta_data`, com `on conflict (id) do nothing`.

```sql
alter function public.handle_new_user() set search_path = public, pg_temp;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

### `set_updated_at()`

Trigger BEFORE UPDATE em 8 tabelas (`categories`, `products`, `orders`, `profiles`, `settings`, `coupons`, `abandoned_carts`, `email_subscribers`) para manter `updated_at` em sync.

### `slugify(text)` + `products_ensure_slug()` (migration phase1)

Trigger BEFORE INSERT/UPDATE em `products` que gera slug a partir do nome quando o campo está vazio (lower + `unaccent` + regex). Garante unicidade adicionando sufixo numérico se necessário.

### `profiles_guard_privileged_cols()` (security-hardening / phase6)

Trigger BEFORE UPDATE em `profiles`: se quem grava não é `service_role`/`postgres`, preserva `id/email/role/provider` do valor antigo. Complementa a RLS (que não filtra colunas).

### `reclaim_coupon_on_approval()` (SECURITY DEFINER, migration `20261008000000` — aplicada em 26/10/2026)

Trigger `orders_reclaim_coupon_on_approval`, BEFORE UPDATE OF `payment_status` em `orders`: quando um pedido cujo uso de cupom já foi devolvido (`coupon_released_at` preenchido) vira `approved`, volta a contar o uso em `coupons.used_count` e limpa a marca. Cobre o pagamento que chega depois da devolução (Pix pago tarde). Não respeita `max_uses`, de propósito — o pagamento com desconto já foi capturado.

### `purge_old_logs()` (SECURITY DEFINER)

Função idempotente (versão final na phase6) que deleta:

- `download_logs` > 12 meses
- `security_events` > 6 meses
- `page_views` > 6 meses
- `admin_audit_log` > 18 meses

(`analytics_events` saiu desta função — tem cleanup próprio.) Agendada via `pg_cron` diariamente às 03:00 UTC.

### Demais funções (as de cleanup são SECURITY DEFINER com EXECUTE revogado de public/anon/authenticated)

| Função                                  | O que faz                                                                                                                                         | Agendamento                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `cleanup_old_analytics_events()`        | Apaga `analytics_events` > 180 dias                                                                                                               | mensal (`0 3 1 * *`)           |
| `cleanup_old_email_logs()`              | Apaga `email_sent_log` > 90 dias                                                                                                                  | mensal (`15 3 1 * *`)          |
| `purge_stale_email_subscribers()`       | Apaga subscribers não confirmados > 30d ou descadastrados > 90d                                                                                   | mensal (`30 3 1 * *`)          |
| `prevent_admin_audit_mutation()`        | Trigger fn comum (sem SECURITY DEFINER): `raise exception` em UPDATE/DELETE de `admin_audit_log`                                                  | —                              |
| `increment_coupon_usage(bigint)`        | UPDATE atômico de `coupons.used_count` respeitando `max_uses`; EXECUTE só para service_role                                                       | —                              |
| `cleanup_old_abandoned_carts()`         | Apaga `abandoned_carts` não recuperados com `updated_at` > 90 dias                                                                                | mensal (`20 3 1 * *`)          |
| `rate_limit_hit(text,text,int,int)`     | Incremento atômico do contador de rate limit (janela fixa); EXECUTE só para service_role                                                          | —                              |
| `purge_old_rate_limit_hits()`           | Apaga janelas de `rate_limit_hit` com mais de 24h; EXECUTE só para service_role                                                                   | de hora em hora (`20 * * * *`) |
| `product_sales_counts(timestamptz,int)` | Soma vendida por produto em pedidos aprovados ("mais vendidos"); EXECUTE só para service_role                                                     | —                              |
| `find_profile_id_by_email(text)`        | Busca `profiles.id` por `lower(email)` (usa `profiles_lower_email_idx`); EXECUTE só para service_role                                             | —                              |
| `release_stale_coupon_reservations()`   | Devolve o uso de cupom de pedidos não aprovados com mais de 2h (marca `coupon_released_at`); EXECUTE só para service_role. Aplicada em 26/10/2026 | a cada 15 min (`*/15 * * * *`) |

---

## Migrations (23 arquivos)

Aplicar em ordem. Pode-se rodar tudo de uma vez via `npm run supabase:db:push`.

| Arquivo                                                                                                                              | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`20260524000000_phase0_analytics.sql`](../../supabase/migrations/20260524000000_phase0_analytics.sql)                               | Cria `analytics_events` (com INSERT público restrito a whitelist) + adiciona `orders.attribution_data`                                                                                                                                                                                                                                                                                                                                      |
| [`20260525000000_phase1_product_slugs.sql`](../../supabase/migrations/20260525000000_phase1_product_slugs.sql)                       | Extensão `unaccent`, função `slugify()`, `products.slug` com backfill + triggers `products_ensure_slug_*`                                                                                                                                                                                                                                                                                                                                   |
| [`20260526000000_phase2_conversion.sql`](../../supabase/migrations/20260526000000_phase2_conversion.sql)                             | Cria `coupons` + `abandoned_carts` + adiciona `products.{faq,reviews,benefits}` + `orders.{coupon_code,discount_amount}`                                                                                                                                                                                                                                                                                                                    |
| [`20260526100000_phase2_log_retention.sql`](../../supabase/migrations/20260526100000_phase2_log_retention.sql)                       | Cria função `purge_old_logs()` (v1)                                                                                                                                                                                                                                                                                                                                                                                                         |
| [`20260526110000_phase2_security_events.sql`](../../supabase/migrations/20260526110000_phase2_security_events.sql)                   | Cria `security_events` (RLS service-only) + `purge_old_logs()` v2                                                                                                                                                                                                                                                                                                                                                                           |
| [`20260526120000_phase2_enable_pg_cron.sql`](../../supabase/migrations/20260526120000_phase2_enable_pg_cron.sql)                     | Habilita extension `pg_cron` + agenda `purge_old_logs_daily` (03:00 UTC)                                                                                                                                                                                                                                                                                                                                                                    |
| [`20260527000000_phase0_analytics_retention.sql`](../../supabase/migrations/20260527000000_phase0_analytics_retention.sql)           | Cria `cleanup_old_analytics_events()` (180 dias) + job mensal                                                                                                                                                                                                                                                                                                                                                                               |
| [`20260528000000_phase3_email_marketing.sql`](../../supabase/migrations/20260528000000_phase3_email_marketing.sql)                   | Cria `email_subscribers` + `email_sent_log` + `cleanup_old_email_logs()`                                                                                                                                                                                                                                                                                                                                                                    |
| [`20260530000000_phase4_admin_audit_log.sql`](../../supabase/migrations/20260530000000_phase4_admin_audit_log.sql)                   | Cria `admin_audit_log` (RLS service-only)                                                                                                                                                                                                                                                                                                                                                                                                   |
| [`20260701000000_phase5_audit_immutability.sql`](../../supabase/migrations/20260701000000_phase5_audit_immutability.sql)             | Torna `admin_audit_log` append-only (REVOKE + triggers)                                                                                                                                                                                                                                                                                                                                                                                     |
| [`20260701000001_phase5_payment_hardening.sql`](../../supabase/migrations/20260701000001_phase5_payment_hardening.sql)               | Dedup + UNIQUE `(order_id, product_id)` em `download_tokens` + `increment_coupon_usage()`                                                                                                                                                                                                                                                                                                                                                   |
| [`20260702000000_phase6_db_rls_hardening.sql`](../../supabase/migrations/20260702000000_phase6_db_rls_hardening.sql)                 | Baseline RLS nas 17 tabelas, trigger guard de `profiles`, remove escrita pública de `abandoned_carts`/`page_views`, versiona `handle_new_user()`, índices de FK, `purge_old_logs()` v3, `purge_stale_email_subscribers()` + jobs mensais                                                                                                                                                                                                    |
| [`20260703000000_perf_indexes.sql`](../../supabase/migrations/20260703000000_perf_indexes.sql)                                       | 5 índices de performance para painel/cron (`orders`, `email_sent_log`, `abandoned_carts`)                                                                                                                                                                                                                                                                                                                                                   |
| [`20260812000000_security_hardening_wave1.sql`](../../supabase/migrations/20260812000000_security_hardening_wave1.sql)               | Wave 1 do hardening de 12/08: revoga `products.download_url` do `anon` (RLS filtra linha, não coluna), reancora as policies de `orders`/`order_items` em `customer_id = auth.uid()` no lugar do claim `email`; normaliza `orders.customer_email` para minúsculas (W1-03); remove o INSERT anônimo em `analytics_events` (W1-04 — o front grava só via `/api/track-event`); fixa o `search_path` de `prevent_admin_audit_mutation()` (W1-05) |
| [`20260813000000_rate_limit.sql`](../../supabase/migrations/20260813000000_rate_limit.sql)                                           | Cria `rate_limit_hit` + função `rate_limit_hit()` — o rate limit que vale em produção ([ADR 0007](../adr/0007-um-mecanismo-de-rate-limit.md))                                                                                                                                                                                                                                                                                               |
| [`20260813000001_best_sellers_aggregate.sql`](../../supabase/migrations/20260813000001_best_sellers_aggregate.sql)                   | Função de agregação de mais-vendidos no banco: `/api/products`, `/home-sections` e `/cross-sell` deixam de baixar `orders`+`order_items` inteiras a cada hit                                                                                                                                                                                                                                                                                |
| [`20260813000002_orders_customer_id_index.sql`](../../supabase/migrations/20260813000002_orders_customer_id_index.sql)               | Índice em `orders(customer_id)` — a âncora nova da RLS estava sem índice e fazia seq scan                                                                                                                                                                                                                                                                                                                                                   |
| [`20260818000000_profiles_lower_email_index.sql`](../../supabase/migrations/20260818000000_profiles_lower_email_index.sql)           | Índice funcional em `profiles(lower(email))` + RPC `find_profile_id_by_email()` — substitui a paginação da Admin API no webhook de pagamento, que tinha teto de 2.000 usuários                                                                                                                                                                                                                                                              |
| [`20260902000000_abandoned_carts_retention.sql`](../../supabase/migrations/20260902000000_abandoned_carts_retention.sql)             | `cleanup_old_abandoned_carts()` (90 dias, só carrinho não recuperado) + job mensal `cleanup-abandoned-carts-monthly`. Aplicada em 02/09/2026 ([13-ROADMAP §1](./13-ROADMAP-PENDENCIAS.md)) — a tabela era a única de PII sem prazo, apesar de a migration que a criou prometer limpeza "após 7 dias"                                                                                                                                        |
| [`20261008000000_coupon_usage_release.sql`](../../supabase/migrations/20261008000000_coupon_usage_release.sql)                       | Coluna `orders.coupon_released_at`, função `release_stale_coupon_reservations()` (devolve o uso de cupom de pedido não aprovado com mais de 2h; pg_cron `*/15 * * * *`) e trigger `orders_reclaim_coupon_on_approval` (volta a contar o uso se o pagamento chegar depois). ✅ Aplicada em produção em 26/10/2026 ([13-ROADMAP, checklist A](./13-ROADMAP-PENDENCIAS.md))                                                                    |
| [`20261008000001_profiles_role_check.sql`](../../supabase/migrations/20261008000001_profiles_role_check.sql)                         | Recria a `check_valid_role` em `profiles`: `upper(role) in ('CUSTOMER','SELLER','ADMIN','MASTER')`, `not valid`. ✅ Aplicada em produção em 26/10/2026 ([13-ROADMAP, checklist A](./13-ROADMAP-PENDENCIAS.md))                                                                                                                                                                                                                              |
| [`20261026000000_coupon_reservation_compensation.sql`](../../supabase/migrations/20261026000000_coupon_reservation_compensation.sql) | Funções `decrement_coupon_usage()` e `release_coupon_reservation()` (SECURITY DEFINER, só service role): devolve na hora o uso de cupom quando o checkout falha antes de criar a preferência no MP; o cron de 2h segue como rede de segurança. Aplicada pelo workflow de release                                                                                                                                                            |
| [`20261026000001_product_seller_ownership.sql`](../../supabase/migrations/20261026000001_product_seller_ownership.sql)               | `products.seller_id` (FK `profiles`, nullable) + índice — plataforma de professores ([07-DASHBOARD-ADMIN](./07-DASHBOARD-ADMIN.md#plataforma-de-professores)). Aplicada pelo workflow de release                                                                                                                                                                                                                                            |

### Como aplicar

```bash
# Opção A — Supabase CLI (recomendado)
npm run supabase:db:push

# Opção B — Manual no SQL Editor
# Cole cada arquivo em ordem e clique Run

# Opção C — Via Management API
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' \
  curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query:.}' < supabase/migrations/...)"
```

### Validação após aplicar

```sql
-- 1. analytics_events existe
select count(*) from analytics_events;

-- 2. products.slug populado
select slug from products limit 3;

-- 3. coupons RLS ativada
select relrowsecurity from pg_class where relname = 'coupons';

-- 4. funções de purge criadas
select proname from pg_proc where proname like 'purge%' or proname like 'cleanup%';

-- 5. tabelas de email
select tablename from pg_tables where tablename like 'email_%';

-- 6. audit log append-only
select tgname from pg_trigger where tgname like 'admin_audit_log%';

-- 7. pg_cron jobs
select * from cron.job;     -- requer pg_cron habilitado
```

---

## Gerar nova migration

```bash
npm run supabase:migration:new -- nome_da_migration
# Cria supabase/migrations/<timestamp>_nome_da_migration.sql

# Edite o arquivo, depois aplique localmente / em prod
npm run supabase:db:push
```

Padrão a seguir:

- Criar a tabela
- Ativar `alter table <t> enable row level security;`
- Criar policies (mínimo necessário; default deny)
- Adicionar grants explícitos quando precisar abrir um subset de colunas
- Funções SECURITY DEFINER sempre com `set search_path = public, pg_temp;` + `revoke execute from public`

---

## Dados de exemplo

```bash
# Cole supabase/seed-sample-data.sql no SQL Editor (idempotente)
# Cria 6 categorias, 9 produtos com imagens placeholder e o setting homeSections
```

---

## Armadilhas conhecidas

Coisas que já custaram tempo de depuração:

- **`profiles.role` é MAIÚSCULO** — `CUSTOMER` | `SELLER` | `ADMIN` | `MASTER`, default `CUSTOMER`
  (CHECK `check_valid_role`). O painel só atribui `CUSTOMER`/`SELLER`; o login do admin aceita
  `ADMIN` ou `MASTER`. Comparar com `'admin'` minúsculo falha em silêncio.
- **Nunca inserir em `profiles` direto.** A linha nasce do trigger `handle_new_user` sobre
  `auth.users`; um `insert` sem o usuário correspondente estoura erro de FK. Crie o usuário pela
  Admin API e deixe o trigger criar o perfil.
- **`auth.users.instance_id`** precisa ser `00000000-0000-0000-0000-000000000000` — a Admin API já
  preenche; scripts que inserem à mão, não.
- **Migration não substitui o `schema.sql`.** As migrations assumem que as tabelas base já
  existem (a primeira faz `alter table public.orders`). Em projeto novo, rode o `schema.sql`
  primeiro.

## Backups

| Plano | Retenção                    |
| ----- | --------------------------- |
| Free  | 7 dias automatizado         |
| Pro   | 30 dias automatizado + PITR |

Em produção, **Supabase Pro é mandatório** para garantir RPO de no máximo 24h. Ver [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md).

Backup manual ad-hoc:

```bash
pg_dump "postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres" \
  --schema public --no-owner --no-acl > backup-$(date +%Y%m%d).sql
```
