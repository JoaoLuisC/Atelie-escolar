# 09 — API endpoints

> Referência de **todos** os endpoints expostos pela API. Cada `api/**/*.js` vira função serverless no Vercel; em dev, os handlers planos de `api/*.js` são montados no Express via `routes/api-compat.routes.js` e os aninhados (`api/auth/customer/**`) via `routes/auth.routes.js` (mesmas rotas `/api/<nome>` nos dois ambientes).

---

## Convenções

- **Base URL:** `https://<dominio>/api` em prod, `http://localhost:3000/api` em dev
- **Content-Type:** `application/json` para requests e responses (exceto `/api/download`, que redireciona para a URL do arquivo, e `/sitemap.xml`, que é `application/xml`)
- **Autenticação:**
  - **Cliente** — cookie `customer_session` (HttpOnly, SameSite=Strict) emitido em `/api/auth/customer/login`
  - **Admin** — cookie `admin_session` (HttpOnly, SameSite=Strict) emitido em `/api/admin-login`
  - **Webhook** — header `x-signature` validado por HMAC com `WEBHOOK_SECRET`
  - **Cron** — header `X-Cron-Secret: <CRON_SECRET>` (comparação timing-safe; nunca via query string)
- **Erros:** JSON com shape `{ "error": "mensagem humana" }` (vários handlers incluem também `"success": false`). Código de máquina só onde faz diferença: `code` no `/api/validate-coupon` e no 404 de produção (`_notfound`)
- **Rate-limit:** implementado com `express-rate-limit`, ou seja, **só vale em dev/Express** — na Vercel serverless não há store compartilhado (pendência API-03). Retornos 429 usam os headers padrão `RateLimit-*` + `Retry-After`

---

## 1. Catálogo público

### `GET /api/products`
Lista produtos ativos (sem query params — filtro/busca/ordenação acontecem no frontend).

**Response 200** (cache público 5 min):
```json
{
  "success": true,
  "products": [
    {
      "id": "<uuid>", "slug": "...", "name": "...", "description": "...",
      "price": 19.9, "originalPrice": null, "image": "...", "images": [],
      "category": "Nome da categoria", "categoryId": "<uuid>",
      "tags": [], "productType": "individual", "isKit": false,
      "soldCount": 3, "createdAt": "...", "updatedAt": "..."
    }
  ],
  "total": 42
}
```

`soldCount` = soma das quantidades em pedidos com `payment_status = approved`.

### `GET /api/product-details`
Detalhes completos de 1 produto ativo.

**Query:** `slug` **ou** `id` (um dos dois obrigatório; valor 100% numérico é tratado como `id`)

**Response 200** (cache público 5 min): `{ success, product }` — o objeto `product` inclui `faq[]`, `reviews[]`, `benefits[]`, `category` (nome), `categorySlug`, `kitItems[]`, `panelSizes[]` etc. **Nunca** expõe `download_url` (o link do arquivo só é resolvido em `/api/download` após validar o token).

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
Sitemap dinâmico para SEO (handler `api/sitemap.xml.js`; servido na **raiz** — rewrite no `vercel.json` e mount direto no Express). Inclui as rotas estáticas `/`, `/produtos` e `/login`, as categorias ativas (como `/produtos?categoria=<slug>`) e as páginas de produto ativas (`/produtos/<slug>`). Não inclui páginas legais.

**Response:** `application/xml` (cache público 1h)

---

## 2. Compra e pagamento

### `POST /api/create-payment`
Cria pedido + preferência Mercado Pago.

**Auth:** nenhuma (convidado também pode comprar; conta é provisionada depois da aprovação).

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
- Cupom validado server-side (existe + ativo + não expirou + mínimo de pedido + elegibilidade por item); uso incrementado atomicamente via RPC `increment_coupon_usage` (respeita `max_uses` sob concorrência)
- Cria `orders` (status=pending, `order_code` com 128 bits de entropia) + `order_items` em lote (preço original, sem rateio de desconto)
- Cria preferência MP com `external_reference = order_code` e desconto rateado só nos itens elegíveis
- Registra evento `checkout_initiated`

### `GET /api/verify-payment`
Verifica status de pagamento; se aprovado (e ainda não processado), cria os download tokens e provisiona a conta do cliente.

**Query:** `orderId` (= `order_code`, obrigatório) + `email` (obrigatório)

**Rate-limit:** 60 req/min por IP (dev).

**Response 200:**
```json
{
  "success": true,
  "order": {
    "orderId": "ORD-...",
    "status": "completed",
    "paymentStatus": "approved",
    "totalAmount": 19.9,
    "downloadTokens": [{ "productId": "<uuid>", "productName": "...", "token": "xyz" }],
    "createdAt": "...",
    "items": [{ "id": "<uuid>", "title": "...", "quantity": 1, "price": 19.9 }]
  }
}
```

**Response 404 (não encontrado OU email não bate):** resposta uniforme para evitar enumeração (comparação timing-safe) + security event `verify_payment_email_mismatch`.

### `POST /api/webhook`
Webhook do Mercado Pago.

**Headers:** `x-signature: ts=...,v1=...` (HMAC SHA-256 com `WEBHOOK_SECRET`) + `x-request-id`

**Body:** `{ type, data: { id } }` (formato MP)

**Comportamento:**
- Valida assinatura → 401 + security event `webhook_invalid_signature` se falhar
- Consulta `payment.get(id)` na MP API
- Match em `orders.order_code = external_reference`
- Se `approved`: transição **atômica e idempotente** `!approved → approved`, cria `download_tokens` (validade 72h, insert em lote idempotente), provisiona a conta do cliente (com e-mail de definição de senha na 1ª aprovação) e registra evento `payment_approved` (o endpoint `/api/send-confirmation-email` existe para (re)envio, mas nenhum código o chama automaticamente hoje)
- Se `rejected`/`cancelled`: marca `payment_status` + `status=failed` e registra o evento correspondente
- Responde 200 para a MP em caso de sucesso (reentregas são idempotentes)

### `GET /api/download`
Download de arquivo com token de **uso único**.

**Query:** `token` (obrigatório)

**Validações:**
- Token existe + não usado + não expirou (inválido/usado/expirado → 401)
- Claim atômico `used=false → true` (requisições concorrentes com o mesmo token são barradas)
- Gera signed URL do Supabase Storage (5 min) e **redireciona** para ela; fallback: redirect para a URL externa legada (Drive etc.)
- Headers `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Download-Mode: signed-storage|external-redirect`
- Insere `download_logs` (IP, UA, timestamp)

**Response:** 302 para a URL do arquivo.

### `POST /api/validate-coupon`
Validação server-side de cupom.

**Rate-limit:** 20 req/min por IP (dev).

**Body:** `{ code, items }` (subtotal é recalculado a partir dos items)

**Response 200:**
```json
{
  "success": true,
  "coupon": { "code": "VOLTEI15", "discountType": "percent", "discountValue": 15 },
  "subtotal": 22.9,
  "discount": 3.44,
  "total": 19.46
}
```

**Response 422:** `{ success: false, error: "...", code: "not_found" | "inactive" | "not_yet_valid" | "expired" | "exhausted" | "below_min" | "not_eligible" }`

### `POST /api/send-confirmation-email`
(Re)envia e-mail de confirmação do pedido. Endpoint idempotente disponível para uso manual — hoje nenhum código do frontend o chama automaticamente.

**Body:** `{ orderId, customerName, customerEmail, isNewAccount }` (`orderId` = `order_code`)

**Response 200:** `{ success: true, sent, skipped, reason }` — best-effort: nunca falha o checkout (pedido inexistente ou erro interno retornam 200 com `sent: false`).

**Segurança:** o destinatário é **sempre** o e-mail gravado no pedido — o `customerEmail` do body é ignorado (conhecer um `order_code` não permite exfiltrar itens/total para e-mail arbitrário). Idempotente via `email_sent_log` (kind `order_confirmation` + `entityId`).

---

## 3. Cliente logado

### `GET /api/customer-orders`
Histórico de pedidos do cliente, com itens e download tokens.

**Auth:** cookie `customer_session` obrigatório.

**Response 200:** `{ success, orders: [...] }` — o e-mail usado no filtro vem **só do cookie** (nunca de parâmetro — anti-IDOR); match case-insensitive em `orders.customer_email`.

### `POST /api/me-delete-account`
Exclusão de conta self-service (LGPD, direito ao esquecimento) em **2 passos**.

**Rate-limit:** 5 req/min por IP (dev).

1. **POST sem token** (auth: cookie `customer_session`) → gera token assinado (HMAC, TTL 1h) e envia link de confirmação para o e-mail do cliente
2. **POST com `{ token }`** → executa a exclusão: deleta o usuário em `auth.users` (cascateia profiles/user_products), anonimiza PII dos pedidos (mantém histórico fiscal), apaga `download_tokens`, marca unsubscribe na newsletter, registra security event `account_self_deleted` e limpa a sessão

### Autenticação de cliente (funções em `api/auth/customer/`)

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/auth/customer/login` | POST | Login com email + senha; seta cookie `customer_session` |
| `/api/auth/customer/register` | POST | Cadastro com email + senha + name |
| `/api/auth/customer/logout` | POST | Limpa cookie (exige request same-origin — anti-CSRF) |
| `/api/auth/customer/session` | GET | Retorna sessão atual ou null |
| `/api/auth/customer/google/start` | GET | Inicia OAuth Google (Supabase) |
| `/api/auth/customer/google/callback` | POST | Conclui OAuth Google e estabelece a sessão |

**Rate-limit:** 5 req/10min em `/login` (dev).

---

## 4. Newsletter

### `POST /api/subscribe`
Inscreve em newsletter com double opt-in.

**Rate-limit:** 5 req/min por IP (dev).

**Body:** `{ email, source?, attribution? }`

**Response 200:** `{ success: true, message: "Confirmação enviada..." }` — cria/reativa subscriber com `confirmed=false` e envia e-mail de confirmação. Idempotente: já confirmado → `{ success: true, alreadyConfirmed: true }`; reenvio reusa o token se enviado há menos de 1h.

### `GET /api/confirm-subscription`
Confirma inscrição via link no e-mail (token com TTL de 72h; invalidado após uso).

**Query:** `token`

**Response 200 (mesmo com token inválido/expirado; 400 só se o token estiver ausente):** `{ confirmed: true|false, alreadyConfirmed?, email?, error? }` — sem redirect; a página `/confirmar-inscricao` do SPA chama o endpoint e decide a UI. Registro descadastrado **não** é reativado por link antigo (exige novo `/subscribe`).

### `GET|POST /api/unsubscribe`
Descadastra (idempotente). Aceita `GET ?token=` (link 1-click do e-mail), `POST ?token=` (RFC 8058 — Gmail/Outlook) e `POST { email }` (fallback da página `/desinscrever`).

**Rate-limit:** 20 req/min por IP (dev).

**Response 200 (sempre):** JSON com mensagem neutra — não confirma nem nega a existência do e-mail.

---

## 5. Analytics e tracking

### `POST /api/track-event`
Insere evento em `analytics_events`.

**Rate-limit:** 120 req/min por IP (dev).

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

**Rate-limit:** 30 req/min por IP (dev — chamado a cada keystroke debounced).

**Body:** `{ email, sessionId, items, attribution }` (máx. 20 itens; `total_amount` é recalculado)

**Comportamento:** upsert manual por `(email, session_id)`. Atualização do carrinho reseta `reminder_sent_at` (o ciclo de lembretes recomeça). O cron pula carrinhos com `recovered_at` preenchido.

**Response 204 (sempre que aceito):** falha silenciosa — não pode quebrar o checkout.

---

## 6. Cron de e-mails

### `GET|POST /api/cron-email-jobs`
Disparado pelo workflow `email-cron.yml` (GitHub Actions) de hora em hora (`cron: '0 * * * *'`, via POST).

**Headers:** `X-Cron-Secret: <CRON_SECRET>` (obrigatório, comparação timing-safe; 401 se inválido; nunca aceito via query string)

**Comportamento (máx. 100 candidatos por sub-job; `maxDuration: 60`):**
1. Carrinho abandonado: 1º lembrete após ~1h e 2º após ~24h (janelas configuráveis via `ABANDONED_CART_FIRST_HOURS`/`ABANDONED_CART_SECOND_HOURS`); pula `recovered_at`, `reminder_sent_at` e descadastrados
2. Pós-compra: D+3 (pedido de review), D+15 (produto complementar da categoria), D+45 (novidades da categoria)
3. Reativação de inativos 90–180d (`REACTIVATION_DAYS_MIN/MAX`) com cupom `VOLTEI15` (15%) — defaults de `REACTIVATION_COUPON_CODE`/`REACTIVATION_COUPON_PCT` —, no máximo 1x por mês por e-mail
4. Idempotência de todos os envios via `email_sent_log`

**Response 200:** `{ success: true, elapsedMs, abandoned: { firstReminder, secondReminder, skipped }, postPurchase: { d3, d15, d45 }, reactivation }`

---

## 7. Admin (endpoints de dados exigem `admin_session`)

> ⚠️ **Sem cookie admin válido = 401.** Re-login refaz cookie. Sessão TTL 8h.

### Sessão e autenticação

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-login` | POST | Login com email + senha via Supabase, exige role `admin`/`master` (+ TOTP ou PIN se 2FA ativo; challenge token com TTL 5 min). Resposta idêntica para senha errada e conta não-admin. Rate-limit 5/10min (dev) |
| `/api/admin-logout` | POST | Limpa `admin_session` (exige request same-origin) |
| `/api/admin-session` | GET | Retorna `{ success, authenticated }` — não vaza e-mail nem role |

### Dashboard e KPIs

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-dashboard` | GET | Payload agregado do painel: produtos, categorias, perfis, pedidos, itens, download logs, settings + summary de receita |
| `/api/admin-kpis` | GET | `?window=` (meses, 1–36). Receita MTD/mês anterior, ticket médio, pedidos, LTV, taxa de recompra (CAC = null até existir input de custo). Cache 1h |

### CRUD (todas as escritas geram audit log via `logAdminAction`)

| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin-products` | GET, POST, PUT, PATCH, DELETE | Lista + cria + atualiza + remove produtos (cria categoria on-the-fly por slug) |
| `/api/admin-categories` | GET, POST, PUT, DELETE | Idem para categorias (slug normalizado; 409 em duplicata) |
| `/api/admin-coupons` | GET, POST, PUT, DELETE | CRUD de cupons |
| `/api/admin-orders` | GET, PUT, DELETE | Lista (`?status=` opcional) + atualizar + excluir pedidos |
| `/api/admin-users` | GET, PUT, DELETE | Listar + atualizar + excluir clientes (profiles) |

### Análise (cache in-memory server-side)

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-abc-products` | GET | Curva ABC de produtos por receita (`?period=&categoryId=`). Cache 1h |
| `/api/admin-abc-customers` | GET | Curva ABC de clientes + classificação vip/recorrente/eventual (`?period=`; e-mails mascarados). Cache 1h |
| `/api/admin-cohort` | GET | Matriz de retenção por coorte mensal (`?months=`, 1–36). Cache 1h |
| `/api/admin-funnel` | GET | Funil de conversão por sessão + atribuição UTM (`?days=`, 1–180; `?nocache=1` invalida). Cache 1h |
| `/api/admin-segments` | GET | Relatório agregado de segmentação de subscribers (sem lista bruta de e-mails). Cache 30 min |

### Vitrine, configurações e uploads

| Endpoint | Métodos | Descrição |
|---|---|---|
| `/api/admin-settings` | GET, PUT | `?key=` de uma whitelist (`homeSections` — vitrine da home — e `adminConfig` — TOTP, PIN). GET de `adminConfig` nunca devolve `totpSecret`/`fallbackPin` (só `has2FA`/`hasPin`); PUT auditado com redação de segredos |
| `/api/admin-upload-url` | POST | Gera signed upload URL do Supabase Storage por `kind` (image/video/download), com whitelist de extensão/MIME e bloqueio de SVG/HTML em bucket público |

### Manutenção

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin-cleanup-events` | POST | Chama a RPC `cleanup_old_analytics_events` (remove eventos com mais de 180 dias) |

---

## 8. Express routes (não em `api/` — existem SÓ em dev)

Rotas montadas direto no Express via `server.js`/`routes/`. **Na Vercel elas não existem** (caem no 404 JSON de `api/_notfound.js`):

| Path | Métodos | Arquivo | Descrição |
|---|---|---|---|
| `/health` | GET | `server.js` | Healthcheck `{ ok: true, service: 'api', port }` |
| `/api/auth/me` | GET | `routes/auth.routes.js` | Bearer token Supabase; não usado pelo frontend (que usa `/api/auth/customer/session`) |
| `/api/produtos` | POST | `routes/products.routes.js` | Criação admin de produto (Bearer + role ADMIN, validada com Zod) |

`routes/payment.routes.js` existe mas está **vazio**: os aliases `/api/payments/process|verify` foram removidos de propósito (burlavam o rate limit do verify-payment).

---

## 9. Erros comuns

| HTTP | Quando acontece |
|---|---|
| 400 | Payload/query inválido (item sem `productId`, e-mail malformado, chave de setting fora da whitelist etc.) |
| 401 | Cookie de sessão ausente/inválido; token de download inválido, usado ou expirado; assinatura HMAC do webhook não bate; `X-Cron-Secret` errado |
| 403 | Request cross-origin em `/api/admin-logout` e `/api/auth/customer/logout` (anti-CSRF); `/api/admin-users` recusa editar/excluir contas admin/master |
| 404 | Recurso não existe — também usado no `verify-payment` quando o e-mail não bate (anti-enumeração) e em qualquer `/api/*` sem função na Vercel (`_notfound`, com `code: "not_found"`) |
| 405 | Método não permitido no endpoint |
| 409 | Duplicata (ex.: categoria com mesmo slug) |
| 422 | Cupom não aplicável em `/api/validate-coupon` (com `code` de máquina: `not_found`, `inactive`, `not_yet_valid`, `expired`, `exhausted`, `below_min`, `not_eligible`) |
| 429 | Excedeu rate limit (só em dev/Express). Veja headers `RateLimit-*`/`Retry-After` |
| 500 | Erro interno — mensagem genérica, não expõe stack/detalhes em prod |

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

Quando necessário adicionar v2 no futuro (ex: app mobile externo): criar `api/v2/` e manter `api/*` como compat.
