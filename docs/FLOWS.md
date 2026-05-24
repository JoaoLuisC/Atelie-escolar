# Fluxogramas

> Diagramas em **Mermaid**. Abra este arquivo no GitHub, VS Code (com extensão Mermaid Preview) ou em https://mermaid.live.

## Índice

- [1. Login / cadastro de cliente](#1-login--cadastro-de-cliente)
- [2. Login Google OAuth (PKCE)](#2-login-google-oauth-pkce)
- [3. Compra e download](#3-compra-e-download)
- [4. Admin: criar/editar produto](#4-admin-criareditar-produto)
- [5. Webhook Mercado Pago](#5-webhook-mercado-pago)
- [6. Estrutura geral de chamadas](#6-estrutura-geral-de-chamadas)

---

## 1. Login / cadastro de cliente

```mermaid
flowchart TD
    A[Usuário em /login] --> B{Modo}
    B -->|Login| C[POST /api/auth/customer/login]
    B -->|Cadastro| D[POST /api/auth/customer/register]
    B -->|Esqueci senha| E[Supabase resetPasswordForEmail]

    C --> C1[Backend chama Supabase Auth<br/>POST /auth/v1/token grant_type=password]
    C1 -->|200 OK| C2[Backend cria cookie HttpOnly<br/>customer_session]
    C2 --> C3[Frontend recebe user<br/>navega para redirect]
    C1 -->|401| C4[Mostra mensagem específica<br/>email não confirmado / credenciais inválidas]

    D --> D1{Senha válida?<br/>min 8 chars + maiúscula + minúscula + número}
    D1 -->|Não| D2[Toast de erro local]
    D1 -->|Sim| D3[Backend chama Supabase Auth<br/>POST /auth/v1/signup]
    D3 -->|200 OK + access_token| D4[Cookie criado + navega]
    D3 -->|200 OK sem token| D5[verificationRequired = true<br/>Toast 'verifique seu email']
    D3 -->|400| D6[Mensagem específica<br/>email já cadastrado / senha fraca]

    E --> E1[Supabase Auth → SMTP Resend<br/>envia e-mail com link<br/>https://app.com/reset-password?code=...]
    E1 --> E2[ResetPasswordPage troca code por sessão<br/>via supabase.auth.exchangeCodeForSession]
    E2 --> E3[Usuário define nova senha<br/>supabase.auth.updateUser]
```

**Pré-requisitos para o reset funcionar:**
- SMTP custom configurado no Supabase Auth (sem isso, usa SMTP grátis que só entrega pra members da org)
- Em sandbox do Resend, só entrega para o e-mail dono da conta Resend
- Em produção: domínio verificado em [resend.com/domains](https://resend.com/domains) + `smtp_admin_email` apontando pra ele

**Link "· admin ·":** no rodapé do `/login`, link discreto leva pra `/painel-acesso-privado-atelie`. Conveniência pra admin não ter que decorar a URL obscurecida.

---

## 2. Login Google OAuth (PKCE)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant FE as Frontend (React)
    participant SB as Supabase Auth
    participant G as Google
    participant API as Express API

    U->>FE: Clica "Entrar com Google"
    FE->>SB: supabase.auth.signInWithOAuth({provider:'google',<br/>redirectTo: /login?oauth=google})
    Note over FE: code_verifier salvo em localStorage
    SB-->>U: 302 redirect → Google
    U->>G: Autoriza permissões
    G-->>U: 302 redirect → Supabase callback
    U->>SB: callback?code=...
    SB-->>U: 302 redirect → /login?oauth=google&code=...
    Note over FE: detectSessionInUrl: true
    FE->>SB: Detecta code automaticamente<br/>troca por session (PKCE)
    SB-->>FE: { access_token, refresh_token, user }
    FE->>API: POST /api/auth/customer/google/callback<br/>{ accessToken }
    API->>SB: GET /auth/v1/user<br/>Authorization: Bearer accessToken
    SB-->>API: { id, email, user_metadata }
    API->>API: Cria cookie HttpOnly<br/>customer_session (HMAC-SHA256)
    API-->>FE: { user: { uid, email, name } }
    FE->>FE: setCustomerSession(user)<br/>limpa ?code= da URL
    FE-->>U: Redireciona para /checkout
```

**Pontos críticos:**
- O Supabase Client é **único responsável** pelo OAuth — não fazemos a request pro Google manualmente.
- A `redirectTo` precisa estar no `uri_allow_list` do Supabase (scripts/configure-auth.js cuida disso).
- O cookie HttpOnly do nosso backend é **separado** da sessão do Supabase Client. Os dois coexistem.

---

## 3. Compra e download

```mermaid
flowchart TD
    A[Cliente adiciona ao carrinho<br/>localStorage] --> B[/checkout/]
    B --> C[Preenche nome + email]
    C --> D[POST /api/create-payment<br/>{ items, customer }]

    D --> D1[Backend valida produtos<br/>SELECT FROM products WHERE id IN ...]
    D1 --> D2[INSERT INTO orders + order_items<br/>status=pending]
    D2 --> D3[Cria preferência Mercado Pago<br/>com items + back_urls + webhook]
    D3 --> D4[UPDATE orders SET preference_id]
    D4 --> D5{Retorna initPoint para o frontend}

    D5 --> E[Frontend abre Mercado Pago<br/>em nova aba via window.open]
    D5 --> F[Salva pendingOrderId no state<br/>useEffect inicia polling]

    F --> F1[A cada 4s GET /api/verify-payment?orderId=X]
    F1 --> F2{paymentStatus?}
    F2 -->|approved| G[Limpa carrinho<br/>navega para /downloads]
    F2 -->|rejected/cancelled| H[Toast erro<br/>polling para]
    F2 -->|pending| F1
    F2 -->|150x sem resposta| I[Timeout 10min<br/>usuário pode verificar em Downloads]

    G --> J[/downloads?order=X/]
    J --> J1[GET /api/verify-payment?orderId=X]
    J1 --> J2{Status approved?}
    J2 -->|Sim| K[Lista download_tokens]
    J2 -->|Não| L[Continua polling a cada 10s<br/>até max 12 tentativas]

    K --> M[Para cada arquivo:<br/>href = /api/download?token=Y]
    M --> N[Backend valida token<br/>Faz pipe do arquivo Storage→browser]
    N --> O[INSERT INTO download_logs<br/>marca token como used]

    G -.->|paralelo| P[POST /api/send-confirmation-email<br/>nodemailer → Resend]
    P --> Q[Email transacional<br/>'Pagamento confirmado']
```

**Webhook paralelo:** ver fluxo #5. Polling cobre o caso de webhook não chegar (dev sem ngrok).

**Email de confirmação:** se `SMTP_HOST/USER/PASS` não estiverem no `.env.local`, o backend loga warning e segue (não falha checkout). Em produção, configure Resend (ver `docs/SETUP.md`).

---

## 4. Admin: criar/editar produto

```mermaid
flowchart LR
    A[Admin em /admin] --> B[Tab Produtos]
    B --> C[Clica 'Novo produto'<br/>OU 'Editar' em existente]
    C --> D[ProductWizard abre]

    D --> D1[Step 1: Básico<br/>nome + categoria + descrição]
    D1 --> D2[Step 2: Mídia<br/>multi-images + multi-videos + downloadUrl]
    D2 --> D3[Step 3: Preço<br/>price + originalPrice + type]
    D3 --> E[Submit do form]

    E --> F[AdminPage.handleProductSave<br/>monta payload com images[] e videos[]]
    F --> G{Tem ID?}
    G -->|Sim| H[PUT /api/admin-products<br/>updateProduct]
    G -->|Não| I[POST /api/admin-products<br/>createProduct]

    H --> J[Backend valida sessão admin<br/>ensureAdminSession]
    I --> J
    J --> K[toProductPayload normaliza<br/>image_url = images[0]<br/>images: jsonb array<br/>videos: jsonb array]
    K --> L[INSERT/UPDATE em public.products]
    L --> M[Refresh dashboard<br/>fechar wizard<br/>toast sucesso]
```

---

## 5. Webhook Mercado Pago

```mermaid
sequenceDiagram
    autonumber
    participant MP as Mercado Pago
    participant API as Express /api/webhook
    participant DB as Supabase

    MP->>API: POST /api/webhook<br/>{ type: 'payment', data: { id: 'PAY-123' } }<br/>x-signature: ts=...,v1=hash
    API->>API: validateWebhookSignature(req)<br/>HMAC-SHA256 com WEBHOOK_SECRET
    alt Assinatura inválida
        API-->>MP: 401 Unauthorized
    end
    API->>MP: GET /v1/payments/PAY-123<br/>Authorization: Bearer access_token
    MP-->>API: { status, external_reference, transaction_amount }
    API->>DB: SELECT FROM orders WHERE order_code = external_reference
    alt Aprovado
        API->>DB: UPDATE orders SET<br/>payment_status='approved',<br/>completed_at=now()
        API->>DB: INSERT INTO download_tokens<br/>(token, order_id, product_id, expires_at)
        API->>DB: INSERT INTO user_products<br/>(user_id, product_id, order_id)
    end
    API-->>MP: 200 OK
    Note over MP,DB: Polling do cliente vai pegar<br/>esse update na próxima iteração
```

**Em dev sem ngrok**: webhook nunca chega → polling no frontend cobre o gap.

---

## 6. Estrutura geral de chamadas

```mermaid
graph TB
    subgraph Browser
        A[React Pages]
        B[Hooks: useAuth, useCart, useToast]
        C[Services: customer-auth, admin-panel, products]
        D[utils/api.js — fetch wrapper]
        E[Supabase JS Client<br/>auth only]
    end

    subgraph Express :3000
        F[Routes: auth, products, payment, api-compat]
        G[Middleware: helmet, cors, rate-limit, auth]
        H[lib: supabase, customer-session,<br/>admin-session, mercadopago]
    end

    subgraph External
        I[Supabase Postgres + Auth]
        J[Mercado Pago API]
        K[SMTP nodemailer]
    end

    A --> B
    B --> C
    C --> D
    D -->|fetch /api/* + cookies| F
    C -->|signInWithOAuth| E
    E -->|HTTPS| I

    F --> G
    G --> H
    H -->|REST com service_role| I
    H -->|SDK| J
    H -->|SMTP| K

    J -.->|webhook| F
```

**Observações:**
- O **Express é BFF** (Backend for Frontend): browser não fala direto com Supabase para dados (só Auth).
- **Service role nunca sai do servidor** — fica em variáveis de env do backend.
- **`utils/api.js`** centraliza fetch, timeout (15s) e parsing de erro.
- **Supabase JS Client no browser**: usado APENAS para `signInWithOAuth`, `signOut`, `getSession`, `updateUser` (reset de senha), `exchangeCodeForSession`. Toda CRUD em tabelas vai via backend.
