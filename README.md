# Ateliê da Escola

Base em migração para Supabase.

## Estado Atual

Frontend legado removido. O projeto agora roda com:

- React (Vite) para interface
- Node API server para endpoints em `/api`

## Fluxo Profissional (recomendado)

### Bootstrap inicial

1. Instalar dependencias:
	- `npm run bootstrap`
2. Rodar validacao base (testes + build):
	- `npm run check`

### Desenvolvimento diario

- Rodar frontend + API em paralelo:
	- `npm run dev:all`

- Alias para fluxo de desenvolvimento (frontend + API):
	- `npm run dev:full`

### Scripts de qualidade e manutencao

- Limpar build:
	- `npm run clean`
- Rebuild limpo:
	- `npm run rebuild`
- Testes:
	- `npm run test`
- Build:
	- `npm run build`

### Como rodar localmente

1. Suba a API em um terminal:
	- `npm run dev:api`
2. Suba o frontend React em outro terminal:
	- `npm run dev`

Frontend: http://localhost:5173
API: http://localhost:3000

### Variaveis de ambiente (Vite + API)

- Use `APP_ENV` para controlar ambiente da API local (`development`, `test`, `production`).
- Evite `NODE_ENV` em arquivos `.env*` do projeto para nao gerar warning no Vite.
- O `server.js` faz fallback automatico para `development` quando `APP_ENV` nao estiver definido.
- Para login de cliente (e-mail/senha + Google) via Supabase Auth no frontend, configure:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`
- No painel do Supabase, habilite o provedor Google em `Authentication > Providers`.
- O acesso administrativo agora vem do Supabase Auth e da tabela `profiles`.
- Crie o perfil com `role = 'master'` ou `role = 'admin'` para liberar o painel.

## Supabase CLI (workflow recomendado)

Este repositorio esta configurado para usar o Supabase remoto como fluxo principal de banco.

### Primeira configuracao

1. Fazer login no Supabase CLI:
	 - `npm run supabase:login`
2. Inicializar estrutura do projeto (ja executado neste repositorio):
	 - `npm run supabase:init`
3. Vincular ao projeto remoto:
	 - `npm run supabase:link -- --project-ref SEU_PROJECT_REF`

### Comandos do dia a dia (remoto)

- Criar migration nova:
	- `npm run supabase:migration:new -- nome_da_migration`
- Puxar mudancas do remoto para migration:
	- `npm run supabase:db:pull`
- Enviar migrations/schema para remoto:
	- `npm run supabase:db:push`
- Gerar tipos para React:
	- `npm run supabase:types`

### Fluxo seguro de banco

1. Criar migration.
2. Revisar e aplicar no projeto remoto.
3. Testar API/frontend.
4. Fazer push para remoto.
5. Gerar tipos e commitar junto.

## Próximos passos

1. Executar o schema do Supabase em [supabase/schema.sql](supabase/schema.sql).
2. Configurar as variáveis em [.env.local](.env.local).
3. Evoluir o app React e manter apenas o fluxo Supabase como fonte de dados.

## Release

Antes de publicar, siga o checklist em [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md).
