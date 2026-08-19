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
6. **Compatibilidade com Vercel.** Cada arquivo em `api/` vira função serverless automática; em dev, o Express monta os mesmos handlers via `api-compat.routes.js`.

---

## Estrutura de pastas

```
Atelie-escolar/
│
├── api/                                  # ❶ Endpoints serverless (Vercel) + montados no Express em dev
│   ├── __tests__/                        # Testes dos endpoints
│   ├── auth/customer/                    # login.js / register.js / session.js / logout.js
│   │   └── google/                       # start.js / callback.js (OAuth Google)
│   ├── notfound.js                       # 404 JSON para /api/* inexistente (Vercel)
│   ├── products.js                       # GET listagem pública
│   ├── product-details.js                # GET por slug
│   ├── home-sections.js                  # GET vitrine + destaques + mais vendidos
│   ├── create-payment.js                 # POST cria preferência MP
│   ├── verify-payment.js                 # GET status + emissão de download tokens
│   ├── webhook.js                        # POST webhook MP com HMAC
│   ├── download.js                       # GET com token efêmero
│   ├── customer-orders.js                # GET histórico do cliente
│   ├── cross-sell.js                     # GET recomendações por co-compra (fallback categoria)
│   ├── validate-coupon.js                # POST valida cupom server-side
│   ├── track-event.js                    # POST eventos do funil (RLS público)
│   ├── abandoned-cart.js                 # POST upsert de carrinho abandonado (só POST)
│   ├── subscribe.js / unsubscribe.js / confirm-subscription.js   # Newsletter LGPD
│   ├── send-confirmation-email.js        # POST nodemailer → Resend
│   ├── me-delete-account.js              # POST exclusão de conta (LGPD, confirmação 2 passos)
│   ├── sitemap.xml.js                    # GET sitemap dinâmico
│   ├── cron-email-jobs.js                # POST job de email (chamado por GitHub Actions)
│   │
│   ├── admin-login.js / admin-logout.js / admin-session.js
│   ├── admin-dashboard.js / admin-kpis.js
│   ├── admin-products.js / admin-categories.js / admin-orders.js / admin-users.js
│   ├── admin-coupons.js / admin-settings.js / admin-upload-url.js   # vitrine é servida por admin-settings
│   ├── admin-abc-products.js / admin-abc-customers.js / admin-cohort.js
│   ├── admin-funnel.js / admin-segments.js
│   └── admin-cleanup-events.js
│
├── routes/                               # ❷ Mount points do Express (só dev)
│   ├── auth.routes.js                    # /api/auth/me + /api/auth/customer/* (mesmos handlers de api/auth/)
│   ├── payment.routes.js                 # Router VAZIO (aliases /payments/* removidos; mantido pelo mount)
│   ├── products.routes.js                # POST /api/produtos (admin, validado, dev-only)
│   └── api-compat.routes.js              # Reusa todos os api/*.js como /api/* + rate-limits por endpoint
│
├── middleware/                           # ❸ Middlewares Express
│   ├── auth.middleware.js                # Valida Bearer token Supabase + resolve role
│   ├── error.middleware.js               # Handler de erro global + 404
│   └── validate.middleware.js            # validateBody(zodSchema)
│
├── lib/                                  # ❹ Camada de serviço backend
│   ├── supabase.js                       # Cliente service-role + helpers
│   ├── env-secret.js                     # Resolve segredos + flags (cookie seguro, dev/test)
│   ├── admin-session.js                  # Cookie HMAC + 2FA challenge + TOTP
│   ├── customer-session.js               # Cookie HMAC do cliente
│   ├── customer-auth-handlers.js         # Handlers de auth do cliente (compartilhados api/ ↔ routes/)
│   ├── security-headers.js               # CSP estrita, HSTS, X-Frame-Options
│   ├── security-logger.js                # Log estruturado + tabela security_events + webhook opcional
│   ├── admin-audit.js                     # Trilha de auditoria de ações admin (logAdminAction)
│   ├── mercadopago-config.js             # SDK MP + criar preferência + validar webhook (HMAC + janela de frescor do `ts`)
│   ├── payment-integrity.js              # Reconciliação valor/moeda/live_mode — porta ÚNICA de webhook.js e verify-payment.js
│   ├── rate-limit.js                     # Contador atômico no Postgres (rate_limit_hit) — vale em serverless
│   ├── analytics-events.js               # Whitelist + RLS público de eventos
│   ├── attribution-sanitize.js           # Whitelist canônica de atribuição (UTMs/referrer/sessão)
│   ├── coupons.js                        # Validação e cálculo de desconto de cupons
│   ├── abc-classification.js             # Algoritmo Pareto compartilhado
│   ├── customer-segmentation.js          # RFM + lifecycle + cohort
│   ├── customer-account-provisioning.js  # Vincula pedido a conta existente
│   ├── storage-signed-url.js             # Gera URL assinada do Supabase Storage
│   ├── email-sender.js                   # Wrapper Resend/nodemailer
│   ├── email-templates.js                # 8 templates HTML
│   └── __tests__/                        # Testes dos lib
│
├── services/
│   └── supabase-auth.js                  # Helpers Supabase Auth lado servidor
│
├── validation/                           # ❺ Schemas Zod
│   ├── payment.schemas.js
│   ├── product.schemas.js
│   └── __tests__/
│
├── utils/
│   └── app-error.js                      # Classe Error com statusCode
│
├── src/                                  # ❻ Frontend React
│   ├── App.jsx                           # Rotas SPA + lazy load + Suspense
│   ├── main.jsx                          # Render + providers
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
│   │   ├── AdminLoginPage.jsx            # /painel-acesso-privado-atelie
│   │   ├── AdminPage.jsx                 # /admin (com 14 abas)
│   │   ├── NotFoundPage.jsx              # *
│   │   └── __tests__/                    # Testes de página
│   │
│   ├── components/                       # Compartilhados
│   │   ├── Shell.jsx                     # Layout cliente: Header + Footer + Outlet
│   │   ├── CartDrawer.jsx
│   │   ├── ProductGrid.jsx
│   │   ├── ProductSidebar.jsx
│   │   ├── ProductBenefits.jsx / ProductFaq.jsx / ProductReviews.jsx
│   │   ├── ProductWizard.jsx             # Admin: criação de produto
│   │   ├── CategoryWizard.jsx            # Admin: criação de categoria
│   │   ├── CouponWizard.jsx              # Admin: criação de cupom
│   │   ├── ModalWizard.jsx               # Wrapper genérico
│   │   ├── CrossSellSection.jsx
│   │   ├── CouponField.jsx
│   │   ├── NewsletterSignup.jsx
│   │   ├── SocialProofStrip.jsx
│   │   ├── ConsentBanner.jsx             # LGPD
│   │   ├── ProtectedRoute.jsx            # Wrapper de rota admin
│   │   ├── ErrorBoundary.jsx
│   │   ├── ToastViewport.jsx / Skeleton.jsx / SortDropdown.jsx / StatusStepper.jsx
│   │   ├── SEO.jsx                       # react-helmet-async + JSON-LD
│   │   └── admin/
│   │       ├── AdminLayout.jsx           # Sidebar + header do painel
│   │       ├── OrderDetailModal.jsx      # Modal de detalhe de pedido
│   │       ├── tabs/                     # ⚠️ 14 abas (ver [07-DASHBOARD-ADMIN](./07-DASHBOARD-ADMIN.md))
│   │       ├── ui/                       # StatCard, BarList, StatusChip, Card, Button, EmptyState
│   │       └── utils/                    # Helpers admin (derive.js, format.js, tabs.js)
│   │
│   ├── providers/                        # Context React
│   │   ├── AuthProvider.jsx
│   │   ├── CartProvider.jsx
│   │   └── ToastProvider.jsx
│   │
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCart.js
│   │   ├── useToast.js
│   │   └── useProductFilters.js
│   │
│   ├── services/                         # API client lado browser
│   │   ├── admin-auth.js
│   │   ├── admin-panel.js
│   │   ├── admin-products.js
│   │   ├── customer-auth.js
│   │   ├── products.js
│   │   └── supabase-browser.js
│   │
│   ├── utils/
│   │   ├── analytics.js                  # GA4 + Meta Pixel + consent gate
│   │   ├── api.js                        # fetch wrapper com timeout 15s + parse de erro
│   │   ├── attribution.js                # UTM persistente em localStorage
│   │   ├── cart-storage.js
│   │   ├── consent.js                    # LGPD state
│   │   ├── csv-export.js                 # Export de relatórios admin
│   │   └── currency.js
│   │
│   ├── constants/                        # routes.js (ADMIN_LOGIN_PATH, reset-password)
│   └── test/                             # Setup Vitest
│
├── supabase/
│   ├── schema.sql                        # DDL completo
│   ├── security-hardening.sql            # RLS + policies + funções
│   ├── seed-sample-data.sql              # Dados de exemplo
│   ├── config.toml                       # Config CLI Supabase
│   └── migrations/                       # 18 migrations versionadas
│
├── scripts/
│   ├── check-advisor.js                  # Security Advisor via Management API
│   ├── configure-auth.js                 # Atualiza URLs OAuth permitidas
│   ├── db-inspect.js                     # Inventário via REST
│   ├── check-utf8.js / fix-utf8.js
│   └── fix-dns.ps1                       # Conserta DNS Windows
│
├── public/
│   ├── robots.txt
│   ├── favicon.svg
│   └── og-default.png                    # ❌ ainda não criado — pendência §13
│
├── server.js                             # Bootstrap Express
├── vite.config.js
├── vercel.json
├── tailwind.config.js
├── lighthouserc.json                     # Lighthouse CI
└── package.json
```

---

## Por onde começar a mexer

| Quero alterar…               | Comece por                                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth do admin                | [`lib/admin-session.js`](../../lib/admin-session.js), [`api/admin/login.js`](../../api/admin/login.js), [`src/services/admin-auth.js`](../../src/services/admin-auth.js)                                                                                                         |
| Auth do cliente              | [`lib/customer-auth-handlers.js`](../../lib/customer-auth-handlers.js), [`lib/customer-session.js`](../../lib/customer-session.js), `api/auth/customer/**`                                                                                                                       |
| Layout do painel             | [`src/components/admin/AdminLayout.jsx`](../../src/components/admin/AdminLayout.jsx), [`src/pages/AdminPage.jsx`](../../src/pages/AdminPage.jsx)                                                                                                                                 |
| Wizard de produto e upload   | [`src/components/ProductWizard.jsx`](../../src/components/ProductWizard.jsx), [`api/admin/upload-url.js`](../../api/admin/upload-url.js), `uploadProductAsset` em [`src/services/admin-panel.js`](../../src/services/admin-panel.js)                                             |
| Curva ABC                    | [`lib/abc-classification.js`](../../lib/abc-classification.js) (backend) e [`src/utils/abc.js`](../../src/utils/abc.js) (browser) — os dois têm teste de paridade; `api/admin/abc-{products,customers}.js`; [`AnalysisTab.jsx`](../../src/components/admin/tabs/AnalysisTab.jsx) |
| Storage e downloads          | [`lib/storage-signed-url.js`](../../lib/storage-signed-url.js), [`api/download.js`](../../api/download.js)                                                                                                                                                                       |
| Cupons                       | [`lib/coupons.js`](../../lib/coupons.js), [`api/validate-coupon.js`](../../api/validate-coupon.js), [`api/admin/coupons.js`](../../api/admin/coupons.js), [`CouponsTab.jsx`](../../src/components/admin/tabs/CouponsTab.jsx)                                                     |
| Cron de e-mail               | [`api/cron-email-jobs.js`](../../api/cron-email-jobs.js), [`.github/workflows/email-cron.yml`](../../.github/workflows/email-cron.yml)                                                                                                                                           |
| Rate limit                   | [`lib/rate-limit.js`](../../lib/rate-limit.js) e a migration `20260813000000_rate_limit.sql` ([ADR 0007](../adr/0007-um-mecanismo-de-rate-limit.md))                                                                                                                             |
| Envelope de resposta / erros | [`lib/http.js`](../../lib/http.js) ([ADR 0004](../adr/0004-envelope-de-resposta-e-codigo-de-erro.md))                                                                                                                                                                            |
| Header/footer do cliente     | [`src/components/Shell.jsx`](../../src/components/Shell.jsx)                                                                                                                                                                                                                     |
| CRUD do admin em geral       | [`lib/admin-resource-handler.js`](../../lib/admin-resource-handler.js) — a factory dos cinco recursos ([ADR 0005](../adr/0005-factory-para-recursos-crud-do-admin.md))                                                                                                           |

---

## Como o request flui

### Request público (catálogo)

```
Browser → fetch /api/products?category=alfabetizacao
       → utils/api.js (timeout 15s via AbortController, parse de erro)
Express :3000
       → middleware/cors → middleware/rate-limit (250/15min)
       → routes/api-compat.routes.js
       → api/products.js
       → lib/supabase.js (service_role)
       → Supabase REST (RLS pulado pelo service_role)
       → JSON volta
Browser → cache no React state → render
```

### Request admin (com auth)

```
Browser → fetch /api/admin/orders + cookie admin_session
       → utils/api.js
Express :3000
       → middleware/cors + middleware/rate-limit
       → routes/api-compat.routes.js
       → api/admin/orders.js
       → ensureAdminSession() valida HMAC do cookie
       → 401 se inválido | continua se válido
       → lib/supabase.js (service_role)
       → SELECT + JOINs
       → JSON
Browser → render no AdminPage tab
```

### Request de webhook

```
Mercado Pago → POST https://app.com/api/webhook
            → body: { type: 'payment', data: { id: 'PAY-123' } }
            → headers: x-signature: ts=…,v1=hash
Express :3000
       → middleware/rate-limit (global 250/15min; webhook sem limiter dedicado)
       → api/webhook.js
       → validateWebhookSignature() → HMAC-SHA256 com WEBHOOK_SECRET
       → 401 se inválido | continua se válido
       → mercadopago.payment.get(paymentId)
       → external_reference da preference = orders.id
       → UPDATE orders SET payment_status='approved' (transição atômica !approved→approved)
       → INSERT INTO download_tokens (lote idempotente)
       → 200 OK
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
**Decisão.** Frontend faz polling em `/api/verify-payment` a cada 4s (CheckoutPage) e 10s (DownloadsPage).
**Trade-off.** Mais requests, mas garante UX confiável. Rate-limit (60/min por IP) controla abuso.

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

### `server.js` (Express bootstrap)

1. Carrega `.env.{ENV}.local` → `.env.local` → `.env.{ENV}` → `.env` (cascata; `ENV` = `APP_ENV || NODE_ENV`)
2. Em prod: valida que `APP_URL` começa com `https://` e que segredos estão setados
3. `app.set('trust proxy', 1)` para Vercel
4. Helmet + CORS (allowlist em prod, localhost wildcard em dev) + express.json 1MB + rate-limit
5. Routes na ordem: `GET /health`, `GET /sitemap.xml`, depois tudo sob `/api`: auth → products → payments (router vazio) → compat (`api/*.js`)
6. Handler de erro global + 404 JSON

### `vite.config.js`

- Port 5173 com `strictPort: true` (não muda de porta se ocupada)
- `manualChunks` (via `rolldownOptions`, Vite 8) para split de chunks: `router` (react-router), `supabase`, `forms` (react-hook-form), `react` (react + react-dom), `vendor` (resto)
- Test config: jsdom, setupFiles, globals

### `vercel.json`

- Build estático em `dist/` (frontend)
- Cada `api/**/*.js` vira função serverless (o caminho do arquivo é a rota; ex.: `api/auth/customer/login.js` → `/api/auth/customer/login`)
- Rotas em ordem: headers de segurança em todas as respostas (HSTS, CSP, X-Frame-Options etc., com `continue`); `/api/*` → `/api/$1`; `/sitemap.xml` → `/api/sitemap.xml`; filesystem (estáticos); `/api/*` sem função → `/api/notfound` (404 JSON); `/*` → `/index.html` (SPA fallback)
- Os `dest` são **caminhos de rota, sem `.js`** — sob zero-config a Vercel publica `api/x.js` na rota `/api/x`. E o handler do 404 **não pode** voltar a se chamar `_notfound.js`: arquivos de `api/` prefixados com `_` não viram função, o `dest` não resolveria e todo `/api/*` inexistente cairia no SPA fallback, respondendo HTML com status 200

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
