# Supabase Setup

Use este roteiro se a ideia for trocar o banco atual por Supabase.

## Setup com Supabase CLI (recomendado)

1. Login no CLI:
	- `npm run supabase:login`
2. Inicializacao do projeto (ja feita neste repositorio):
	- `npm run supabase:init`
3. Vincular o repositorio ao projeto remoto:
	- `npm run supabase:link -- --project-ref SEU_PROJECT_REF`

Depois disso, use sempre migracoes versionadas em Git.

### Comandos principais

- `npm run supabase:start`
- `npm run supabase:status`
- `npm run supabase:stop`
- `npm run supabase:migration:new -- nome_da_migration`
- `npm run supabase:db:pull`
- `npm run supabase:db:push`
- `npm run supabase:types`

## Ordem recomendada

1. Criar o projeto no Supabase.
2. Abrir o `SQL Editor` e executar [supabase/schema.sql](../supabase/schema.sql).
3. Ir em `Storage` e criar o bucket de arquivos, se os downloads forem armazenados la.
4. Ir em `Authentication` e decidir se o login do cliente vai usar Supabase Auth.
5. Preencher as variaveis de ambiente do projeto.
6. Adaptar o backend Node para ler e gravar no Supabase.
7. Migrar os dados antigos, se houver.

## O que o schema ja cria

- `categories`
- `products`
- `orders`
- `order_items`
- `download_tokens`
- `download_logs`
- `profiles`
- `user_products`
- `settings`
- `page_views`

## Variaveis de ambiente

Se a aplicacao for falar com o Supabase direto pelo backend, use pelo menos:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` ou `DATABASE_URL`
- `SUPABASE_STORAGE_BUCKET`

## Observacoes importantes

- Se o backend usar `SERVICE_ROLE_KEY`, nao exponha essa chave no frontend.
- Se voce quiser usar Supabase Auth, a tabela `profiles` ja esta pronta para vincular usuarios do Auth com o cadastro da aplicacao.
- Se os arquivos de download continuarem no Google Drive, voce nao precisa mover tudo para o Storage agora.

## Proximo passo depois do schema

Adaptar os endpoints da API para usar somente Supabase, começando por produtos, pedidos, downloads e configuracoes do admin.
