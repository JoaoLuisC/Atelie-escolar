# Release Checklist

## 1. Ambiente e configuracao

- Confirmar `APP_ENV=production` no ambiente de execucao da API.
- Validar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET`.
- Validar variaveis de pagamento (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`).
- Garantir segredos definidos (`WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `ADMIN_SESSION_SECRET` quando aplicavel).
- Confirmar `APP_URL` com dominio final de producao.

## 2. Banco e dados

- Executar migracoes Supabase pendentes.
- Validar integridade das tabelas criticas: `products`, `orders`, `order_items`, `download_tokens`, `settings`.
- Validar categorias e produtos ativos no painel admin.
- Confirmar indices principais (filtro por pedidos/produtos) aplicados.

## 3. Build e testes

- Rodar build web: `npm run build:web`.
- Rodar testes web: `npm run test:web`.
- Rodar testes de contrato de API (quando aplicavel) e validar respostas HTTP principais.
- Garantir ausencia de erros no console durante smoke test.

## 4. Smoke test funcional

- Home, listagem de produtos e detalhe de produto carregando corretamente.
- Fluxo de checkout criando pagamento com sucesso.
- Fluxo de retorno e verificacao em downloads funcionando.
- Endpoint de health respondendo: `GET /health`.
- Login admin, listagem de pedidos/produtos e alteracoes basicas funcionando.

## 5. Seguranca e operacao

- Verificar cookies administrativos com `HttpOnly` e `Secure` em producao.
- Confirmar CORS adequado para frontend de producao.
- Revisar logs de erro para nao expor detalhes sensiveis em producao.
- Garantir que credenciais e segredos nao estao versionados no Git.

## 6. Go-live

- Publicar backend e frontend.
- Validar healthcheck e rota principal apos deploy.
- Executar compra sandbox/producao controlada e validar webhook.
- Confirmar download liberado apos pagamento aprovado.
- Registrar horario da release, responsavel e resultado do smoke test.
