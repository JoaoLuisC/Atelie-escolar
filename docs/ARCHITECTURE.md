# Arquitetura

## Diagrama de alto nível

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (Cliente)                            │
│                                                                         │
│  React 19 SPA  •  Tailwind CSS  •  React Router 7                       │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ HomePage     │  │ ProductsPage │  │ CheckoutPage │  Pages            │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
│         │                  │                  │                         │
│         └──────────────────┴──────────────────┘                         │
│                            │                                            │
│  ┌─────────────────────────▼──────────────────────────────────────┐     │
│  │ Providers: Auth / Cart / Toast                                 │     │
│  │ Hooks: useAuth, useCart, useToast, useProductFilters           │     │
│  │ Services: customer-auth, admin-auth, products, admin-panel     │     │
│  │ Utils: api, currency                                           │     │
│  └─────────────────────────┬──────────────────────────────────────┘     │
└────────────────────────────┼────────────────────────────────────────────┘
                             │ fetch + credentials: include
                             │ (cookies HttpOnly)
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS API (Node :3000)                          │
│                                                                         │
│  middleware: helmet, cors, rate-limit, json-parser                      │
│                                                                         │
│  routes/                                                                │
│   ├── auth.routes.js          (login, register, OAuth, session)         │
│   ├── products.routes.js      (catálogo público)                        │
│   ├── payment.routes.js       (create-payment, verify-payment)          │
│   └── api-compat.routes.js    (todos os endpoints /api/*)               │
│                                                                         │
│  api/                                                                   │
│   ├── admin-*.js              (CRUD para painel admin)                  │
│   ├── create-payment.js       (cria preferência Mercado Pago)           │
│   ├── verify-payment.js       (consulta status do pagamento)            │
│   ├── webhook.js              (recebe webhook do MP)                    │
│   ├── download.js             (entrega arquivo via token)               │
│   └── home-sections.js        (vitrine pública)                         │
│                                                                         │
│  lib/                                                                   │
│   ├── supabase.js             (wrapper REST com service_role)           │
│   ├── customer-session.js     (cookie HttpOnly JWT-like)                │
│   ├── admin-session.js        (cookie HttpOnly admin)                   │
│   └── mercadopago-config.js   (SDK + webhook signature)                 │
└─────────────────┬───────────────────────────────┬───────────────────────┘
                  │                               │
                  │ REST + service_role           │ HTTPS + access_token
                  ▼                               ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│   SUPABASE                           │  │   MERCADO PAGO               │
│                                      │  │                              │
│   ─ Postgres 15 (RLS habilitado)     │  │   ─ Checkout Pro             │
│   ─ Auth (email + Google OAuth)      │  │   ─ Webhooks                 │
│   ─ SMTP custom → Resend             │  │   ─ Sandbox para testes      │
│   ─ Storage (futuro)                 │  │                              │
└──────────────────────────────────────┘  └──────────────────────────────┘
            │
            │ smtp.resend.com:465                  ┌──────────────────┐
            └─────────────────────────────────────▶│  RESEND          │
                                                   │                  │
            nodemailer (api/send-confirmation-email)│  Email transac.  │
            ───────────────────────────────────────▶│  (3k/mês free)   │
                                                   └──────────────────┘
```

**Email** vai por dois caminhos, ambos via Resend:
- Auth emails (reset senha, confirm signup) → Supabase Auth SMTP → Resend
- Pedido aprovado → nodemailer no Express → Resend

---

## Estrutura de pastas

```
.
├── api/                         # Serverless handlers (Vercel)
│   ├── admin-*.js               # Endpoints do painel admin
│   ├── create-payment.js
│   ├── verify-payment.js
│   ├── webhook.js
│   ├── download.js
│   ├── products.js
│   ├── product-details.js
│   ├── home-sections.js
│   ├── customer-orders.js
│   ├── send-confirmation-email.js
│   └── __tests__/api-endpoints.test.js
│
├── routes/                      # Express routes (dev local)
│   ├── auth.routes.js
│   ├── products.routes.js
│   ├── payment.routes.js
│   └── api-compat.routes.js     # Reexporta api/* como Express handlers
│
├── lib/                         # Camada compartilhada server-side
│   ├── supabase.js              # REST helper com service_role
│   ├── customer-session.js      # Cookie HttpOnly
│   ├── admin-session.js         # Cookie HttpOnly admin + CORS
│   ├── customer-account-provisioning.js  # Cria auth.users + dispara reset
│   └── mercadopago-config.js    # SDK MP
│
├── middleware/                  # Express middleware
│   ├── auth.middleware.js       # Bearer token (Supabase JWT)
│   ├── error.middleware.js
│   └── validate.middleware.js   # Zod body validation
│
├── services/                    # Server services
│   └── supabase-auth.js         # getProfileRoleByUserId
│
├── utils/                       # Utilitários server-side
│   └── app-error.js
│
├── validation/                  # Zod schemas
│   ├── payment.schemas.js
│   └── product.schemas.js
│
├── supabase/                    # SQL e config
│   ├── schema.sql               # DDL completo
│   ├── security-hardening.sql   # RLS + policies
│   ├── seed-sample-data.sql     # Dados iniciais
│   └── config.toml
│
├── scripts/                     # Scripts utilitários
│   ├── check-advisor.js         # Lê Security Advisor via Management API
│   ├── configure-auth.js        # Atualiza URLs OAuth permitidas
│   ├── fix-dns.ps1              # Conserta DNS local Windows (admin)
│   ├── fix-utf8.js              # Conserta encoding de dados
│   ├── check-utf8.js            # Audita encoding nos textos do banco
│   └── db-inspect.js            # Inventário de tabelas
│
├── src/                         # Frontend React
│   ├── App.jsx                  # Roteador raiz (lazy routes)
│   ├── main.jsx                 # Entry point + providers
│   ├── styles.css               # Tailwind base
│   ├── pages/
│   │   ├── HomePage.jsx
│   │   ├── ProductsPage.jsx (lógica de catálogo extraída em useProductFilters)
│   │   ├── ProductDetailsPage.jsx (galeria + vídeos)
│   │   ├── CheckoutPage.jsx (StatusStepper + polling de pagamento)
│   │   ├── DownloadsPage.jsx (StatusStepper + usePendingOrderPolling interno)
│   │   ├── CustomerAuthPage.jsx (login + register + reset)
│   │   ├── ResetPasswordPage.jsx
│   │   ├── AdminLoginPage.jsx (com 2FA)
│   │   ├── AdminPage.jsx (orquestrador das 10 abas em src/components/admin/tabs)
│   │   └── NotFoundPage.jsx
│   ├── components/
│   │   ├── Shell.jsx (navbar + footer)
│   │   ├── ProductGrid.jsx
│   │   ├── ProductSidebar.jsx
│   │   ├── SortDropdown.jsx
│   │   ├── ProductWizard.jsx (multi-step)
│   │   ├── CategoryWizard.jsx
│   │   ├── ModalWizard.jsx (base)
│   │   ├── StatusStepper.jsx (compartilhado por Checkout/Downloads)
│   │   ├── ToastViewport.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── admin/
│   │       ├── AdminLayout.jsx
│   │       ├── OrderDetailModal.jsx
│   │       ├── ui/ (StatCard, BarList, StatusChip, Card, Button, EmptyState)
│   │       ├── tabs/ (Dashboard, Products, Categories, Orders, Users, Finance,
│   │       │         Comparison, Performance, Vitrine, Security)
│   │       └── utils/ (format, derive, tabs)
│   ├── hooks/                   # useAuth, useCart, useToast, useProductFilters
│   ├── providers/               # AuthProvider, CartProvider, ToastProvider
│   ├── services/                # admin-auth, admin-panel, admin-products,
│   │                            # customer-auth, products, supabase-browser
│   ├── utils/                   # api, currency
│   ├── constants/               # routes (ADMIN_LOGIN_PATH, etc.)
│   └── test/                    # setupTests.js
│
├── server.js                    # Express server (dev local)
├── vite.config.js               # strictPort 5173 + manual chunks
├── tailwind.config.js           # paleta brand-*, animações marquee
├── vercel.json                  # roteamento produção
└── package.json
```

---

## Estratégia de chunks (code-splitting)

`vite.config.js` cria estes chunks pra otimizar cache:

| Chunk | Conteúdo | Tamanho |
|-------|----------|---------|
| `react` | react + react-dom | ~182 kB |
| `supabase` | @supabase/supabase-js | ~187 kB |
| `router` | react-router-dom | ~42 kB |
| `forms` | react-hook-form + zod | ~32 kB |
| `vendor` | Outras deps | ~1 kB |
| Pages | Cada rota é um chunk via `React.lazy` | 4-16 kB cada |
| `AdminPage` | Só carrega quando entra em `/admin` | ~73 kB |

**Inicial**: react + supabase + router + HomePage ≈ 420 kB minificado, 130 kB gzipped.

---

## Camada de dados

### Tabelas (10 tabelas, todas com RLS)

| Tabela | Propósito | RLS |
|--------|-----------|-----|
| `categories` | Categorias do catálogo | Public read (active=true) |
| `products` | Produtos | Public read (active=true) |
| `orders` | Pedidos | Customer lê próprios (email/uid) |
| `order_items` | Itens de pedido | Via parent order |
| `profiles` | Perfis de usuário (auth.users.id) | Próprio (id=auth.uid); só `display_name` editável pelo cliente |
| `user_products` | Produtos comprados | Próprio (user_id=auth.uid) |
| `download_tokens` | Tokens efêmeros de download | Service role only |
| `download_logs` | Auditoria de downloads | Service role only |
| `settings` | Config global (homeSections, adminConfig) | Service role only |
| `page_views` | Tracking | Anon insert (path obrigatório) |

### Funções

| Função | Trigger? | Definidas em |
|--------|----------|--------------|
| `set_updated_at()` | Pre-update em categories, products, orders, profiles, settings | schema.sql |
| `handle_new_user()` | After-insert em auth.users (cria profile com `role='customer'`) | Dashboard Supabase |

Ambas com `search_path` fixo (`public, pg_temp`) por segurança.

### ⚠️ Schema desatualizado

[supabase/schema.sql](../supabase/schema.sql) declara `profiles.id` como `bigint identity`, mas o banco real (após migrações no dashboard) usa `uuid` referenciando `auth.users.id`. Ao recriar o projeto do zero, atualize o schema.sql antes de aplicar — ou só rode `handle_new_user` e use o trigger pra criar profiles automaticamente.

### Grants em colunas (privilege escalation)

Aplicado via SQL no dashboard (não está no schema.sql; ver `docs/SECURITY.md` seção 4b):

```sql
revoke update on public.profiles from authenticated, anon;
grant  update (display_name) on public.profiles to authenticated;
```

Sem isso, qualquer cliente autenticado pode rodar `UPDATE profiles SET role='ADMIN' WHERE id=auth.uid()` e virar admin — a RLS policy `profiles_own_update` libera por linha mas não por coluna.

---

## Sessões e autenticação

Dois sistemas independentes de sessão (cookies HttpOnly):

### 1. Sessão de Cliente
- **Cookie**: `customer_session`
- **Conteúdo**: JWT-like (HMAC-SHA256 com `CUSTOMER_SESSION_SECRET`)
- **TTL**: 8 horas
- **Payload**: `{ sub, uid, email, name, iat, exp }`
- **Criado por**: login email/senha OU callback Google OAuth
- **Lido por**: middleware customer-session em endpoints sensíveis

### 2. Sessão de Admin
- **Cookie**: `admin_session`
- **Conteúdo**: JWT-like (HMAC-SHA256 com `ADMIN_SESSION_SECRET`)
- **TTL**: 8 horas
- **Criado por**: admin-login.js (após validar password + role=ADMIN no profile + 2FA opcional)
- **Validado por**: ensureAdminSession em todo endpoint `/api/admin-*`
- **Acesso**: URL obscurecida `/painel-acesso-privado-atelie` + link discreto "· admin ·" no rodapé do `/login` (a obscuridade da URL é UX, não segurança real — o que vale é o cookie validado a cada chamada)
- **⚠️ Fallback de secret**: se `ADMIN_SESSION_SECRET` não for setado, [lib/admin-session.js](../lib/admin-session.js) usa `WEBHOOK_SECRET` ou `DOWNLOAD_TOKEN_SECRET` como fallback. **Sempre defina o seu** — fallback expande superfície de ataque.

### Google OAuth (PKCE)
1. Frontend chama `supabase.auth.signInWithOAuth({ provider: 'google' })`
2. Supabase JS Client gera `code_verifier` (localStorage) + redireciona para Google
3. Google autentica e volta para `/login?oauth=google&code=...`
4. Supabase JS detecta `?code=` e troca por sessão automaticamente (PKCE)
5. AuthProvider chama `consumeCustomerSessionFromAuthCallback()` que:
   - Pega `access_token` da sessão do Supabase
   - POST `/api/auth/customer/google/callback` com o token
   - Backend valida no Supabase e seta `customer_session` cookie
6. Frontend atualiza estado de auth

---

## Segurança aplicada

### Backend
- **CORS**: dev libera qualquer `localhost:*`; prod usa `CORS_ORIGINS` env (allowlist).
- **Helmet**: headers de segurança (X-Frame-Options, CSP, HSTS).
- **Rate limit**: 250 req/15min global; 30 req/15min em `/auth/*`; **5/10min em `/admin-login` (só falhas)** e **5/10min em `/auth/customer/login`**.
- **Service role**: nunca exposto ao browser. Só usado no backend.
- **Webhook MP**: valida assinatura HMAC com `WEBHOOK_SECRET`.

### Banco
- **RLS** habilitado em todas as tabelas. Service role bypassa (backend).
- **Funções com `SECURITY DEFINER`** têm `EXECUTE` revogado de public/anon/authenticated.
- **Senhas Supabase Auth**: mínimo 8 chars, exigem letra maiúscula + minúscula + número.

### Frontend
- **Cookies HttpOnly** — JS não acessa.
- **SameSite=Strict** no cookie de cliente.
- **No `dangerouslySetInnerHTML`** em código próprio.
- **Lazy loading** das rotas reduz superfície de ataque.

---

## Convenções

- **Imports relativos** em `src/` — sem alias por enquanto.
- **PropTypes** nos componentes (não usamos TypeScript).
- **Estilo PT-BR** em strings de UI; código em inglês.
- **camelCase** em JSON da API; `snake_case` nas colunas Postgres.
- **Conversão na camada de serviço** (`api/*.js` traduz `image_url` → `image`).
