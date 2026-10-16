# 02 — Arquitetura

> Estrutura de pastas, decisões de stack, padrão BFF, camada de dados, dependências.

---

## Visão macro

```
┌────────────────────┐      ┌────────────────────┐      ┌──────────────────────┐
│  Browser (React)   │──HTTP─▶│  Express API     │──REST▶│  Supabase            │
│  Vite :5173        │      │  Node :3000      │      │  Auth + Postgres + S3 │
└────────────────────┘      └────────┬───────────┘      └──────────────────────┘
            │                        │
            │                        ├──HTTPS──▶ Mercado Pago (criar preferência, webhook, verify)
            │                        ├──SMTP───▶ Resend (e-mails transacionais e marketing)
            │                        └──HTTP───▶ Slack/Discord webhook (alertas de segurança, opcional)
            │
            ├──HTTPS──▶ Supabase Auth (apenas signInWithOAuth, resetPasswordForEmail, exchangeCode)
            ├──HTTPS──▶ GA4 (eventos do funil)
            └──HTTPS──▶ Meta Pixel (eventos do funil)
```

**O Express é um BFF (Backend for Frontend)**. O browser **não fala diretamente** com Supabase para CRUD de dados. Apenas para:

- `signInWithOAuth({ provider: 'google' })` — fluxo PKCE
- `resetPasswordForEmail`, `exchangeCodeForSession`/`setSession` e `updateUser` (durante reset de senha)
- `signOut({ scope: 'local' })` — limpa tokens do localStorage logo após o callback OAuth

Login com e-mail/senha e cadastro do cliente passam pelo BFF (`/api/auth/customer/login` e `/api/auth/customer/register`), que troca as credenciais por cookie HttpOnly `customer_session`. Toda escrita em tabelas e leitura de dados administrativos passa pelo Express usando `service_role`.

**Por que BFF e não chamar Supabase direto do browser?**

1. **Esconder `service_role`** do navegador. Se a anon key vazar, RLS protege. Se a service role vazar, o atacante tem acesso total ao banco.
2. **Validação consistente.** Zod no backend valida cada payload antes de tocar o banco. O cliente pode mentir; o servidor confere.
3. **Cookies HttpOnly.** Sessão de admin e de cliente ficam em cookies que o JS não acessa — defesa contra XSS.
4. **Integração com Mercado Pago.** O `access_token` do MP precisa ficar no servidor; webhook precisa de endpoint público estável.
5. **Rate-limit em um mecanismo só.** A política vale nos dois ambientes: `enforceRateLimit` (`lib/rate-limit.js`) conta no Postgres, que é o único estado que todas as funções serverless enxergam. O `express-rate-limit` de borda do `server.js` é conveniência de dev, não a política ([ADR 0007](../adr/0007-um-mecanismo-de-rate-limit.md)).
6. **Uma função serverless só.** O plano Hobby publica no máximo 12 funções por deployment e o projeto tem 45 handlers. `api/index.js` é a única função: ela serve o mesmo app Express (`lib/express-app.js`) que o `server.js` usa em dev, e os handlers moram em `handlers/`. O endpoint continua sendo o mesmo módulo nos dois ambientes ([ADR 0002](../adr/0002-handler-unico-para-vercel-e-express.md)).

---

## Estrutura de pastas

```
Projeto-mae/
│
├── api/                                  # ❶ A ÚNICA função serverless
│   ├── index.js                          # Remonta a URL a partir de `__path` e entrega ao app Express
│   └── __tests__/                        # Roteamento pela borda (`__path` duplicado, query preservada)
│
├── handlers/                             # ❷ Os 45 endpoints — o MESMO módulo em dev e em produção
│   ├── __tests__/                        # Testes dos endpoints + harness do caminho do dinheiro
│   ├── auth/customer/                    # login.js / register.js / session.js / logout.js
│   │   └── google/                       # start.js / callback.js (OAuth Google)
│   ├── admin/                            # 18 endpoints do painel, em /api/admin/<recurso>
│   │   ├── login.js / logout.js / session.js
│   │   ├── dashboard.js / kpis.js
│   │   ├── products.js / categories.js / orders.js / users.js / coupons.js   # CRUD pela factory (ADR 0005)
│   │   ├── settings.js / upload-url.js   # a vitrine é servida por settings.js
│   │   ├── abc-products.js / abc-customers.js / cohort.js
│   │   ├── funnel.js / segments.js
│   │   └── cleanup-events.js
│   ├── products.js                       # GET listagem pública
│   ├── product-details.js                # GET por slug
│   ├── home-sections.js                  # GET vitrine + destaques + mais vendidos
│   ├── create-payment.js                 # POST cria o pedido + preferência MP
│   ├── verify-payment.js                 # GET/POST status + emissão de download tokens (polling)
│   ├── webhook.js                        # POST webhook MP com HMAC
│   ├── download.js                       # GET com token de uso único
│   ├── customer-orders.js                # GET histórico do cliente
│   ├── cross-sell.js                     # GET recomendações por co-compra (fallback categoria)
│   ├── validate-coupon.js                # POST valida cupom server-side
│   ├── track-event.js                    # POST eventos do funil
│   ├── abandoned-cart.js                 # POST upsert de carrinho abandonado
│   ├── subscribe.js / unsubscribe.js / confirm-subscription.js   # Newsletter LGPD
│   ├── send-confirmation-email.js        # POST e-mail de confirmação do pedido
│   ├── me-delete-account.js              # POST exclusão de conta (LGPD, confirmação em 2 passos)
│   ├── me-export-data.js                 # GET exportação dos próprios dados (LGPD art. 18, V)
│   ├── cron-email-jobs.js                # POST jobs de e-mail (chamado pelo GitHub Actions)
│   ├── sitemap.xml.js                    # GET sitemap dinâmico
│   └── notfound.js                       # 404 JSON nomeado
│
├── routes/                               # ❸ Onde cada handler é montado no app Express
│   ├── auth.routes.js                    # /api/auth/customer/* → handlers/auth/customer/**
│   ├── api-compat.routes.js              # todo o resto de handlers/ como /api/*
│   └── __tests__/                        # Paridade de rotas (identidade de módulo) + guardas de auth
│
├── middleware/
│   └── error.middleware.js               # errorHandler global + notFoundHandler (404 JSON em /api)
│
├── lib/                                  # ❹ Camada de serviço backend — 30 módulos, todos com suíte
│   ├── express-app.js                    # App Express de dev E produção: headers, CORS, parsers, rotas
│   ├── route-mount.js                    # mountHandler: o adaptador único handler → Express
│   ├── http.js                           # Envelope, códigos de erro, guardMethod, CORS admin, cache (ADR 0004)
│   ├── logger.js                         # Log JSON estruturado — porta única (regra F1)
│   ├── supabase.js                       # Cliente REST service-role + helpers
│   ├── env-secret.js                     # Resolve segredos com política fail-closed + flags de ambiente
│   ├── admin-session.js                  # Cookie HMAC do admin + anti-CSRF por origem
│   ├── admin-2fa.js                      # TOTP + PIN de emergência, protegidos em repouso
│   ├── admin-audit.js                    # Trilha de auditoria das escritas admin (logAdminAction)
│   ├── admin-resource-handler.js         # Factory dos recursos CRUD do admin (ADR 0005)
│   ├── customer-session.js               # Cookie HMAC do cliente
│   ├── customer-auth-handlers.js         # Lógica de auth do cliente (as guardas ficam em handlers/auth/customer/**)
│   ├── customer-account-provisioning.js  # Cria/vincula a conta do comprador convidado após o pagamento
│   ├── security-headers.js               # CSP, HSTS, X-Frame-Options
│   ├── security-logger.js                # security_events + log + webhook de alerta opcional
│   ├── rate-limit.js                     # enforceRateLimit + RATE_LIMITS, contador no Postgres (ADR 0007)
│   ├── mercadopago-config.js             # SDK MP: preferência, consulta de pagamento, assinatura do webhook
│   ├── payment-integrity.js              # Reconciliação valor/moeda/live_mode — porta ÚNICA (ADR 0003)
│   ├── money.js                          # Aritmética de dinheiro em centavos inteiros (regra E3)
│   ├── coupons.js                        # Validação e cálculo de desconto de cupons
│   ├── public-catalog.js                 # Regras de vitrine dos endpoints públicos do catálogo
│   ├── sales-counts.js                   # Contagem de "mais vendidos"
│   ├── analytics-events.js               # Whitelist de eventos + gravação em analytics_events
│   ├── attribution-sanitize.js           # Whitelist canônica de atribuição (UTMs/referrer/sessão)
│   ├── abc-classification.js             # Curva ABC (Pareto) compartilhada
│   ├── customer-segmentation.js          # RFM + lifecycle + coorte
│   ├── concurrency.js                    # Execução em lote com concorrência limitada
│   ├── storage-signed-url.js             # URL assinada do Supabase Storage
│   ├── email-sender.js                   # Wrapper de envio (nodemailer → SMTP do Resend)
│   ├── email-templates.js                # Templates HTML dos e-mails
│   └── __tests__/
│
├── services/
│   └── supabase-auth.js                  # Clientes Supabase (anon/admin) do servidor + leitura do role em profiles
│
├── validation/                           # ❺ Schemas Zod, aplicados DENTRO do handler (regra B1)
│   ├── index.js                          # parse / parseOrFail
│   ├── common.schemas.js
│   ├── payment.schemas.js
│   └── admin.schemas.js
│
├── utils/
│   └── app-error.js                      # Classe Error com statusCode
│
├── src/                                  # ❻ Frontend React
│   ├── App.jsx                           # Rotas SPA + lazy load + Suspense
│   ├── main.jsx                          # Render + providers + banner de consentimento
│   ├── styles.css
│   │
│   ├── pages/
│   │   ├── HomePage.jsx                  # /
│   │   ├── ProductsPage.jsx              # /produtos
│   │   ├── ProductDetailsPage.jsx        # /produtos/:slug
│   │   ├── CheckoutPage.jsx              # /checkout
│   │   ├── DownloadsPage.jsx             # /downloads
│   │   ├── CustomerAuthPage.jsx          # /login + /conta
│   │   ├── ResetPasswordPage.jsx         # /reset-password
│   │   ├── LegalPages.jsx                # /privacidade + /termos
│   │   ├── SubscriptionPages.jsx         # /confirmar-inscricao + /desinscrever
│   │   ├── AdminLoginPage.jsx            # /admin sem sessão admin
│   │   ├── AdminPage.jsx                 # /admin com sessão (14 abas)
│   │   ├── NotFoundPage.jsx              # *
│   │   └── __tests__/
│   │
│   ├── components/
│   │   ├── Shell.jsx                     # Layout cliente: Header + Footer + Outlet
│   │   ├── CartDrawer.jsx
│   │   ├── ProductGrid.jsx / ProductSidebar.jsx / SortDropdown.jsx
│   │   ├── ProductBenefits.jsx / ProductFaq.jsx / ProductReviews.jsx
│   │   ├── ProductWizard.jsx + product-wizard-form.js   # Admin: produto (regras de dados fora do JSX)
│   │   ├── CategoryWizard.jsx / CouponWizard.jsx
│   │   ├── ModalWizard.jsx               # Wrapper genérico dos wizards
│   │   ├── CrossSellSection.jsx / CouponField.jsx / NewsletterSignup.jsx / SocialProofStrip.jsx
│   │   ├── ConsentBanner.jsx / ConsentPreferences.jsx   # LGPD
│   │   ├── ProtectedRoute.jsx            # Sem sessão admin, renderiza o fallback (login)
│   │   ├── ErrorBoundary.jsx / ToastViewport.jsx / Skeleton.jsx / StatusStepper.jsx / ScrollToTop.jsx
│   │   ├── SEO.jsx                       # react-helmet-async + JSON-LD
│   │   └── admin/
│   │       ├── AdminLayout.jsx           # Sidebar + header do painel
│   │       ├── OrderDetailModal.jsx      # Modal de detalhe de pedido
│   │       ├── tabs/                     # 14 abas (ver [07-DASHBOARD-ADMIN](./07-DASHBOARD-ADMIN.md)) + regras extraídas do JSX
│   │       ├── ui/                       # StatCard, BarList, StatusChip, Card, Button, EmptyState, useModalBehavior
│   │       └── utils/                    # category-label.js, derive.js, errors.js, tabs.js
│   │
│   ├── providers/                        # AuthProvider, CartProvider, ToastProvider
│   ├── hooks/                            # useAuth, useCart, useToast, useProductFilters
│   │
│   ├── services/                         # A única camada que fala com a API (regra C2)
│   │   ├── admin-auth.js / admin-panel.js / admin-products.js
│   │   ├── checkout.js / coupons.js / downloads.js / products.js
│   │   ├── customer-auth.js / newsletter.js / subscription.js
│   │   └── supabase-browser.js           # Supabase client só para OAuth e reset de senha
│   │
│   ├── utils/
│   │   ├── api.js                        # apiRequest: timeout 15s + parse do envelope (regra C1)
│   │   ├── analytics.js                  # GA4 + Meta Pixel + consent gate
│   │   ├── attribution.js                # UTM persistente em localStorage
│   │   ├── consent.js                    # Estado do consentimento LGPD
│   │   ├── cart-storage.js
│   │   ├── currency.js / number.js / date.js   # Formatação (regra C3)
│   │   ├── abc.js                        # Curva ABC no browser (paridade com lib/abc-classification.js)
│   │   └── csv-export.js                 # Export de relatórios admin
│   │
│   ├── constants/                        # routes.js (ROUTES) + error-codes.js (códigos da API, isSessionError)
│   └── test/                             # Setup do Vitest (projetos node + browser)
│
├── supabase/
│   ├── schema.sql                        # DDL completo
│   ├── security-hardening.sql            # RLS + policies + funções
│   ├── seed-sample-data.sql              # Dados de exemplo
│   ├── config.toml                       # Config CLI Supabase
│   └── migrations/                       # 21 migrations versionadas
│
├── scripts/
│   ├── check-env.js                      # Valida o ambiente (no npm run check e no build da Vercel)
│   ├── check-rls.js                      # O que a chave anon consegue ler em produção (só leitura)
│   ├── check-schema-drift.js             # Migrations local × remoto: funções, triggers, policies, grants
│   ├── check-advisor.js                  # Security Advisor via Management API
│   ├── configure-auth.js                 # Atualiza URLs OAuth permitidas
│   ├── db-inspect.js                     # Inventário via REST
│   ├── check-utf8.js / fix-utf8.js
│   ├── build-icon-subset.js + icons-usados.json   # Subset da fonte de ícones
│   └── fix-dns.ps1                       # Conserta DNS Windows
│
├── public/
│   ├── robots.txt
│   ├── favicon.svg
│   ├── og-default.png                    # Imagem OG padrão (1200×630)
│   └── fonts/                            # Subset do bootstrap-icons
│
├── docs/                                 # Índice em docs/README.md
├── tcc-build/                            # Gerador do .docx do TCC (fora do app)
├── .github/workflows/                    # test.yml (gate), lighthouse.yml, email-cron.yml
│
├── server.js                             # Express local de dev (:3000) — NÃO roda na Vercel
├── vite.config.js
├── vercel.json
├── tailwind.config.js
├── lighthouserc.json                     # Lighthouse CI
└── package.json
```

---

## Por onde começar a mexer

| Quero alterar…               | Comece por                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth do admin                | [`lib/admin-session.js`](../../lib/admin-session.js), [`lib/admin-2fa.js`](../../lib/admin-2fa.js), [`handlers/admin/login.js`](../../handlers/admin/login.js), [`src/services/admin-auth.js`](../../src/services/admin-auth.js)                                                           |
| Auth do cliente              | [`lib/customer-auth-handlers.js`](../../lib/customer-auth-handlers.js) (lógica), [`lib/customer-session.js`](../../lib/customer-session.js), `handlers/auth/customer/**` (guardas), [`routes/auth.routes.js`](../../routes/auth.routes.js)                                                 |
| Roteamento / montagem        | [`api/index.js`](../../api/index.js), [`lib/express-app.js`](../../lib/express-app.js), [`lib/route-mount.js`](../../lib/route-mount.js), [`routes/api-compat.routes.js`](../../routes/api-compat.routes.js)                                                                               |
| Layout do painel             | [`src/components/admin/AdminLayout.jsx`](../../src/components/admin/AdminLayout.jsx), [`src/pages/AdminPage.jsx`](../../src/pages/AdminPage.jsx)                                                                                                                                           |
| Wizard de produto e upload   | [`src/components/ProductWizard.jsx`](../../src/components/ProductWizard.jsx), [`handlers/admin/upload-url.js`](../../handlers/admin/upload-url.js), `uploadProductAsset` em [`src/services/admin-panel.js`](../../src/services/admin-panel.js)                                             |
| Curva ABC                    | [`lib/abc-classification.js`](../../lib/abc-classification.js) (backend) e [`src/utils/abc.js`](../../src/utils/abc.js) (browser) — os dois têm teste de paridade; `handlers/admin/abc-{products,customers}.js`; [`AnalysisTab.jsx`](../../src/components/admin/tabs/AnalysisTab.jsx)      |
| Checkout e pagamento         | [`handlers/create-payment.js`](../../handlers/create-payment.js), [`handlers/webhook.js`](../../handlers/webhook.js), [`handlers/verify-payment.js`](../../handlers/verify-payment.js), [`lib/payment-integrity.js`](../../lib/payment-integrity.js), [`lib/money.js`](../../lib/money.js) |
| Storage e downloads          | [`lib/storage-signed-url.js`](../../lib/storage-signed-url.js), [`handlers/download.js`](../../handlers/download.js)                                                                                                                                                                       |
| Cupons                       | [`lib/coupons.js`](../../lib/coupons.js), [`handlers/validate-coupon.js`](../../handlers/validate-coupon.js), [`handlers/admin/coupons.js`](../../handlers/admin/coupons.js), [`CouponsTab.jsx`](../../src/components/admin/tabs/CouponsTab.jsx)                                           |
| Cron de e-mail               | [`handlers/cron-email-jobs.js`](../../handlers/cron-email-jobs.js), [`.github/workflows/email-cron.yml`](../../.github/workflows/email-cron.yml)                                                                                                                                           |
| Rate limit                   | [`lib/rate-limit.js`](../../lib/rate-limit.js) e a migration `20260813000000_rate_limit.sql` ([ADR 0007](../adr/0007-um-mecanismo-de-rate-limit.md))                                                                                                                                       |
| Envelope de resposta / erros | [`lib/http.js`](../../lib/http.js) ([ADR 0004](../adr/0004-envelope-de-resposta-e-codigo-de-erro.md))                                                                                                                                                                                      |
| Header/footer do cliente     | [`src/components/Shell.jsx`](../../src/components/Shell.jsx)                                                                                                                                                                                                                               |
| CRUD do admin em geral       | [`lib/admin-resource-handler.js`](../../lib/admin-resource-handler.js) — a factory dos cinco recursos ([ADR 0005](../adr/0005-factory-para-recursos-crud-do-admin.md))                                                                                                                     |

---

## Como o request flui

O trecho até o app Express é igual para toda requisição, e só muda o ponto de entrada:

```
Produção (Vercel)                         Desenvolvimento
──────────────────                        ───────────────
mesma origem do site (/api)              front em :5173 chama http://localhost:3000/api
borda: headers de segurança (vercel.json) (cross-origin; o cors do Express resolve)
rota /api/(.*) → /api/index?__path=$1     server.js: limitador de borda em /api
api/index.js remonta req.url              (250/15min — só dev, ADR 0007)
          └──────────────┬──────────────────────┘
                         ▼
lib/express-app.js → helmet (security-headers) → cors → express.json (1MB)
                   → routes/auth.routes.js | routes/api-compat.routes.js
                   → mountHandler → handlers/<recurso>.js
```

Daqui em diante, toda guarda está **dentro do handler** (regras A3 e E1), na mesma ordem em
qualquer ambiente.

### Request público (catálogo)

```
Browser → src/services/products.js → apiRequest (src/utils/api.js, timeout 15s)
       → GET /api/products?category=alfabetizacao
handlers/products.js
       → guardMethod(['GET'])                  405 se outro método
       → enforceRateLimit(RATE_LIMITS.catalog)  120/min por IP, contador no Postgres
       → lib/supabase.js (service_role) + regras de vitrine (lib/public-catalog.js)
       → Cache-Control de catálogo (CDN pode servir)
       → ok(res, { products, ... })             envelope da regra A1
Browser → render
```

### Request admin (com auth)

```
Browser → src/services/admin-panel.js (credentials: include)
       → GET /api/admin/orders + cookie admin_session
handlers/admin/orders.js  (createAdminResourceHandler — ADR 0005)
       → setAdminCorsHeaders + Cache-Control no-store (adminReport)
       → guardMethod
       → ensureAdminSession() valida HMAC do cookie → 401 ADMIN_SESSION_INVALID se inválido
       → validação Zod (validation/admin.schemas.js) nas escritas
       → lib/supabase.js (service_role)
       → logAdminAction() em toda escrita (audit log append-only)
       → ok(res, { ... })
Browser → render na aba do AdminPage
```

Endpoints admin não têm contador de rate limit próprio: a sessão admin é a guarda (exceto o
login, que tem `adminLogin` e `adminLoginSecondFactor`).

### Request de webhook

```
Mercado Pago → POST /api/webhook
            → body: { type: 'payment', data: { id: '123' } }
            → headers: x-signature: ts=…,v1=hash  +  x-request-id
handlers/webhook.js   (sem contador: a assinatura é a guarda — dispensa registrada)
       → inspectWebhookSignature() → HMAC-SHA256 com WEBHOOK_SECRET + janela de frescor do ts
       → 401 genérico se inválido (motivo vai para security_events, não para a resposta)
       → getPaymentInfo(paymentId) no Mercado Pago
       → external_reference do pagamento = orders.order_code
       → se approved: checkPaymentIntegrity (valor, moeda, live_mode) ANTES de qualquer escrita
             └─ divergência → security_event 'payment_amount_mismatch' + 200 sem aprovar
       → UPDATE orders ... WHERE payment_status <> 'approved'   (transição atômica, idempotente)
       → INSERT em lote em download_tokens (só se ainda não houver nenhum)
       → na 1ª aprovação: provisiona conta do comprador + evento payment_approved
       → 200 OK (a resposta NÃO devolve tokens)
```

---

## Decisões arquiteturais (ADRs informais)

### D1. SPA + BFF Express ao invés de Next.js

**Contexto.** Time de 1 dev, projeto pequeno, hosting gratuito Vercel.
**Decisão.** React SPA + Express BFF, sem SSR.
**Trade-off.** Perdemos prerender automático → SEO depende de Lighthouse + sitemap + meta dinâmico via Helmet (já no verde). Se SEO cair abaixo de 95 em produção, avaliar `react-snap` (build-time prerender). Migrar para Next.js só se ROI justificar.

### D2. Cookies HttpOnly assinados ao invés de localStorage com JWT

**Contexto.** Auth de admin e cliente expostos a XSS se token estiver acessível ao JS.
**Decisão.** Sessões via cookie HttpOnly + HMAC-SHA256. JS não acessa.
**Trade-off.** Precisamos manter `ADMIN_SESSION_SECRET` e `CUSTOMER_SESSION_SECRET` no servidor + rotação trimestral. CSRF mitigado por SameSite=Strict.

### D3. Polling como fallback de webhook

**Contexto.** Em dev sem ngrok, webhook do MP não chega; em prod, pode falhar/atrasar.
**Decisão.** Frontend faz polling em `/api/verify-payment` a cada 4s na CheckoutPage (com recuo progressivo de 15s até 5min, no máximo 150 tentativas) e a cada 10s na DownloadsPage (12 tentativas, depois o botão "Atualizar").
**Trade-off.** Mais requests, mas garante UX confiável. O perfil `verifyPayment` (600 por 10 min, contado por `order_code`, não por IP) controla abuso.

### D4. localStorage para carrinho

**Contexto.** Carrinho não precisa estar no banco para visitante anônimo.
**Decisão.** Items em `localStorage`; preço e disponibilidade re-validados no checkout (server-side).
**Trade-off.** Atacante pode forjar preço no client; backend sempre revalida com `products.price` antes de criar preferência MP.

### D5. Vitrine configurável em `settings` ao invés de coluna em `products`

**Contexto.** Quais produtos aparecem em destaque, mais vendidos, novidades.
**Decisão.** Tabela `settings` (key-value JSON) guarda a configuração da vitrine. Aba **Vitrine** edita.
**Trade-off.** Setup inicial mais complexo, mas dona da loja edita sem dev intermediar.

### D6. Cron via GitHub Actions ao invés de pg_cron

**Contexto.** Supabase Free não garante `pg_cron`. Disparo de emails (abandoned cart, reativação) precisa ser confiável.
**Decisão.** Workflow `email-cron.yml` chama `/api/cron-email-jobs` com `CRON_SECRET`.
**Trade-off.** Dependência do GitHub (free 2.000 min/mês). `pg_cron` é usado apenas para purges de retenção de dados antigos (logs, eventos de analytics, subscribers não confirmados), que não bloqueiam se falharem.

### D7. Schema único `public` no Postgres

**Contexto.** Multi-schema (auth, public, storage) complicaria policies.
**Decisão.** Tudo do app vive em `public.*`. Apenas Auth/Storage usam `auth.*`/`storage.*`.
**Trade-off.** Necessário `revoke execute` em SECURITY DEFINER functions + grants de coluna explícitos em `profiles` (ver [08-SEGURANCA §4b](./08-SEGURANCA.md)).

### D8. Tailwind ao invés de styled-components

**Contexto.** Time pequeno, branding consistente, mobile-first.
**Decisão.** Tailwind com `brand-*` customizado em `tailwind.config.js`.
**Trade-off.** Markup carregado de classes, mas zero CSS-in-JS overhead e tree-shake nativo.

### D9. Vitest ao invés de Jest

**Contexto.** Build é Vite; queremos mesmo ESM e velocidade.
**Decisão.** Vitest + Testing Library.
**Trade-off.** Algumas libs com setup só Jest precisam de adaptação; ganhamos hot-reload de testes e config unificada.

---

## Dependências externas

| Dependência    | Onde aparece              | Como falha graciosamente                                                                     |
| -------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| Supabase       | Tudo: DB, Auth, Storage   | App fica 500. Sem fallback (single point of failure por design)                              |
| Mercado Pago   | Checkout + webhook        | Checkout falha visivelmente; webhook gera 4xx/5xx logado, polling cobre                      |
| Resend (SMTP)  | Reset senha + e-mails app | Reset falha silencioso para o usuário; logs do server mostram erro                           |
| GA4            | Eventos do funil          | Disparo bloqueado se sem consent. Sem GA4 ID, `gtag` não inicializa                          |
| Meta Pixel     | Eventos do funil          | Idem GA4                                                                                     |
| Vercel         | Hosting + serverless      | App offline; deploy alternativo em outro provedor possível (vercel.json é principal blocker) |
| GitHub Actions | Cron de email             | Cron não roda; pode ser invocado manualmente via `gh workflow run`                           |

---

## Configurações importantes

### `lib/express-app.js` (o app, nos dois ambientes)

1. `app.set('trust proxy', 1)` para a Vercel (IP real do cliente no rate limit e nos logs)
2. Helmet com CSP estrita (`lib/security-headers.js`)
3. CORS: fora de dev/test, `CORS_ORIGINS` é **obrigatório** (sem ele o boot falha); em dev, qualquer `localhost:*`. Origem recusada não vira erro: segue sem headers de CORS e a guarda do handler decide
4. `express.json` e `urlencoded` com limite de 1MB
5. Rotas: `/sitemap.xml` e `/api/sitemap.xml`, depois `/api` → `auth.routes` → `api-compat.routes` → `notFoundHandler` (404 JSON)

### `server.js` (Express local de dev, :3000)

1. Carrega `.env.{ENV}.local` → `.env.local` (pulado quando `ENV=test`) → `.env.{ENV}` → `.env` (cascata; `ENV` = `APP_ENV || NODE_ENV || 'development'`)
2. Em produção: exige os segredos de boot e `APP_URL` com `https://`
3. Monta `createApiApp` com o limitador de borda genérico em `/api` (250/15min, `RATE_LIMIT_MAX`) — só aqui, nunca na Vercel
4. Acrescenta `GET /health` (não existe em produção), o 404 e o `errorHandler`

### `api/index.js` (produção)

Monta o mesmo `createApiApp` uma vez por instância, fecha com o `errorHandler` e, a cada requisição, remonta `req.url` a partir de `__path`. Mais de um `__path` na query faz a requisição não ser roteada (404), porque um deles veio do cliente.

### `vite.config.js`

- Port 5173 com `strictPort: true` (não muda de porta se ocupada)
- `manualChunks` (via `rolldownOptions`, Vite 8): `react` (react + react-dom + scheduler), `router` (react-router), `supabase` e `vendor` (resto). O `react-hook-form` fica de fora de propósito e vai junto da `CheckoutPage`, seu único importador, para não pesar no caminho crítico
- Testes em dois projetos do Vitest: `node` (as pastas do backend: `api/`, `handlers/`, `lib/`, `routes/`, `scripts/` etc.) e `browser` (jsdom, tudo em `src/**/*.test.{js,jsx}`), cada um com seu setup
- Piso de cobertura (regra D2) em `coverage.thresholds`, recalibrado a cada rodada com ~2pp de folga

### `vercel.json`

- Build estático em `dist/` (frontend)
- **Uma** função serverless: `api/index.js`, com `maxDuration: 60` — teto do plano Hobby, e o que o cron de e-mail precisa
- Rotas em ordem: headers de segurança em todas as respostas (HSTS, CSP, X-Frame-Options etc., com `continue`); `/api/admin-*` → função com `__path=admin/*` (regra A6); `/api/*` → função; `/sitemap.xml` → função; filesystem (estáticos); `/*` → `/index.html` (SPA fallback)
- O caminho original viaja no parâmetro `__path` porque um `dest` da Vercel **reescreve** `req.url`: sem ele toda requisição chegaria na função como `/api/index` e o Express não saberia qual endpoint era. `api/index.js` remonta a URL antes de entregar ao app, preservando a query original
- `/api/*` inexistente responde 404 JSON pelo `notFoundHandler` do próprio Express, não mais por uma rota do `vercel.json`. O endpoint `/api/notfound` continua existindo por si (montado em `routes/api-compat.routes.js`)

### `tailwind.config.js`

- Brand: `purple` (#9B5DE5) com escalas 50-900; accents `sky`, `pink`, `yellow`
- Fonts: Raleway (display), Poppins (heading), Roboto (sans)
- Shadows brand + animations marquee/float

---

## Próximos passos arquiteturais (quando justificar)

Itens descartados conscientemente hoje, com gatilho de reabertura:

| Item                                       | Gatilho para reabrir                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Next.js / SSR                              | Lighthouse SEO < 95 em produção, ou TTFB ruim em conexão 3G                               |
| pg_cron oficial (Supabase Pro)             | Volume de e-mails ultrapassa GitHub Actions free; ou job precisa rodar de minuto a minuto |
| CDN de imagens (Cloudflare Images / Imgix) | Catálogo > 200 produtos OU bandwidth Vercel ultrapassa 100GB/mês                          |
| Sentry / observabilidade paga              | ErrorBoundary mostra > 100 erros/dia                                                      |
| Microsserviços                             | Quando team crescer > 5 devs e bloqueios mútuos surgirem                                  |
