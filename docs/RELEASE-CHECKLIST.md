# Release Checklist

## 1. Ambiente e configuracao

- Confirmar `APP_ENV=production` no ambiente de execucao da API.
- Validar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET` (e `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` para o build do frontend).
- Validar variaveis de pagamento (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`).
- Garantir os 4 segredos obrigatorios definidos: `ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET` — o `server.js` valida no boot com `APP_ENV=production` (junto com as `SUPABASE_*`), mas nao roda na Vercel: la a falta de segredo derruba a requisicao em runtime (fail-closed em `lib/env-secret.js`).
- Validar variaveis de e-mail (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Resend, com dominio do remetente verificado).
- Definir `CRON_SECRET` na Vercel e o MESMO valor nos GitHub Secrets (junto com `APP_URL`) para o cron de e-mails (`.github/workflows/email-cron.yml`).
- Definir `CORS_ORIGINS` para o Express (dev/`npm start`; em branco libera apenas localhost) — na Vercel a variavel nao e lida: o CORS dos handlers usa a origem de `APP_URL` (`lib/admin-session.js`).
- Confirmar `APP_URL` com dominio final de producao (https obrigatorio em producao).

## 2. Banco e dados

- Executar migracoes Supabase pendentes: `npm run supabase:db:push` (13 migrations em `supabase/migrations/`).
- Validar integridade das tabelas criticas: `products`, `orders`, `order_items`, `download_tokens`, `settings`, `coupons`, `email_sent_log`.
- Conferir RLS habilitado em todas as tabelas publicas (query de verificacao ao final de `supabase/security-hardening.sql`).
- Validar categorias e produtos ativos no painel admin.
- Confirmar indices principais (pedidos, log de e-mails e carrinhos abandonados) aplicados (ver `supabase/migrations/20260703000000_perf_indexes.sql`).
- Diagnostico rapido de conectividade e tabelas: `node scripts/db-inspect.js`.

## 3. Build e testes

- Rodar o gate local igual ao da CI: `npm run check` (testes + build).
- Rodar build web: `npm run build:web`.
- Rodar testes web: `npm run test:web` (inclui os testes de contrato de API em `api/__tests__/`: payloads obrigatorios, OPTIONS e assinatura de webhook).
- Confirmar workflows verdes no GitHub Actions: `test.yml` (Node 20, `npm ci` + `npm run check`) e `lighthouse.yml`.
- Garantir ausencia de erros no console durante smoke test.

## 4. Smoke test funcional

- Home, listagem de produtos e detalhe de produto carregando corretamente.
- Fluxo de checkout criando pagamento com sucesso.
- Fluxo de retorno e verificacao em downloads funcionando.
- Healthcheck local respondendo: `GET /health` (rota Express-only; nao existe na Vercel — em producao validar `GET /api/products`).
- `GET /sitemap.xml` respondendo XML.
- Login admin, listagem de pedidos/produtos e alteracoes basicas funcionando.

## 5. Seguranca e operacao

- Verificar cookies de sessao (`admin_session` e `customer_session`) com `HttpOnly` e `Secure` em producao.
- Confirmar CORS adequado para frontend de producao (na Vercel a allowlist vem de `APP_URL` via `setAdminCorsHeaders`; `CORS_ORIGINS` vale apenas para o Express).
- Confirmar headers de seguranca do `vercel.json` ativos apos deploy (HSTS, CSP, `X-Content-Type-Options`).
- Lembrar: rate limiting (express-rate-limit) atua apenas no Express/dev; nas funcoes serverless da Vercel nao ha limiter ativo (pendencia API-03).
- Revisar logs de erro para nao expor detalhes sensiveis em producao.
- Garantir que credenciais e segredos nao estao versionados no Git.

## 6. Go-live

- Publicar via Vercel: SPA estatico (`dist/`) + funcoes serverless `@vercel/node` (deploy pela integracao Git; nao ha workflow de deploy no repo).
- Validar rota principal e `GET /api/products` apos deploy.
- Executar compra sandbox/producao controlada e validar webhook (cartoes de teste MP: Visa 4235 6477 2802 5682, Master 5480 8328 0103 3311, Amex 3753 651535 56885).
- Confirmar download liberado apos pagamento aprovado.
- Disparar o cron de e-mails manualmente (`email-cron.yml` via workflow_dispatch) e confirmar resposta 200 de `/api/cron-email-jobs`.
- Registrar horario da release, responsavel e resultado do smoke test.
