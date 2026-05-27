# 09 — API endpoints

> Referência de **todos** os endpoints expostos pela API. Cada `api/*.js` vira função serverless no Vercel e é montado no Express em dev via `routes/api-compat.routes.js`.

---

## Convenções

- **Base URL:** `https://<dominio>/api` em prod, `http://localhost:3000/api` em dev
- **Content-Type:** `application/json` para requests e responses (exceto `/api/download` que faz pipe de arquivo)
- **Autenticação:**
  - **Cliente** — cookie `customer_session` (HttpOnly) emitido em `/auth/customer/login`
  - **Admin** — cookie `admin_session` (HttpOnly) emitido em `/admin-login`
  - **Webhook** — header `x-signature` validado por HMAC com `WEBHOOK_SECRET`
  - **Cron** — header `Authorization: Bearer <CRON_SECRET>`
- **Erros:** sempre JSON com shape `{ "error": "mensagem humana", "code": "MACHINE_CODE" }`
- **Rate-limit:** retornos 429 contém header `Retry-After`

---

## 1. Catálogo público

### `GET /api/products`
Lista produtos ativos.

**Query params:**
- `category` (slug, opcional) — filtra por categoria
- `q` (string, opcional) — busca textual em `name`/`description`
- `sort` (`price_asc` | `price_desc` | `newest` | `bestsellers`)
- `limit` / `offset` (paginação)

**Response 200:**
```json
{
  "products": [
    { "id": "uuid", "name": "...", "slug": "...", "price": 19.9, "image_url": "...", "category": {...} }
  ],
  "total": 42
}
```

### `GET /api/product-details`
Detalhes completos de 1 produto.

**Query:** `slug` (obrigatório)

**Response 200:** produto + `faq[]` + `reviews[]` + `benefits[]` + `category`.

### `GET /api/home-sections`
Seções da home (vitrine).

**Response 200:**
```json
{
  "sections": [
    { "key": "featured", "title": "Destaques", "products": [...] },
    { "key": "newest", "title": "Novidades", "products": [...] }
  ]
}
```

### `GET /api/cross-sell`
Recomendações relacionadas.

**Query:** `productId` (obrigatório)

**Response 200:** lista de até 4 produtos da mesma categoria + co-purchase frequente.

### `GET /api/sitemap.xml`
Sitemap dinâmico para SEO. Inclui todas as URLs públicas (home, produtos, categorias, páginas legais).

**Response:** `text/xml`

---

## 2. Compra e pagamento

### `POST /api/create-payment`
Cria preferência Mercado Pago.

**Auth:** cookie `customer_session` opcional (convidado também pode comprar).

**Body:**
```json
{
  "customer": { "email": "...", "name": "...", "cpf": "..." },
  "items": [{ "id": "uuid", "quantity": 1 }],
  "coupon": "VOLTEI15"
}
```

**Response 200:**
```json
{
  "orderId": "uuid",
  "orderCode": "abc123...",
  "initPoint": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
  "totalAmount": 19.9,
  "discountAmount": 3.0
}
```

**Validações backend:**
- Items reais com preços do banco (não confia no client)
- Cupom existe + ativo + não expirou + não atingiu `max_uses` + aplica a algum item
- Cria `orders` (status=pending) + `order_items`
- Cria preferência MP com `back_urls` + `notification_url`

### `GET /api/verify-payment`
Verifica status de pagamento e emite download tokens se aprovado.

**Query:** `orderId` (obrigatório) + `email` (obrigatório)

**Rate-limit:** 60 req/min por IP.

**Response 200 (aprovado):**
```json
{
  "status": "approved",
  "order": { "code": "abc...", "totalAmount": 19.9 },
  "downloads": [
    { "token": "xyz", "productName": "...", "expiresAt": "..." }
  ]
}
```

**Response 404 (não encontrado OU email não bate):** resposta uniforme para evitar enumeração + log `verify_payment_email_mismatch`.

### `POST /api/webhook`
Webhook do Mercado Pago.

**Headers:** `x-signature` (HMAC SHA-256 com `WEBHOOK_SECRET`)

**Body:** `{ type, data: { id } }` (formato MP)

**Comportamento:**
- Valida assinatura → 401 + log `webhook_invalid_signature` se falhar
- Consulta `payment.get(id)` na MP API
- Match em `orders.order_code = external_reference`
- Se `approved`: atualiza `payment_status`, cria `download_tokens` + `user_products`, dispara confirmation email
- Sempre retorna 200 OK para a MP (idempotente)

### `GET /api/download`
Download de arquivo com token.

**Query:** `token` (obrigatório)

**Validações:**
- Token existe + não expirou
- Gera signed URL do Supabase Storage
- Faz pipe do arquivo (`Content-Type` adequado + `Content-Disposition: attachment`)
- Header `Referrer-Policy: no-referrer`
- Insere `download_logs` (IP, UA, timestamp)
- Marca `used=true`

**Response 200:** binário do arquivo.

### `POST /api/validate-coupon`
Validação server-side de cupom.

**Rate-limit:** 20 req/min por IP.

**Body:** `{ code, items, total }`

**Response 200:**
```json
{ "valid": true, "discountType": "percent", "discountValue": 15, "computedDiscount": 3.0 }
```

**Response 400:** `{ valid: false, reason: "expired" | "not_found" | "min_order" | "max_uses" }`

### `POST /api/send-confirmation-email`
Envia e-mail de confirmação após pagamento aprovado. Chamado internamente após webhook ou verify-payment de sucesso.

**Body:** `{ orderId }`

**Response 200:** `{ ok: true }` (best-effort; se SMTP falha, loga e retorna ok mesmo assim).

---

## 3. Cliente logado

### `GET /api/customer-orders`
Histórico de pedidos do cliente.

**Auth:** cookie `customer_session` obrigatório.

**Response 200:** lista de pedidos do cliente atual (filtra por `customer_id = auth.uid()`).

### Autenticação de cliente (rotas em `routes/auth.routes.js`)

| Endpoint | Método | Descrição |
|---|---|---|
| `/auth/customer/login` | POST | Login com email + senha |
| `/auth/customer/register` | POST | Cadastro com email + senha + name |
| `/auth/customer/logout` | POST | Limpa cookie customer_session |
| `/auth/customer/session` | GET | Retorna user atual ou null |
| `/auth/customer/google/callback` | POST | Recebe accessToken do Supabase OAuth |

**Rate-limit:** 5 req/10min em `/login`.

---

## 4. Newsletter

### `POST /api/subscribe`
Inscreve em newsletter com double opt-in.

**Body:** `{ email, source }`

**Response 200:** `{ ok: true, pending: true }` (envia email de confirmação).

### `GET /api/confirm-subscription`
Confirma inscrição via link no e-mail.

**Query:** `token`

**Response:** redirect para `/confirmar-inscricao?status=ok`

### `GET /api/unsubscribe`
Descadastra (idempotente).

**Query:** `token`

**Response:** página HTML de confirmação.

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
  "product_id": "uuid",
  "properties": { "value": 19.9, "currency": "BRL", "utm_source": "google" }
}
```

**Validação:** `event_name` precisa estar na whitelist (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `view_category`, `search`, etc.). Backend rejeita eventos fora da whitelist (regra A5).

**Response 200:** `{ ok: true }`

### `POST /api/abandoned-cart`
Salva carrinho abandonado.

**Body:** `{ email, sessionId, items, totalAmount, attributionData }`

**Comportamento:** UPSERT por `session_id`. Atualiza `recovered_at` quando o mesmo session faz checkout.

---

## 6. Cron de e-mails

### `POST /api/cron-email-jobs`
Disparado pelo workflow `email-cron.yml` (GitHub Actions) de hora em hora.

**Headers:** `Authorization: Bearer <CRON_SECRET>` (obrigatório; 401 se inválido)

**Comportamento:**
1. Lê `abandoned_carts` candidatos (criados há > 1h, `reminder_sent_at IS NULL`, `recovered_at IS NULL`) → envia lembrete
2. Lê `orders` para sequência pós-compra (D+3 review, D+15 cross-sell)
3. Lê inativos 90-180d → enviar reativação com cupom `VOLTEI15`
4. Atualiza `email_sent_log` para cada envio

**Response 200:** `{ ok: true, sent: { abandoned: 3, postPurchase: 2, reactivation: 0 } }`

---

## 7. Admin (todos exigem `admin_session`)

> ⚠️ **Sem cookie admin válido = 401.** Re-login refaz cookie. Sessão TTL 8h.

### Sessão e autenticação

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-login` | POST | Login com email + senha (+ TOTP + PIN se 2FA ativo). Rate-limit 5/10min |
| `/api/admin-logout` | POST | Limpa admin_session |
| `/api/admin-session` | GET | Retorna sessão atual + role |

### Dashboard e KPIs

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-dashboard` | GET | KPIs gerais + mini gráficos |
| `/api/admin-kpis` | GET | LTV, recompra, AOV, LTV/CAC |

### CRUD

| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin-products` | GET, POST, PUT/PATCH, DELETE | Lista + cria + atualiza + remove produtos |
| `/api/admin-categories` | GET, POST, PATCH, DELETE | Idem para categorias |
| `/api/admin-orders` | GET, PATCH | Lista paginada + atualizar status |
| `/api/admin-users` | GET, PATCH, DELETE | Listar clientes + soft delete (LGPD) |

### Análise (cache 1h server-side)

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-abc-products` | GET | Curva ABC de produtos (filtro: período, categoria) |
| `/api/admin-abc-customers` | GET | Curva ABC de clientes (email mascarado) |
| `/api/admin-cohort` | GET | Matriz de coorte mensal |
| `/api/admin-funnel` | GET | Funil de conversão por etapa |
| `/api/admin-segments` | GET, POST | Segmentos pré-definidos + customizados |

### Vitrine e configurações

| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin-vitrine` | GET, POST | Lê e edita `settings.vitrine` |
| `/api/admin-settings` | GET, POST | Lê e edita `settings.adminConfig` (TOTP, PIN, etc.) |

### Manutenção

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-cleanup-events` | POST | Trigger manual de `purge_old_logs()` (se pg_cron desabilitado) |

---

## 8. Express routes (não em `api/`)

Existem ainda rotas montadas direto em Express via `routes/`:

| Path | Métodos | Arquivo | Descrição |
|---|---|---|---|
| `/auth/customer/*` | POST/GET | `routes/auth.routes.js` | Login/register/logout/session/google |
| `/products` | POST | `routes/products.routes.js` | Criação admin de produto (validada com Zod) |
| `/payments/process` | POST | `routes/payment.routes.js` | Alias de `/api/create-payment` (compat) |
| `/payments/verify` | GET | `routes/payment.routes.js` | Alias de `/api/verify-payment` |
| `/health` | GET | `server.js` | Healthcheck simples `{ status: 'ok' }` |

---

## 9. Códigos de erro comuns

| Código | HTTP | Significado |
|---|---|---|
| `UNAUTHORIZED` | 401 | Cookie inválido / ausente |
| `FORBIDDEN` | 403 | Cookie OK mas sem permissão (ex: cliente em endpoint admin) |
| `NOT_FOUND` | 404 | Recurso não existe |
| `VALIDATION_FAILED` | 422 | Zod validation falhou (detalhes em `errors[]`) |
| `RATE_LIMITED` | 429 | Excedeu limite. Veja `Retry-After` header |
| `INTERNAL_ERROR` | 500 | Erro interno — não expõe stack em prod |
| `WEBHOOK_INVALID_SIGNATURE` | 401 | Assinatura HMAC do MP não bate |
| `COUPON_INVALID` | 400 | Cupom não existe / expirou / não aplicável |
| `PAYMENT_REJECTED` | 200 (`status: rejected`) | Não é erro HTTP — pagamento foi rejeitado pelo MP |

---

## 10. Testando manualmente

### Healthcheck
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
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
    "items":[{"id":"<uuid-real>","quantity":1}]
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

---

## 11. Versionamento

Não há versionamento explícito de API (`/api/v1/...`). O contrato é interno (frontend + admin). Mudanças quebrantes em endpoints exigem atualização do consumidor no mesmo PR.

Quando necessário adicionar v2 no futuro (ex: app mobile externo): criar `api/v2/` e manter `api/*` como compat.
