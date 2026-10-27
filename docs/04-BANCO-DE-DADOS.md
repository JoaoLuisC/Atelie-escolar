# 04 — Banco de dados

> Postgres no Supabase: tabelas, relacionamentos, RLS, funções, jobs agendados e migrations.
> A visão de segurança (quem acessa o quê e por quê) está em [08-SEGURANCA](./08-SEGURANCA.md).

## Visão geral

- **Engine:** Postgres gerenciado pelo Supabase; local usa Postgres 17 (`supabase/config.toml`).
- **Schemas:** `public` (app), `auth` (Supabase Auth), `storage` (Supabase Storage).
- **RLS ligada nas 18 tabelas do app.** O backend usa a `service_role` (ignora RLS); o navegador
  usa só a chave `anon`, que respeita as policies.
- **Extensões:** `pgcrypto` (`gen_random_uuid`), `unaccent` (slug), `pg_cron` (limpezas agendadas).

Arquivos:

| Arquivo                                                                 | Papel                                                                                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`supabase/schema.sql`](../supabase/schema.sql)                         | DDL base de 14 tabelas. Rode primeiro em projeto novo: as migrations assumem que elas existem                                                                   |
| [`supabase/migrations/`](../supabase/migrations/)                       | 24 migrations versionadas (lista abaixo). Criam as outras 4 tabelas, as funções, os jobs e o `products.seller_id`                                               |
| [`supabase/security-hardening.sql`](../supabase/security-hardening.sql) | Espelho, fora da sequência, do baseline de RLS/policies/grants da migration `20260702000000`                                                                    |
| [`supabase/seed-sample-data.sql`](../supabase/seed-sample-data.sql)     | Dados de exemplo idempotentes (categorias e produtos com imagens placeholder)                                                                                   |
| [`supabase/config.toml`](../supabase/config.toml)                       | Configuração do Supabase CLI/local                                                                                                                              |
| `scripts/check-rls.js` / `scripts/check-schema-drift.js`                | Conferem o banco no ar: o primeiro, pela chave `anon`, quem consegue ler o quê; o segundo, pela CLI, se funções, triggers, policies e grants prometidos existem |

## Tabelas (18)

### `categories`

Categorias de produto. Leitura pública quando `active = true`.

| Coluna        | Tipo        | Notas                        |
| ------------- | ----------- | ---------------------------- |
| `id`          | uuid PK     |                              |
| `name`        | text        |                              |
| `slug`        | text uniq   | Usado em URLs                |
| `color`       | text        | Hex do selo na vitrine       |
| `active`      | boolean     | `false` esconde da loja      |
| `featured`    | boolean     | Aparece na vitrine principal |
| `badge_label` | text        | Selo ("Novo", "Promoção")    |
| `sort_order`  | int         | Ordem na home                |
| `created_at`  | timestamptz |                              |
| `updated_at`  | timestamptz | Trigger `set_updated_at`     |

### `products`

Catálogo. Leitura pública das linhas com `active = true`, mas só das colunas liberadas por grant
(`download_url` e `seller_id` ficam de fora para `anon`/`authenticated`).

| Coluna                      | Tipo                   | Notas                                                                                                                                     |
| --------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | uuid PK                |                                                                                                                                           |
| `name`                      | text                   |                                                                                                                                           |
| `slug`                      | text uniq              | Gerado do nome pelo trigger `products_ensure_slug` quando vazio                                                                           |
| `category_id`               | uuid FK → `categories` | ON DELETE SET NULL                                                                                                                        |
| `seller_id`                 | uuid FK → `profiles`   | Professor(a) dono(a) do produto. ON DELETE RESTRICT, índice `products_seller_id_idx`. Nullable: NULL = produto legado ainda não atribuído |
| `description`               | text                   |                                                                                                                                           |
| `price` / `original_price`  | numeric(12,2)          | Preço atual / preço "de" (opcional)                                                                                                       |
| `image_url`                 | text                   | Imagem principal                                                                                                                          |
| `images` / `videos`         | jsonb                  | Arrays de URL. Só `https://` (validado na gravação, `lib/product-media.js`)                                                               |
| `download_url`              | text                   | Referência ao Storage (bucket da allowlist, sem travessia de caminho). Link externo é recusado na gravação e na entrega                   |
| `tags`                      | jsonb                  |                                                                                                                                           |
| `product_type`              | text                   | `individual` \| `kit`                                                                                                                     |
| `is_kit` / `kit_items`      | boolean / jsonb        | Kit e seus itens                                                                                                                          |
| `panel_sizes`               | jsonb                  | Tamanhos de painel                                                                                                                        |
| `page_size` / `paper_type`  | text                   | Formato (`A4`, `A3`…) e papel sugerido                                                                                                    |
| `active` / `featured`       | boolean                | Visível no catálogo / destaque na home                                                                                                    |
| `faq`                       | jsonb                  | `[{ question, answer }]`                                                                                                                  |
| `reviews`                   | jsonb                  | `[{ author, role, location, text, rating }]`                                                                                              |
| `benefits`                  | jsonb                  | `[{ icon, label }]`                                                                                                                       |
| `created_at` / `updated_at` | timestamptz            | Trigger `set_updated_at`                                                                                                                  |

### `orders`

Pedidos. O cliente logado lê os próprios (`customer_id = auth.uid()`); o resto passa pelo backend.

| Coluna                                                                      | Tipo                            | Notas                                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                        | uuid PK                         |                                                                                                                                          |
| `order_code`                                                                | text uniq                       | `ORD-<timestamp>-<hex>` com 128 bits aleatórios; vai como `external_reference` no Mercado Pago                                           |
| `customer_id`                                                               | uuid FK → `auth.users` nullable | ON DELETE SET NULL; NULL em compra de convidado                                                                                          |
| `customer_email`                                                            | text                            | Sempre presente, em minúsculas                                                                                                           |
| `customer_name` / `customer_cpf` / `customer_phone`                         | text                            | CPF e telefone opcionais                                                                                                                 |
| `total_amount` / `discount_amount`                                          | numeric(12,2)                   |                                                                                                                                          |
| `coupon_code`                                                               | text nullable                   |                                                                                                                                          |
| `coupon_released_at`                                                        | timestamptz nullable            | Quando o uso reservado do cupom foi devolvido (pedido não pago). NULL = uso ainda contado                                                |
| `status`                                                                    | text                            | `pending` → `completed` (aprovado), `failed` ou `refunded` (estorno/chargeback); gravado por webhook/verify-payment, ajustável no painel |
| `payment_status`                                                            | text                            | `pending` \| `approved` \| `rejected` \| `cancelled` \| `refunded` \| `charged_back`                                                     |
| `payment_provider`                                                          | text                            | `mercadopago`                                                                                                                            |
| `payment_id` / `preference_id`                                              | text                            | IDs no Mercado Pago                                                                                                                      |
| `attribution_data`                                                          | jsonb                           | UTM, referrer, sessão (sanitizado)                                                                                                       |
| `created_at` / `updated_at` / `completed_at`                                | timestamptz                     | `completed_at` na aprovação                                                                                                              |
| `mercadopago_preference_id` / `mercadopago_payment_id` / `mercadopago_data` | text / text / jsonb             | Legado, sem uso                                                                                                                          |
| `download_tokens` / `metadata`                                              | jsonb                           | Legado, sem uso (os tokens vivem na tabela `download_tokens`)                                                                            |

### `order_items`

| Coluna                       | Tipo                 | Notas                                         |
| ---------------------------- | -------------------- | --------------------------------------------- |
| `id`                         | uuid PK              |                                               |
| `order_id`                   | uuid FK → `orders`   | ON DELETE CASCADE                             |
| `product_id`                 | uuid FK → `products` | ON DELETE RESTRICT (produto vendido não some) |
| `product_name`, `unit_price` | text, numeric(12,2)  | Retrato do momento da compra                  |
| `quantity`, `total_price`    | int, numeric(12,2)   |                                               |
| `created_at`                 | timestamptz          |                                               |

### `profiles`

Perfil de cada conta do Supabase Auth. Nasce pelo trigger `handle_new_user`.

| Coluna                      | Tipo                      | Notas                                                                                                             |
| --------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `id`                        | uuid PK FK → `auth.users` | ON DELETE CASCADE                                                                                                 |
| `email`                     | text uniq                 | Espelho de `auth.users.email`, mantido pelo trigger `on_auth_user_email_changed`                                  |
| `display_name`              | text                      | Única coluna que o próprio usuário consegue alterar                                                               |
| `role`                      | text                      | `CUSTOMER` \| `SELLER` \| `ADMIN` \| `MASTER` (CHECK `check_valid_role`). O painel só atribui `CUSTOMER`/`SELLER` |
| `provider`                  | text                      | `email` \| `google`                                                                                               |
| `created_at` / `updated_at` | timestamptz               |                                                                                                                   |

O trigger `profiles_guard_privileged_cols` preserva `id`, `email`, `role` e `provider` quando quem
grava não é `service_role`: o cliente não consegue se promover a admin.

### `user_products`

Produto comprado por usuário: uma linha por (usuário, produto, pedido).

| Coluna         | Tipo                   | Notas              |
| -------------- | ---------------------- | ------------------ |
| `id`           | uuid PK                |                    |
| `user_id`      | uuid FK → `auth.users` | ON DELETE CASCADE  |
| `product_id`   | uuid FK → `products`   | ON DELETE CASCADE  |
| `order_id`     | uuid FK → `orders`     | ON DELETE SET NULL |
| `purchased_at` | timestamptz            |                    |

### `download_tokens`

Tokens de download. Só backend.

| Coluna         | Tipo                 | Notas                                                                                                                |
| -------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `token`        | text PK              | 256 bits em hex                                                                                                      |
| `order_id`     | uuid FK → `orders`   | ON DELETE CASCADE. UNIQUE `(order_id, product_id)`: webhook reentregue não duplica                                   |
| `product_id`   | uuid FK → `products` | ON DELETE CASCADE                                                                                                    |
| `product_name` | text                 | Retrato                                                                                                              |
| `used`         | boolean              | Vira `true` no download (UPDATE condicional atômico). O `verify-payment` reemite token novo até 5 downloads por item |
| `used_at`      | timestamptz nullable |                                                                                                                      |
| `expires_at`   | timestamptz          | 72h a partir da emissão ou reemissão                                                                                 |
| `created_at`   | timestamptz          |                                                                                                                      |

### `download_logs`

Registro de cada download. Retenção de 12 meses.

| Coluna                      | Tipo        | Notas              |
| --------------------------- | ----------- | ------------------ |
| `id`                        | uuid PK     |                    |
| `order_id` / `product_id`   | uuid FK     | ON DELETE SET NULL |
| `token`                     | text        |                    |
| `ip_address` / `user_agent` | text        |                    |
| `downloaded_at`             | timestamptz |                    |

### `analytics_events`

Eventos do funil. Sem policies: o front posta em `/api/track-event`, que confere a lista de
[`lib/analytics-events.js`](../lib/analytics-events.js) e grava com `service_role`. Retenção de 180 dias.

| Coluna                    | Tipo               | Notas                                                                                                                                                                                      |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                      | bigint identity PK |                                                                                                                                                                                            |
| `event_name`              | text               | Do site: `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `view_catalog`, `begin_checkout`, `client_error`. Do servidor: `checkout_initiated`, `payment_*`, `webhook_received` |
| `session_id`              | text               | UUID do navegador                                                                                                                                                                          |
| `customer_email`          | text nullable      | Legado: nada grava mais; zerado na exclusão de conta                                                                                                                                       |
| `order_id` / `product_id` | uuid FK nullable   | ON DELETE SET NULL                                                                                                                                                                         |
| `properties`              | jsonb              | UTM, referrer, valor (sem PII)                                                                                                                                                             |
| `source`                  | text               | `web` \| `server` \| `webhook`                                                                                                                                                             |
| `created_at`              | timestamptz        |                                                                                                                                                                                            |

### `security_events`

Eventos de segurança (lista em [08-SEGURANCA](./08-SEGURANCA.md)). Só backend. Retenção de 6 meses.

Colunas: `id` (bigint identity), `event_name`, `severity` (`info` \| `warn` \| `error`), `ip`,
`user_agent`, `request_id`, `properties` (jsonb), `created_at`.

### `page_views`

Sem uso: nenhum código grava nela e o INSERT público foi removido. Retenção de 6 meses.
Colunas: `id`, `path`, `ip_address`, `user_agent`, `referrer`, `viewed_at`.

### `coupons`

Só backend. CRUD na aba Cupons do painel; validação em `/api/validate-coupon` e de novo no
`create-payment`.

| Coluna                       | Tipo                   | Notas                                                                                                                                          |
| ---------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | bigint identity PK     |                                                                                                                                                |
| `code`                       | text uniq              | Comparado sem diferenciar maiúsculas                                                                                                           |
| `discount_type`              | text                   | `percent` \| `fixed` (CHECK)                                                                                                                   |
| `discount_value`             | numeric(12,2)          | 15 = 15% ou R$ 15 (CHECK > 0)                                                                                                                  |
| `valid_from` / `valid_until` | timestamptz nullable   |                                                                                                                                                |
| `max_uses`                   | int nullable           | NULL = ilimitado                                                                                                                               |
| `used_count`                 | int                    | Reservado no checkout (`increment_coupon_usage`), devolvido se o checkout falha (`release_coupon_reservation`) ou após 2h sem pagamento (cron) |
| `applies_to`                 | jsonb                  | `{ category_ids, product_ids }`; vazio = qualquer produto                                                                                      |
| `min_order_amount`           | numeric(12,2) nullable |                                                                                                                                                |
| `active`                     | boolean                |                                                                                                                                                |
| `created_at` / `updated_at`  | timestamptz            |                                                                                                                                                |

### `abandoned_carts`

Carrinho com e-mail informado e pagamento não confirmado; lembretes em ~1h e ~24h pelo cron de
e-mail. Só backend. Retenção de 90 dias.

| Coluna                      | Tipo                 | Notas                                                         |
| --------------------------- | -------------------- | ------------------------------------------------------------- |
| `id`                        | bigint identity PK   |                                                               |
| `email`                     | text                 | UNIQUE `(lower(email), coalesce(session_id, ''))`             |
| `session_id`                | text nullable        |                                                               |
| `items`, `total_amount`     | jsonb, numeric(12,2) | Retrato do carrinho                                           |
| `attribution_data`          | jsonb                |                                                               |
| `reminder_sent_at`          | timestamptz nullable | Gravado pelo cron                                             |
| `recovered_at`              | timestamptz nullable | Reservada: nada grava hoje; o cron só lê para pular lembretes |
| `created_at` / `updated_at` | timestamptz          |                                                               |

### `email_subscribers`

Newsletter com confirmação dupla e descadastro em 1 clique. Só backend.

| Coluna                                        | Tipo                    | Notas                                                          |
| --------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `id`                                          | bigint identity PK      |                                                                |
| `email`                                       | text                    | UNIQUE em `lower(email)`                                       |
| `confirmed` / `confirmed_at`                  | boolean / timestamptz   | Confirmação dupla                                              |
| `confirmation_token` / `confirmation_sent_at` | text uniq / timestamptz |                                                                |
| `unsubscribe_token` / `unsubscribed_at`       | text uniq / timestamptz | Token estável, vai em todo e-mail                              |
| `source`                                      | text                    | `footer`, `checkout`, `admin`…                                 |
| `attribution_data`                            | jsonb                   |                                                                |
| `tags` / `tags_updated_at`                    | jsonb / timestamptz     | Segmentação calculada pelo cron (cliente ativo, VIP, inativo…) |
| `created_at` / `updated_at`                   | timestamptz             |                                                                |

### `email_sent_log`

Idempotência dos e-mails automáticos. Só backend. Retenção de 90 dias.

| Coluna       | Tipo                 | Notas                                                                                      |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------ |
| `id`         | bigint identity PK   |                                                                                            |
| `email`      | text                 | UNIQUE `(lower(email), kind, coalesce(entity_id, ''))`                                     |
| `kind`       | text                 | `abandoned_cart_1h`, `abandoned_cart_24h`, `post_purchase_d3/d15/d45`, `reactivation_90d`… |
| `entity_id`  | text nullable        | Id do carrinho ou pedido                                                                   |
| `status`     | text                 | `queued` \| `sent` \| `failed` \| `skipped` (CHECK)                                        |
| `error`      | text nullable        |                                                                                            |
| `sent_at`    | timestamptz nullable |                                                                                            |
| `created_at` | timestamptz          |                                                                                            |

### `admin_audit_log`

Trilha de escrita do painel. **Só INSERT**: UPDATE e DELETE são bloqueados por REVOKE e por
trigger, inclusive para `service_role`. Retenção de 18 meses.

| Coluna             | Tipo               | Notas                                                                                                                                 |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | bigint identity PK |                                                                                                                                       |
| `admin_id`         | text               | E-mail de quem estava na sessão de staff (`'admin'` só para sessão antiga sem identidade)                                             |
| `action`           | text               | `create` \| `update` \| `patch` \| `delete` e ações nomeadas (`assign_seller`, `set_store_owner`, `change_password`, `change_email`…) |
| `target_type`      | text               | `product`, `category`, `coupon`, `order`, `user`, `profile`, `setting`, `storage_object`, `analytics_events`…                         |
| `target_id`        | text nullable      |                                                                                                                                       |
| `before` / `after` | jsonb              | Retratos; campos sensíveis de settings são redigidos                                                                                  |
| `ip`               | text nullable      |                                                                                                                                       |
| `created_at`       | timestamptz        |                                                                                                                                       |

### `settings`

Chave-valor em JSON. Só backend.

| `setting_key`     | Conteúdo                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `adminConfig`     | 2FA do admin: `totpSecret` cifrado (AES-256-GCM, chave `ADMIN_2FA_ENC_KEY`), `fallbackPin` em hash scrypt, preferências. Nunca volta no GET |
| `homeSections`    | Seções da vitrine da home                                                                                                                   |
| `homeContent`     | Textos da página da loja                                                                                                                    |
| `productDefaults` | Valores padrão do cadastro de produto                                                                                                       |
| `storeOwner`      | `{ sellerId }` da professora dona da loja (gravado pelo admin)                                                                              |

Colunas: `setting_key` (PK), `setting_value` (jsonb), `updated_at`.

### `rate_limit_hit`

Contador do rate limit. As funções serverless da Vercel não compartilham memória, então o
contador mora no Postgres. Janela fixa, uma linha por `(bucket, identifier, window_start)` (PK
composta). Só backend, escrita só pela função `rate_limit_hit()`. Retenção de 24h.

| Coluna         | Tipo        | Notas                                                                                                             |
| -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `bucket`       | text        | Nome do limite (`admin-login`, `download`…)                                                                       |
| `identifier`   | text        | IP resolvido na borda, ou `IP\|hash` do escopo (e-mail, `order_code` ou token em sha256 truncado, nunca em claro) |
| `window_start` | timestamptz | Início da janela                                                                                                  |
| `count`        | integer     | Acessos na janela                                                                                                 |
| `updated_at`   | timestamptz |                                                                                                                   |

## Relacionamentos

```
auth.users (1) ─── (0..1) profiles            [id é PK e FK]
auth.users (1) ─── (0..n) orders.customer_id
auth.users (1) ─── (0..n) user_products

profiles   (1) ─── (0..n) products.seller_id   [RESTRICT]
categories (1) ─── (0..n) products
products   (1) ─── (0..n) order_items         [RESTRICT]
products   (1) ─── (0..n) user_products, download_tokens, download_logs

orders     (1) ─── (1..n) order_items         [CASCADE]
orders     (1) ─── (0..n) download_tokens, download_logs, user_products
```

`coupons`, `abandoned_carts`, `email_subscribers`, `email_sent_log`, `admin_audit_log`,
`security_events`, `page_views`, `settings` e `rate_limit_hit` não têm FK. `analytics_events` tem
FKs opcionais para `orders`/`products` (SET NULL).

## RLS — resumo

| Tabela                                                                                                                                                                                     | Leitura pelo navegador              | Escrita                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------- |
| `categories`, `products`                                                                                                                                                                   | anon + auth, só `active = true`     | service_role                                                        |
| `orders`                                                                                                                                                                                   | auth, só `customer_id = auth.uid()` | service_role                                                        |
| `order_items`                                                                                                                                                                              | auth, pelo pedido pai               | service_role                                                        |
| `profiles`                                                                                                                                                                                 | auth, só a própria linha            | auth (própria linha, colunas privilegiadas travadas) + service_role |
| `user_products`                                                                                                                                                                            | auth, só as próprias                | service_role                                                        |
| `download_tokens`, `download_logs`, `analytics_events`, `security_events`, `page_views`, `coupons`, `abandoned_carts`, `email_subscribers`, `email_sent_log`, `settings`, `rate_limit_hit` | nenhuma (sem policy)                | service_role                                                        |
| `admin_audit_log`                                                                                                                                                                          | nenhuma                             | service_role, só INSERT                                             |

Tabela sem policy é intencional: só o backend acessa, e o Security Advisor a lista como INFO
"RLS Enabled No Policy".

## Funções e triggers

Toda função `SECURITY DEFINER` tem `set search_path = public, pg_temp` e `EXECUTE` revogado de
`public`/`anon`/`authenticated`; as chamadas pelo backend têm `EXECUTE` só para `service_role`.

### Triggers

| Trigger (função)                                                   | Onde                                     | O que faz                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `on_auth_user_created` (`handle_new_user`, definer)                | `auth.users` AFTER INSERT                | Cria o `profiles` com `role = 'CUSTOMER'`, nome e provider; `on conflict do nothing`                                    |
| `on_auth_user_email_changed` (`sync_profile_email`, definer)       | `auth.users` AFTER UPDATE OF email       | Copia o e-mail novo para `profiles.email` quando a troca é confirmada no Auth                                           |
| `profiles_guard_privileged_cols`                                   | `profiles` BEFORE UPDATE                 | Preserva `id`/`email`/`role`/`provider` se quem grava não é `service_role`/`postgres`/`supabase_admin`                  |
| `<tabela>_set_updated_at` (`set_updated_at`)                       | 8 tabelas, BEFORE UPDATE                 | `categories`, `products`, `orders`, `profiles`, `settings`, `coupons`, `abandoned_carts`, `email_subscribers`           |
| `products_ensure_slug_*` (`products_ensure_slug` + `slugify`)      | `products` BEFORE INSERT/UPDATE          | Gera slug do nome (minúsculas, sem acento) quando vazio; sufixo numérico se repetir                                     |
| `orders_reclaim_coupon_on_approval` (`reclaim_coupon_on_approval`) | `orders` BEFORE UPDATE OF payment_status | Pedido com cupom já devolvido que vira `approved` volta a contar o uso (Pix pago tarde). Ignora `max_uses` de propósito |
| `admin_audit_log_*` (`prevent_admin_audit_mutation`)               | `admin_audit_log` UPDATE/DELETE          | `raise exception`: trilha imutável                                                                                      |

### Funções chamadas pelo backend ou pelo cron

| Função                                   | O que faz                                                                                                  | Agendamento (`pg_cron`)                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `purge_old_logs()`                       | Apaga `download_logs` > 12 meses, `security_events` e `page_views` > 6 meses, `admin_audit_log` > 18 meses | `purge_old_logs_daily`, `0 3 * * *`                 |
| `cleanup_old_analytics_events()`         | `analytics_events` > 180 dias                                                                              | `cleanup-analytics-events`, `0 3 1 * *`             |
| `cleanup_old_email_logs()`               | `email_sent_log` > 90 dias                                                                                 | `cleanup-email-logs-monthly`, `15 3 1 * *`          |
| `cleanup_old_abandoned_carts()`          | `abandoned_carts` não recuperados com `updated_at` > 90 dias                                               | `cleanup-abandoned-carts-monthly`, `20 3 1 * *`     |
| `purge_stale_email_subscribers()`        | Não confirmados > 30 dias, descadastrados > 90 dias                                                        | `purge-stale-subscribers-monthly`, `30 3 1 * *`     |
| `purge_old_rate_limit_hits()`            | Janelas de `rate_limit_hit` > 24h                                                                          | `purge-rate-limit-hits-hourly`, `20 * * * *`        |
| `release_stale_coupon_reservations()`    | Devolve o uso de cupom de pedido não aprovado com mais de 2h (marca `coupon_released_at`)                  | `release-stale-coupon-reservations`, `*/15 * * * *` |
| `rate_limit_hit(text, text, int, int)`   | Incremento atômico do contador (`insert … on conflict do update`)                                          | —                                                   |
| `increment_coupon_usage(bigint)`         | Reserva um uso respeitando `max_uses`                                                                      | —                                                   |
| `decrement_coupon_usage(bigint)`         | Devolve um uso (nunca abaixo de zero)                                                                      | —                                                   |
| `release_coupon_reservation(uuid)`       | Devolve na hora o cupom de um pedido cujo checkout falhou antes da preferência no MP                       | —                                                   |
| `product_sales_counts(timestamptz, int)` | Quantidade vendida por produto em pedidos aprovados ("mais vendidos")                                      | —                                                   |
| `find_profile_id_by_email(text)`         | `profiles.id` por `lower(email)` (índice `profiles_lower_email_idx`)                                       | —                                                   |

Sem `pg_cron` habilitado, as migrations só emitem um `notice` e as limpezas precisam ser rodadas à
mão (`select public.purge_old_logs();` etc.). Conferir os jobs: `select jobname, schedule from cron.job;`.

## Migrations (24)

Em ordem, aplicadas com `npm run supabase:db:push`.

| Arquivo                                              | Conteúdo                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260524000000_phase0_analytics.sql`                | Cria `analytics_events` e `orders.attribution_data`                                                                                                                                                                       |
| `20260525000000_phase1_product_slugs.sql`            | `unaccent`, `slugify()`, `products.slug` com preenchimento e triggers de slug                                                                                                                                             |
| `20260526000000_phase2_conversion.sql`               | Cria `coupons` e `abandoned_carts`; `products.faq/reviews/benefits`; `orders.coupon_code/discount_amount`                                                                                                                 |
| `20260526100000_phase2_log_retention.sql`            | Primeira versão de `purge_old_logs()`                                                                                                                                                                                     |
| `20260526110000_phase2_security_events.sql`          | Cria `security_events` (só backend) e atualiza `purge_old_logs()`                                                                                                                                                         |
| `20260526120000_phase2_enable_pg_cron.sql`           | Habilita `pg_cron` e agenda `purge_old_logs_daily`                                                                                                                                                                        |
| `20260527000000_phase0_analytics_retention.sql`      | `cleanup_old_analytics_events()` (180 dias) e job mensal                                                                                                                                                                  |
| `20260528000000_phase3_email_marketing.sql`          | Cria `email_subscribers`, `email_sent_log` e `cleanup_old_email_logs()`                                                                                                                                                   |
| `20260530000000_phase4_admin_audit_log.sql`          | Cria `admin_audit_log`                                                                                                                                                                                                    |
| `20260701000000_phase5_audit_immutability.sql`       | Torna `admin_audit_log` só-INSERT (REVOKE + triggers)                                                                                                                                                                     |
| `20260701000001_phase5_payment_hardening.sql`        | Deduplica e põe UNIQUE `(order_id, product_id)` em `download_tokens`; cria `increment_coupon_usage()`                                                                                                                     |
| `20260702000000_phase6_db_rls_hardening.sql`         | Baseline de RLS e policies, guarda de `profiles`, `handle_new_user()` versionado, índices de FK, `purge_old_logs()` final, `purge_stale_email_subscribers()` e jobs mensais                                               |
| `20260703000000_perf_indexes.sql`                    | Índices para painel e cron (`orders`, `email_sent_log`, `abandoned_carts`)                                                                                                                                                |
| `20260812000000_security_hardening_wave1.sql`        | Tira `download_url` do SELECT de `anon` (grant por coluna), ancora as policies de pedido em `customer_id = auth.uid()`, e-mail de pedido em minúsculas, remove o INSERT anônimo em `analytics_events`, fixa `search_path` |
| `20260813000000_rate_limit.sql`                      | Cria `rate_limit_hit`, `rate_limit_hit()`, `purge_old_rate_limit_hits()` e o job de hora em hora                                                                                                                          |
| `20260813000001_best_sellers_aggregate.sql`          | `product_sales_counts()`: "mais vendidos" calculado no banco                                                                                                                                                              |
| `20260813000002_orders_customer_id_index.sql`        | Índice em `orders(customer_id)`, a âncora da RLS de pedidos                                                                                                                                                               |
| `20260818000000_profiles_lower_email_index.sql`      | Índice em `profiles(lower(email))` e `find_profile_id_by_email()`                                                                                                                                                         |
| `20260902000000_abandoned_carts_retention.sql`       | `cleanup_old_abandoned_carts()` (90 dias) e job mensal                                                                                                                                                                    |
| `20261008000000_coupon_usage_release.sql`            | `orders.coupon_released_at`, `release_stale_coupon_reservations()` (cron a cada 15 min) e trigger `orders_reclaim_coupon_on_approval`                                                                                     |
| `20261008000001_profiles_role_check.sql`             | Recria `check_valid_role`: `upper(role) in ('CUSTOMER','SELLER','ADMIN','MASTER')`                                                                                                                                        |
| `20261026000000_coupon_reservation_compensation.sql` | `decrement_coupon_usage()` e `release_coupon_reservation()`: devolução imediata do cupom quando o checkout falha                                                                                                          |
| `20261026000001_product_seller_ownership.sql`        | `products.seller_id` (FK `profiles`, nullable) e índice                                                                                                                                                                   |
| `20261027000000_profiles_email_sync.sql`             | `sync_profile_email()` e trigger `on_auth_user_email_changed`                                                                                                                                                             |

### Criar uma migration

```bash
npm run supabase:migration:new -- nome_da_migration
# edite supabase/migrations/<timestamp>_nome_da_migration.sql
npm run supabase:db:push
```

Padrão:

- `alter table <t> enable row level security;` em toda tabela nova; policy só quando o navegador
  precisa ler (sem policy = só backend).
- Função `SECURITY DEFINER` sempre com `set search_path = public, pg_temp` e
  `revoke execute … from public, anon, authenticated`; `grant execute … to service_role` se o
  backend chama.
- Coluna nova em `products` que a vitrine precise ler pela chave `anon` exige `grant select (coluna)`
  explícito: o SELECT da tabela é concedido coluna a coluna.
- Depois de aplicar em produção, rode `node scripts/check-schema-drift.js` e `node scripts/check-rls.js`.

## Armadilhas conhecidas

- **`profiles.role` é MAIÚSCULO** no banco (`CUSTOMER`, `SELLER`, `ADMIN`, `MASTER`). O código
  compara em minúsculas depois de normalizar; comparar `'admin'` direto no SQL falha em silêncio.
- **Não insira em `profiles` à mão.** Crie o usuário pela Admin API do Auth e deixe o trigger criar
  o perfil; insert sem o `auth.users` correspondente quebra a FK.
- **`auth.users.instance_id`** precisa ser `00000000-0000-0000-0000-000000000000`. A Admin API
  preenche; usuário inserido por SQL fica com NULL e o GoTrue passa a ignorá-lo em login e
  recuperação. Correção: `update auth.users set instance_id = '00000000-0000-0000-0000-000000000000' where instance_id is null;`
- **Migration não substitui o `schema.sql`.** Em projeto novo, rode o `schema.sql` antes.
- **Produto com `seller_id` NULL não aparece para a professora** no painel da loja: o recorte
  por professora filtra por `seller_id`. Atribua o dono em `/admin/plataforma`.

## Dados de exemplo e backup

- Exemplo: cole `supabase/seed-sample-data.sql` no SQL Editor (idempotente).
- Backup: o plano Free guarda 7 dias de backup diário; o Pro guarda mais e tem PITR. Cópia avulsa:

```bash
pg_dump "$SUPABASE_DB_URL" --schema public --no-owner --no-acl > backup-$(date +%Y%m%d).sql
```

## Pendências do banco

- `products.seller_id` ainda aceita NULL: atribuir os produtos legados e tornar a coluna
  obrigatória numa migration nova.
- Arquivo de download por professor: o caminho em `product_files` não tem prefixo por vendedor
  (detalhe em [08-SEGURANCA](./08-SEGURANCA.md)).
- Não há registro de restauração de backup testada; decidir o plano do Supabase (Free ou Pro com PITR).
