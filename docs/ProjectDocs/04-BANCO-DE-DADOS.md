# 04 — Banco de dados

> Schema Postgres no Supabase, tabelas, relacionamentos, RLS, migrations.

---

## Visão geral

- **Engine:** Postgres 15 (Supabase managed)
- **Schemas:** `public` (app) + `auth` (Supabase Auth) + `storage` (Supabase Storage)
- **RLS:** ativado em **todas** as 14 tabelas do app
- **Service role:** bypassa RLS (usada apenas pelo backend); browser nunca tem service role
- **Anon key:** respeita RLS; só acessa o que as policies permitem

Arquivos:
- [`supabase/schema.sql`](../../supabase/schema.sql) — DDL completo
- [`supabase/security-hardening.sql`](../../supabase/security-hardening.sql) — RLS + policies + funções + grants
- [`supabase/seed-sample-data.sql`](../../supabase/seed-sample-data.sql) — dados de exemplo
- [`supabase/migrations/`](../../supabase/migrations/) — 8 migrations versionadas

---

## Tabelas (14)

### `categories`
Categorização de produtos. Acesso público read-only quando `active=true`.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `slug` | text uniq | Usado em URLs |
| `color` | text | Hex para badge na vitrine |
| `active` | boolean | Falso esconde da home |
| `featured` | boolean | Aparece na vitrine principal |
| `badge_label` | text | Selo do tipo "Novo", "Promoção" |
| `sort_order` | int | Ordem na home |
| `created_at` | timestamptz | |

### `products`
Catálogo. Núcleo do app. Acesso público read-only quando `active=true`.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `slug` | text uniq | URL canônica + trigger auto-gerador |
| `category_id` | uuid FK → `categories` | |
| `description` | text | Markdown / texto rico |
| `price` | numeric | Preço atual |
| `original_price` | numeric | Preço "de" — opcional para mostrar desconto |
| `image_url` | text | Imagem primária (compat) |
| `images` | jsonb | Array de URLs (galeria) |
| `videos` | jsonb | Array de URLs (YouTube/Vimeo embed) |
| `download_url` | text | Path no Supabase Storage |
| `tags` | text[] | Para busca / filtros futuros |
| `product_type` | text | `digital` \| `kit` \| `bundle` |
| `is_kit` | boolean | Flag de kit |
| `page_size` | text | `A4`, `A3`, etc |
| `paper_type` | text | Sugestão de impressão |
| `active` | boolean | Falso esconde do catálogo |
| `featured` | boolean | Destaque na home |
| `faq` | jsonb | `[{ question, answer }]` |
| `reviews` | jsonb | `[{ author, rating, text, date }]` |
| `benefits` | jsonb | `[{ icon, title, description }]` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Trigger `set_updated_at` |

> ⚠️ `faq`, `reviews` e `benefits` hoje são editáveis **só por SQL**. Wizard admin para editar esses campos está pendente — ver [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md).

### `orders`
Pedidos. Acesso restrito ao próprio cliente (via `auth.uid()`) ou admin (via service_role).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `order_code` | text uniq | 128 bits hex (`crypto.randomBytes(16).toString('hex')`) — usado como `external_reference` no MP |
| `customer_id` | uuid FK → `auth.users` nullable | Pode ser convidado (anônimo + email) |
| `customer_email` | text | Sempre presente |
| `customer_name` | text | |
| `customer_cpf` | text nullable | Para emissão de nota futuramente |
| `total_amount` | numeric | |
| `status` | text | `pending` \| `paid` \| `cancelled` |
| `payment_status` | text | `pending` \| `approved` \| `rejected` \| `refunded` \| `cancelled` |
| `payment_provider` | text | `mercadopago` |
| `mercadopago_preference_id` | text | |
| `mercadopago_payment_id` | text | |
| `coupon_code` | text nullable | |
| `discount_amount` | numeric | |
| `attribution_data` | jsonb | UTM + referrer + sessão |
| `created_at` | timestamptz | |
| `completed_at` | timestamptz nullable | Setado quando `approved` |

### `order_items`
Itens do pedido.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK → `orders` | ON DELETE CASCADE |
| `product_id` | uuid FK → `products` | nullable se produto for excluído |
| `product_name` | text | Snapshot do nome no momento da compra |
| `unit_price` | numeric | Snapshot |
| `quantity` | int | |
| `total_price` | numeric | `unit_price * quantity` |

### `profiles`
Perfil de usuário Supabase Auth. Criado por trigger `handle_new_user` quando alguém se registra.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK FK → `auth.users` | |
| `email` | text | Espelho de `auth.users.email` |
| `display_name` | text | Editável pelo cliente (única coluna que ele pode UPDATE) |
| `role` | text | `CUSTOMER` \| `ADMIN` \| `MASTER` |
| `provider` | text | `email` \| `google` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

> 🔒 **Privilege escalation bloqueado:** `revoke update` + `grant update (display_name)` impedem cliente de fazer `UPDATE profiles SET role='ADMIN'`. Ver [08-SEGURANCA §4b](./08-SEGURANCA.md).

### `user_products`
Vinculação usuário ↔ produto comprado. 1 row por (usuário, produto, pedido).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users` | |
| `product_id` | uuid FK → `products` | |
| `order_id` | uuid FK → `orders` | |
| `purchased_at` | timestamptz | |

### `download_tokens`
Tokens efêmeros de download. Acesso apenas via service_role.

| Coluna | Tipo | Notas |
|---|---|---|
| `token` | text PK | 128 bits hex |
| `order_id` | uuid FK → `orders` | |
| `product_id` | uuid FK → `products` | |
| `used` | boolean | `true` após primeiro download bem-sucedido |
| `expires_at` | timestamptz | TTL configurável (default 7 dias) |
| `created_at` | timestamptz | |

### `download_logs`
Auditoria de downloads. Retenção 12 meses (LGPD).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `order_id` | uuid FK → `orders` | |
| `product_id` | uuid FK → `products` | |
| `token` | text | snapshot |
| `ip_address` | inet | |
| `user_agent` | text | |
| `downloaded_at` | timestamptz | |

### `analytics_events`
Eventos do funil. **RLS permite INSERT público** (anon+auth) com whitelist de `event_name`. Retenção 24 meses.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `event_name` | text | `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, etc. (whitelisted) |
| `session_id` | text | UUID gerado client-side |
| `customer_email` | text nullable | Hash sha256.slice(0,16) — nunca claro |
| `order_id` | uuid nullable | |
| `product_id` | uuid nullable | |
| `properties` | jsonb | UTM, referrer, valor, etc |
| `source` | text | `web` \| `email` \| `webhook` |
| `created_at` | timestamptz | |

### `security_events`
Eventos de segurança. RLS service-only (cliente não consegue ler nem escrever). Retenção 6 meses.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `event_name` | text | `webhook_invalid_signature`, `admin_login_failed`, `verify_payment_email_mismatch` |
| `severity` | text | `info` \| `warn` \| `error` |
| `ip` | inet | |
| `user_agent` | text | |
| `properties` | jsonb | |
| `created_at` | timestamptz | |

### `page_views`
Page views via tracker básico. RLS público para INSERT com `path NOT NULL`.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `path` | text | |
| `ip_address` | inet | |
| `user_agent` | text | |
| `referrer` | text | |
| `created_at` | timestamptz | |

### `coupons`
Cupons. RLS service-only.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `code` | text uniq | Case-insensitive na validação |
| `discount_type` | text | `percent` \| `fixed` |
| `discount_value` | numeric | 15 = 15% ou R$ 15 |
| `valid_from` | timestamptz nullable | |
| `valid_until` | timestamptz nullable | |
| `max_uses` | int nullable | NULL = ilimitado |
| `uses_count` | int | Incrementado server-side |
| `applies_to` | jsonb | `["category:slug"]` ou `["product:uuid"]` — vazio = qualquer |
| `min_order_amount` | numeric nullable | |
| `active` | boolean | |
| `created_at` | timestamptz | |

> ⚠️ **CRUD de cupons no admin** ainda não existe — gerenciar via SQL. Ver [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md).

### `abandoned_carts`
Carrinhos abandonados. Capturado quando email é fornecido no checkout mas pagamento não confirma em X minutos.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `email` | text | |
| `session_id` | text | |
| `items` | jsonb | Snapshot dos itens |
| `total_amount` | numeric | |
| `attribution_data` | jsonb | |
| `reminder_sent_at` | timestamptz nullable | Setado pelo cron |
| `recovered_at` | timestamptz nullable | Setado quando o cliente finaliza compra mesma sessão |
| `created_at` | timestamptz | |

### `email_subscribers` + `email_sent_log`
Newsletter com double opt-in e log de envios.

`email_subscribers`:
| Coluna | Tipo | Notas |
|---|---|---|
| `email` | text PK | |
| `status` | text | `pending` \| `confirmed` \| `unsubscribed` |
| `confirmation_token` | text uniq | Para link no e-mail |
| `confirmed_at` | timestamptz nullable | |
| `unsubscribed_at` | timestamptz nullable | |
| `source` | text | Origem (`footer`, `popup`, `checkout`, etc) |
| `created_at` | timestamptz | |

`email_sent_log`:
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `email` | text | |
| `campaign` | text | `welcome`, `post_purchase_d3`, `reactivation_90d`, etc. |
| `sent_at` | timestamptz | |
| `opened_at` | timestamptz nullable | Via pixel de abertura (futuro) |

### `settings`
Configurações chave-valor JSON. Service-only.

| Coluna | Tipo | Notas |
|---|---|---|
| `setting_key` | text PK | `adminConfig`, `vitrine`, etc. |
| `setting_value` | jsonb | |
| `updated_at` | timestamptz | |

`adminConfig` guarda `totpSecret`, `fallbackPin` (hash bcrypt), preferências do admin.

---

## Relacionamentos

```
auth.users (1) ─── (0..n) profiles
auth.users (1) ─── (0..n) orders.customer_id
auth.users (1) ─── (0..n) user_products

categories (1) ─── (0..n) products
products   (1) ─── (0..n) order_items
products   (1) ─── (0..n) user_products
products   (1) ─── (0..n) download_tokens
products   (1) ─── (0..n) download_logs

orders     (1) ─── (1..n) order_items   [CASCADE delete]
orders     (1) ─── (0..n) download_tokens
orders     (1) ─── (0..n) download_logs
orders     (1) ─── (0..n) user_products
```

`coupons`, `abandoned_carts`, `email_subscribers`, `analytics_events`, `security_events`, `page_views`, `settings` não têm FKs duras — vivem isoladas.

---

## Resumo de policies (RLS)

| Tabela | Quem lê (SELECT) | Quem escreve (INSERT/UPDATE) |
|---|---|---|
| `categories` | anon + auth (active=true) | service_role |
| `products` | anon + auth (active=true) | service_role |
| `orders` | auth (próprios via `customer_id = auth.uid()`) | service_role |
| `order_items` | auth (via FK ao parent order) | service_role |
| `profiles` | auth (próprio via `id = auth.uid()`) | auth (só `display_name`) + service_role |
| `user_products` | auth (próprios) | service_role |
| `download_tokens` | — | service_role |
| `download_logs` | — | service_role |
| `analytics_events` | — | anon + auth (whitelist de `event_name`) |
| `security_events` | — | service_role |
| `page_views` | — | anon + auth (path NOT NULL) |
| `coupons` | — | service_role |
| `abandoned_carts` | — | service_role |
| `email_subscribers` | — | service_role |
| `email_sent_log` | — | service_role |
| `settings` | — | service_role |

**Princípio**: o backend (com service_role) pode tudo. O browser (com anon key) só vê o que está liberado em policy. Quando uma tabela é "service-role only", clientes nunca acessam direto — só via API que valida e age em nome deles.

Detalhes em [08-SEGURANCA §3](./08-SEGURANCA.md).

---

## Triggers e funções

### `handle_new_user()` (SECURITY DEFINER)
Trigger em `auth.users` AFTER INSERT. Cria `profiles` com `role='CUSTOMER'` e `provider` derivado do raw_user_metadata.

```sql
alter function public.handle_new_user() set search_path = public, pg_temp;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

### `set_updated_at()` (SECURITY DEFINER)
Trigger BEFORE UPDATE em várias tabelas para manter `updated_at` em sync.

### `purge_old_logs()` (SECURITY DEFINER)
Função idempotente que deleta:
- `download_logs` > 12 meses
- `analytics_events` > 24 meses
- `security_events` > 6 meses

Agendada via `pg_cron` diariamente às 03:00 UTC quando habilitado.

### `generate_product_slug()` (migration phase1)
Trigger BEFORE INSERT/UPDATE em `products` que gera slug a partir do nome quando o campo está vazio. Garante unicidade adicionando sufixo numérico se necessário.

---

## Migrations (8 arquivos)

Aplicar em ordem. Pode-se rodar tudo de uma vez via `npm run supabase:db:push`.

| Arquivo | Conteúdo |
|---|---|
| [`20260524000000_phase0_analytics.sql`](../../supabase/migrations/20260524000000_phase0_analytics.sql) | Cria `analytics_events` + adiciona `orders.attribution_data` |
| [`20260525000000_phase1_product_slugs.sql`](../../supabase/migrations/20260525000000_phase1_product_slugs.sql) | Adiciona `products.slug` + trigger `generate_product_slug` |
| [`20260526000000_phase2_conversion.sql`](../../supabase/migrations/20260526000000_phase2_conversion.sql) | Cria `coupons` + `abandoned_carts` + adiciona `products.{faq,reviews,benefits}` + `orders.{coupon_code,discount_amount}` |
| [`20260526100000_phase2_log_retention.sql`](../../supabase/migrations/20260526100000_phase2_log_retention.sql) | Cria função `purge_old_logs()` |
| [`20260526110000_phase2_security_events.sql`](../../supabase/migrations/20260526110000_phase2_security_events.sql) | Cria `security_events` (RLS service-only) |
| [`20260526120000_phase2_enable_pg_cron.sql`](../../supabase/migrations/20260526120000_phase2_enable_pg_cron.sql) | Habilita extension `pg_cron` + agenda job diário 03:00 UTC |
| [`20260527000000_phase0_analytics_retention.sql`](../../supabase/migrations/20260527000000_phase0_analytics_retention.sql) | Cleanup específico para `analytics_events` (caso pg_cron não esteja habilitado) |
| [`20260528000000_phase3_email_marketing.sql`](../../supabase/migrations/20260528000000_phase3_email_marketing.sql) | Cria `email_subscribers` + `email_sent_log` + cleanup |

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

-- 4. função purge_old_logs criada
select proname from pg_proc where proname like 'purge%';

-- 5. tabelas de email
select tablename from pg_tables where tablename like 'email_%';

-- 6. pg_cron jobs
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

## Atualizar tipos TypeScript

```bash
npm run supabase:types
# Gera src/types/supabase.ts
```

Necessário sempre que alterar schema.

---

## Dados de exemplo

```bash
# Cole supabase/seed-sample-data.sql no SQL Editor
# Cria 4 categorias e ~15 produtos com imagens placeholder
```

---

## Backups

| Plano | Retenção |
|---|---|
| Free | 7 dias automatizado |
| Pro | 30 dias automatizado + PITR |

Em produção, **Supabase Pro é mandatório** para garantir RPO de no máximo 24h. Ver [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md).

Backup manual ad-hoc:
```bash
pg_dump "postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres" \
  --schema public --no-owner --no-acl > backup-$(date +%Y%m%d).sql
```
