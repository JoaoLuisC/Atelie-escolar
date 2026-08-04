# Supabase Setup

> **Doc legado.** A migracao para Supabase ja foi concluida: o Supabase e o banco atual da aplicacao (project ref em producao ja vinculado). Para o setup atualizado do projeto (variaveis de ambiente, chaves, buckets), use [docs/SETUP.md](./SETUP.md). Este roteiro permanece como referencia para recriar o banco do zero em um novo projeto Supabase. Ultima atualizacao: 2026-07-19.

## Setup com Supabase CLI (recomendado)

1. Login no CLI:
	- `npm run supabase:login`
2. Inicializacao do projeto (ja feita neste repositorio):
	- `npm run supabase:init`
3. Vincular o repositorio ao projeto remoto:
	- `npm run supabase:link -- --project-ref SEU_PROJECT_REF`

Depois disso, use sempre migracoes versionadas em Git (ha 13 migrations em `supabase/migrations/`).

### Comandos principais

- `npm run supabase:migration:new -- nome_da_migration`
- `npm run supabase:db:pull`
- `npm run supabase:db:push`

## Ordem recomendada

1. Criar o projeto no Supabase.
2. Abrir o `SQL Editor` e executar [supabase/schema.sql](../supabase/schema.sql) (baseline das tabelas) e, em seguida, aplicar as migrations de `supabase/migrations/` com `npm run supabase:db:push`. As migrations **nao substituem** o `schema.sql`: elas criam apenas as tabelas adicionais (ex. `email_subscribers`) e alteram tabelas base que precisam ja existir (a primeira migration faz `alter table public.orders`).
3. Aplicar [supabase/security-hardening.sql](../supabase/security-hardening.sql) (RLS e policies) — o `schema.sql` sozinho **nao** habilita RLS; a versao completa esta na migration `phase6_db_rls_hardening`.
4. Em `Authentication`, o login do cliente usa Supabase Auth (o trigger `handle_new_user` cria a linha em `profiles` com role `CUSTOMER`; admin/master via `profiles.role`).
5. Preencher as variaveis de ambiente do projeto.
6. (Opcional) Popular dados de exemplo com [supabase/seed-sample-data.sql](../supabase/seed-sample-data.sql).

No `Storage`, criar os 3 buckets com nomes fixos no codigo ([api/admin-upload-url.js](../api/admin-upload-url.js)): `product_images` (publico), `product_videos` (privado) e `product_files` (privado, arquivos de download entregues via `download_tokens` + signed URL). URLs externas legadas (ex. Google Drive) em `products.download_url` continuam funcionando sem bucket.

## O que o schema ja cria

Tabelas do `schema.sql`:

- `categories`
- `products`
- `orders`
- `order_items`
- `profiles`
- `user_products`
- `download_tokens`
- `download_logs`
- `analytics_events`
- `security_events`
- `page_views`
- `coupons`
- `abandoned_carts`
- `settings`

Tabelas criadas apenas por migrations (aplicadas com `supabase:db:push`):

- `email_subscribers`
- `email_sent_log`
- `admin_audit_log`

## Variaveis de ambiente

Backend (Express/serverless):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` (connection string Postgres direta; opcional)
- `SUPABASE_STORAGE_BUCKET` (opcional; hoje e codigo morto — os buckets reais tem nomes fixos no codigo)

Frontend (Vite):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Observacoes importantes

- Se o backend usar `SERVICE_ROLE_KEY`, nao exponha essa chave no frontend.
- O login (cliente e admin) usa Supabase Auth: a tabela `profiles` e 1:1 com `auth.users` e guarda o `role` (`CUSTOMER`/`ADMIN`/`MASTER`); nao ha mais credenciais de admin em variaveis de ambiente.
- `products.download_url` pode apontar para o Storage (bucket privado `product_files`, entregue via signed URL de 5 min) ou para URL externa legada (ex. Google Drive) — os dois formatos convivem ([lib/storage-signed-url.js](../lib/storage-signed-url.js)).

## Proximo passo depois do schema

Os endpoints da API ja usam somente Supabase (produtos, pedidos, downloads e configuracoes do admin). Para rodar o projeto, siga [docs/SETUP.md](./SETUP.md).
