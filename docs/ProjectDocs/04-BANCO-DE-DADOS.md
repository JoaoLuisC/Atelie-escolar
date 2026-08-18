# 04 — Banco de dados

> Schema Postgres no Supabase, tabelas, relacionamentos, RLS, migrations.

---

## Visão geral

- **Engine:** Postgres (Supabase managed); dev local usa Postgres 17 (`supabase/config.toml`, `major_version = 17`)
- **Schemas:** `public` (app) + `auth` (Supabase Auth) + `storage` (Supabase Storage)
- **RLS:** ativado em **todas** as 17 tabelas do app
- **Service role:** bypassa RLS (usada apenas pelo backend); browser nunca tem service role
- **Anon key:** respeita RLS; só acessa o que as policies permitem
- **Extensões:** `pgcrypto` (gen_random_uuid), `unaccent` (slugify), `pg_cron` (purges agendados)

Arquivos:

- [`supabase/schema.sql`](../../supabase/schema.sql) — DDL canônico (14 tabelas; as 3 restantes nascem em migrations)
- [`supabase/security-hardening.sql`](../../supabase/security-hardening.sql) — RLS + policies + funções + grants (espelho fora da sequência de migrations)
- [`supabase/seed-sample-data.sql`](../../supabase/seed-sample-data.sql) — dados de exemplo
- [`supabase/migrations/`](../../supabase/migrations/) — 13 migrations versionadas
- [`supabase/config.toml`](../../supabase/config.toml) — config do Supabase CLI/local

---

## Tabelas (17)

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

| Coluna           | Tipo                   | Notas                                                                               |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `id`             | uuid PK                |                                                                                     |
| `name`           | text                   |                                                                                     |
| `slug`           | text uniq              | URL canônica + trigger auto-gerador (`products_ensure_slug`)                        |
| `category_id`    | uuid FK → `categories` | ON DELETE SET NULL                                                                  |
| `description`    | text                   | Markdown / texto rico                                                               |
| `price`          | numeric(12,2)          | Preço atual                                                                         |
| `original_price` | numeric(12,2)          | Preço "de" — opcional para mostrar desconto                                         |
| `image_url`      | text                   | Imagem primária (compat)                                                            |
| `images`         | jsonb                  | Array de URLs (galeria)                                                             |
| `videos`         | jsonb                  | Array de URLs (YouTube/Vimeo embed)                                                 |
| `download_url`   | text                   | Path no Supabase Storage (vira signed URL de 5 min) ou URL externa (Drive — legado) |
| `tags`           | jsonb                  | Para busca / filtros futuros                                                        |
| `product_type`   | text                   | `individual` \| `kit`                                                               |
| `is_kit`         | boolean                | Flag de kit                                                                         |
| `kit_items`      | jsonb                  | Itens que compõem o kit                                                             |
| `panel_sizes`    | jsonb                  | Tamanhos de painel disponíveis                                                      |
| `page_size`      | text                   | `A4`, `A3`, etc                                                                     |
| `paper_type`     | text                   | Sugestão de impressão                                                               |
| `active`         | boolean                | Falso esconde do catálogo                                                           |
| `featured`       | boolean                | Destaque na home                                                                    |
| `faq`            | jsonb                  | `[{ question, answer }]`                                                            |
| `reviews`        | jsonb                  | `[{ author, rating, text, date }]`                                                  |
| `benefits`       | jsonb                  | `[{ icon, title, description }]`                                                    |
| `created_at`     | timestamptz            |                                                                                     |
| `updated_at`     | timestamptz            | Trigger `set_updated_at`                                                            |

> `faq`, `reviews` e `benefits` são editáveis pelo admin via `ProductWizard` (aba Produtos) — ver [07-DASHBOARD-ADMIN](./07-DASHBOARD-ADMIN.md).

### `orders`

Pedidos. Acesso restrito ao próprio cliente (via `auth.uid()` ou e-mail do JWT) ou admin (via service_role).

| Coluna                                                                      | Tipo                            | Notas                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                        | uuid PK                         |                                                                                                                                     |
| `order_code`                                                                | text uniq                       | `ORD-<timestamp>-<hex>` com 128 bits de entropia (`crypto.randomBytes(16).toString('hex')`) — usado como `external_reference` no MP |
| `customer_id`                                                               | uuid FK → `auth.users` nullable | ON DELETE SET NULL; pode ser convidado (anônimo + email)                                                                            |
| `customer_email`                                                            | text                            | Sempre presente                                                                                                                     |
| `customer_name`                                                             | text                            |                                                                                                                                     |
| `customer_cpf`                                                              | text nullable                   | Para emissão de nota futuramente                                                                                                    |
| `customer_phone`                                                            | text nullable                   |                                                                                                                                     |
| `total_amount`                                                              | numeric(12,2)                   |                                                                                                                                     |
| `status`                                                                    | text                            | `pending` → `completed` (setado por webhook/verify-payment); admin pode ajustar via painel                                          |
| `payment_status`                                                            | text                            | `pending` \| `approved` (demais estados do MP — `rejected`, `refunded`, etc — via admin)                                            |
| `payment_provider`                                                          | text                            | `mercadopago` (default)                                                                                                             |
| `payment_id`                                                                | text                            | ID do pagamento no MP                                                                                                               |
| `preference_id`                                                             | text                            | ID da preference no MP                                                                                                              |
| `mercadopago_preference_id` / `mercadopago_payment_id` / `mercadopago_data` | text / text / jsonb             | Colunas legadas — código atual usa `preference_id`/`payment_id`                                                                     |
| `download_tokens`                                                           | jsonb                           | Legado — tokens vivem na tabela `download_tokens`                                                                                   |
| `metadata`                                                                  | jsonb                           | Legado                                                                                                                              |
| `coupon_code`                                                               | text nullable                   |                                                                                                                                     |
| `discount_amount`                                                           | numeric(12,2)                   |                                                                                                                                     |
| `attribution_data`                                                          | jsonb                           | UTM + referrer + sessão                                                                                                             |
| `created_at`                                                                | timestamptz                     |                                                                                                                                     |
| `updated_at`                                                                | timestamptz                     | Trigger `set_updated_at`                                                                                                            |
| `completed_at`                                                              | timestamptz nullable            | Setado quando `approved`                                                                                                            |

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

| Coluna         | Tipo                      | Notas                                                                 |
| -------------- | ------------------------- | --------------------------------------------------------------------- |
| `id`           | uuid PK FK → `auth.users` | ON DELETE CASCADE                                                     |
| `email`        | text uniq                 | Espelho de `auth.users.email`                                         |
| `display_name` | text                      | Editável pelo cliente (única coluna que ele consegue alterar de fato) |
| `role`         | text                      | `CUSTOMER` \| `ADMIN` \| `MASTER`                                     |
| `provider`     | text                      | `email` \| `google`                                                   |
| `created_at`   | timestamptz               |                                                                       |
| `updated_at`   | timestamptz               |                                                                       |

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

| Coluna         | Tipo                 | Notas                                                                                   |
| -------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `token`        | text PK              | 256 bits hex (`crypto.randomBytes(32)`)                                                 |
| `order_id`     | uuid FK → `orders`   | ON DELETE CASCADE; UNIQUE `(order_id, product_id)` — idempotente a webhooks reentregues |
| `product_id`   | uuid FK → `products` | ON DELETE CASCADE                                                                       |
| `product_name` | text                 | Snapshot                                                                                |
| `used`         | boolean              | `true` após primeiro download (claim atômico via UPDATE condicional)                    |
| `used_at`      | timestamptz nullable |                                                                                         |
| `expires_at`   | timestamptz          | TTL de 72h a partir da aprovação do pagamento                                           |
| `created_at`   | timestamptz          |                                                                                         |

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

Eventos do funil. **RLS permite INSERT público** (anon+auth) com whitelist de `event_name` e sem PII. Retenção 180 dias.

| Coluna           | Tipo               | Notas                                                                                                                                                           |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | bigint identity PK |                                                                                                                                                                 |
| `event_name`     | text               | Client só insere da whitelist: `view_item`, `add_to_cart`, `begin_checkout`, `remove_from_cart`, `view_cart`, `view_catalog`; `purchase` e afins só via backend |
| `session_id`     | text               | UUID gerado client-side                                                                                                                                         |
| `customer_email` | text nullable      | Preenchido só por inserts do backend (service_role); a policy pública exige `customer_email is null`                                                            |
| `order_id`       | uuid nullable FK   | ON DELETE SET NULL; policy pública exige `order_id is null`                                                                                                     |
| `product_id`     | uuid nullable FK   | ON DELETE SET NULL                                                                                                                                              |
| `properties`     | jsonb              | UTM, referrer, valor, etc (sanitizado, sem PII)                                                                                                                 |
| `source`         | text               | `web` \| `server` \| `webhook`                                                                                                                                  |
| `created_at`     | timestamptz        |                                                                                                                                                                 |

### `security_events`

Eventos de segurança. RLS service-only (cliente não consegue ler nem escrever). Retenção 6 meses.

| Coluna       | Tipo               | Notas                                                                              |
| ------------ | ------------------ | ---------------------------------------------------------------------------------- |
| `id`         | bigint identity PK |                                                                                    |
| `event_name` | text               | `webhook_invalid_signature`, `admin_login_failed`, `verify_payment_email_mismatch` |
| `severity`   | text               | `info` \| `warn` \| `error` (default `warn`)                                       |
| `ip`         | text               |                                                                                    |
| `user_agent` | text               |                                                                                    |
| `request_id` | text               |                                                                                    |
| `properties` | jsonb              |                                                                                    |
| `created_at` | timestamptz        |                                                                                    |

### `page_views`

Page views via tracker básico. RLS sem policies — o INSERT público foi removido no hardening (RLS-04); só o backend escreve. Retenção 6 meses.

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

| Coluna             | Tipo                   | Notas                                                             |
| ------------------ | ---------------------- | ----------------------------------------------------------------- |
| `id`               | bigint identity PK     |                                                                   |
| `code`             | text uniq              | Case-insensitive na validação                                     |
| `discount_type`    | text                   | `percent` \| `fixed` (CHECK)                                      |
| `discount_value`   | numeric(12,2)          | 15 = 15% ou R$ 15 (CHECK > 0)                                     |
| `valid_from`       | timestamptz nullable   |                                                                   |
| `valid_until`      | timestamptz nullable   |                                                                   |
| `max_uses`         | int nullable           | NULL = ilimitado                                                  |
| `used_count`       | int                    | Incrementado server-side via `increment_coupon_usage()` (atômico) |
| `applies_to`       | jsonb                  | `{ category_ids: [...], product_ids: [...] }` — vazio = qualquer  |
| `min_order_amount` | numeric(12,2) nullable |                                                                   |
| `active`           | boolean                |                                                                   |
| `created_at`       | timestamptz            |                                                                   |
| `updated_at`       | timestamptz            | Trigger `set_updated_at`                                          |

> CRUD de cupons no admin: aba **Cupons** (`CouponWizard` + `/api/admin-coupons`). Validação no checkout via `/api/validate-coupon` (prévia) e revalidação no `create-payment`.

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

| Coluna             | Tipo               | Notas                                                                 |
| ------------------ | ------------------ | --------------------------------------------------------------------- |
| `id`               | bigint identity PK |                                                                       |
| `admin_id`         | text               | default `'admin'`                                                     |
| `action`           | text               | `create` \| `update` \| `patch` \| `delete`                           |
| `target_type`      | text               | `product` \| `category` \| `coupon` \| `order` \| `user` \| `setting` |
| `target_id`        | text nullable      |                                                                       |
| `before` / `after` | jsonb              | Snapshot (settings sensíveis passam por redação)                      |
| `ip`               | text nullable      |                                                                       |
| `created_at`       | timestamptz        |                                                                       |

### `settings`

Configurações chave-valor JSON. Service-only.

| Coluna          | Tipo        | Notas                         |
| --------------- | ----------- | ----------------------------- |
| `setting_key`   | text PK     | `adminConfig`, `homeSections` |
| `setting_value` | jsonb       |                               |
| `updated_at`    | timestamptz |                               |

`adminConfig` guarda `totpSecret` e `fallbackPin` (armazenados em texto claro; a API nunca os devolve no GET e a comparação do PIN é timing-safe), além de preferências do admin. `homeSections` guarda as seções da vitrine da home.

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

`coupons`, `abandoned_carts`, `email_subscribers`, `email_sent_log`, `admin_audit_log`, `analytics_events`, `security_events`, `page_views`, `settings` não têm FKs duras entre si — vivem isoladas (`analytics_events` tem FKs opcionais para `orders`/`products` com SET NULL).

---

## Resumo de policies (RLS)

| Tabela              | Quem lê (SELECT)                                                                   | Quem escreve (INSERT/UPDATE)                                                            |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `categories`        | anon + auth (active=true)                                                          | service_role                                                                            |
| `products`          | anon + auth (active=true)                                                          | service_role                                                                            |
| `orders`            | auth (próprios via `customer_id = auth.uid()` OU `customer_email` = e-mail do JWT) | service_role                                                                            |
| `order_items`       | auth (via FK ao parent order)                                                      | service_role                                                                            |
| `profiles`          | auth (próprio via `id = auth.uid()`)                                               | auth (UPDATE próprio; `id/email/role/provider` travados por trigger) + service_role     |
| `user_products`     | auth (próprios)                                                                    | service_role                                                                            |
| `download_tokens`   | —                                                                                  | service_role                                                                            |
| `download_logs`     | —                                                                                  | service_role                                                                            |
| `analytics_events`  | —                                                                                  | anon + auth (INSERT com whitelist de `event_name`, sem `order_id` nem `customer_email`) |
| `security_events`   | —                                                                                  | service_role                                                                            |
| `page_views`        | —                                                                                  | service_role (INSERT público removido no hardening)                                     |
| `coupons`           | —                                                                                  | service_role                                                                            |
| `abandoned_carts`   | —                                                                                  | service_role (INSERT/UPDATE públicos removidos no hardening)                            |
| `email_subscribers` | —                                                                                  | service_role                                                                            |
| `email_sent_log`    | —                                                                                  | service_role                                                                            |
| `admin_audit_log`   | —                                                                                  | service_role (só INSERT; UPDATE/DELETE bloqueados até para service_role)                |
| `settings`          | —                                                                                  | service_role                                                                            |

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

### `purge_old_logs()` (SECURITY DEFINER)

Função idempotente (versão final na phase6) que deleta:

- `download_logs` > 12 meses
- `security_events` > 6 meses
- `page_views` > 6 meses
- `admin_audit_log` > 18 meses

(`analytics_events` saiu desta função — tem cleanup próprio.) Agendada via `pg_cron` diariamente às 03:00 UTC.

### Demais funções (as de cleanup são SECURITY DEFINER com EXECUTE revogado de public/anon/authenticated)

| Função                            | O que faz                                                                                        | Agendamento           |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- |
| `cleanup_old_analytics_events()`  | Apaga `analytics_events` > 180 dias                                                              | mensal (`0 3 1 * *`)  |
| `cleanup_old_email_logs()`        | Apaga `email_sent_log` > 90 dias                                                                 | mensal (`15 3 1 * *`) |
| `purge_stale_email_subscribers()` | Apaga subscribers não confirmados > 30d ou descadastrados > 90d                                  | mensal (`30 3 1 * *`) |
| `prevent_admin_audit_mutation()`  | Trigger fn comum (sem SECURITY DEFINER): `raise exception` em UPDATE/DELETE de `admin_audit_log` | —                     |
| `increment_coupon_usage(bigint)`  | UPDATE atômico de `coupons.used_count` respeitando `max_uses`; EXECUTE só para service_role      | —                     |

---

## Migrations (13 arquivos)

Aplicar em ordem. Pode-se rodar tudo de uma vez via `npm run supabase:db:push`.

| Arquivo                                                                                                                    | Conteúdo                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`20260524000000_phase0_analytics.sql`](../../supabase/migrations/20260524000000_phase0_analytics.sql)                     | Cria `analytics_events` (com INSERT público restrito a whitelist) + adiciona `orders.attribution_data`                                                                                                                                   |
| [`20260525000000_phase1_product_slugs.sql`](../../supabase/migrations/20260525000000_phase1_product_slugs.sql)             | Extensão `unaccent`, função `slugify()`, `products.slug` com backfill + triggers `products_ensure_slug_*`                                                                                                                                |
| [`20260526000000_phase2_conversion.sql`](../../supabase/migrations/20260526000000_phase2_conversion.sql)                   | Cria `coupons` + `abandoned_carts` + adiciona `products.{faq,reviews,benefits}` + `orders.{coupon_code,discount_amount}`                                                                                                                 |
| [`20260526100000_phase2_log_retention.sql`](../../supabase/migrations/20260526100000_phase2_log_retention.sql)             | Cria função `purge_old_logs()` (v1)                                                                                                                                                                                                      |
| [`20260526110000_phase2_security_events.sql`](../../supabase/migrations/20260526110000_phase2_security_events.sql)         | Cria `security_events` (RLS service-only) + `purge_old_logs()` v2                                                                                                                                                                        |
| [`20260526120000_phase2_enable_pg_cron.sql`](../../supabase/migrations/20260526120000_phase2_enable_pg_cron.sql)           | Habilita extension `pg_cron` + agenda `purge_old_logs_daily` (03:00 UTC)                                                                                                                                                                 |
| [`20260527000000_phase0_analytics_retention.sql`](../../supabase/migrations/20260527000000_phase0_analytics_retention.sql) | Cria `cleanup_old_analytics_events()` (180 dias) + job mensal                                                                                                                                                                            |
| [`20260528000000_phase3_email_marketing.sql`](../../supabase/migrations/20260528000000_phase3_email_marketing.sql)         | Cria `email_subscribers` + `email_sent_log` + `cleanup_old_email_logs()`                                                                                                                                                                 |
| [`20260530000000_phase4_admin_audit_log.sql`](../../supabase/migrations/20260530000000_phase4_admin_audit_log.sql)         | Cria `admin_audit_log` (RLS service-only)                                                                                                                                                                                                |
| [`20260701000000_phase5_audit_immutability.sql`](../../supabase/migrations/20260701000000_phase5_audit_immutability.sql)   | Torna `admin_audit_log` append-only (REVOKE + triggers)                                                                                                                                                                                  |
| [`20260701000001_phase5_payment_hardening.sql`](../../supabase/migrations/20260701000001_phase5_payment_hardening.sql)     | Dedup + UNIQUE `(order_id, product_id)` em `download_tokens` + `increment_coupon_usage()`                                                                                                                                                |
| [`20260702000000_phase6_db_rls_hardening.sql`](../../supabase/migrations/20260702000000_phase6_db_rls_hardening.sql)       | Baseline RLS nas 17 tabelas, trigger guard de `profiles`, remove escrita pública de `abandoned_carts`/`page_views`, versiona `handle_new_user()`, índices de FK, `purge_old_logs()` v3, `purge_stale_email_subscribers()` + jobs mensais |
| [`20260703000000_perf_indexes.sql`](../../supabase/migrations/20260703000000_perf_indexes.sql)                             | 5 índices de performance para painel/cron (`orders`, `email_sent_log`, `abandoned_carts`)                                                                                                                                                |

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
select rowsecurity from pg_class where relname = 'coupons';

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
