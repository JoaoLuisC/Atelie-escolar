# 09 — API

Referência de todos os endpoints da API. Em produção existe uma função serverless só
(`api/index.js`) servindo o app Express de `lib/express-app.js`; em dev o mesmo app roda pelo
`server.js`. Os handlers de `handlers/**` são montados por `routes/api-compat.routes.js` e, os de
autenticação de cliente, por `routes/auth.routes.js` — todos com `router.all`, porque o método é
conferido dentro do handler (`guardMethod`, 405 com header `Allow`).

Arquitetura e decisões (ADR 0002, ADR 0007) estão em [02-ARQUITETURA.md](./02-ARQUITETURA.md);
regras de contrato HTTP (A1–A6, E1, E4) em [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Convenções

- **Base URL:** `https://<dominio>/api` em produção, `http://localhost:3000/api` em dev.
- **Formato:** JSON nos dois sentidos. Exceções: `/api/download` (302 para a URL assinada),
  `/sitemap.xml` (XML), `/api/track-event` e `/api/abandoned-cart` (204 sem corpo).
- **Envelope (regra A1/A2):** sucesso é `{ success: true, ...payload }`; erro é sempre
  `{ success: false, error: { code, message } }`, com `code` estável de `ERROR_CODES`
  (`lib/http.js`). Em produção não sai `details`.
- **Rate limit (regra E1):** `enforceRateLimit` dentro do handler, contador atômico no Postgres
  (`rpc/rate_limit_hit`), valendo em dev e produção. Estouro: 429 `RATE_LIMITED` com
  `RateLimit-*`, `Retry-After` e `retryAfterSeconds` no corpo. Baldes `failMode: 'closed'`
  respondem 503 `SERVICE_UNAVAILABLE` se o contador cair; os demais seguem (fail-open) e registram
  evento de segurança. Perfis compartilhados em `RATE_LIMITS` (`lib/rate-limit.js`); alguns
  handlers declaram o próprio balde inline. Em dev o `server.js` acrescenta um limitador de borda
  genérico (250/15 min) que não é a política.
- **Cache (regra E4):** catálogo público `s-maxage=300`; tudo do painel `private, no-store`.

### Autenticação e guardas

| Credencial     | Como                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| Cliente        | Cookie `customer_session` (HttpOnly, SameSite=Strict, HMAC, 8 h)           |
| Staff (painel) | Cookie `admin_session` (HttpOnly, SameSite=Strict, HMAC, 8 h)              |
| Webhook MP     | Header `x-signature` (HMAC SHA-256 com `WEBHOOK_SECRET`) + `x-request-id`  |
| Cron           | Header `X-Cron-Secret: <CRON_SECRET>`, comparação timing-safe; nunca query |

A sessão de staff carrega `role` (`admin`, `master` ou `seller`) e `storeOwner`. As guardas de
`lib/admin-session.js`, que respondem 401 sem sessão e 403 com papel errado:

| Guarda                          | Quem passa                                                          |
| ------------------------------- | ------------------------------------------------------------------- |
| `ensureAdminSession`            | admin/master                                                        |
| `ensureStoreSession`            | admin/master ou a professora dona da loja (`seller` + `storeOwner`) |
| `ensureStaffSession`            | qualquer staff (admin, master, seller)                              |
| `ensureRoleSession(['seller'])` | só professor(a)                                                     |

Para a dona da loja, pedidos, clientes, produtos e relatórios vêm recortados aos materiais dela
(`lib/seller-scope.js`); produto de outro professor responde 404.

---

## Mapa

| Endpoint                             | Métodos                       | Guarda                              | Rate limit                                          |
| ------------------------------------ | ----------------------------- | ----------------------------------- | --------------------------------------------------- |
| `/api/products`                      | GET                           | pública                             | `catalog` 120/min por IP                            |
| `/api/product-details`               | GET                           | pública                             | `catalog`                                           |
| `/api/home-content`                  | GET                           | pública                             | `catalog`                                           |
| `/api/home-sections`                 | GET                           | pública                             | `catalog`                                           |
| `/api/cross-sell`                    | GET                           | pública                             | `catalog`                                           |
| `/sitemap.xml`, `/api/sitemap.xml`   | GET                           | pública                             | dispensado (CDN)                                    |
| `/api/create-payment`                | POST                          | cliente (401 sem sessão)            | 20/min por IP                                       |
| `/api/verify-payment`                | POST (GET aceito)             | pública                             | 600/10 min por IP+pedido; 40 pedidos/IP             |
| `/api/webhook`                       | POST                          | assinatura MP                       | dispensado (HMAC)                                   |
| `/api/download`                      | GET                           | token (sessão de outra conta → 403) | 20/10 min por IP+token; 30 tokens/IP                |
| `/api/validate-coupon`               | POST                          | pública (sessão lida p/ público)    | 20/min por IP; cotação usa `catalog`                |
| `/api/send-confirmation-email`       | POST                          | pública                             | 5/10 min por IP                                     |
| `/api/customer-orders`               | GET                           | cliente                             | dispensado (sessão)                                 |
| `/api/me-delete-account`             | POST                          | cliente                             | 5/min por IP                                        |
| `/api/me-export-data`                | GET                           | cliente                             | 5/5 min por IP                                      |
| `/api/me-profile`                    | GET, PUT                      | cliente                             | 20/10 min                                           |
| `/api/refund-request`                | GET, POST                     | cliente                             | 10/10 min                                           |
| `/api/auth/customer/login`           | POST                          | pública                             | 5/10 min por IP+e-mail; 20 e-mails/IP; fail-closed  |
| `/api/auth/customer/register`        | POST                          | pública                             | 5/10 min; fail-closed                               |
| `/api/auth/customer/google/start`    | GET                           | pública                             | 20/10 min                                           |
| `/api/auth/customer/google/callback` | POST                          | pública                             | 20/10 min                                           |
| `/api/auth/customer/session`         | GET                           | lê o cookie                         | dispensado                                          |
| `/api/auth/customer/logout`          | POST                          | same-origin                         | dispensado                                          |
| `/api/subscribe`                     | POST                          | pública                             | 5/min por IP                                        |
| `/api/confirm-subscription`          | GET                           | pública                             | 20/min por IP                                       |
| `/api/unsubscribe`                   | GET, POST                     | pública                             | 20/min por IP                                       |
| `/api/track-event`                   | POST                          | pública                             | 120/min por IP                                      |
| `/api/abandoned-cart`                | POST                          | pública                             | 30/min por IP                                       |
| `/api/cron-email-jobs`               | POST, GET                     | `X-Cron-Secret`                     | dispensado (segredo)                                |
| `/api/admin/login`                   | POST                          | pública                             | 5/10 min (senha); 5/10 min no 2º fator, fail-closed |
| `/api/admin/login-google`            | POST                          | pública                             | `staff-google-login` 20/10 min                      |
| `/api/admin/logout`                  | POST                          | same-origin                         | dispensado                                          |
| `/api/admin/session`                 | GET                           | lê o cookie                         | dispensado                                          |
| `/api/admin/dashboard`               | GET                           | store                               | sessão                                              |
| `/api/admin/kpis`                    | GET                           | store                               | sessão                                              |
| `/api/admin/abc-products`            | GET                           | store                               | sessão                                              |
| `/api/admin/abc-customers`           | GET                           | store                               | sessão                                              |
| `/api/admin/cohort`                  | GET                           | store                               | sessão                                              |
| `/api/admin/funnel`                  | GET                           | store                               | sessão                                              |
| `/api/admin/segments`                | GET                           | store                               | sessão                                              |
| `/api/admin/products`                | GET, POST, PUT, PATCH, DELETE | store                               | sessão                                              |
| `/api/admin/categories`              | GET, POST, PUT, DELETE        | store                               | sessão                                              |
| `/api/admin/coupons`                 | GET, POST, PUT, DELETE        | store                               | sessão                                              |
| `/api/admin/orders`                  | GET                           | store                               | sessão                                              |
| `/api/admin/refund-requests`         | GET, PUT                      | store                               | sessão                                              |
| `/api/admin/settings`                | GET, PUT                      | store (`adminConfig` só admin)      | sessão; mudar 2FA: 5/10 min                         |
| `/api/admin/upload-url`              | POST                          | store                               | sessão                                              |
| `/api/admin/ai-assist`               | POST                          | store                               | 30/hora                                             |
| `/api/admin/sales-study`             | GET, POST                     | store                               | POST: 10/hora                                       |
| `/api/admin/social-publish`          | GET, POST                     | store                               | POST: 20/hora                                       |
| `/api/admin/cleanup-events`          | POST                          | store                               | sessão                                              |
| `/api/admin/users`                   | GET, PUT, DELETE              | admin                               | sessão                                              |
| `/api/admin/product-seller`          | PUT                           | admin                               | sessão                                              |
| `/api/admin/store-owner`             | GET, PUT                      | admin                               | sessão                                              |
| `/api/teacher/account`               | GET, PUT, POST                | staff                               | POST: 5/10 min por conta+IP                         |
| `/api/teacher/dashboard`             | GET                           | seller                              | sessão                                              |
| `/api/teacher/products`              | POST, PATCH                   | seller                              | `teacher-products` 60/h                             |
| `/api/notfound`                      | qualquer                      | pública                             | dispensado                                          |

"Sessão" e "dispensado" são as exceções nomeadas em `handlers/__tests__/rate-limit-coverage.test.js`,
que falha se uma rota montada não tiver contador, guarda de sessão ou dispensa registrada.

---

## 1. Catálogo público

### `GET /api/products`

Produtos ativos, sem query params (filtro, busca e ordenação são do frontend).

```json
{
  "success": true,
  "products": [
    {
      "id": "<uuid>",
      "slug": "...",
      "name": "...",
      "description": "...",
      "price": 19.9,
      "originalPrice": null,
      "image": "...",
      "images": [],
      "category": "Nome da categoria",
      "categoryId": "<uuid>",
      "tags": [],
      "productType": "individual",
      "isKit": false,
      "soldCount": 3,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 42
}
```

`soldCount` = soma das quantidades em pedidos com `payment_status = approved`.

### `GET /api/product-details`

Um produto ativo. **Query:** `slug` ou `id` (só UUID é tratado como `id`; o resto, inclusive
número, é buscado como slug).

Resposta `{ success, product }`, com `faq[]`, `reviews[]`, `benefits[]`, `category`, `categorySlug`,
`kitItems[]`, `panelSizes[]`, `sharedDescription` (`{ title, text }` do setting `productDefaults`,
ou `null`; falha ao ler a configuração não derruba a resposta) e `descriptionLayout`
(`{ descriptionOrder, descriptionAlign, descriptionSize }`). Nunca expõe `download_url`.

### `GET /api/home-content`

Textos e blocos da página da loja salvos no painel (setting `homeContent`), limpos de novo na
leitura (`lib/store-content.js`). Devolve só o que foi salvo —
`{ success, content: { blocks?, navigation?, footer?, seo?, hero?, marquee?, catalog?, howItWorks?, socialProof? } }`,
`{}` se vazio —; o front completa com os padrões de `src/constants/home-content.js`. `navigation`
(título, tamanho) e `footer` (textos e links `https://` das redes) alimentam o `Shell.jsx` em todas
as páginas (`src/services/store-settings.js`).

### `GET /api/home-sections`

Faixas de produtos da home a partir do setting `homeSections` (tipos `category`, `best_sellers`,
`new_arrivals`; default se vazio): `{ success, sections: [{ key, type, title, link, products }] }`.

### `GET /api/cross-sell`

**Query:** `productId` (obrigatório). Até 4 produtos por co-ocorrência em pedidos aprovados; sem
histórico, cai para produtos da mesma categoria.

### `GET /sitemap.xml`

Sitemap dinâmico (`handlers/sitemap.xml.js`), servido na raiz e em `/api/sitemap.xml`. Inclui `/`,
`/produtos`, `/privacidade`, `/termos`, as categorias ativas (`/produtos?categoria=<slug>`) e os
produtos ativos (`/produtos/<slug>`). `application/xml`, cache público de 1 h.

---

## 2. Compra e pagamento

### `POST /api/create-payment`

Cria pedido e preferência do Mercado Pago. **Exige `customer_session`**: sem ela, 401
`CUSTOMER_SESSION_INVALID` (o checkout cria a conta antes). O e-mail do pedido é sempre o da conta
e o pedido grava `customer_id`. A sessão é conferida antes do corpo (regra A3).

```json
{
  "customer": { "email": "...", "name": "...", "cpf": "...", "phone": "..." },
  "items": [{ "productId": "<uuid>", "quantity": 1 }],
  "couponCode": "VOLTEI15",
  "attribution": { "session_id": "...", "utm_source": "..." },
  "acceptedDownloadTerms": true
}
```

`acceptedDownloadTerms` é a caixa de ciência do checkout (Termos, seção 7) e precisa ser
exatamente `true`; senão 400 `VALIDATION_FAILED` e nenhum pedido. O pedido grava a data e a hora
em `orders.download_terms_accepted_at`.

Resposta: `{ success, orderId, orderInternalId, preferenceId, initPoint, sandboxInitPoint,
subtotal, discount, total, couponApplied }`.

- Schema na borda (`validation/payment.schemas.js`): até 100 itens, `quantity` exatamente 1
  (produto digital), `productId` UUID, tetos de tamanho para nome, e-mail, telefone e CPF.
- Preço sempre do banco. Desconto rateado por unidade em centavos (`lib/money.js`); o total do
  pedido é a soma do que vai para a preferência (regra E3).
- Cupom validado no servidor (estado, público, itens elegíveis) e reservado atomicamente
  (`increment_coupon_usage(coupon_id, 'user:<uid>')`, limite total e por cliente) antes de criar o
  pedido, que grava `coupon_customer_key`; a reserva é devolvida após 2 h sem pagamento
  (`release_stale_coupon_reservations`). Cupom recusado **é erro**: 422 com o código do cupom
  (`COUPON_*`, `COUPON_NOT_ELIGIBLE` para público ou carrinho sem item elegível,
  `COUPON_EXHAUSTED` para limite total ou por cliente) e nenhum pedido é criado. Sem cupom,
  `couponApplied: null`.
- Cria `orders` (`pending`, `order_code` com 128 bits de entropia) e `order_items`; a preferência
  leva `external_reference = order_code`. Registra `checkout_initiated`.

### `POST /api/verify-payment`

Consulta o pagamento; se aprovado e ainda não processado, emite os tokens de download, provisiona a
conta do cliente e envia a confirmação (`lib/order-confirmation.js`). **Body:** `{ orderId, email }`
(`orderId` = `order_code`). GET com query ainda é aceito, mas o e-mail na URL vaza para logs.

```json
{
  "success": true,
  "order": {
    "orderId": "ORD-...",
    "status": "completed",
    "paymentStatus": "approved",
    "totalAmount": 19.9,
    "downloadTokens": [
      {
        "productId": "<uuid>",
        "productName": "...",
        "token": "...",
        "expiresAt": "...",
        "available": true
      }
    ],
    "createdAt": "...",
    "items": [{ "id": "<uuid>", "title": "...", "quantity": 1, "price": 19.9 }]
  }
}
```

Em pedido aprovado, link usado ou expirado é reemitido (novo token, +72 h) até 5 downloads por item
(`download_logs`); acima disso, `available: false`. Pedido inexistente e e-mail que não bate dão o
mesmo 404 (comparação timing-safe, evento `verify_payment_email_mismatch`).

### `POST /api/webhook`

Notificação do Mercado Pago (`{ type, data: { id } }`).

- Assinatura inválida ou `ts` fora da janela de frescor → 401 e evento `webhook_invalid_signature`.
- Consulta o pagamento na API do MP e casa `external_reference` com `orders.order_code`.
- `approved` que não reconcilia valor/moeda (`checkPaymentIntegrity`) → 200 sem aprovar, evento
  `payment_amount_mismatch`.
- `approved` que reconcilia → transição atômica e idempotente para `approved`, tokens de download
  (72 h), provisionamento da conta, e-mail de confirmação e evento `payment_approved`.
- `rejected`/`cancelled` → `status=failed` só se o pedido ainda não foi aprovado.
- Reentregas são idempotentes; responde 200.

### `GET /api/download`

**Query:** `token`. Token de uso único: claim atômico `used=false → true`, signed URL do Storage
(5 min) e 302 para ela, com `Referrer-Policy: no-referrer` e `Cache-Control: no-store`; grava
`download_logs`.

Sem login, o token basta (link do e-mail). Com `customer_session` de **outra** conta (o
`customer_id` do pedido é diferente), 403 `FORBIDDEN` e evento `download_token_other_customer`, sem
gastar o token. Só assina arquivo do bucket privado `product_files` (ou `SUPABASE_STORAGE_BUCKET`).

Erros: 400 sem token; 401 `DOWNLOAD_TOKEN_INVALID` | `DOWNLOAD_TOKEN_USED` |
`DOWNLOAD_TOKEN_EXPIRED`; 403 sessão de outra conta; 404 produto/arquivo; 500 `DOWNLOAD_UNAVAILABLE`
se `download_url` não for do Storage ou estiver fora de `product_files` (fail-closed, token não é consumido, evento `download_url_not_storage`); 502 se a
assinatura falhar (claim devolvido).

### `POST /api/validate-coupon`

- `{ code, items }`: valida o cupom contra o carrinho com preços do banco. Resposta
  `{ success, coupon: { code, discountType, discountValue }, items, subtotal, discount, total }`.
- `{ quote: true, items }`: só cota o carrinho (`{ success, items, subtotal }`), no balde `catalog`.
- Lê a `customer_session`, se houver, para o público do cupom e o limite por cliente: cupom com
  público diferente de `all` ou com `max_uses_per_customer` pede login (422 `COUPON_NOT_ELIGIBLE`).
  É só prévia — o `create-payment` decide.

422 com `COUPON_NOT_FOUND`, `COUPON_INACTIVE`, `COUPON_NOT_YET_VALID`, `COUPON_EXPIRED`,
`COUPON_EXHAUSTED`, `COUPON_MINIMUM_NOT_MET` ou `COUPON_NOT_ELIGIBLE`; `VALIDATION_FAILED` com
carrinho vazio.

### `POST /api/send-confirmation-email`

Reenvio manual da confirmação do pedido (o envio normal sai do webhook/verify-payment).
**Body:** `{ orderId, customerName, customerEmail, isNewAccount }`; `orderId` e `customerEmail` são
obrigatórios. O destinatário é sempre o e-mail gravado no pedido — o do body é ignorado.
Idempotente por `email_sent_log` (`order_confirmation` + `orderId`). Best-effort: responde 200
`{ success, sent, skipped, reason }` mesmo quando não envia.

---

## 3. Cliente

### `GET /api/customer-orders`

Pedidos do cliente logado, com itens e tokens de download. Escopo por `customer_id` do cookie,
nunca por parâmetro. Pedidos antigos de convidado sem `customer_id` com o mesmo e-mail confirmado
em `auth.users` são adotados pela conta antes da listagem.

### `GET|POST /api/refund-request`

Solicitação de devolução, com `customer_session` (401 sem ela).

Regra por download (Termos, seção 7; `lib/refund-policy.js`): até 7 dias da aprovação e nenhum
download → fluxo `simple`; já baixou ou passou de 7 dias → `support`. O servidor decide.

- **GET:** `{ success, requests: [{ id, order_id, reason, reason_category, flow, phone, status,
admin_response, created_at, updated_at }], eligibility: [{ orderId, flow, flowReason
('ok'|'downloaded'|'expired'), deadline, firstDownloadAt, downloadCount }] }` — `eligibility` tem
  uma linha por pedido aprovado da conta, para o front mostrar o formulário certo.
- **POST** `{ orderId, reasonCategory?, reason?, phone? }`: `orderId` é o `order_code` (até 100);
  telefone opcional, só dígitos, espaço e `()+.-`, 8 a 40 caracteres. Fluxo `simple`: categoria
  opcional (padrão `desistencia`). Fluxo `support`: `reasonCategory` em `nao_abre`, `defeito`,
  `diferente_do_anunciado`, `outro` e `reason` com 20 a 2.000 caracteres. Fora disso → 400
  `VALIDATION_FAILED`. Pedido não aprovado ou de outra conta → 404. Cria com status `open`,
  gravando `flow`, `reason_category`, `first_download_at` e `download_count` → 201
  `{ requestId, flow }`. Já existe uma não encerrada (inclusive na corrida, pelo índice único) →
  200 `{ requestId, alreadyRequested: true }`. **Não estorna nada.**

### `GET|PUT /api/me-profile`

Perfil do cliente, com `customer_session` (401 sem ela). GET devolve `{ user }` com o nome de
`profiles.display_name`. PUT `{ name }` (2–120 caracteres, espaços colapsados) grava em
`profiles`, renova o cookie e devolve `{ user }`; perfil inexistente → 404.

### `POST /api/me-delete-account`

Exclusão da própria conta (LGPD) em dois passos, ambos com `customer_session`:

1. Sem body: gera token assinado (HMAC, 1 h) e envia o link de confirmação por e-mail. Contas
   admin/master → 403.
2. `{ token }` do mesmo uid: anonimiza a PII dos pedidos (mantém o histórico fiscal), apaga
   `download_tokens` e `abandoned_carts`, limpa o e-mail em `analytics_events`, apaga o usuário em
   `auth.users`, descadastra da newsletter, registra `account_self_deleted` e limpa a sessão.

### `GET /api/me-export-data`

Acesso e portabilidade (LGPD art. 18, V). Exige o cookie e confirma o uid em `auth.users`. Devolve
o titular (nome do perfil), pedidos (com itens e metadados de download), solicitações de devolução
(`solicitacoesDeDevolucao`), inscrição na newsletter e carrinhos abandonados.
Não inclui, de propósito, o valor dos tokens de download, eventos de analytics nem registros de
segurança — o campo `naoIncluido` declara isso. `Cache-Control: no-store`; evento
`customer_data_exported` sem PII.

### Autenticação de cliente

| Endpoint                             | Método | O que faz                                                                                               |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------- |
| `/api/auth/customer/login`           | POST   | E-mail + senha; emite `customer_session`                                                                |
| `/api/auth/customer/register`        | POST   | Cadastro com e-mail, senha e nome. Senha 8+ com maiúscula, minúscula, número e caractere especial (400) |
| `/api/auth/customer/google/start`    | GET    | Inicia o OAuth do Google pelo Supabase                                                                  |
| `/api/auth/customer/google/callback` | POST   | Conclui o OAuth e abre a sessão                                                                         |
| `/api/auth/customer/session`         | GET    | Sessão atual ou `null`                                                                                  |
| `/api/auth/customer/logout`          | POST   | Limpa o cookie; exige requisição same-origin (CSRF)                                                     |

---

## 4. Newsletter

### `POST /api/subscribe`

**Body:** `{ email, source?, attribution? }`. Double opt-in: cria ou reativa o inscrito com
`confirmed=false` e envia o e-mail de confirmação. Já confirmado → `{ success, alreadyConfirmed:
true }`; reenvio em menos de 1 h reusa o token.

### `GET /api/confirm-subscription`

**Query:** `token` (TTL 72 h, invalidado no uso). Resposta `{ success, confirmed: true,
alreadyConfirmed?, email }`; a página `/confirmar-inscricao` decide a UI. Erros: 400 sem token, 404
token inválido, 409 inscrição descadastrada (link antigo não reativa), 410 `CONFIRMATION_EXPIRED`.

### `GET|POST /api/unsubscribe`

Idempotente. `GET ?token=` (link do e-mail) e `POST` com token na query ou no body (RFC 8058,
1-click do Gmail/Outlook) descadastram. `POST { email }` não descadastra: envia ao endereço, se
inscrito e ativo (no máximo 1x/dia), um link com o token e responde `{ confirmationRequired: true,
message }`. Mensagem sempre neutra; 400 para token malformado.

---

## 5. Analytics

### `POST /api/track-event`

**Body:** `{ event_name, session_id, properties }`. `event_name` precisa estar em
`CLIENT_ALLOWED_EVENTS` (`lib/analytics-events.js`): `view_item`, `add_to_cart`,
`remove_from_cart`, `view_cart`, `view_catalog`, `begin_checkout`, `client_error`. Chaves com PII
em `properties` são removidas. Responde sempre 204 — evento recusado ou erro interno também.
Eventos de servidor (`checkout_initiated`, `payment_approved`…) são gravados pelos próprios
handlers.

### `POST /api/abandoned-cart`

**Body:** `{ email, sessionId, items, attribution }` (até 20 itens; `total_amount` recalculado).
Upsert por `(email, session_id)`; atualizar o carrinho zera `reminder_sent_at`. Responde 204.

---

## 6. Cron de e-mails

### `POST|GET /api/cron-email-jobs`

Chamado de hora em hora pelo workflow `.github/workflows/email-cron.yml` com `X-Cron-Secret` (401
se inválido). Até 100 candidatos por sub-job:

1. Carrinho abandonado: 1º lembrete após `ABANDONED_CART_FIRST_HOURS` (1 h), 2º após
   `ABANDONED_CART_SECOND_HOURS` (24 h). Só envia com opt-in confirmado ou pedido aprovado com o
   e-mail; nunca para descadastrado; pula `recovered_at`.
2. Pós-compra: D+3 (review), D+15 (complementar da categoria), D+45 (novidades da categoria).
3. Reativação de inativos entre `REACTIVATION_DAYS_MIN`/`MAX` (90–180 d) com o cupom
   `REACTIVATION_COUPON_CODE` (`VOLTEI15`, 15%), no máximo 1x/mês por e-mail.

Idempotência por `email_sent_log`. Resposta: `{ success, elapsedMs, abandoned: { firstReminder,
secondReminder, skipped, blocked }, postPurchase: { d3, d15, d45 }, reactivation: { sent, blocked } }`.

---

## 7. Painel

Todas as respostas do painel saem `private, no-store`. Toda escrita grava auditoria
(`logAdminAction`, `lib/admin-audit.js`).

### Login e sessão

| Endpoint                  | Método | O que faz                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/admin/login`        | POST   | E-mail + senha via Supabase para `admin`, `master` ou `seller`. Com 2FA ativo, devolve um `challengeToken` (uso único, 120 s, preso ao IP; expirado é reemitido) e espera TOTP, código por e-mail (`sendEmailCode: true` pede o envio; resposta traz `emailSent`/`emailHint`; vale 10 min) ou PIN. Senha errada e conta sem papel dão a mesma resposta |
| `/api/admin/login-google` | POST   | `{ accessToken }` do OAuth do Supabase. Confere o token no Supabase e abre `admin_session` só para `seller`. Admin/master → 403 (entram por senha + 2º fator); outro papel → 401                                                                                                                                                                       |
| `/api/admin/logout`       | POST   | Limpa `admin_session`; exige same-origin                                                                                                                                                                                                                                                                                                               |
| `/api/admin/session`      | GET    | `{ success, authenticated }` e, com sessão, `email`, `role`, `userId`, `storeOwner`                                                                                                                                                                                                                                                                    |

### Painel da loja (`ensureStoreSession`)

| Endpoint                     | Métodos                       | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/dashboard`       | GET                           | Payload agregado: produtos, categorias, perfis, pedidos, itens, logs de download, settings e resumo de receita                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/api/admin/kpis`            | GET                           | `?window=` (meses, 1–36, padrão 12). Receita do mês e do anterior, ticket médio, pedidos, LTV, recompra (CAC `null`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/admin/abc-products`    | GET                           | Curva ABC por receita (`?period=` padrão `month`, `?categoryId=`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/abc-customers`   | GET                           | Curva ABC de clientes + vip/recorrente/eventual (`?period=` padrão `quarter`); e-mails mascarados salvo `?includePII=1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/api/admin/cohort`          | GET                           | Retenção por coorte mensal (`?months=`, 1–36)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/api/admin/funnel`          | GET                           | Funil por sessão + atribuição UTM (`?days=`, 1–180)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/api/admin/segments`        | GET                           | Segmentação agregada de inscritos, sem lista de e-mails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/api/admin/products`        | GET, POST, PUT, PATCH, DELETE | Lista (ou `?id=`), cria, atualiza, altera parcialmente e remove. Categoria precisa existir (UUID ou slug), senão 400. Produto criado pela dona já nasce com o `seller_id` dela                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/api/admin/categories`      | GET, POST, PUT, DELETE        | CRUD de categorias (slug normalizado; 409 em duplicata)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/api/admin/coupons`         | GET, POST, PUT, DELETE        | CRUD de cupons. Campos: `code`, `discountType`, `discountValue`, `validFrom` (data pura = 00:00 de Brasília), `validUntil` (23:59:59 de Brasília), `maxUses`, `maxUsesPerCustomer` (≥ 1 ou vazio), `minOrderAmount`, `audience` (`all`, `customers`, `new_customers`, `returning_customers`, `emails`, `purchase_milestone`), `eligibleEmails` (obrigatório em `emails`, até 500), `purchasesRequired` (obrigatório em `purchase_milestone`), `active`                                                                                                                                                                                                                                                |
| `/api/admin/orders`          | GET                           | Pedidos com itens; `?status=` filtra por `payment_status`. Para a dona, só pedidos com material dela                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/admin/refund-requests` | GET, PUT                      | GET: solicitações com `flow`, `reason_category`, `first_download_at`, `download_count`, `firstDownloadIp` (IP do 1º download, de `download_logs`) e `order: { order_code, customer_name, customer_email }`, só dos pedidos no recorte da professora. PUT `{ id, status, response }` — `status` em `open`, `contacted`, `accepted`, `declined`, `resolved`; resposta até 4.000 — grava e audita (`refund_request`); pedido fora do recorte → 403. Não estorna                                                                                                                                                                                                                                          |
| `/api/admin/settings`        | GET, PUT                      | `?key=` entre `homeSections`, `homeContent`, `productDefaults` e `adminConfig`. `homeContent`/`productDefaults` são limpos no PUT (`lib/store-content.js`; descartes voltam em `ignoredFields`). `adminConfig` (TOTP, PIN) é só de admin (403 para a dona), nunca devolve segredos (`has2FA`/`hasPin`) e mudar o 2º fator exige o fator vigente (`SECOND_FACTOR_REQUIRED`)                                                                                                                                                                                                                                                                                                                            |
| `/api/admin/upload-url`      | POST                          | `{ kind, action }` com `kind` = `image`, `video` ou `download` e `action` = `sign` (padrão, gera signed upload URL) ou `confirm` (confere o objeto enviado). Whitelist de extensão/MIME; SVG/HTML barrados em bucket público                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/api/admin/ai-assist`       | POST                          | `{ task, input }`, `task` = `productCopy` (descrição, benefícios, FAQ), `productSeo` (nome, Google, faixa de preço) ou `homeCopy` (textos da loja). Só gera no clique, nada é gravado. Cota do Gemini → 429 `RATE_LIMITED`; IA indisponível → 503                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/admin/sales-study`     | GET, POST                     | GET: última análise (`settings.salesStudy`) + `aiConfigured`. POST `{ days }` (7–90, padrão 30): recalcula período atual × anterior e pede a leitura ao Gemini; sem IA, volta os números e `aiError` (`INSUFFICIENT_DATA`, `AI_NOT_CONFIGURED`, `AI_QUOTA`, `AI_FAILED`)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/api/admin/social-publish`  | GET, POST                     | GET: `{ platforms: { facebook, instagram, pinterest, tiktok, whatsapp } }`, `true` se as variáveis da rede existem (nunca o token). POST `{ platform, caption (até 2.200), mediaUrl?, link?, title?, recipient?, privacy?, videoSize? }`: só `https://`; rede sem variáveis → 503. Facebook (foto ou post), Instagram e Pinterest (imagem obrigatória, até 8 MB), TikTok (vídeo até 64 MB; consulta `creator_info` e só aceita a privacidade permitida; devolve o `upload_url` para o navegador enviar o vídeo), WhatsApp (`recipient` com DDI, 8–15 dígitos). Erros: 400 entrada, 422 token vencido/sem permissão ou mídia recusada, 429 limite da rede, 502 rede fora/timeout. Audita sem a legenda |
| `/api/admin/cleanup-events`  | POST                          | RPC `cleanup_old_analytics_events` (remove eventos com mais de 180 dias)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Só admin (`ensureAdminSession`)

| Endpoint                    | Métodos          | O que faz                                                                                                                                                                   |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/users`          | GET, PUT, DELETE | Lista e edita perfis (papel só entre os atribuíveis). DELETE revoga o acesso: bane o login em `auth.users` e apaga o perfil, mantendo os pedidos. Contas admin/master → 403 |
| `/api/admin/product-seller` | PUT              | `{ productId, sellerId }`: atribui o produto a um perfil `seller` (400 se não for)                                                                                          |
| `/api/admin/store-owner`    | GET, PUT         | GET `{ sellerId }` da dona da loja; PUT `{ sellerId }` (precisa ser `seller`). Vale no próximo login dela                                                                   |

### Conta e área do professor

| Endpoint                 | Métodos        | Guarda | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/teacher/account`   | GET, PUT, POST | staff  | GET `{ account: { email, displayName, role, storeOwner, provider, createdAt } }`. PUT `{ displayName }` (1–80). POST `{ action: "change-password", currentPassword, newPassword }` troca na hora; POST `{ action: "change-email", currentPassword, newEmail }` dispara o link de confirmação do Supabase (o e-mail muda no clique). As duas conferem a senha atual por login real (`lib/staff-account.js`); senha errada → 400 + `staff_reauth_failed` |
| `/api/teacher/dashboard` | GET            | seller | Produtos do professor com vendas e receita (só `approved`), categorias e resumo                                                                                                                                                                                                                                                                                                                                                                        |
| `/api/teacher/products`  | POST, PATCH    | seller | POST cria produto do professor (`name`, `price`, `description`, `downloadUrl` validado por `lib/product-media.js`, `categoryId`), já ativo. PATCH `{ id, active }` só no próprio produto (senão 404). As duas escritas entram no audit log                                                                                                                                                                                                             |

---

## 8. Infraestrutura

- **404 de `/api/*`:** caminho sem rota cai no `notFoundHandler` de `middleware/error.middleware.js`
  (envelope, `code: "NOT_FOUND"`). `/api/notfound` responde o mesmo 404 pelo handler de
  `handlers/notfound.js`.
- **`/api/admin-<recurso>`:** o `vercel.json` reescreve a URL plana antiga para
  `/api/admin/<recurso>` (regra A6).
- **`GET /health`:** só no `server.js` de dev — `{ ok: true, service: 'api', port }`. Não existe em
  produção.

---

## 9. Erros comuns

| HTTP | Quando                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | Payload ou query inválido (`VALIDATION_FAILED`)                                                                                                                                                       |
| 401  | Sessão ausente/expirada; token de download inválido, usado ou expirado; assinatura do webhook; `X-Cron-Secret` errado                                                                                 |
| 403  | Papel sem acesso; download com sessão de outra conta; devolução fora do recorte da professora; logout cross-origin; editar/excluir admin/master em `users`; `me-delete-account` de conta admin/master |
| 404  | Recurso inexistente ou de outro professor; pedido aprovado não encontrado na devolução; `verify-payment` com e-mail que não bate; `/api/*` sem rota                                                   |
| 405  | Método não permitido (header `Allow`)                                                                                                                                                                 |
| 409  | Duplicata (slug de categoria); confirmação de inscrição descadastrada                                                                                                                                 |
| 410  | Link de confirmação expirado (`CONFIRMATION_EXPIRED`)                                                                                                                                                 |
| 422  | Cupom não aplicável em `/api/validate-coupon` ou `/api/create-payment`; rede social recusou a publicação                                                                                              |
| 429  | Rate limit (`RATE_LIMITED`); também cota esgotada do Gemini ou limite da rede social                                                                                                                  |
| 500  | Erro interno, mensagem genérica                                                                                                                                                                       |
| 502  | Falha ao assinar a URL do download (token devolvido); rede social fora do ar                                                                                                                          |
| 503  | Contador indisponível em balde fail-closed; IA indisponível; falha de e-mail no cadastro; rede social não configurada                                                                                 |

Pagamento rejeitado não é erro HTTP: o webhook responde 200 e o `verify-payment` devolve
`paymentStatus: "rejected"`.

---

## 10. Testando à mão

```bash
# Healthcheck (só dev)
curl http://localhost:3000/health

# Login de cliente e chamada com sessão
curl -X POST http://localhost:3000/api/auth/customer/login -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SenhaForte123!"}'
curl http://localhost:3000/api/customer-orders -b cookies.txt

# Criar pagamento (exige a sessão de cliente do passo acima)
curl -X POST http://localhost:3000/api/create-payment -b cookies.txt -H "Content-Type: application/json" \
  -d '{"customer":{"email":"x@y.com","name":"Teste"},"items":[{"productId":"<id-real>","quantity":1}],"acceptedDownloadTerms":true}'

# Webhook assinado
PAYMENT_ID=12345; WEBHOOK_SECRET=<seu-secret>; TS=$(date +%s)
HASH=$(echo -n "id:$PAYMENT_ID;request-id:abc;ts:$TS;" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhook -H "Content-Type: application/json" \
  -H "x-signature: ts=$TS,v1=$HASH" -H "x-request-id: abc" \
  -d "{\"type\":\"payment\",\"data\":{\"id\":\"$PAYMENT_ID\"}}"

# Cron
curl -X POST http://localhost:3000/api/cron-email-jobs -H "X-Cron-Secret: <seu-CRON_SECRET>"
```

Como subir o ambiente local e quais variáveis ele precisa: [03-SETUP-E-DEPLOY.md](./03-SETUP-E-DEPLOY.md).

---

## 11. Versionamento

Não há `/api/v1`. O contrato é interno (loja e painel): mudança que quebra endpoint atualiza o
consumidor no mesmo PR. Se um dia houver consumidor externo, os handlers novos vão para
`handlers/v2/`, montados sob `/api/v2` num router próprio em `lib/express-app.js`.
