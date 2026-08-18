# Fluxogramas

> ## ⚠️ Documento em retirada
>
> **A versão canônica de fluxos é [ProjectDocs/05-FLUXOS.md](./ProjectDocs/05-FLUXOS.md).**
>
> Regra F2 (`CONTRIBUTING.md`): cada tema tem exatamente um arquivo canônico.
> Este arquivo é a versão curta de um par duplicado — as duas descrevem o mesmo
> assunto, com estruturas diferentes, e nada garante que estejam de acordo.
>
> **Não edite este arquivo.** Correção vai na versão canônica.
>
> Ele não foi apagado ainda porque os diagramas Mermaid daqui não têm equivalente óbvio na versão canônica. A remoção depende de alguém que
> conheça o estado atual do sistema confirmar, seção a seção, que a versão
> canônica cobre tudo o que está aqui.

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
    A[Usuário em /login ou /conta] --> B{Modo}
    B -->|Login| C[POST /api/auth/customer/login]
    B -->|Cadastro| D[POST /api/auth/customer/register]
    B -->|Esqueci senha| E[Supabase resetPasswordForEmail]

    C --> C1[Backend chama Supabase Auth<br/>POST /auth/v1/token grant_type=password]
    C1 -->|200 OK| C2[Backend cria cookie HttpOnly<br/>customer_session]
    C2 --> C3[Frontend recebe user<br/>navega para redirect]
    C1 -->|401| C4[Mensagem genérica 'E-mail ou senha incorretos'<br/>dica de e-mail não confirmado só com senha correta]

    D --> D1{Senha válida?<br/>min 8 chars + maiúscula + minúscula + número}
    D1 -->|Não| D2[Toast de erro local]
    D1 -->|Sim| D3[Backend chama Supabase Auth<br/>POST /auth/v1/signup]
    D3 -->|200 OK + access_token| D4[Cookie criado + navega]
    D3 -->|200 OK sem token| D5[verificationRequired = true<br/>Toast 'verifique seu email']
    D3 -->|400| D6[Mensagem neutra anti-enumeração<br/>não revela se o e-mail já existe<br/>senha fraca tem dica própria]

    E --> E1[Supabase Auth → SMTP Resend<br/>envia e-mail com link<br/>https://app.com/reset-password?code=...]
    E1 --> E2[ResetPasswordPage troca code por sessão<br/>via supabase.auth.exchangeCodeForSession<br/>fallback setSession com tokens do hash]
    E2 --> E3[Usuário define nova senha<br/>supabase.auth.updateUser]
```

**Pré-requisitos para o reset funcionar:**

- SMTP custom configurado no Supabase Auth (sem isso, usa SMTP grátis que só entrega pra members da org)
- Em sandbox do Resend, só entrega para o e-mail dono da conta Resend
- Em produção: domínio verificado em [resend.com/domains](https://resend.com/domains) + `smtp_admin_email` apontando pra ele

**Rota do admin:** o login do painel fica no caminho ofuscado `/painel-acesso-privado-atelie` (constante `ADMIN_LOGIN_PATH` em `src/constants/routes.js`); a rota `/admin-login` apenas redireciona para ele. Não há link para o painel no `/login` da loja.

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
    FE->>SB: supabase.auth.signInWithOAuth({provider:'google',<br/>redirectTo: /login?oauth=google&redirect=...})
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
    FE->>SB: supabase.auth.signOut({scope:'local'})<br/>remove tokens Supabase do localStorage
    FE->>FE: setCustomerSession(user)<br/>limpa ?oauth/?code/?state da URL
    FE-->>U: /login mostra "Você já está conectado"<br/>com link para /checkout
```

**Pontos críticos:**

- O Supabase Client é **único responsável** pelo OAuth — não fazemos a request pro Google manualmente.
- A `redirectTo` precisa estar no `uri_allow_list` do Supabase (scripts/configure-auth.js cuida disso).
- Depois que o cookie HttpOnly do backend é criado, o frontend faz `signOut({ scope: 'local' })` — os tokens do Supabase saem do localStorage (menos superfície pra XSS). A sessão passa a viver **só** no cookie.

---

## 3. Compra e download

```mermaid
flowchart TD
    A[Cliente adiciona ao carrinho<br/>localStorage] --> B[/checkout/]
    B --> C[Preenche nome + email<br/>cupom opcional via CouponField]
    C -.->|e-mail digitado, debounce 1,5s| C0[POST /api/abandoned-cart]
    C --> D["POST /api/create-payment<br/>{ items, customer, attribution, couponCode }"]

    D --> D1[Backend valida produtos em lote<br/>SELECT FROM products WHERE id IN ...<br/>preço sempre do banco]
    D1 --> D1b[Valida cupom server-side<br/>calcula desconto + incrementa uso atômico]
    D1b --> D2[INSERT INTO orders + order_items<br/>status=pending]
    D2 --> D3[Cria preferência Mercado Pago<br/>com items + back_urls + webhook]
    D3 --> D4[UPDATE orders SET preference_id]
    D4 --> D5{Retorna initPoint para o frontend}

    D5 --> E[Frontend abre Mercado Pago<br/>em nova aba via window.open<br/>botão fallback se popup bloqueado]
    D5 --> F[Salva pendingOrderId no state<br/>useEffect inicia polling]

    F --> F1[A cada 4s GET /api/verify-payment?orderId=X&email=Y]
    F1 --> F2{paymentStatus?}
    F2 -->|approved| G[Limpa carrinho<br/>navega para /downloads]
    F2 -->|rejected/cancelled| H[Toast erro<br/>polling para]
    F2 -->|pending| F1
    F2 -->|150x sem resposta| I[Timeout 10min<br/>usuário pode verificar em Downloads]

    G --> J[/downloads?order=X&email=Y/]
    J --> J1[GET /api/verify-payment?orderId=X&email=Y]
    J1 --> J2{Status approved?}
    J2 -->|Sim| K[Lista download_tokens]
    J2 -->|Não| L[Continua polling a cada 10s<br/>até max 12 tentativas]

    K --> M[Para cada arquivo:<br/>href = /api/download?token=Y]
    M --> N["Backend valida token<br/>claim atômico used=false→true"]
    N --> O[INSERT INTO download_logs<br/>redirect para signed URL do Storage 5 min<br/>ou URL externa legada]

    G -.->|paralelo, no backend| P[1ª aprovação: webhook/verify-payment<br/>provisionam conta do comprador<br/>ensureCustomerAccountFromCheckout]
    P --> Q[E-mail de definição de senha<br/>Supabase Auth → SMTP Resend]
```

**Webhook paralelo:** ver fluxo #5. O polling não depende do webhook: `verify-payment` consulta o Mercado Pago diretamente (`Payment.search`) e, se o pagamento aprovou, faz a mesma transição do pedido + criação de tokens (cobre dev sem ngrok).

**Email de confirmação do pedido:** `POST /api/send-confirmation-email` existe como endpoint idempotente de (re)envio (`email_sent_log`; destinatário é sempre o e-mail gravado no pedido) — não é disparado automaticamente pelo SPA. Se `SMTP_HOST/USER/PASS` não estiverem no `.env.local`, o backend loga warning e segue (não falha checkout). Em produção, configure Resend (ver `docs/SETUP.md`).

---

## 4. Admin: criar/editar produto

```mermaid
flowchart LR
    A[Admin em /admin] --> B[Tab Produtos]
    B --> C[Clica 'Novo produto'<br/>OU 'Editar' em existente]
    C --> D[ProductWizard abre]

    D --> D1[Step 1: Básico<br/>nome + categoria + descrição]
    D1 --> D2[Step 2: Mídia<br/>multi-images + multi-videos + downloadUrl<br/>upload via signed URL do Storage]
    D2 --> D3[Step 3: Preço & Variações<br/>price + originalPrice + type]
    D3 --> D4[Step 4: Conversão<br/>benefits + FAQ + reviews]
    D4 --> E[Submit do form]

    E --> F["AdminPage.handleProductSave<br/>monta payload com images[], videos[],<br/>faq, reviews e benefits"]
    F --> G{Tem ID?}
    G -->|Sim| H[PUT /api/admin-products<br/>updateProduct]
    G -->|Não| I[POST /api/admin-products<br/>createProduct]

    H --> J[Backend valida sessão admin<br/>ensureAdminSession + same-origin em escrita]
    I --> J
    J --> K["toProductPayload normaliza<br/>image_url = images[0]<br/>images: jsonb array<br/>videos: jsonb array"]
    K --> L[INSERT/UPDATE em public.products<br/>+ audit em admin_audit_log]
    L --> M[Refresh dashboard<br/>fechar wizard<br/>toast sucesso]
```

**Upload de mídia:** o wizard pede uma signed upload URL ao backend (`POST /api/admin-upload-url`, com whitelist de extensão/MIME) e faz o PUT via XHR **direto no Supabase Storage** — limites de 10MB para imagem e 50MB para vídeo/arquivo de download.

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
        API->>DB: INSERT INTO security_events<br/>webhook_invalid_signature
        API-->>MP: 401 Unauthorized
    end
    API->>MP: GET /v1/payments/PAY-123<br/>Authorization: Bearer access_token
    MP-->>API: { status, external_reference, transaction_amount }
    API->>DB: SELECT FROM orders WHERE order_code = external_reference
    alt Aprovado
        API->>DB: UPDATE orders SET payment_status='approved',<br/>status='completed', completed_at=now()<br/>(atômico: só se ainda não estava approved)
        API->>DB: INSERT em lote INTO download_tokens<br/>(token, order_id, product_id, expires_at +72h)<br/>idempotente via UNIQUE(order_id, product_id)
        API->>DB: 1ª aprovação: provisiona conta do comprador<br/>ensureCustomerAccountFromCheckout<br/>+ evento payment_approved
    else Rejeitado/cancelado
        API->>DB: UPDATE orders SET<br/>payment_status='rejected'/'cancelled', status='failed'<br/>+ evento payment_rejected/payment_cancelled
    end
    API-->>MP: 200 OK
    Note over MP,DB: Polling do cliente vai pegar<br/>esse update na próxima iteração
```

**Em dev sem ngrok**: webhook nunca chega → polling no frontend cobre o gap (`verify-payment` consulta o MP e cria os tokens sozinho).

---

## 6. Estrutura geral de chamadas

```mermaid
graph TB
    subgraph Browser
        A[React Pages]
        B[Hooks: useAuth, useCart, useToast]
        C[Services: customer-auth, admin-auth,<br/>admin-panel, admin-products, products]
        D[utils/api.js — fetch wrapper]
        E[Supabase JS Client<br/>auth only]
    end

    subgraph Express :3000
        F[Routes: auth, products, payment, api-compat]
        G[Middleware: helmet, cors, rate-limit, auth]
        H[lib: supabase, customer-session,<br/>admin-session, mercadopago-config,<br/>email-sender, coupons, security-logger]
    end

    subgraph External
        I[Supabase Postgres + Auth + Storage]
        J[Mercado Pago API]
        K[SMTP Resend nodemailer]
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

- O **Express é BFF** (Backend for Frontend): browser não fala direto com Supabase para dados (exceções: Auth e o upload de mídia do admin, feito por PUT em signed URL do Storage).
- **Service role nunca sai do servidor** — fica em variáveis de env do backend.
- **`utils/api.js`** centraliza fetch, timeout (15s) e parsing de erro.
- **Supabase JS Client no browser**: usado APENAS para `signInWithOAuth`, `signOut`, `getSession`, `resetPasswordForEmail`, `exchangeCodeForSession`/`setSession` e `updateUser` (reset de senha). Toda CRUD em tabelas vai via backend.
- **Em produção (Vercel)** o Express não roda: cada arquivo de `api/` vira função serverless com a mesma rota; `routes/api-compat.routes.js` garante a paridade dev↔prod.
