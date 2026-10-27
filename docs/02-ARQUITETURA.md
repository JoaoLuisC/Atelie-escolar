# 02 — Arquitetura

> Como o sistema é montado: camadas, pastas, caminho de uma requisição, papéis do painel e as
> decisões estruturais (ADRs) que explicam por que o código é assim.

---

## Visão macro

```
┌──────────────────────┐        ┌───────────────────────────┐        ┌───────────────────────┐
│  Browser (React SPA) │──/api─▶│  Express (BFF)            │──REST─▶│  Supabase             │
│  Vite :5173 em dev   │        │  dev: server.js :3000     │        │  Auth + Postgres +    │
│  dist/ na Vercel     │        │  prod: api/index.js       │        │  Storage              │
└──────────┬───────────┘        └─────────────┬─────────────┘        └───────────────────────┘
           │                                  ├──HTTPS──▶ Mercado Pago (preferência, consulta, webhook)
           │                                  ├──SMTP───▶ Resend (e-mails transacionais e marketing)
           │                                  ├──HTTPS──▶ Gemini (IA do painel, só por clique)
           │                                  └──HTTPS──▶ Slack/Discord (alerta de segurança, opcional)
           ├──HTTPS──▶ Supabase Auth (só OAuth Google e reset de senha)
           └──HTTPS──▶ GA4 / Meta Pixel (funil, só com consentimento)
```

**O Express é um BFF (Backend for Frontend).** O navegador não lê nem grava tabelas do Supabase.
Usa o SDK do Supabase (carregado sob demanda) apenas para:

- `signInWithOAuth({ provider: 'google' })` com PKCE — cliente e professor(a);
- `getSession` depois do callback, para entregar o `access_token` ao BFF, que o confere no
  Supabase e emite o cookie próprio;
- `resetPasswordForEmail`, troca do código e `updateUser` no reset de senha;
- `signOut({ scope: 'local' })` para limpar os tokens do `localStorage` depois do OAuth.

Login por e-mail/senha (cliente e staff), cadastro, toda escrita e toda leitura administrativa
passam pelo BFF com `service_role`. Por quê:

1. **`service_role` fica no servidor.** Se a anon key vazar, a RLS protege; a service role daria
   acesso total.
2. **Validação no servidor.** Zod (`validation/`) confere cada payload dentro do handler.
3. **Sessão em cookie HttpOnly assinado** — o JS da página não lê o token (defesa contra XSS).
4. **Segredos de terceiros** (Mercado Pago, SMTP, Gemini) e o webhook precisam de servidor.
5. **Uma função serverless só**, servindo o mesmo app Express de dev ([ADR 0002](#adr-0002--um-handler-serve-a-vercel-e-o-express-de-desenvolvimento)).

---

## Estrutura de pastas

```
Projeto-mae/
├── api/
│   └── index.js                 # A ÚNICA função serverless: remonta a URL a partir de `__path`
│                                #   e entrega ao app Express compartilhado
│
├── handlers/                    # 54 endpoints — o MESMO módulo em dev e em produção
│   ├── auth/customer/           # login, register, session, logout
│   │   └── google/              # start, callback (OAuth do cliente)
│   ├── admin/                   # 23 endpoints do painel, em /api/admin/<recurso>
│   │   ├── login.js             # e-mail/senha de staff + 2º fator de admin/master
│   │   ├── login-google.js      # Google, só para professor(a)
│   │   ├── logout.js / session.js
│   │   ├── products.js / categories.js / coupons.js / orders.js / users.js  # factory (ADR 0005)
│   │   ├── dashboard.js / kpis.js / funnel.js / cohort.js / segments.js
│   │   ├── abc-products.js / abc-customers.js / sales-study.js
│   │   ├── settings.js          # homeSections, homeContent, productDefaults, adminConfig
│   │   ├── upload-url.js        # URL assinada de upload no Storage
│   │   ├── ai-assist.js         # textos de produto/SEO/página pelo Gemini
│   │   ├── store-owner.js       # qual professora é a dona da loja (só admin)
│   │   ├── product-seller.js    # de qual professora é um produto (só admin)
│   │   └── cleanup-events.js
│   ├── teacher/                 # área de /professores
│   │   ├── dashboard.js / products.js   # professor(a) comum: só os materiais dele(a)
│   │   └── account.js           # "Minha conta" de todo staff: nome, senha, e-mail
│   ├── products.js / product-details.js / home-sections.js / home-content.js  # catálogo público
│   ├── create-payment.js / verify-payment.js / webhook.js / download.js       # dinheiro e entrega
│   ├── validate-coupon.js / cross-sell.js / customer-orders.js
│   ├── track-event.js / abandoned-cart.js
│   ├── subscribe.js / confirm-subscription.js / unsubscribe.js / send-confirmation-email.js
│   ├── me-delete-account.js / me-export-data.js   # LGPD
│   ├── cron-email-jobs.js       # chamado de hora em hora pelo GitHub Actions
│   ├── sitemap.xml.js
│   ├── notfound.js
│   └── __tests__/               # suítes dos endpoints + harness do caminho do dinheiro
│
├── routes/
│   ├── auth.routes.js           # /api/auth/customer/* → handlers/auth/customer/**
│   ├── api-compat.routes.js     # o resto de handlers/ como /api/*
│   └── __tests__/               # paridade de rotas (identidade de módulo) + guardas
│
├── lib/                         # 40 módulos de serviço do backend
│   ├── express-app.js           # o app: trust proxy, helmet, cors, parsers, rotas, 404
│   ├── route-mount.js           # mountHandler: adaptador único handler → Express
│   ├── http.js                  # ok/fail, ERROR_CODES, guardMethod, CORS, cache (ADR 0004)
│   ├── logger.js                # log JSON estruturado
│   ├── env-secret.js            # segredos fail-closed + flags de ambiente
│   ├── supabase.js              # cliente REST service_role + helpers
│   ├── admin-session.js         # cookie `admin_session` (HMAC), guardas, anti-CSRF
│   ├── admin-2fa.js             # TOTP + PIN de emergência
│   ├── admin-audit.js           # trilha de auditoria (logAdminAction)
│   ├── admin-resource-handler.js# factory do CRUD do painel (ADR 0005)
│   ├── store-owner.js           # dona da loja = settings.storeOwner
│   ├── seller-scope.js          # recorte de pedidos/clientes por professora
│   ├── staff-account.js         # troca de senha/e-mail com a senha atual
│   ├── customer-session.js      # cookie `customer_session` (HMAC)
│   ├── customer-auth-handlers.js# lógica de auth do cliente (as guardas ficam em handlers/)
│   ├── customer-account-provisioning.js  # conta do comprador convidado após o pagamento
│   ├── rate-limit.js            # enforceRateLimit + RATE_LIMITS, contador no Postgres (ADR 0007)
│   ├── mercadopago-config.js    # SDK do MP + assinatura do webhook
│   ├── payment-integrity.js     # reconciliação valor/moeda/live_mode (ADR 0003)
│   ├── money.js                 # dinheiro em centavos inteiros
│   ├── order-confirmation.js    # e-mail de confirmação na 1ª aprovação
│   ├── coupons.js / public-catalog.js / product-media.js / store-content.js / sales-counts.js
│   ├── gemini.js                # chamada ao Gemini com JSON de formato fechado
│   ├── ai-assist.js             # tarefas de IA do painel (produto, SEO, página)
│   ├── sales-study.js / funnel-metrics.js       # Estudo de vendas e métricas do funil
│   ├── abc-classification.js / customer-segmentation.js
│   ├── analytics-events.js / attribution-sanitize.js
│   ├── security-headers.js / security-logger.js
│   ├── email-sender.js / email-templates.js     # nodemailer → SMTP do Resend
│   ├── storage-signed-url.js / concurrency.js
│   └── __tests__/
│
├── middleware/error.middleware.js   # notFoundHandler + errorHandler (rede de segurança)
├── services/supabase-auth.js        # clientes Supabase (anon/admin) do servidor + role em profiles
├── validation/                      # schemas Zod: common, payment, admin + parse/parseOrFail
├── utils/app-error.js               # usado só pelo middleware de erro
│
├── src/                             # frontend React (ESM)
│   ├── App.jsx                      # rotas + lazy load
│   ├── main.jsx                     # render + providers + banner de consentimento
│   ├── pages/                       # Home, Products, ProductDetails, Checkout, Downloads,
│   │                                #   CustomerAuth (/login, /conta), ResetPassword, Legal,
│   │                                #   Subscription, AdminLogin, AdminPage, TeachersPage, NotFound
│   ├── components/                  # loja (Shell, CartDrawer, ProductGrid, wizards, SEO, consentimento…)
│   │   └── admin/                   # AdminLayout, OrderDetailModal, tabs/, ui/, utils/
│   ├── providers/                   # AuthProvider, CartProvider, ToastProvider
│   ├── hooks/                       # useAuth, useCart, useToast, useProductFilters
│   ├── services/                    # a única camada que chama a API (admin-*, teacher-panel,
│   │                                #   checkout, products, customer-auth, supabase-browser…)
│   ├── utils/                       # api.js (apiRequest), analytics, attribution, consent,
│   │                                #   formatação, abc.js (paridade com o backend), csv-export
│   ├── constants/                   # routes, error-codes (espelho do backend), home-content, seller
│   └── test/                        # setup do Vitest (node e browser)
│
├── supabase/                        # schema.sql, security-hardening.sql, seed, config.toml, migrations/
├── scripts/                         # check-env, check-rls, check-schema-drift, check-advisor,
│                                    #   configure-auth, db-inspect, utf8, subset de ícones, fix-dns
├── public/                          # logo (coruja), favicons, webmanifest, og-default, fontes, robots
├── .github/workflows/               # test.yml, release-production.yml, email-cron.yml, lighthouse.yml
├── tcc-build/                       # gerador do .docx do TCC (fora do app e do deploy)
├── server.js                        # Express local de dev (:3000) — não roda na Vercel
├── vercel.json / vite.config.js / tailwind.config.js / eslint.config.js / lighthouserc.json
└── package.json
```

---

## Por onde começar a mexer

| Quero alterar…                  | Comece por                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login e sessão do painel        | [`lib/admin-session.js`](../lib/admin-session.js), [`handlers/admin/login.js`](../handlers/admin/login.js), [`login-google.js`](../handlers/admin/login-google.js)       |
| Quem vê o quê no painel         | [`lib/store-owner.js`](../lib/store-owner.js), [`lib/seller-scope.js`](../lib/seller-scope.js), [`tabs.js`](../src/components/admin/utils/tabs.js)                       |
| Auth do cliente                 | [`lib/customer-auth-handlers.js`](../lib/customer-auth-handlers.js), [`lib/customer-session.js`](../lib/customer-session.js), `handlers/auth/customer/**`                |
| Roteamento                      | [`api/index.js`](../api/index.js), [`lib/express-app.js`](../lib/express-app.js), [`routes/api-compat.routes.js`](../routes/api-compat.routes.js)                        |
| Painel (layout e abas)          | [`src/pages/AdminPage.jsx`](../src/pages/AdminPage.jsx), [`AdminLayout.jsx`](../src/components/admin/AdminLayout.jsx)                                                    |
| CRUD do painel                  | [`lib/admin-resource-handler.js`](../lib/admin-resource-handler.js) ([ADR 0005](#adr-0005--factory-para-os-recursos-crud-do-admin))                                      |
| Checkout e pagamento            | [`create-payment.js`](../handlers/create-payment.js), [`webhook.js`](../handlers/webhook.js), [`verify-payment.js`](../handlers/verify-payment.js), `lib/money.js`       |
| Reconciliação do pagamento      | [`lib/payment-integrity.js`](../lib/payment-integrity.js) ([ADR 0003](#adr-0003--reconciliação-de-pagamento-em-módulo-único))                                            |
| IA do painel                    | [`lib/gemini.js`](../lib/gemini.js), [`lib/ai-assist.js`](../lib/ai-assist.js), [`lib/sales-study.js`](../lib/sales-study.js)                                            |
| Conteúdo da home e dos produtos | [`lib/store-content.js`](../lib/store-content.js), [`handlers/admin/settings.js`](../handlers/admin/settings.js)                                                         |
| Upload e download               | [`handlers/admin/upload-url.js`](../handlers/admin/upload-url.js), [`lib/storage-signed-url.js`](../lib/storage-signed-url.js), [`download.js`](../handlers/download.js) |
| Curva ABC                       | [`lib/abc-classification.js`](../lib/abc-classification.js) e [`src/utils/abc.js`](../src/utils/abc.js) (teste de paridade entre os dois)                                |
| Rate limit                      | [`lib/rate-limit.js`](../lib/rate-limit.js) ([ADR 0007](#adr-0007--um-mecanismo-de-rate-limit-não-dois))                                                                 |
| Envelope e códigos de erro      | [`lib/http.js`](../lib/http.js) ([ADR 0004](#adr-0004--envelope-de-resposta-e-código-de-erro))                                                                           |
| Cron de e-mail                  | [`handlers/cron-email-jobs.js`](../handlers/cron-email-jobs.js), [`.github/workflows/email-cron.yml`](../.github/workflows/email-cron.yml)                               |

---

## Como uma requisição chega ao handler

Até o app Express o caminho só muda no ponto de entrada:

```
Produção (Vercel)                           Desenvolvimento
──────────────────                          ───────────────
mesma origem do site (/api)                 front em :5173 chama http://localhost:3000/api
borda: headers de segurança (vercel.json)   (cross-origin; o cors do app resolve)
/api/(.*) → /api/index?__path=$1            server.js: limitador de borda em /api
api/index.js remonta req.url                  (250 req/15 min — só dev, ADR 0007)
          └───────────────┬─────────────────────┘
                          ▼
lib/express-app.js → helmet → cors → express.json (1 MB)
                   → routes/auth.routes.js | routes/api-compat.routes.js
                   → mountHandler → handlers/<recurso>.js
```

Daqui em diante toda guarda está **dentro do handler**, na ordem fixa da regra A3 do
[CONTRIBUTING.md](../CONTRIBUTING.md): CORS → OPTIONS → método → rate limit → sessão → validação.

**Catálogo (público).** `src/services/products.js` → `apiRequest` (timeout 15 s) →
`GET /api/products` → `guardMethod` → `enforceRateLimit(RATE_LIMITS.catalog)` → leitura com
service_role + regras de vitrine (`lib/public-catalog.js`) → `Cache-Control` de catálogo →
`ok(res, { products, … })`.

**Painel.** `src/services/admin-panel.js` (`credentials: include`) → `GET /api/admin/orders` com o
cookie `admin_session` → factory (ADR 0005): `Cache-Control: no-store` → `guardMethod` →
`ensureStoreSession` (401 `ADMIN_SESSION_INVALID` / 403 `FORBIDDEN`) → recorte por professora
(`getSellerScope`) → operação → `logAdminAction` em toda escrita → `ok()`. Endpoints do painel não
têm rate limit próprio (a sessão é a guarda), exceto login, 2º fator, login Google, reautenticação
em `settings`, troca de senha/e-mail e as chamadas de IA.

**Webhook do Mercado Pago.** `POST /api/webhook` → `inspectWebhookSignature` (HMAC-SHA256 com
`WEBHOOK_SECRET` + janela de frescor) → 401 genérico se inválida (o motivo vai para
`security_events`) → `getPaymentInfo` no MP → `external_reference` = `orders.order_code` → se
aprovado, `checkPaymentIntegrity` **antes** de qualquer escrita → `UPDATE … WHERE payment_status
<> 'approved'` (transição atômica e idempotente) → `download_tokens` em lote → na 1ª aprovação:
conta do comprador, e-mail de confirmação e evento `payment_approved` → 200 sem tokens na resposta.
Sem contador de rate limit: a assinatura é a guarda.

---

## Papéis e sessão do painel

| Papel (`profiles.role`) | Entra por               | Painel                                                                            |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `admin`, `master`       | e-mail/senha + 2º fator | `/admin` — `AdminPage variant="platform"`: plataforma, usuários, segurança, conta |
| `seller` dona da loja   | e-mail/senha ou Google  | `/professores` — `AdminPage variant="store"`: painel completo da loja             |
| `seller` comum          | e-mail/senha ou Google  | `/professores` — `TeachersPage`: só os materiais dele(a) e "Minha conta"          |

- **Dona da loja** é a professora apontada em `settings.storeOwner = { sellerId }`, gravada pelo
  admin em `/api/admin/store-owner`. O login consulta `lib/store-owner.js` e assina o resultado no
  cookie; trocar a dona vale a partir do próximo login.
- **Cookie `admin_session`**: HttpOnly, `SameSite=Strict`, `Secure` fora de dev, 8 h, payload
  `{ sub, email, role, userId, storeOwner, iat, exp }` assinado com HMAC-SHA256
  (`ADMIN_SESSION_SECRET`). O 2º fator (TOTP, código por e-mail, PIN de emergência) só se aplica a
  admin/master; o Google é aceito só para professor(a), justamente para não pular o 2º fator.
- **Guardas** (`lib/admin-session.js`), todas com anti-CSRF por origem em métodos de escrita:

  | Guarda                          | Aceita                      | Usada em                                                                  |
  | ------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
  | `ensureAdminSession`            | admin, master               | `users`, `store-owner`, `product-seller`                                  |
  | `ensureStoreSession`            | admin, master, dona da loja | produtos, categorias, cupons, pedidos, relatórios, `settings`, upload, IA |
  | `ensureStaffSession`            | admin, master, seller       | `/api/teacher/account`                                                    |
  | `ensureRoleSession(['seller'])` | seller                      | `/api/teacher/dashboard`, `/api/teacher/products`                         |

  Em `settings`, a chave `adminConfig` (2FA) continua só de admin mesmo dentro de
  `ensureStoreSession`.

- **Recorte por vendedora** (`lib/seller-scope.js`): com sessão `seller`, pedidos, clientes e
  relatórios trazem só o que envolve `products.seller_id` dela, e o valor de um pedido misto é a
  fatia proporcional dela. Admin/master não têm recorte. O recorte é feito no servidor, em cada
  endpoint — esconder no front não protegeria nada.

O cliente da loja tem sessão separada: cookie `customer_session` (HMAC com
`CUSTOMER_SESSION_SECRET`, `SameSite=Strict`, 8 h). Detalhes em [08-SEGURANCA.md](./08-SEGURANCA.md)
e telas em [06-PAINEIS.md](./06-PAINEIS.md).

---

## Configuração que molda a arquitetura

**`lib/express-app.js`** (o app, nos dois ambientes)

- `trust proxy = 1` (IP real atrás da Vercel, para rate limit e logs); `x-powered-by` desligado.
- Helmet com CSP de `lib/security-headers.js` (na Vercel a borda também injeta; a duplicata é
  inerte em JSON).
- `cors`: fora de dev/test `CORS_ORIGINS` é obrigatório (sem ele o boot falha); em dev aceita
  qualquer `localhost:*`. Origem recusada não vira erro: segue sem headers e a guarda do handler
  decide.
- `express.json`/`urlencoded` com limite de 1 MB; `/sitemap.xml` e `/api/sitemap.xml`; depois
  `/api` → `auth.routes` → `api-compat.routes` → `notFoundHandler` (404 JSON).

**`server.js`** (dev, :3000): carrega `.env.{ENV}.local` → `.env.local` (fora de `test`) →
`.env.{ENV}` → `.env`; em produção exige os segredos de boot e `APP_URL` com `https://`; pendura o
limitador de borda em `/api`; acrescenta `GET /health` (não existe em produção) e o `errorHandler`.

**`api/index.js`** (produção): monta `createApiApp` uma vez por instância, fecha com
`errorHandler` e remonta `req.url` a partir de `__path`, preservando a query. Mais de um `__path`
faz a requisição cair no 404 — um deles veio do cliente.

**`vercel.json`**

- Build `npm run check:env && npm run build`, saída `dist/`; uma função (`api/index.js`,
  `maxDuration: 60`, teto do Hobby e o que o cron de e-mail precisa).
- Rotas em ordem: headers de segurança em tudo (`continue`); 308 de `ateliedaescola.com.br` e
  `www.` para `professoramarcia.ateliedaescola.com.br`; `no-store` em `/admin*`;
  `/api/admin-*` → `__path=admin/*` (regra A6); `/api/*` → função; `/sitemap.xml` → função;
  estáticos; `/*` → `index.html` (SPA).
- `__path` existe porque `dest` reescreve `req.url`: sem ele toda requisição chegaria como
  `/api/index`.

**`vite.config.js`**: porta 5173 com `strictPort`; `manualChunks` (rolldown) separa `react`,
`router`, `supabase` e `vendor`, e deixa de fora de propósito `react-hook-form` (vai com a
`CheckoutPage`) e `qrcode` (vai com a aba Segurança); Vitest em dois projetos, `node` (árvores do
backend) e `browser` (jsdom, `src/`), com piso de cobertura em `coverage.thresholds`.

**`tailwind.config.js`**: cor `brand` (500 = `#9B5DE5`) com acentos `sky`, `pink`, `yellow`;
fontes Raleway (display), Poppins (títulos), Roboto (texto).

**Release**: push na `main` roda `.github/workflows/release-production.yml` — `validate`
(`npm run check`) → `supabase db push` → `vercel build` + `vercel deploy --prebuilt --prod`, sem
concorrência entre releases, atrás do environment `production` e só com a variável
`RELEASE_AUTOMATION_ENABLED=true` no repositório. Passo a passo em
[03-SETUP-E-DEPLOY.md](./03-SETUP-E-DEPLOY.md).

---

## Dependências externas

| Dependência    | Para quê                 | Se cair                                                                    |
| -------------- | ------------------------ | -------------------------------------------------------------------------- |
| Supabase       | Banco, Auth, Storage     | O app para (ponto único de falha, aceito)                                  |
| Mercado Pago   | Checkout e webhook       | Checkout falha visivelmente; o polling de `verify-payment` cobre o webhook |
| Resend (SMTP)  | E-mails do app e reset   | Envio falha e fica no log; a compra não depende dele                       |
| Gemini         | IA do painel             | O botão responde `AI_NOT_CONFIGURED`/erro; nada mais depende dele          |
| GA4 / Meta     | Funil                    | Sem consentimento ou sem ID, simplesmente não carregam                     |
| Vercel         | Hosting + função         | Site fora do ar                                                            |
| GitHub Actions | Release e cron de e-mail | Cron não roda (dá para disparar à mão); release manual pela CLI da Vercel  |

---

## Decisões estruturais

Uma decisão vira ADR quando amarra vários arquivos, escolhe entre alternativas com custo real e
seria "consertada" de volta por quem não conhece o contexto. Convenção de estilo é regra do
[CONTRIBUTING.md](../CONTRIBUTING.md); bug corrigido é commit + teste. Os comentários longos no
código continuam onde estão — explicam o arquivo local; o ADR explica o repositório.

Para mudar uma decisão, acrescente um ADR novo (próximo número) que diga qual substitui; não
reescreva o antigo. Cada subseção abaixo traz contexto, decisão e o que não fazer.

### ADR 0001 — CommonJS no backend, ESM no frontend

**Contexto.** O repositório tem dois runtimes. Tudo que roda em Node (`api/`, `handlers/`, `lib/`,
`routes/`, `middleware/`, `services/`, `utils/`, `validation/`, `scripts/`, `server.js`) usa
`require`/`module.exports`; `src/` roda no navegador via Vite e usa `import`/`export`. O
`package.json` não declara `"type": "module"`. Os testes são ESM e importam CommonJS (o Vite
transpila).

**Decisão.** Manter os dois, com a fronteira na pasta. `eslint.config.js` tem blocos separados
(`NODE_FILES` e `src/`), cada um só com os globais do seu runtime — o que pega `window` num
handler e `process`/`require` num componente.

**Consequência / não fazer.** Utilitário dos dois lados é duplicado e guardado por teste (ex.:
`ERROR_CODES` em `lib/http.js` e `src/constants/error-codes.js`). Não migrar para
`"type": "module"`: custaria renomear ~100 arquivos e reescrever o harness de teste
(`handlers/__tests__/money-path-harness.js`), que intercepta módulos por `require.cache`.

### ADR 0002 — Um handler serve a Vercel e o Express de desenvolvimento

**Contexto.** A classe de bug mais cara do projeto foi proteção que existia em dev e não em
produção (o limitador de cupom e outros cinco endpoints públicos sem contador). Depois, o plano
Hobby limitou o deploy a 12 funções, e cada handler era uma.

**Decisão.** Todo endpoint é o mesmo módulo nos dois ambientes. Os handlers moram em `handlers/`
(fora de `api/`, senão viram função), `api/index.js` é a única função e serve o mesmo app
(`lib/express-app.js`) que o `server.js` usa em dev. Os routers só montam handlers, por
`mountHandler`. Corolários:

1. **Guarda mora no handler.** Rate limit, sessão e validação ficam dentro dele, mesmo com
   `app.use` rodando em produção: as suítes de `handlers/__tests__/` chamam o handler direto, e
   guarda em middleware sumiria ali.
2. **Nada de estado de processo** para decidir comportamento: a função tem várias instâncias e
   hiberna.
3. O `errorHandler` é rede de segurança, não o mecanismo de erro dos handlers.

**Consequência / não fazer.** Cada handler repete seu topo, de propósito: a ordem fixa faz uma
guarda ausente saltar aos olhos. `routes/__tests__/api-route-parity.test.js` compara a
**identidade do módulo** montado — não volte a montar a lógica crua de `lib/` num router (foi
assim que login e cadastro de cliente ficaram sem contador numa consolidação anterior). Vercel Pro
ou hospedar o `server.js` em outro lugar foram descartados: custo fixo e dois lugares para operar.

### ADR 0003 — Reconciliação de pagamento em módulo único

**Contexto.** Duas portas aprovam um pedido e emitem `download_tokens`: `handlers/webhook.js` e
`handlers/verify-payment.js`. A liberação só conferia `status === 'approved'` — um pagamento de
R$ 0,01 apontado para um pedido de R$ 200 entregava o produto. A primeira correção ficou com rigor
diferente em cada porta, e a mais frouxa definia a proteção.

**Decisão.** A regra vive só em `lib/payment-integrity.js`, chamada pelas duas portas antes de
qualquer escrita. Tudo fail-closed: moeda tem de ser BRL; campo ausente ou ilegível (do pagamento
ou do pedido) nunca libera; `live_mode === false` em produção recusa; pagamento a maior não
bloqueia (é caso de suporte). Divergência gera `payment_amount_mismatch` e 200 sem aprovar.

**Consequência / não fazer.** Não copiar a checagem para dentro de uma porta. Os testes de
paridade (`handlers/__tests__/payment-integrity.test.js`) pegam erro de **encaixe**, não
substituem o módulo. A tolerância `AMOUNT_TOLERANCE = 0.01` perdeu a causa original (o rateio de
cupom já é em centavos, `lib/money.js`) e ficou por assimetria de custo: recusar quem pagou certo
por 1 centavo do gateway não tem reprocessamento. Critério para zerar: nenhum
`payment_amount_mismatch` de exatamente 1 centavo num período com volume real.

### ADR 0004 — Envelope de resposta e código de erro

**Contexto.** Os handlers tinham três formatos de erro e o front ramificava por texto em português
(reescrever a frase quebrava o re-login sem nenhum teste acusar).

**Decisão.** Toda resposta JSON sai por `lib/http.js`:

```js
ok(res, { products, total }); // { success: true, products, total }
fail(res, { status: 422, code: ERROR_CODES.COUPON_EXPIRED, message: 'Este cupom expirou.' });
// { success: false, error: { code: 'COUPON_EXPIRED', message: 'Este cupom expirou.' } }
```

`code` (SCREAMING_SNAKE, do catálogo) é o contrato de máquina; `message` é para gente e pode
mudar. O front lê `data.error?.message`, ramifica por `data.error?.code` e `isSessionError`
compara código. `fail()` também esconde `details` em produção e emite `Allow` no 405.

**Consequência / não fazer.** Sucesso plano e erro aninhado, de propósito; um payload de domínio
não pode usar a chave `success`. Não migrar para `{ success, data }` (reescreveria todo consumidor
e o caminho do checkout por ganho pequeno). Não usar `throw new AppError(...)` como mecanismo dos
handlers: chamado direto num teste, sem middleware, o erro escaparia como exceção em vez de 400.

### ADR 0005 — Factory para os recursos CRUD do admin

**Contexto.** `products`, `categories`, `coupons`, `orders` e `users` terminavam com o mesmo bloco
de ~55 linhas (CORS, método, sessão, auditoria, `catch`), e as cópias já tinham divergido: erro
fora de `fail()`, `Allow` escrito à mão, auditoria que dependia de alguém lembrar de copiar.

**Decisão.** Os cinco são montados por `createAdminResourceHandler`
(`lib/admin-resource-handler.js`), que faz CORS → `no-store` → `guardMethod` → sessão →
checagem do Supabase → operação → auditoria → `catch`. Cada arquivo só declara o domínio:

```js
module.exports = createAdminResourceHandler({
  storeResource: true, // ensureStoreSession; sem isto, ensureAdminSession
  targetType: 'category',
  errorMessage: 'Erro ao processar categorias do admin.',
  loggerName: 'admin-categories',
  handlerName: 'adminCategoriesHandler',
  operations: { GET: async () => ({ status: 200, body: { categories: await list() } }) /* … */ },
});
```

Regras: a operação nunca escreve em `res` (devolve `{ status, body }` ou `{ error }`); `Allow`
sai de `Object.keys(operations)`; a auditoria mora na factory; o nome do handler vem de
`handlerName`. `storeResource: true` (produtos, categorias, cupons, pedidos) abre para a dona da
loja; `users` fica só de admin; `allowedRoles` existe para um conjunto explícito.

**Consequência / não fazer.** Quem lê o recurso precisa abrir a factory para ver o topo. Um passo
fora da sequência exige estender a factory — resista a acumular flags booleanas. Descartados: um
router genérico por configuração (cada recurso tem validação própria e a indireção esconderia
regra de negócio) e classe base (convidaria a sobrescrever `catch` e auditoria).

### ADR 0006 — CORS só quando o endpoint é cross-origin

**Contexto.** A regra A3 mandava todo handler começar por CORS, mas só os do painel o faziam — e
nada quebrava: em produção front e API saem da mesma origem, e em dev o `cors` do app resolve. O
painel é o caso real, porque usa `credentials: 'include'`, que exige origem explícita e
`Access-Control-Allow-Credentials`.

**Decisão.** A regra A3 diz "CORS quando cross-origin". `setAdminCorsHeaders` e
`getAllowedOrigins` moram em `lib/http.js` (CORS é cabeçalho de resposta, não sessão). Existe
**uma** allowlist — `APP_URL` + `CORS_ORIGINS` (+ localhost:5173 só em dev/test) — usada pelo CORS
e pela defesa anti-CSRF `isSameOriginRequest` de `lib/admin-session.js`.

**Consequência / não fazer.** Não criar uma segunda allowlist: duas divergentes abririam o CSRF que
a função fecha. Não espalhar CORS nos handlers públicos: cabeçalho que nenhum navegador consome
vira superfície que alguém afrouxa para `*`. No app compartilhado quem emite CORS é o middleware
`cors`, e `mountHandler` descarta os `Access-Control-Allow-*` escritos pelo handler (evita header
duplicado). Se a API for para um domínio próprio, basta pôr a origem do site em `CORS_ORIGINS`;
os cookies `SameSite=Strict` é que precisariam ser revistos.

### ADR 0007 — Um mecanismo de rate limit, não dois

**Contexto.** Havia `enforceRateLimit` nos handlers e onze `express-rate-limit` nos routers — que
só rodavam em dev. No login a divergência era de desenho: dev limitava por IP puro, a produção por
IP + e-mail com um balde de varredura de contas.

**Decisão.** `enforceRateLimit` (`lib/rate-limit.js`) é a política: dentro do handler, perfil em
`RATE_LIMITS`, contador atômico no Postgres (`rate_limit_hit`), válido nos dois ambientes. Sobra
só um limitador de borda genérico no `server.js` (`/api`, 250/15 min, `RATE_LIMIT_MAX`), contra
loop acidental de script local, respondendo no envelope com `RATE_LIMITED`.

**Indisponibilidade por balde (`failMode`).** O padrão é `open` (contador fora → passa; o endpoint
cairia logo adiante de qualquer forma, e fechar o `adminLogin` trancaria a dona para fora num
incidente). Ficam `closed` → **503** com `Retry-After: 30` os baldes de credencial cujo alvo
continua de pé sem o contador: `customerLogin`, `customerRegister` (GoTrue) e
`adminLoginSecondFactor` (o anti-replay do TOTP é o próprio contador). Sem Supabase configurado,
os baldes `closed` também recusam. Nos dois modos sai o evento `rate_limit_unavailable`.

**Consequência / não fazer.** Não reintroduzir limitador por rota em `routes/` nem em `app.use`:
camada que só existe na máquina do dev é falso conforto. Em dev contra o banco de produção, os
contadores são compartilhados com a loja real. Endpoint público novo precisa de perfil em
`RATE_LIMITS` ou de dispensa registrada em `handlers/__tests__/rate-limit-coverage.test.js`.

### Decisões menores

- **SPA + BFF, sem Next.js/SSR.** Um dev, hosting gratuito. SEO por Helmet + JSON-LD + sitemap
  dinâmico, vigiado pelo Lighthouse CI.
- **Sessão em cookie HttpOnly assinado**, não JWT no `localStorage`; segredos só no servidor.
- **Polling como reserva do webhook.** `CheckoutPage` consulta `/api/verify-payment` a cada 4 s
  (até 150 tentativas, com recuo de 15 s a 5 min quando limitado); `DownloadsPage` a cada 10 s.
  O balde `verifyPayment` conta por `order_code`.
- **Carrinho no `localStorage`.** Preço e disponibilidade são refeitos no servidor em
  `create-payment`; o preço do cliente nunca vale.
- **Conteúdo editável em `settings`** (chave/valor JSON): `homeSections`, `homeContent`,
  `productDefaults`, `adminConfig`, `storeOwner`. A dona edita sem deploy; o servidor sanitiza
  antes de gravar (`lib/store-content.js`).
- **Cron de e-mail no GitHub Actions** (`email-cron.yml`, de hora em hora, `CRON_SECRET`), porque
  o plano gratuito não garante `pg_cron` para isso. `pg_cron` fica só com purgas de retenção,
  que podem falhar sem bloquear nada.
- **Tudo do app em `public.*`**, com `revoke execute` em funções `SECURITY DEFINER` e grants de
  coluna explícitos (ver [04-BANCO-DE-DADOS.md](./04-BANCO-DE-DADOS.md) e
  [08-SEGURANCA.md](./08-SEGURANCA.md)).
- **IA só por clique, no servidor.** `lib/gemini.js` centraliza chave, modelo
  (`GEMINI_MODEL`, padrão `gemini-2.5-flash`), tempo-limite e resposta em JSON por
  `responseSchema`; nada é gravado sem a pessoa aceitar a sugestão.
- **Tailwind** com a paleta da marca; **Vitest** + Testing Library, no mesmo pipeline do Vite.

---

## Quando revisitar

| Item                   | Gatilho                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| Prerender / SSR        | SEO do Lighthouse abaixo de 95 em produção, ou TTFB ruim em 3G   |
| `pg_cron` para o cron  | Volume de e-mail além do gratuito do Actions, ou job por minuto  |
| CDN de imagens         | Catálogo acima de ~200 produtos ou banda da Vercel no limite     |
| Observabilidade paga   | Erros recorrentes que o log estruturado não deixa diagnosticar   |
| API em domínio próprio | Ver consequências do ADR 0006 (CORS) e cookies `SameSite=Strict` |
| `AMOUNT_TOLERANCE` = 0 | Critério do ADR 0003                                             |
