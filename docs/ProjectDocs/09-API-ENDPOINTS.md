# 09 — API endpoints

> Referência de **todos** os endpoints expostos pela API. Em produção existe **uma** função serverless (`api/index.js`) servindo o app Express de `lib/express-app.js`; em dev o mesmo app roda pelo `server.js`. Nos dois casos os handlers planos de `handlers/*.js` são montados por `routes/api-compat.routes.js` e os aninhados (`handlers/auth/customer/**`) por `routes/auth.routes.js` — mesmas rotas `/api/<nome>`.

---

## Convenções

- **Base URL:** `https://<dominio>/api` em prod, `http://localhost:3000/api` em dev
- **Content-Type:** `application/json` para requests e responses (exceto `/api/download`, que redireciona para a URL do arquivo, e `/sitemap.xml`, que é `application/xml`)
- **Autenticação:**
  - **Cliente** — cookie `customer_session` (HttpOnly, SameSite=Strict) emitido em `/api/auth/customer/login`
  - **Admin** — cookie `admin_session` (HttpOnly, SameSite=Strict) emitido em `/api/admin/login`
  - **Webhook** — header `x-signature` validado por HMAC com `WEBHOOK_SECRET`
  - **Cron** — header `X-Cron-Secret: <CRON_SECRET>` (comparação timing-safe; nunca via query string)
- **Erros:** envelope único `{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "mensagem humana" } }` (`fail()` em `lib/http.js`). Todo erro traz um `code` estável de `ERROR_CODES`; em produção não sai `details`
- **Rate-limit:** `enforceRateLimit` dentro de cada handler, com contador atômico no Postgres (`rpc/rate_limit_hit`). Vale em dev e em produção. 429 com headers `RateLimit-*` + `Retry-After` e corpo `{ success: false, error: { code: "RATE_LIMITED", message }, retryAfterSeconds }`. Os baldes `failMode: 'closed'` (login/cadastro de cliente e 2º fator do admin) respondem 503 `SERVICE_UNAVAILABLE` se o contador cair. Em dev há também um limitador de borda genérico (250/15min) no `server.js`

---

## 1. Catálogo público

**Rate-limit:** 120 req/min por IP (`catalog`) em todos os endpoints de catálogo (`products`, `product-details`, `home-sections`, `home-content`, `cross-sell`).

### `GET /api/products`

Lista produtos ativos (sem query params — filtro/busca/ordenação acontecem no frontend).

**Response 200** (cache público 5 min):

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

Detalhes completos de 1 produto ativo.

**Query:** `slug` **ou** `id` (um dos dois obrigatório; só UUID é tratado como `id`, o resto — inclusive número — é buscado como slug)

**Response 200** (cache público 5 min): `{ success, product }` — o objeto `product` inclui `faq[]`, `reviews[]`, `benefits[]`, `category` (nome), `categorySlug`, `kitItems[]`, `panelSizes[]` etc. **Nunca** expõe `download_url` (o link do arquivo só é resolvido em `/api/download` após validar o token).

O campo `product.sharedDescription` traz a descrição comum a todos os produtos (setting `productDefaults`, aba Produtos do painel): `{ title, text }`, ou `null` quando não há texto. Falha ao ler a configuração não derruba a resposta — o campo vem `null`.

### `GET /api/home-content`

Textos e blocos da página inicial salvos na aba "Página inicial" do painel (setting `homeContent`). Devolve **só o que foi salvo**, limpo de novo na leitura (`lib/store-content.js`); o front completa com os textos padrão de `src/constants/home-content.js` o que estiver ausente.

**Response 200** (mesmo cache de CDN do catálogo): `{ success: true, content: { blocks?, seo?, hero?, marquee?, catalog?, howItWorks?, socialProof? } }` — `content` é `{}` quando nada foi salvo.

### `GET /api/home-sections`

Seções da home (vitrine), montadas a partir do setting `homeSections` (tipos `category`, `best_sellers`, `new_arrivals`; default se o setting estiver vazio).

**Response 200** (cache público 5 min):

```json
{
  "success": true,
  "sections": [
    { "key": "best_sellers-0", "type": "best_sellers", "title": "Mais vendidos", "link": "/produtos?preset=mais-vendidos", "products": [...] },
    { "key": "new_arrivals-1", "type": "new_arrivals", "title": "Novidades", "link": "/produtos?preset=novidades", "products": [...] }
  ]
}
```

### `GET /api/cross-sell`

Recomendações relacionadas.

**Query:** `productId` (obrigatório)

**Response 200** (cache público 5 min): lista de até 4 produtos por co-ocorrência de compra em pedidos aprovados; fallback para produtos da mesma categoria (featured + mais recentes) quando não há histórico.

### `GET /sitemap.xml`

Sitemap dinâmico para SEO (handler `handlers/sitemap.xml.js`; servido na **raiz** — rewrite no `vercel.json` e mount direto no Express). Inclui as rotas estáticas `/`, `/produtos`, `/privacidade` e `/termos` (as páginas legais entram; `/login` não), as categorias ativas (como `/produtos?categoria=<slug>`) e as páginas de produto ativas (`/produtos/<slug>`).

**Response:** `application/xml` (cache público 1h)

---

## 2. Compra e pagamento

### `POST /api/create-payment`

Cria pedido + preferência Mercado Pago.

**Auth:** opcional — convidado compra sem sessão (a conta é provisionada depois da aprovação); com `customer_session` o pedido usa o e-mail da conta (o do formulário é ignorado).

**Rate-limit:** 20 req/min por IP.

**Body:**

```json
{
  "customer": { "email": "...", "name": "...", "cpf": "...", "phone": "..." },
  "items": [{ "productId": "<uuid-do-produto>", "quantity": 1 }],
  "couponCode": "VOLTEI15",
  "attribution": { "session_id": "...", "utm_source": "..." }
}
```

**Response 200:**

```json
{
  "success": true,
  "orderId": "ORD-1720000000000-a1b2c3...",
  "orderInternalId": "<uuid-interno-do-pedido>",
  "preferenceId": "...",
  "initPoint": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
  "sandboxInitPoint": "...",
  "subtotal": 22.9,
  "discount": 3.0,
  "total": 19.9,
  "couponApplied": "VOLTEI15"
}
```

**Validações backend:**

- Items reais com preços do banco (não confia no client); máx. 100 itens, `quantity` inteiro 1–99
- Cupom validado server-side (existe + ativo + não expirou + mínimo de pedido + elegibilidade por item); o uso é reservado atomicamente via RPC `increment_coupon_usage` ANTES de criar o pedido (respeita `max_uses` sob concorrência) e devolvido após 2h se o pedido não for pago (`release_stale_coupon_reservations`, migration `20261008000000`). Cupom inválido/esgotado não dá erro: o pedido segue sem desconto (`couponApplied: null`)
- Cria `orders` (status=pending, `order_code` com 128 bits de entropia) + `order_items` em lote (preço original, sem rateio de desconto)
- Cria preferência MP com `external_reference = order_code` e desconto rateado só nos itens elegíveis
- Registra evento `checkout_initiated`

### `POST /api/verify-payment` (GET depreciado)

Verifica status de pagamento; se aprovado (e ainda não processado), cria os download tokens e provisiona a conta do cliente.

**Body:** `{ orderId, email }` (`orderId` = `order_code`; os dois obrigatórios). GET com `?orderId=&email=` ainda é aceito por compatibilidade, mas o e-mail na query vaza para logs e Referer.

**Rate-limit:** 600 req/10min por IP+pedido (cobre o polling) + 40 pedidos distintos por IP a cada 10min (anti-varredura).

**Response 200:**

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
        "token": "xyz",
        "expiresAt": "...",
        "available": true
      }
    ],
    "createdAt": "...",
    "items": [{ "id": "<uuid>", "title": "...", "quantity": 1, "price": 19.9 }]
  }
}
```

Em pedido aprovado, link usado/expirado é reemitido (novo token, +72h) até 5 downloads por item (contados em `download_logs`); acima disso `available: false`.

**Response 404 (não encontrado OU email não bate):** resposta uniforme para evitar enumeração (comparação timing-safe) + security event `verify_payment_email_mismatch`.

### `POST /api/webhook`

Webhook do Mercado Pago.

**Headers:** `x-signature: ts=...,v1=...` (HMAC SHA-256 com `WEBHOOK_SECRET`) + `x-request-id`

**Body:** `{ type, data: { id } }` (formato MP)

**Comportamento:**

- Valida assinatura → 401 + security event `webhook_invalid_signature` se falhar
- Assinatura com `ts` fora da janela de frescor também → 401 (`reason: stale_timestamp` no evento)
- Consulta `payment.get(id)` na MP API
- Match em `orders.order_code = external_reference`
- Se `approved` mas o valor/moeda não reconcilia com o pedido (`checkPaymentIntegrity`): responde 200 **sem** aprovar e registra `payment_amount_mismatch`
- Se `approved` e reconcilia: transição **atômica e idempotente** `!approved → approved`, cria `download_tokens` (validade 72h, insert em lote idempotente), provisiona a conta do cliente (com e-mail de definição de senha na 1ª aprovação) e registra evento `payment_approved` (o endpoint `/api/send-confirmation-email` existe para (re)envio, mas nenhum código o chama automaticamente hoje)
- Se `rejected`/`cancelled`: marca `payment_status` + `status=failed` **só se o pedido ainda não estiver aprovado** (notificação atrasada não rebaixa pedido pago) e registra o evento correspondente
- Responde 200 para a MP em caso de sucesso (reentregas são idempotentes)

### `GET /api/download`

Download de arquivo com token de **uso único**.

**Query:** `token` (obrigatório)

**Rate-limit:** 20 req/10min por IP+token + 30 tokens distintos por IP a cada 10min.

**Validações:**

- Token existe + não usado + não expirou (inválido/usado/expirado → 401)
- Claim atômico `used=false → true` (requisições concorrentes com o mesmo token são barradas)
- Gera signed URL do Supabase Storage (5 min) e **redireciona** para ela. `download_url` fora do Storage → 500 `DOWNLOAD_UNAVAILABLE` + security event `download_url_not_storage` (fail-closed, token não é consumido)
- Headers `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Download-Mode: signed-storage`
- Insere `download_logs` (IP, UA, timestamp)

**Response:** 302 para a URL do arquivo.

**Erros:** 400 sem token; 401 `DOWNLOAD_TOKEN_INVALID` | `DOWNLOAD_TOKEN_USED` | `DOWNLOAD_TOKEN_EXPIRED`; 404 produto/arquivo; 502 falha ao assinar (claim devolvido).

### `POST /api/validate-coupon`

Validação server-side de cupom.

**Rate-limit:** 20 req/min por IP (prévia de cupom); 120 req/min no modo cotação (balde `catalog`).

**Body:** `{ code, items }` (subtotal é recalculado com os preços do banco), ou `{ quote: true, items }` para só cotar o carrinho com preços do banco (resposta `{ success, items, subtotal }`)

**Response 200:**

```json
{
  "success": true,
  "coupon": { "code": "VOLTEI15", "discountType": "percent", "discountValue": 15 },
  "items": [
    {
      "productId": "<uuid>",
      "name": "...",
      "price": 22.9,
      "categoryId": "<uuid>",
      "quantity": 1,
      "available": true
    }
  ],
  "subtotal": 22.9,
  "discount": 3.44,
  "total": 19.46
}
```

**Response 422:** `{ success: false, error: { code: "COUPON_NOT_FOUND" | "COUPON_INACTIVE" | "COUPON_NOT_YET_VALID" | "COUPON_EXPIRED" | "COUPON_EXHAUSTED" | "COUPON_MINIMUM_NOT_MET" | "COUPON_NOT_ELIGIBLE" | "VALIDATION_FAILED" (carrinho vazio), message } }`

### `POST /api/send-confirmation-email`

(Re)envia e-mail de confirmação do pedido. Endpoint idempotente disponível para uso manual — hoje nenhum código do frontend o chama automaticamente.

**Rate-limit:** 5 req/10min por IP.

**Body:** `{ orderId, customerName, customerEmail, isNewAccount }` (`orderId` = `order_code`). `orderId` e `customerEmail` são obrigatórios (400 se faltarem), embora `customerEmail` não seja usado como destinatário.

**Response 200:** `{ success: true, sent, skipped, reason }` — best-effort: nunca falha o checkout (pedido inexistente ou erro interno retornam 200 com `sent: false`).

**Segurança:** o destinatário é **sempre** o e-mail gravado no pedido — o `customerEmail` do body é ignorado (conhecer um `order_code` não permite exfiltrar itens/total para e-mail arbitrário). Idempotente via `email_sent_log` (kind `order_confirmation` + `entityId`).

---

## 3. Cliente logado

### `GET /api/customer-orders`

Histórico de pedidos do cliente, com itens e download tokens.

**Auth:** cookie `customer_session` obrigatório.

**Response 200:** `{ success, orders: [...] }` — escopo por `orders.customer_id = uid` do cookie (nunca por parâmetro — anti-IDOR). Pedidos de convidado órfãos (`customer_id` nulo) com o mesmo e-mail **confirmado** em `auth.users` são adotados pela conta antes da listagem.

### `POST /api/me-delete-account`

Exclusão de conta self-service (LGPD, direito ao esquecimento) em **2 passos**.

**Rate-limit:** 5 req/min por IP.

1. **POST sem token** (auth: cookie `customer_session`) → gera token assinado (HMAC, TTL 1h) e envia link de confirmação para o e-mail do cliente. Contas admin/master → 403
2. **POST com `{ token }`** + cookie `customer_session` do mesmo uid do token (401 se faltar) → executa a exclusão: anonimiza PII dos pedidos (mantém histórico fiscal), apaga `download_tokens` e `abandoned_carts`, limpa o e-mail em `analytics_events`, deleta o usuário em `auth.users` (cascateia profiles/user_products), marca unsubscribe na newsletter, registra security event `account_self_deleted` e limpa a sessão

### `GET /api/me-export-data`

Acesso e portabilidade dos próprios dados (LGPD, art. 18, V). Auth: cookie
`customer_session` **mais** confirmação do uid contra `auth.users` — o e-mail do
cookie é cópia feita no login e não vale como prova numa resposta que devolve o
dossiê da pessoa.

**Rate-limit:** 5 req/5min por IP (`meExportData`).

Devolve pedidos (com itens e metadados de download; escopados por
`customer_id = uid`), inscrição na newsletter e carrinhos abandonados (esses
dois pelo e-mail **confirmado** em `auth.users`, únicas tabelas sem outra
chave). Responde `Cache-Control: no-store` e registra o evento de segurança
`customer_data_exported` sem PII.

**Não inclui, de propósito:** o VALOR do token de download (é credencial de uso
único que abre o arquivo pago, não dado pessoal — um JSON exportado circula por
e-mail e Drive), eventos de analytics (chaveados por sessão do navegador, sem
ligação com a identidade no servidor) e registros de segurança. O próprio corpo
da resposta declara essas omissões no campo `naoIncluido`.

---

### Autenticação de cliente (`handlers/auth/customer/**`, montados por `routes/auth.routes.js`)

| Endpoint                             | Método | Descrição                                               |
| ------------------------------------ | ------ | ------------------------------------------------------- |
| `/api/auth/customer/login`           | POST   | Login com email + senha; seta cookie `customer_session` |
| `/api/auth/customer/register`        | POST   | Cadastro com email + senha + name                       |
| `/api/auth/customer/logout`          | POST   | Limpa cookie (exige request same-origin — anti-CSRF)    |
| `/api/auth/customer/session`         | GET    | Retorna sessão atual ou null                            |
| `/api/auth/customer/google/start`    | GET    | Inicia OAuth Google (Supabase)                          |
| `/api/auth/customer/google/callback` | POST   | Conclui OAuth Google e estabelece a sessão              |

**Rate-limit:** `/login` 5 tentativas/10min por IP+e-mail + 20 e-mails distintos por IP a cada 10min; `/register` 5/10min; `/google/start` e `/google/callback` 20/10min. Login e cadastro são fail-closed (503 se o contador cair).

---

## 4. Newsletter

### `POST /api/subscribe`

Inscreve em newsletter com double opt-in.

**Rate-limit:** 5 req/min por IP.

**Body:** `{ email, source?, attribution? }`

**Response 200:** `{ success: true, message: "Confirmação enviada..." }` — cria/reativa subscriber com `confirmed=false` e envia e-mail de confirmação. Idempotente: já confirmado → `{ success: true, alreadyConfirmed: true }`; reenvio reusa o token se enviado há menos de 1h.

### `GET /api/confirm-subscription`

Confirma inscrição via link no e-mail (token com TTL de 72h; invalidado após uso).

**Query:** `token`

**Rate-limit:** 20 req/min por IP.

**Response 200:** `{ success, confirmed: true, alreadyConfirmed?, email }` — sem redirect; a página `/confirmar-inscricao` do SPA chama o endpoint e decide a UI.

**Erros:** 400 token ausente; 404 token inválido; 409 inscrição descadastrada (registro descadastrado **não** é reativado por link antigo — exige novo `/subscribe`); 410 `CONFIRMATION_EXPIRED` (link com mais de 72h).

### `GET|POST /api/unsubscribe`

Descadastra (idempotente). Aceita `GET ?token=` (link 1-click do e-mail) e `POST ?token=` / `POST { token }` (RFC 8058 — Gmail/Outlook). `POST { email }` (fallback da página `/desinscrever`) **não descadastra**: envia ao endereço (se inscrito e ativo; máx. 1x/dia) um link com o token e responde `{ confirmationRequired: true, message }`.

**Rate-limit:** 20 req/min por IP.

**Response 200:** JSON com mensagem neutra — não confirma nem nega a existência do e-mail. 400 para token malformado ou sem token/e-mail válido.

---

## 5. Analytics e tracking

### `POST /api/track-event`

Insere evento em `analytics_events`.

**Rate-limit:** 120 req/min por IP.

**Body:**

```json
{
  "event_name": "view_item",
  "session_id": "uuid",
  "properties": { "value": 19.9, "currency": "BRL", "utm_source": "google" }
}
```

**Validação:** `event_name` precisa estar na whitelist de eventos de client (`view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `view_catalog`, `begin_checkout`, `client_error` — regra A5). Chaves com PII em `properties` são removidas.

**Response 204 (sempre):** falha silenciosa — evento fora da whitelist ou erro interno também retornam 204 (tracking não pode quebrar o cliente). Eventos server-side (`checkout_initiated`, `payment_approved`, etc.) são gravados direto pelos handlers, não por aqui.

### `POST /api/abandoned-cart`

Salva carrinho abandonado.

**Rate-limit:** 30 req/min por IP (chamado a cada keystroke debounced).

**Body:** `{ email, sessionId, items, attribution }` (máx. 20 itens; `total_amount` é recalculado)

**Comportamento:** upsert manual por `(email, session_id)`. Atualização do carrinho reseta `reminder_sent_at` (o ciclo de lembretes recomeça). O cron pula carrinhos com `recovered_at` preenchido.

**Response 204 (sempre que aceito):** falha silenciosa — não pode quebrar o checkout.

---

## 6. Cron de e-mails

### `GET|POST /api/cron-email-jobs`

Disparado pelo workflow `email-cron.yml` (GitHub Actions) de hora em hora (`cron: '0 * * * *'`, via POST).

**Headers:** `X-Cron-Secret: <CRON_SECRET>` (obrigatório, comparação timing-safe; 401 se inválido; nunca aceito via query string)

**Comportamento (máx. 100 candidatos por sub-job; `maxDuration: 60`):**

1. Carrinho abandonado: 1º lembrete após ~1h e 2º após ~24h (janelas configuráveis via `ABANDONED_CART_FIRST_HOURS`/`ABANDONED_CART_SECOND_HOURS`); pula `recovered_at`/`reminder_sent_at`; só envia para quem tem opt-in confirmado na newsletter **ou** pedido aprovado com aquele e-mail (descadastrado nunca). Pós-compra e reativação usam a base contratual (pedido aprovado) e respeitam descadastro
2. Pós-compra: D+3 (pedido de review), D+15 (produto complementar da categoria), D+45 (novidades da categoria)
3. Reativação de inativos 90–180d (`REACTIVATION_DAYS_MIN/MAX`) com cupom `VOLTEI15` (15%) — defaults de `REACTIVATION_COUPON_CODE`/`REACTIVATION_COUPON_PCT` —, no máximo 1x por mês por e-mail
4. Idempotência de todos os envios via `email_sent_log`

**Response 200:** `{ success: true, elapsedMs, abandoned: { firstReminder, secondReminder, skipped, blocked }, postPurchase: { d3: { sent, blocked }, d15: {…}, d45: {…} }, reactivation: { sent, blocked } }` — `blocked` conta os bloqueios por motivo.

---

## 7. Admin (endpoints de dados exigem `admin_session`)

> ⚠️ **Sem cookie admin válido = 401.** Re-login refaz cookie. Sessão TTL 8h.

### Sessão e autenticação

| Endpoint                  | Método | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/login`        | POST   | Login com email + senha via Supabase, exige role `admin`/`master` (+ TOTP, código por e-mail ou PIN se 2FA ativo — `sendEmailCode: true` com o desafio pede o envio, e a resposta traz `emailSent`/`emailHint`; challenge token de uso único com TTL de 120s, preso ao IP; desafio expirado é reemitido). Resposta idêntica para senha errada e conta não-admin. Rate-limit 5/10min (senha) + 5/10min no 2º fator (fail-closed) |
| `/api/admin/login-google` | POST   | `{ accessToken }` do OAuth do Supabase: confere o token no Supabase, lê o papel em `profiles` e abre `admin_session` **só para `SELLER`**. Admin/master → 403 (entram por senha + 2º fator); outro papel → 401. Rate limit `staff-google-login` 20/10min                                                                                                                                                                        |
| `/api/admin/logout`       | POST   | Limpa `admin_session` (exige request same-origin)                                                                                                                                                                                                                                                                                                                                                                               |
| `/api/admin/session`      | GET    | Retorna `{ success, authenticated }` e, se autenticado, `email`, `role` e `userId` (o front escolhe entre painel e área do professor)                                                                                                                                                                                                                                                                                           |

### Dashboard e KPIs

| Endpoint               | Método | Descrição                                                                                                                                                                                     |
| ---------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/dashboard` | GET    | Payload agregado do painel: produtos, categorias, perfis, pedidos, itens, download logs, settings + summary de receita                                                                        |
| `/api/admin/kpis`      | GET    | `?window=` (meses, 1–36). Receita MTD/mês anterior, ticket médio, pedidos, LTV, taxa de recompra (CAC = null até existir input de custo). Sem cache (`no-store`), recalculado a cada abertura |

### CRUD (todas as escritas geram audit log via `logAdminAction`)

| Endpoint                    | Métodos                       | Descrição                                                                                                                                                   |
| --------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/products`       | GET, POST, PUT, PATCH, DELETE | Lista (ou `?id=` para um produto) + cria + atualiza + remove produtos. A categoria precisa existir (UUID ou slug); categoria desconhecida → 400             |
| `/api/admin/categories`     | GET, POST, PUT, DELETE        | Idem para categorias (slug normalizado; 409 em duplicata)                                                                                                   |
| `/api/admin/coupons`        | GET, POST, PUT, DELETE        | CRUD de cupons                                                                                                                                              |
| `/api/admin/orders`         | GET, PUT, DELETE              | Lista (`?status=` opcional, filtra por `payment_status`) + atualizar + excluir pedidos                                                                      |
| `/api/admin/store-owner`    | GET, PUT                      | Só admin. GET `{ sellerId }` da dona da loja; PUT `{ sellerId }` (precisa ser perfil `SELLER`). Auditado como `set_store_owner`. Vale no próximo login dela |
| `/api/admin/product-seller` | PUT                           | `{ productId, sellerId }`: atribui o produto a um perfil `SELLER` (400 se o perfil não for professor). Auditado como `assign_seller`                        |
| `/api/admin/users`          | GET, PUT, DELETE              | Listar + atualizar + excluir clientes (profiles)                                                                                                            |

| Rota                     | Método    | O que faz                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/ai-assist`   | POST      | `{ task, input }` com `task` = `productCopy` (descrição, benefícios, FAQ), `productSeo` (nome, Google, faixa de preço pelo catálogo) ou `homeCopy` (textos da página). Só gera no clique; nada é gravado. Sessão da loja, limite 30/hora, auditado como `ai_assist`. Falha da IA: 429 `RATE_LIMITED` (cota) ou 503 `SERVICE_UNAVAILABLE`                              |
| `/api/admin/sales-study` | GET, POST | GET: última análise salva (`settings.salesStudy`) + `aiConfigured`. POST `{ days }` (7–90, padrão 30): recalcula os agregados do período atual × anterior e, com dados suficientes, pede a leitura ao Gemini. IA indisponível não derruba: volta `aiError` (`INSUFFICIENT_DATA`, `AI_NOT_CONFIGURED`, `AI_QUOTA`, `AI_FAILED`) e os números. Limite 10/hora; auditado |

### Análise (sem cache — recalculado a cada abertura, `Cache-Control: no-store`)

| Endpoint                   | Método | Descrição                                                                                      |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `/api/admin/abc-products`  | GET    | Curva ABC de produtos por receita (`?period=&categoryId=`)                                     |
| `/api/admin/abc-customers` | GET    | Curva ABC de clientes + classificação vip/recorrente/eventual (`?period=`; e-mails mascarados) |
| `/api/admin/cohort`        | GET    | Matriz de retenção por coorte mensal (`?months=`, 1–36)                                        |
| `/api/admin/funnel`        | GET    | Funil de conversão por sessão + atribuição UTM (`?days=`, 1–180)                               |
| `/api/admin/segments`      | GET    | Relatório agregado de segmentação de subscribers (sem lista bruta de e-mails)                  |

### Vitrine, configurações e uploads

| Endpoint                | Métodos  | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/admin/settings`   | GET, PUT | `?key=` de uma whitelist (`homeSections` — faixas de produtos da home —, `homeContent` — textos e blocos da home —, `productDefaults` — descrição comum dos produtos — e `adminConfig` — TOTP, PIN). `homeContent` e `productDefaults` são limpos no PUT (`lib/store-content.js`: whitelist, tetos, links só https/internos; campos descartados voltam em `ignoredFields`). GET de `adminConfig` nunca devolve `totpSecret`/`fallbackPin` (só `has2FA`/`hasPin`); PUT auditado com redação de segredos |
| `/api/admin/upload-url` | POST     | Gera signed upload URL do Supabase Storage por `kind` (image/video/download), com whitelist de extensão/MIME e bloqueio de SVG/HTML em bucket público                                                                                                                                                                                                                                                                                                                                                  |

> **Painel da loja:** os endpoints de dados, CRUD, análise, vitrine/configurações e upload acima aceitam admin/master **ou a professora dona da loja** (`ensureStoreSession`). Ficam só de admin: `users`, `product-seller`, `store-owner` e `settings?key=adminConfig` (403 para a dona).

### Professor (sessão de papel `seller`; 403 para os outros papéis)

| Endpoint                 | Métodos     | Descrição                                                                                                                                                                                                                  |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/teacher/account`   | GET, PUT    | Qualquer sessão de staff. GET: e-mail, nome, papel, `storeOwner`, forma de login, criação. PUT `{ displayName }` (1–80 caracteres), auditado como `update_own_account`                                                     |
| `/api/teacher/dashboard` | GET         | Produtos do professor logado com vendas e receita (só pedidos `approved`), categorias e resumo                                                                                                                             |
| `/api/teacher/products`  | POST, PATCH | POST cria produto do professor (`name`, `price`, `description`, `downloadUrl` validado por `lib/product-media.js`, `categoryId`) — nasce ativo. PATCH `{ id, active }` só no produto com o próprio `seller_id` (senão 404) |

### Manutenção

| Endpoint                    | Método | Descrição                                                                        |
| --------------------------- | ------ | -------------------------------------------------------------------------------- |
| `/api/admin/cleanup-events` | POST   | Chama a RPC `cleanup_old_analytics_events` (remove eventos com mais de 180 dias) |

---

## 8. Rotas só de dev

Toda rota `/api/*` é a mesma em dev e produção (o mesmo app de `lib/express-app.js`). Caminho `/api/*` sem rota → 404 no envelope padrão (`notFoundHandler` de `middleware/error.middleware.js`). Só o `server.js` acrescenta:

| Path      | Métodos | Arquivo     | Descrição                                        |
| --------- | ------- | ----------- | ------------------------------------------------ |
| `/health` | GET     | `server.js` | Healthcheck `{ ok: true, service: 'api', port }` |

`GET /api/auth/me` (Bearer token) e `POST /api/produtos` foram removidos, junto com `routes/products.routes.js` e `routes/payment.routes.js`.

---

## 9. Erros comuns

| HTTP | Quando acontece                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | Payload/query inválido (item sem `productId`, e-mail malformado, chave de setting fora da whitelist etc.)                                                                                                                                                  |
| 401  | Cookie de sessão ausente/inválido; token de download inválido, usado ou expirado; assinatura HMAC do webhook não bate; `X-Cron-Secret` errado                                                                                                              |
| 403  | Request cross-origin em `/api/admin/logout` e `/api/auth/customer/logout` (anti-CSRF); `/api/admin/users` recusa editar/excluir contas admin/master; `/api/me-delete-account` recusa contas admin/master                                                   |
| 404  | Recurso não existe — também usado no `verify-payment` quando o e-mail não bate (anti-enumeração) e em qualquer `/api/*` sem rota (`code: "NOT_FOUND"`)                                                                                                     |
| 405  | Método não permitido no endpoint (com header `Allow`)                                                                                                                                                                                                      |
| 409  | Duplicata (ex.: categoria com mesmo slug); confirmação de newsletter já descadastrada                                                                                                                                                                      |
| 410  | Link de confirmação de newsletter expirado (`CONFIRMATION_EXPIRED`)                                                                                                                                                                                        |
| 422  | Cupom não aplicável em `/api/validate-coupon` (`error.code`: `COUPON_NOT_FOUND`, `COUPON_INACTIVE`, `COUPON_NOT_YET_VALID`, `COUPON_EXPIRED`, `COUPON_EXHAUSTED`, `COUPON_MINIMUM_NOT_MET`, `COUPON_NOT_ELIGIBLE`; `VALIDATION_FAILED` com carrinho vazio) |
| 429  | Excedeu rate limit — vale em dev e em produção (`enforceRateLimit`, contador no Postgres). Veja headers `RateLimit-*`/`Retry-After`                                                                                                                        |
| 500  | Erro interno — mensagem genérica, não expõe stack/detalhes em prod                                                                                                                                                                                         |
| 502  | Falha ao gerar a signed URL do download (token devolvido)                                                                                                                                                                                                  |
| 503  | Contador de rate limit indisponível em balde fail-closed (login/cadastro/2FA) ou falha de envio de e-mail no cadastro                                                                                                                                      |

Pagamento rejeitado **não é erro HTTP**: o webhook responde 200 e o `verify-payment` devolve o pedido com `paymentStatus: "rejected"`.

---

## 10. Testando manualmente

### Healthcheck (só dev)

```bash
curl http://localhost:3000/health
# → {"ok":true,"service":"api","port":3000}
```

### Login cliente

```bash
curl -X POST http://localhost:3000/api/auth/customer/login \
  -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SenhaForte123"}'
```

### Chamada com sessão

```bash
curl http://localhost:3000/api/customer-orders -b cookies.txt
```

### Criar pagamento

```bash
curl -X POST http://localhost:3000/api/create-payment \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "customer":{"email":"x@y.com","name":"Teste"},
    "items":[{"productId":"<id-real>","quantity":1}]
  }'
```

### Forçar webhook em dev

```bash
# Calcule a assinatura HMAC
PAYMENT_ID=12345
WEBHOOK_SECRET=<seu-secret>
TS=$(date +%s)
MANIFEST="id:$PAYMENT_ID;request-id:abc;ts:$TS;"
HASH=$(echo -n "$MANIFEST" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-signature: ts=$TS,v1=$HASH" \
  -H "x-request-id: abc" \
  -d "{\"type\":\"payment\",\"data\":{\"id\":\"$PAYMENT_ID\"}}"
```

### Rodar o cron manualmente

```bash
curl -X POST http://localhost:3000/api/cron-email-jobs \
  -H "X-Cron-Secret: <seu-CRON_SECRET>"
```

---

## 11. Versionamento

Não há versionamento explícito de API (`/api/v1/...`). O contrato é interno (frontend + admin). Mudanças quebrantes em endpoints exigem atualização do consumidor no mesmo PR.

Quando necessário adicionar v2 no futuro (ex: app mobile externo): criar os handlers em `handlers/v2/` e montá-los sob `/api/v2` num router próprio em `lib/express-app.js`, mantendo as rotas atuais como compat (`api/` só tem a função `api/index.js`, que recebe todo `/api/*`).
