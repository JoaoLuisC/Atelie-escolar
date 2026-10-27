# 08 — Segurança

> Modelo de ameaça, autenticação e papéis, CSRF, rate limit, RLS, segredos, webhook, downloads,
> eventos de segurança, LGPD, rotina de auditoria, dependências e pendências.
> Tabelas, policies e funções em detalhe: [04-BANCO-DE-DADOS](./04-BANCO-DE-DADOS.md).

## 1. Modelo de ameaça

| Ator                                               | Acesso esperado                                      | Como é garantido                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Visitante anônimo                                  | Catálogo público, criar pedido                       | RLS: `categories`/`products` com `active = true`, colunas liberadas por grant (sem `download_url`) |
| Cliente logado                                     | Próprios pedidos e downloads                         | Cookie `customer_session`; handler filtra pelo uid da sessão; RLS por `auth.uid()` como reforço    |
| Professor(a)                                       | Só os próprios produtos, em `/api/teacher/*`         | Cookie `admin_session` com `role = seller`; filtro por `seller_id` no handler                      |
| Dona da loja (professora em `settings.storeOwner`) | Painel da loja, só com dados dos produtos dela       | `storeOwner: true` assinado no cookie; `ensureStoreSession`; recorte por `seller_id` no servidor   |
| Admin / master                                     | Plataforma inteira, Usuários, Segurança, professores | `ensureAdminSession`; 2º fator opcional                                                            |
| Atacante com a chave `anon`                        | Nada além do catálogo público                        | RLS: sem policy, sem acesso                                                                        |
| Atacante com `SUPABASE_SERVICE_ROLE_KEY`           | Banco inteiro                                        | A chave nunca sai do servidor; rotação; ver §11                                                    |
| Webhook forjado                                    | —                                                    | HMAC-SHA256 com `WEBHOOK_SECRET`, fail-closed (§4)                                                 |
| Enumeração de `order_code`                         | —                                                    | 128 bits aleatórios + e-mail obrigatório + rate limit + resposta uniforme (§6)                     |

## 2. Camadas de defesa

### 2.1 Headers, HTTPS e CORS

- `lib/security-headers.js` (montado por `lib/express-app.js`, o mesmo app no dev e na função
  `api/index.js`): `helmet()` com CSP explícita (scripts só de GA4, Meta e Mercado Pago), HSTS,
  `X-Frame-Options: DENY`, `nosniff`. O `vercel.json` aplica headers equivalentes em todas as rotas, com
  `frame-ancestors 'none'`.
- **HTTPS obrigatório:** o build da Vercel falha (`scripts/check-env.js`) se `APP_URL` não começar
  com `https://`; `server.js` repete a checagem com `APP_ENV=production`.
- **CORS:** `CORS_ORIGINS` é obrigatório fora de dev/test (o boot falha sem ele). Origem fora da
  lista não recebe os headers e a guarda de origem do handler responde 403.

### 2.2 CSRF

- Cookies `admin_session` e `customer_session` com `HttpOnly` e `SameSite=Strict` (`Secure` em
  produção).
- Toda escrita (POST/PUT/PATCH/DELETE) com sessão de staff, e os dois logouts, passam por
  `isSameOriginRequest` (`lib/admin-session.js`): `Origin`, ou `Referer` na falta dele, precisa
  estar na allowlist de `getAllowedOrigins()` (`lib/http.js`) = `APP_URL` + `CORS_ORIGINS`
  (+ `localhost:5173` só em dev/test). Sem os dois headers, bloqueia (fail-closed).

### 2.3 Sessões

- Duas sessões: `customer_session` (cliente) e `admin_session` (staff). Token
  `payload.assinatura`, HMAC-SHA256 com `CUSTOMER_SESSION_SECRET` / `ADMIN_SESSION_SECRET`,
  comparação timing-safe.
- **TTL de 8h**, sem renovação e sem revogação individual: derrubar sessões = rotacionar o segredo.
- `lib/env-secret.js` é fail-closed: fora de dev/test, segredo ausente faz a requisição falhar em
  vez de cair num valor padrão; o build já barra antes (`scripts/check-env.js`).
- Payload do `admin_session`: `email`, `role` (`admin` \| `master` \| `seller`), `userId` e
  `storeOwner`. Tudo é decidido no login e assinado; forjar exige o segredo. Mudança de papel ou
  de dona da loja vale a partir do próximo login.

### 2.4 Papéis do staff e guardas

| Guarda (`lib/admin-session.js`)           | Quem passa                             | Onde                                                                                                                                                    |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureAdminSession`                      | admin, master                          | Usuários, Segurança (`adminConfig`), dona da loja (`store-owner`), dono do produto (`product-seller`)                                                   |
| `ensureStoreSession`                      | admin, master, seller com `storeOwner` | Painel da loja: produtos, categorias, cupons, pedidos, dashboard, KPIs, funil, ABC, coorte, segmentos, estudo de vendas, IA, upload, settings da página |
| `ensureStaffSession`                      | admin, master, seller                  | `/api/teacher/account` (Minha conta)                                                                                                                    |
| `ensureRoleSession(req, res, ['seller'])` | seller                                 | `/api/teacher/dashboard`, `/api/teacher/products`                                                                                                       |

- **Recorte por professora** (`lib/seller-scope.js`): sessão `seller`, inclusive a dona da loja,
  vê só pedidos que têm material dela (só os itens dela e o valor proporcional), só clientes que
  compraram esses materiais e só os próprios produtos. Admin/master não têm recorte. O recorte é
  feito no servidor em cada endpoint.
- **Professor comum** (`/api/teacher/*`): leitura e escrita filtradas por `seller_id` = `userId`
  da sessão, porque a escrita é com `service_role`.
- Na rota de settings, a chave `adminConfig` (2FA) só aceita admin/master, mesmo com
  `ensureStoreSession`.
- O painel só atribui `CUSTOMER`/`SELLER` (`userUpdateSchema`); promover a admin exige SQL.

### 2.5 Login do staff

- **Senha** (`/api/admin/login`): login real no Supabase Auth; o papel é resolvido pelo **id** da
  conta em `profiles` (e-mail só como reserva para perfis antigos), então trocar o e-mail não
  tranca ninguém. Conta sem papel de staff recebe a mesma resposta 401 de senha errada; o motivo
  fica só no evento.
- **Google** (`/api/admin/login-google`): o front faz o OAuth pelo Supabase (PKCE) e manda o
  `access_token`, conferido no Supabase. Só `seller` recebe o cookie; admin/master levam 403 para
  o Google não pular o 2º fator. A volta usa `?oauth=staff`, que o fluxo do cliente ignora.
- **2º fator do admin** (`lib/admin-2fa.js`, aba Segurança): existe no código, mas **nunca foi
  configurado em produção** (ver §13). Quando ligado:
  - TOTP com janela ±1 passo e uso único (anti-replay via `rate_limit_hit` com limite 1);
    PIN de recuperação; código por e-mail opcional (`allowEmailCode`), nunca como único método.
  - Desafio assinado com TTL de 120 s (10 min com código por e-mail), preso a IP e e-mail, de uso
    único. O código por e-mail não é guardado: vai selado no desafio como HMAC.
  - `totpSecret` cifrado com AES-256-GCM (`ADMIN_2FA_ENC_KEY`); `fallbackPin` em hash scrypt com
    sal. Nenhum dos dois volta no GET nem entra no audit log. Mudar campos de segurança exige
    reautenticar com o 2º fator.
  - Vale só para admin/master. Professor(a) e dona da loja não têm 2º fator.

### 2.6 Minha conta: troca de senha e e-mail

`POST /api/teacher/account` (`lib/staff-account.js`), para qualquer sessão de staff:

- Exige a **senha atual**, conferida com um login de verdade num cliente Supabase descartável
  (nunca o cliente compartilhado). Senha errada responde 400 (não 401, para o painel não tratar
  como sessão expirada).
- Limite `staff-account-reauth`: 5 tentativas / 10 min por IP + conta.
- Senha nova: 8+ caracteres com maiúscula, minúscula e número; diferente da atual. Troca na hora
  pela Admin API.
- E-mail novo: pedido em nome da pessoa (`updateUser`); só muda depois do clique no link de
  confirmação. O trigger `on_auth_user_email_changed` atualiza `profiles.email`.
- Conta só com Google não troca senha nem e-mail por aqui.
- Eventos: `staff_password_changed`, `staff_email_change_requested`, `staff_reauth_failed`; a
  ação também vai para o `admin_audit_log`.

### 2.7 Rate limit

Um mecanismo só: `enforceRateLimit` no início do handler, com contador atômico no Postgres
(`rate_limit_hit()`), válido em produção. Configuração em `RATE_LIMITS`
([`lib/rate-limit.js`](../lib/rate-limit.js)); quatro baldes são declarados no próprio handler.

| Endpoint                                                                 | Balde                               | Limite                        | Contador fora do ar |
| ------------------------------------------------------------------------ | ----------------------------------- | ----------------------------- | ------------------- |
| `/auth/customer/login`                                                   | `customer-login` (IP + conta)       | 5 / 10 min                    | recusa              |
| ⤷ teto por conexão                                                       | `customer-login-scan` (IP)          | 20 contas distintas / 10 min  | recusa              |
| `/auth/customer/register`                                                | `customer-register`                 | 5 / 10 min                    | recusa              |
| `/auth/customer/google/start`                                            | `customer-google-start`             | 20 / 10 min                   | passa               |
| `/auth/customer/google/callback`                                         | `customer-google-callback`          | 20 / 10 min                   | passa               |
| `/admin/login` (senha)                                                   | `admin-login`                       | 5 / 10 min                    | passa               |
| `/admin/login` (2º fator)                                                | `admin-login-2fa` (IP + conta)      | 5 / 10 min                    | recusa              |
| `/admin/login-google`                                                    | `staff-google-login`                | 20 / 10 min                   | passa               |
| `/teacher/account` (senha/e-mail)                                        | `staff-account-reauth` (IP + conta) | 5 / 10 min                    | passa               |
| `/admin/settings` (reautenticação 2FA)                                   | `admin-settings-2fa`                | 5 / 10 min                    | passa               |
| `/admin/ai-assist`                                                       | `admin-ai-assist`                   | 30 / hora                     | passa               |
| `/teacher/products`                                                      | `teacher-products`                  | 60 / hora                     | passa               |
| `/admin/sales-study`                                                     | `admin-sales-study`                 | 10 / hora                     | passa               |
| `/verify-payment`                                                        | `verify-payment` (por pedido)       | 600 / 10 min                  | passa               |
| ⤷ teto por conexão                                                       | `verify-payment-scan` (IP)          | 40 pedidos distintos / 10 min | passa               |
| `/download`                                                              | `download` (por token)              | 20 / 10 min                   | passa               |
| ⤷ teto por conexão                                                       | `download-scan` (IP)                | 30 tokens distintos / 10 min  | passa               |
| `/create-payment`                                                        | `create-payment`                    | 20 / min                      | passa               |
| `/validate-coupon`                                                       | `validate-coupon`                   | 20 / min                      | passa               |
| ⤷ com `quote: true` (cotação)                                            | `catalog`                           | 120 / min                     | passa               |
| `/track-event`                                                           | `track-event`                       | 120 / min                     | passa               |
| `/abandoned-cart`                                                        | `abandoned-cart`                    | 30 / min                      | passa               |
| `/subscribe`                                                             | `subscribe`                         | 5 / min                       | passa               |
| `/unsubscribe`                                                           | `unsubscribe`                       | 20 / min                      | passa               |
| `/confirm-subscription`                                                  | `confirm-subscription`              | 20 / min                      | passa               |
| `/send-confirmation-email`                                               | `send-confirmation-email`           | 5 / 10 min                    | passa               |
| `/me-delete-account`                                                     | `me-delete-account`                 | 5 / min                       | passa               |
| `/me-export-data`                                                        | `me-export-data`                    | 5 / 5 min                     | passa               |
| catálogo público (`products`, `product-details`, `home-*`, `cross-sell`) | `catalog`                           | 120 / min                     | passa               |

- **"Contador fora do ar"**: o padrão é passar (fail-open), porque a mesma queda derrubaria o
  endpoint adiante e trancar o `/admin/login` deixaria a dona fora do painel. Os baldes que
  **recusam** (`failMode: 'closed'`, 503) protegem senha contra serviços que continuam de pé sem o
  contador (GoTrue) e o anti-replay do TOTP. Nos dois casos sai `rate_limit_unavailable`.
- Login, cadastro e 2º fator contam também as tentativas certas (não há estorno de hit).
- O `express-rate-limit` de 250 req / 15 min em `/api` só existe no `server.js` de dev, como
  rede contra loop de script; não é política.
- Ao mexer na montagem das rotas, rode `routes/__tests__/api-route-parity.test.js` e
  `handlers/__tests__/rate-limit-coverage.test.js`: eles conferem que o módulo montado é o que
  chama `enforceRateLimit`.

### 2.8 Banco: RLS e funções privilegiadas

- RLS ligada nas 18 tabelas; só `categories`, `products`, `orders`, `order_items`, `profiles` e
  `user_products` têm policy de leitura para o navegador. O resto é só backend.
- `products`: RLS filtra linha, não coluna; por isso o SELECT de `anon`/`authenticated` é
  concedido coluna a coluna, sem `download_url`.
- `profiles`: a policy de UPDATE libera a própria linha; o trigger `profiles_guard_privileged_cols`
  preserva `id`, `email`, `role` e `provider` para quem não é `service_role`. Cliente não se
  promove.
- Toda função `SECURITY DEFINER` tem `search_path` fixo e `EXECUTE` revogado de
  `public`/`anon`/`authenticated`.
- `admin_audit_log` é só-INSERT, até para `service_role`.

### 2.9 Validação de entrada

- Zod em `validation/`, aplicado **dentro do handler**: `parseOrFail` em `create-payment`,
  `validate-coupon` e `verify-payment`; `parse` nos handlers do painel e de `/api/teacher/products`.
  - `payment.schemas.js`: 1–100 itens, `productId` UUID obrigatório, quantidade inteira 1–99,
    tetos de nome/e-mail/telefone/CPF.
  - `admin.schemas.js`: categorias, cupons, produto (`name`, `price`), PATCH de produto
    (`active`/`featured`), usuário (papel só `customer`/`seller`).
- **Preço sempre vem do banco**, nunca do cliente.
- **Mídia do produto** (`lib/product-media.js`, admin e professor): imagens e vídeos só `https://`
  com host; `download_url` precisa ser referência ao Storage aceita pela entrega (bucket da
  allowlist, sem travessia de caminho). `javascript:`, `data:` e links externos são recusados na
  gravação.
- Atribuição (UTM etc.) passa por `lib/attribution-sanitize.js`: 9 campos, 200 caracteres.

## 3. Segredos

Só no servidor (Vercel e `.env.local`), nunca com prefixo `VITE_`:

| Segredo                                            | Uso                                               |
| -------------------------------------------------- | ------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                        | Backend com acesso total ao banco                 |
| `MERCADOPAGO_ACCESS_TOKEN`                         | Cobranças e consultas no MP                       |
| `WEBHOOK_SECRET`                                   | HMAC do webhook do MP                             |
| `ADMIN_SESSION_SECRET` / `CUSTOMER_SESSION_SECRET` | Assinatura das sessões                            |
| `ADMIN_2FA_ENC_KEY`                                | Cifra do `totpSecret`                             |
| `CRON_SECRET`                                      | Autentica o workflow do cron de e-mail            |
| `SMTP_PASS`                                        | Chave do Resend                                   |
| `GEMINI_API_KEY`                                   | IA do painel (opcional)                           |
| `SECURITY_ALERT_WEBHOOK_URL`                       | Alerta externo de eventos de segurança (opcional) |

Públicas por design: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GA4_ID`,
`VITE_META_PIXEL_ID`. `VITE_ALLOW_ADMIN_BYPASS` só tem efeito em `import.meta.env.DEV`.

Na tabela `settings`, `totpSecret` e `fallbackPin` ficam cifrado/em hash e são redigidos no GET e
no audit log. A IA (Gemini) recebe só agregados e nomes de produto/categoria: nada de e-mail, nome
de cliente ou código de pedido.

## 4. Webhook do Mercado Pago

- `/api/webhook` recalcula `HMAC-SHA256(WEBHOOK_SECRET, "id:…;request-id:…;ts:…;")` e compara em
  tempo constante. Falha → 401 + `webhook_invalid_signature`.
- Fail-closed: sem `WEBHOOK_SECRET`, tudo é rejeitado (nunca usa o access token como chave).
- `ts` fora da tolerância (padrão 48h, teto de 7 dias, folga pequena para o futuro) é recusado.
- O pagamento é reconsultado no MP; valor diferente do pedido → `payment_amount_mismatch` e o
  pedido fica `pending`. Reentrega não duplica tokens (UNIQUE `(order_id, product_id)`).

## 5. Downloads

- Token opaco de 256 bits, criado na aprovação, TTL de 72h, em `download_tokens`.
- `/api/download?token=…` confere existência, validade e uso; o claim `used = true` é um UPDATE
  condicional atômico (requisição repetida ou concorrente recebe 401).
- Reemissão: para pedido aprovado, `/api/verify-payment` (código + e-mail) troca token usado ou
  vencido por um novo, até 5 downloads por item contados em `download_logs`.
- Entrega por signed URL do Storage de 5 min, só dos buckets `product_images`/`product_videos`/
  `product_files`, sem travessia de caminho. `download_url` fora do Storage → 500 +
  `download_url_not_storage`, sem consumir o token.
- Resposta com `Referrer-Policy: no-referrer` e `Cache-Control: no-store`.
- `product_files` precisa ser privado: se o upload o encontra público, volta a fechá-lo e emite
  `storage_bucket_unexpectedly_public`.

## 6. Verify-payment (anti-enumeração)

- Exige `orderId` **e** `email`; e-mail comparado em tempo constante.
- Mesma resposta `404 "Pedido não encontrado"` para pedido inexistente e e-mail errado.
- Dois baldes: 600 / 10 min por pedido (cobre o polling) e 40 pedidos distintos / 10 min por IP.
- E-mail errado gera `verify_payment_email_mismatch` (com hash do e-mail, não o e-mail).

## 7. E-mail (Resend)

- E-mails do Supabase Auth (confirmação, redefinição de senha, troca de e-mail) e do app
  (confirmação de compra, carrinho abandonado, newsletter, pós-compra, reativação) saem pelo SMTP
  do Resend (`smtp.resend.com`), com domínio verificado (SPF, DKIM, DMARC).
- O app usa nodemailer com `SMTP_HOST/PORT/USER/PASS/FROM` (`lib/email-sender.js`).
- E-mails de marketing têm descadastro em 1 clique e headers `List-Unsubscribe` (RFC 8058).

## 8. Eventos de segurança

`recordSecurityEvent` ([`lib/security-logger.js`](../lib/security-logger.js)) grava em três
destinos: log JSON na saída padrão (Vercel), tabela `security_events` (consulta por SQL; não há
tela no painel) e `SECURITY_ALERT_WEBHOOK_URL`, se configurada. Falha nos dois últimos não derruba
o handler.

| `event_name`                         | Origem                                    | Severidade | Quando                                                                           |
| ------------------------------------ | ----------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `admin_login_failed`                 | `admin/login.js`, `admin/login-google.js` | warn       | Senha errada, conta sem papel de staff, token Google inválido, admin pelo Google |
| `admin_2fa_failed`                   | `admin/login.js`                          | warn       | Código de 2º fator inválido                                                      |
| `admin_2fa_email_failed`             | `admin/login.js`                          | warn       | Código por e-mail não pôde ser enviado                                           |
| `admin_2fa_code_replayed`            | `admin/login.js`                          | error      | Código TOTP já usado                                                             |
| `admin_2fa_challenge_replayed`       | `admin/login.js`                          | error      | Desafio de 2º fator reutilizado                                                  |
| `admin_2fa_replay_guard_degraded`    | `admin/login.js`                          | error      | Marca de uso único indisponível no Postgres                                      |
| `admin_2fa_settings_reauth_failed`   | `admin/settings.js`                       | error      | Reautenticação falhou ao mudar a segurança                                       |
| `staff_password_changed`             | `teacher/account.js`                      | info       | Staff trocou a senha na Minha conta                                              |
| `staff_email_change_requested`       | `teacher/account.js`                      | info       | Staff pediu troca de e-mail (link enviado)                                       |
| `staff_reauth_failed`                | `teacher/account.js`                      | warn       | Senha atual errada na troca de senha/e-mail                                      |
| `webhook_invalid_signature`          | `webhook.js`                              | warn       | HMAC do MP ausente ou inválido                                                   |
| `payment_amount_mismatch`            | `webhook.js`, `verify-payment.js`         | error      | Valor pago diferente do pedido                                                   |
| `verify_payment_email_mismatch`      | `verify-payment.js`                       | warn       | Pedido existe, e-mail não bate                                                   |
| `download_url_not_storage`           | `download.js`                             | error      | Produto com arquivo fora do Storage                                              |
| `storage_bucket_unexpectedly_public` | `admin/upload-url.js`                     | error      | `product_files` estava público (o upload o fecha de novo)                        |
| `rate_limit_exceeded`                | `lib/rate-limit.js`                       | warn       | Balde estourou (429); no máximo um alerta por balde por minuto, por instância    |
| `rate_limit_unavailable`             | `lib/rate-limit.js`                       | error      | Contador no Postgres não respondeu                                               |
| `admin_audit_write_failed`           | `lib/admin-audit.js`                      | error      | Insert no `admin_audit_log` falhou                                               |
| `account_self_deleted`               | `me-delete-account.js`                    | info       | Cliente confirmou a exclusão da conta                                            |
| `account_deletion_anonymize_failed`  | `me-delete-account.js`                    | error      | Anonimização dos pedidos falhou na exclusão                                      |
| `customer_data_exported`             | `me-export-data.js`                       | info       | Cliente exportou os próprios dados                                               |

E-mail nunca vai em claro: os eventos levam `sha256(email).slice(0, 16)` ou o `user_id`.

## 9. Retenção

| Tabela                              | Prazo                                      |
| ----------------------------------- | ------------------------------------------ |
| `download_logs`                     | 12 meses                                   |
| `security_events`, `page_views`     | 6 meses                                    |
| `admin_audit_log`                   | 18 meses                                   |
| `analytics_events`                  | 180 dias                                   |
| `email_sent_log`                    | 90 dias                                    |
| `abandoned_carts` (não recuperados) | 90 dias                                    |
| `email_subscribers`                 | não confirmados 30 dias, descadastrados 90 |
| `rate_limit_hit`                    | 24h                                        |

Funções e jobs `pg_cron` em [04-BANCO-DE-DADOS](./04-BANCO-DE-DADOS.md).

## 10. LGPD

- **Finalidade:** Política de Privacidade em `/privacidade`, Termos em `/termos`.
- **Minimização:** nome e e-mail no checkout; CPF e telefone opcionais; sem endereço (produto
  digital); dados de cartão vão direto ao Mercado Pago.
- **Consentimento:** banner Aceitar / Rejeitar / Personalizar (`ConsentBanner.jsx`, estado em
  `src/utils/consent.js`); GA4 e Meta Pixel só carregam com consentimento.
- **Oposição:** descadastro em 1 clique em todo e-mail de marketing.
- **Exclusão:** `/api/me-delete-account` em 2 passos (pedido com sessão → link por e-mail com token
  HMAC de 1h). Apaga a conta do Auth, anonimiza os pedidos (histórico fiscal fica), apaga tokens
  de download e carrinhos, limpa e-mails legados em `analytics_events` e descadastra da newsletter.
- **Acesso/portabilidade:** `GET /api/me-export-data` devolve pedidos, newsletter e carrinhos do
  titular, com `Cache-Control: no-store`.
- **Logs:** IP e user agent em claro (mitigação de ataque); e-mail só em hash.
- **Transferência internacional:** Supabase em `sa-east-1`; Resend e Google (Gemini) fora do
  Brasil.

## 11. Rotina

### Conferências do banco e do Supabase

```bash
node scripts/check-rls.js            # quem lê o quê com a chave anon (somente leitura, sem PII)
node scripts/check-schema-drift.js   # funções, triggers, policies e grants existem (CLI linkada)
SUPABASE_PAT=… SUPABASE_PROJECT_REF=… node scripts/check-advisor.js   # Security Advisor
```

O Advisor deve dar 0 CRITICAL. Os INFO "RLS Enabled No Policy" nas tabelas só de backend são
esperados.

### Rotação de segredos (trimestral, ou na hora em caso de vazamento)

| Segredo                                            | Efeito                             | Cuidado                                           |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `ADMIN_SESSION_SECRET` / `CUSTOMER_SESSION_SECRET` | Derruba as sessões                 | Avisar o staff                                    |
| `ADMIN_2FA_ENC_KEY`                                | Invalida o `totpSecret` salvo      | Recadastrar o 2FA logo após o deploy              |
| `WEBHOOK_SECRET`                                   | Webhook falha até sincronizar      | Trocar no painel do MP antes do deploy            |
| `MERCADOPAGO_ACCESS_TOKEN`                         | Pagamentos param se dessincronizar | Gerar no painel do MP antes                       |
| `SUPABASE_SERVICE_ROLE_KEY`                        | Backend perde acesso               | Rotacionar no Supabase e atualizar a Vercel junto |
| `CRON_SECRET`                                      | Workflow do cron dá 401            | Atualizar o GitHub Secrets                        |
| `SMTP_PASS`, `GEMINI_API_KEY`                      | E-mail / IA param                  | Atualizar Vercel e SMTP do Supabase Auth          |

Gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Atualizar
`.env.local` e a Vercel (Production e Preview), fazer redeploy e conferir: webhook do MP com 200,
login no painel, criação de pedido.

### Pen-test (antes de release grande, no mínimo anual)

Escopo mínimo:

- Enumeração de `order_code` em `/api/verify-payment`.
- Acesso cruzado: cookie de cliente em `/api/admin/*`; professor(a) em produto, pedido ou arquivo
  de outro professor; dona da loja em Usuários/Segurança.
- CSRF nos POST que dependem só de cookie (`/api/auth/customer/login`, `/api/admin/login`,
  `/api/teacher/account`).
- XSS armazenado em campos de produto e da página da loja.
- Bypass de RLS com a chave `anon` publicada.
- Replay de webhook (assinatura válida + corpo antigo).

Resultados ficam fora do repositório.

## 12. Dependências e npm audit

- O CI (`.github/workflows/test.yml`) roda `npm audit --omit=dev --audit-level=high` sem
  bloquear: só relatório.
- **Runtime (`npm audit --omit=dev`): 0 vulnerabilidades.** O SDK do Mercado Pago está na 3.x,
  o que eliminou a advisory antiga do `uuid`.
- **Árvore completa:** 2 advisories moderadas, ambas do `postcss-selector-parser` via
  `@tailwindcss/typography` (só no build do CSS). O `npm audit fix` só resolve trocando de major
  (`--force`), então ficam aceitas até o plugin publicar a correção.
- O `npm audit fix` / `npm update` do npm 10 falha com `Cannot read properties of null (reading
'edgesOut')` nesta árvore (bug do arborist com o peer set do `vite`). Contorno:
  `npx npm@11 install -D <pacote>@<versão>` e depois `npm ci` com o npm normal para validar o
  lockfile.

Rotina:

1. Olhar o runtime primeiro: é o que roda em produção.
2. Achar a raiz com `npm ls <pacote>`; advisories transitivas costumam vir de uma dependência só.
3. Conferir se o caminho vulnerável é alcançável no código do pacote.
4. Nunca rodar `npm audit fix --force` sem ler: ele instala major. No caminho do dinheiro
   (Mercado Pago, Supabase) isso troca risco em vez de reduzir.

## 13. Pendências de segurança

- **Credenciais no histórico do git.** Um `.env.production` e um arquivo de handoff com PATs do
  Supabase e senhas do admin e de contas de teste foram commitados; os arquivos saíram, os commits
  não. Ordem: (1) revogar os PATs e rotacionar tudo o que estava neles (MP, `WEBHOOK_SECRET`,
  service role, senhas); (2) só então expurgar com `git filter-repo` e forçar novo clone.
  Até o passo 1, trate esses valores como comprometidos.
- **2FA do admin nunca configurado em produção.** O código existe; falta cadastrar o TOTP e o PIN
  na aba Segurança.
- **Sem 2º fator para professor(a) e dona da loja**, que vê pedidos e clientes. O `adminConfig` é
  um só; falta 2FA por conta (segredo por `profiles.id`), e então liberar o Google também para
  admin com o 2º fator depois do OAuth.
- **Arquivo de outro professor.** `download_url` de professor aceita qualquer caminho de
  `product_files`: um professor pode apontar o produto dele para o PDF de outro, comprar e baixar.
  Falta prefixo por vendedor (`product_files/<seller_id>/…`) no upload e exigência do prefixo em
  `handlers/teacher/products.js`. Só vira risco quando houver outro professor com login.
- **Moderação.** Produto de professor nasce `active: true` e entra direto na loja.
- **Pen-test externo** nunca feito (escopo no §11).
