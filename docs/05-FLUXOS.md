# 05 — Fluxos

Cada fluxo aparece uma vez: diagrama técnico (Mermaid) e, logo abaixo, o que a pessoa vê e o que
o sistema faz. Os diagramas abrem no GitHub, no VS Code (extensão Mermaid) ou em
https://mermaid.live.

Os painéis em si (abas, cards, ações) estão em [06-PAINEIS](./06-PAINEIS.md); os endpoints, em
[09-API](./09-API.md); regras e métricas do negócio, em
[07-NEGOCIO-E-MARKETING](./07-NEGOCIO-E-MARKETING.md).

## Índice

**Compra (cliente)**

1. [Jornada em resumo](#1-jornada-em-resumo)
2. [Descoberta e página do produto](#2-descoberta-e-página-do-produto)
3. [Carrinho e checkout](#3-carrinho-e-checkout)
4. [Pagamento e confirmação](#4-pagamento-e-confirmação)
5. [Webhook do Mercado Pago](#5-webhook-do-mercado-pago)
6. [Download](#6-download)
7. [Pós-venda: e-mails automáticos](#7-pós-venda-e-mails-automáticos)
8. [Newsletter (double opt-in)](#8-newsletter-double-opt-in)

**Contas e login**

9. [Cliente: cadastro e login por e-mail](#9-cliente-cadastro-e-login-por-e-mail)
10. [Cliente: login com Google](#10-cliente-login-com-google)
11. [Redefinição de senha](#11-redefinição-de-senha)
12. [Staff: login por senha (2º fator da administração)](#12-staff-login-por-senha-2º-fator-da-administração)
13. [Staff: login com Google (só professor)](#13-staff-login-com-google-só-professor)
14. [Minha conta: nome, senha e e-mail](#14-minha-conta-nome-senha-e-e-mail)

**Loja (quem vende)**

15. [Cadastro de produto](#15-cadastro-de-produto)
16. [Estrutura geral de chamadas](#16-estrutura-geral-de-chamadas)
17. [Rotina da dona da loja](#17-rotina-da-dona-da-loja)
18. [Casos extremos](#18-casos-extremos)

---

## 1. Jornada em resumo

```mermaid
flowchart LR
    A[Descoberta<br/>home, catálogo, filtros] --> B[Página do produto<br/>galeria, FAQ, depoimentos]
    B --> C[Carrinho<br/>drawer lateral]
    C --> D[Checkout<br/>nome + e-mail + cupom]
    D --> E[Mercado Pago<br/>cartão, Pix, boleto]
    E --> F[Downloads<br/>links de uso único]
    F --> G[Pós-venda<br/>confirmação, conta, e-mails]
```

| Etapa      | Cliente vê                                     | Seção                                                        |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Descoberta | Home, catálogo com filtros, página do produto  | [2](#2-descoberta-e-página-do-produto)                       |
| Compra     | Carrinho, checkout, pagamento em nova aba      | [3](#3-carrinho-e-checkout), [4](#4-pagamento-e-confirmação) |
| Entrega    | `/downloads` com um botão "Baixar" por arquivo | [6](#6-download)                                             |
| Pós-venda  | E-mail de confirmação, conta criada, lembretes | [7](#7-pós-venda-e-mails-automáticos)                        |

Eventos de analytics (GA4 e Meta Pixel) só disparam depois do consentimento no banner LGPD
(`utils/consent.js`, `ConsentBanner.jsx`). Os eventos de funil próprios (`view_catalog` →
`view_item` → `add_to_cart` → `begin_checkout` → `purchase`) vão para `analytics_events` via
`POST /api/track-event` e alimentam a subaba Funil.

---

## 2. Descoberta e página do produto

```mermaid
flowchart TD
    A[Visitante chega<br/>SEO, direto, social] --> B[HomePage]
    B --> B1[GET /api/home-content<br/>textos, imagem, ordem dos blocos]
    B --> B2[GET /api/home-sections<br/>faixas de produtos]
    A --> U[UTMs salvas em localStorage<br/>30 dias - utils/attribution.js]
    B --> C[/produtos<br/>categoria, mais vendidos, novidades, faixa de preço/]
    C --> D[/produtos/:slug/]
    D --> D1[GET /api/product-details?slug=<br/>+ sharedDescription - descrição padrão da loja]
    D --> D2[GET /api/cross-sell?productId=<br/>co-ocorrência de compra, senão mesma categoria]
    D --> D3[SEO.jsx: title, meta e JSON-LD Product + Offer]
```

**Cliente vê.** Na home, os blocos que a dona da loja configurou na aba "Página da loja" (banner,
faixa de palavras, vitrine de produtos, passo a passo da compra, depoimentos e redes). Na página do
produto: galeria, vídeos, descrição, a descrição padrão da loja logo abaixo, preço (com preço
original riscado, se houver), benefícios, FAQ, depoimentos e produtos relacionados.

**Quem vende garante.** Categorias ativas, 3+ imagens por produto, FAQ e depoimentos preenchidos,
slug legível (gerado a partir do nome), vitrine atualizada.

---

## 3. Carrinho e checkout

```mermaid
flowchart TD
    A[Adicionar ao carrinho] --> A1[Toast, sem navegar<br/>CartProvider grava em localStorage]
    A1 --> B[CartDrawer: Finalizar compra]
    B --> C[/checkout/]
    C --> C1[Nome + e-mail, página única<br/>Google opcional]
    C1 --> C2[E-mail digitado com carrinho cheio<br/>debounce 1,5 s → POST /api/abandoned-cart<br/>falha silenciosa]
    C --> C3[Cupom → POST /api/validate-coupon<br/>só prévia; vale o que o create-payment decidir]
    C --> D[Ir para pagamento → seção 4]
```

**Cliente vê.** Resumo dos itens (pode remover), formulário curto, campo de cupom com o desconto
previsto e o botão "Ir para pagamento". Não precisa ter conta: a conta é criada depois da primeira
compra aprovada (seção 7).

**Sistema.** `add_to_cart` e `begin_checkout` vão para o funil. O carrinho abandonado é gravado
por e-mail + sessão; o total é recalculado no servidor e cada atualização zera o lembrete.

---

## 4. Pagamento e confirmação

```mermaid
flowchart TD
    A[Ir para pagamento] --> B[POST /api/create-payment<br/>items, customer, attribution, couponCode]
    B --> B1[Revalida produtos no banco<br/>até 100 itens, quantidade 1–99]
    B1 --> B2[Recalcula total e aplica cupom no servidor<br/>reserva atômica: rpc increment_coupon_usage<br/>sem reserva → segue sem desconto]
    B2 --> B3[INSERT orders + order_items<br/>status pending, order_code de 128 bits]
    B3 --> B4[Preferência no Mercado Pago<br/>back_urls + notification_url, installments 1]
    B4 --> B5[Devolve initPoint]

    B5 --> C[window.open em nova aba<br/>botão Abrir pagamento se o popup for bloqueado]
    B5 --> D[Polling a cada 4 s - até 150 tentativas<br/>POST /api/verify-payment orderId + email]
    D --> D1{paymentStatus}
    D1 -->|approved| E[Limpa carrinho<br/>/downloads?order=X&email=Y&success=1]
    D1 -->|rejected / cancelled| F[Toast de erro, polling para]
    D1 -->|pending| D
    D1 -->|limite| G[Cliente confere depois em /downloads]

    C --> MP[Mercado Pago processa]
    MP -.->|webhook| W[Seção 5]
    MP -->|back_urls| H[success → /downloads<br/>failure/pending → /checkout?status=]
```

**Cliente vê.** O Mercado Pago abre em outra aba (cartão, Pix ou boleto, sem parcelamento). A aba
da loja fica esperando e, quando o pagamento é aprovado, vai sozinha para os downloads.

**Sistema.**

- Duas portas confirmam o pagamento: o webhook (seção 5) e o `verify-payment` do polling, que
  consulta o Mercado Pago (`payment.search` por `external_reference`) quando o pedido ainda está
  pendente. As duas fazem a mesma coisa na primeira aprovação: tokens de download, conta do
  comprador e e-mail de confirmação. Sem webhook (dev sem túnel, atraso em produção), o polling
  cobre.
- O `verify-payment` exige o par `order_code` + e-mail (comparação em tempo constante); par errado
  → 404 e evento de segurança.
- Erros de rede no polling aumentam o intervalo (backoff de 15 s até 5 min) em vez de martelar o
  servidor.
- Cupom reservado e não pago em 2 h volta a ficar disponível (`release_stale_coupon_reservations`).
- O evento `purchase` (GA4 + Pixel) só dispara em `/downloads`, com o pagamento confirmado, uma vez
  por pedido (`trackPurchaseOnce`).

---

## 5. Webhook do Mercado Pago

```mermaid
sequenceDiagram
    autonumber
    participant MP as Mercado Pago
    participant API as /api/webhook
    participant DB as Supabase

    MP->>API: POST { type: payment, data.id }<br/>x-signature: ts, v1
    API->>API: HMAC-SHA256 com WEBHOOK_SECRET
    alt Assinatura inválida
        API->>DB: security_events webhook_invalid_signature
        API-->>MP: 401
    end
    API->>MP: GET /v1/payments/:id
    MP-->>API: status, external_reference, valor, moeda
    API->>DB: pedido por order_code
    alt Aprovado, mas valor ou moeda não batem
        API->>DB: security_events payment_amount_mismatch
        API-->>MP: 200 sem aprovar
    end
    alt Aprovado e reconciliado
        API->>DB: UPDATE atômico: só !approved → approved<br/>status completed, completed_at, payment_id
        API->>DB: download_tokens em lote - 32 bytes, +72 h
        API->>API: 1ª aprovação: cria conta do comprador<br/>+ e-mail de confirmação do pedido
    end
    alt Rejeitado ou cancelado
        API->>DB: payment_status rejected/cancelled, status failed<br/>só se ainda não aprovado
    end
    alt Estorno ou chargeback de pedido aprovado
        API->>DB: payment_status refunded/charged_back, status refunded<br/>tokens queimados
    end
    API-->>MP: 200
```

**Idempotência.** A transição de status é um UPDATE condicional: só a primeira notificação
aprovada vence. Os tokens têm `UNIQUE (order_id, product_id)`; o INSERT repetido colide (409
tratado como sucesso) e os tokens gravados são relidos. O e-mail de confirmação é idempotente por
`email_sent_log`.

---

## 6. Download

```mermaid
flowchart TD
    A[/downloads?order=X&email=Y/] --> B[POST /api/verify-payment]
    B --> C{approved?}
    C -->|não| C1[Polling a cada 10 s, até 12 vezes]
    C -->|sim| D[Lista os tokens válidos<br/>purchase event uma vez por pedido]
    D --> E[Baixar → GET /api/download?token=]
    E --> F[Token existe, não usado, não expirou?]
    F -->|não| F1[401 Token já utilizado / expirado]
    F -->|sim| G[Claim atômico used=false → true<br/>antes de gerar a URL]
    G --> H{download_url é do Storage?}
    H -->|não| H1[500 DOWNLOAD_UNAVAILABLE<br/>token preservado + download_url_not_storage]
    H -->|sim| I[URL assinada de 5 min<br/>302 + Referrer-Policy no-referrer + no-store]
    I --> J[download_logs: IP, UA, data]
    D --> K[Atualizar: reemite link usado ou vencido<br/>novo token +72 h, até 5 downloads por item]
```

**Cliente vê.** Um botão "Baixar" por arquivo. O link vale uma vez e por 72 h; o botão "Atualizar"
gera link novo até 5 downloads por item — depois disso o item aparece sem botão. Cliente logado
vê o histórico em `/downloads` via `GET /api/customer-orders` (filtrado pelo `customer_id` do
cookie; pedidos de convidado com o mesmo e-mail confirmado são adotados pela conta).

**Quem vende garante.** Todo produto com arquivo enviado pelo painel (bucket privado
`product_files`). Link externo (Google Drive etc.) é recusado no cadastro e não é entregue.

---

## 7. Pós-venda: e-mails automáticos

```mermaid
flowchart TD
    A[1ª aprovação do pedido<br/>webhook ou verify-payment] --> A1[Conta Supabase do comprador convidado<br/>ensureCustomerAccountFromCheckout]
    A1 --> A2[E-mail para definir senha<br/>resetPasswordForEmail]
    A --> A3[E-mail Pagamento confirmado<br/>lib/order-confirmation.js]

    C[GitHub Actions email-cron.yml<br/>de hora em hora] --> D[POST /api/cron-email-jobs<br/>X-Cron-Secret]
    D --> E[Carrinho abandonado<br/>1º lembrete ~1 h, 2º ~24 h]
    D --> F[Pós-compra D+3 avaliação<br/>D+15 complementares, D+45 novidades]
    D --> G[Reativação: última compra entre 90 e 180 dias<br/>cupom VOLTEI15, no máximo 1x por mês]
    E & F & G --> H[email_sent_log - idempotência<br/>descadastro respeitado em tudo]
```

**Cliente vê.** Logo após pagar: "Pagamento confirmado" (itens e link para os downloads) e, na
primeira compra, um e-mail para criar a senha da conta criada para ele. Depois, os e-mails da
sequência, cada um com link de descadastro de 1 clique.

**Regras.**

- Lembrete de carrinho só vai para e-mail com opt-in confirmado ou com pedido aprovado (o e-mail do
  carrinho vem de um endpoint público, sem prova de posse).
- Ninguém inativo há mais de 180 dias recebe e-mail.
- Cupom de reativação só na janela de 90–180 dias, para não dar desconto a quem ia comprar de
  qualquer jeito. O código vem de `REACTIVATION_COUPON_CODE` (padrão `VOLTEI15`) e precisa existir
  na aba Cupons.
- Janelas por env: `ABANDONED_CART_FIRST_HOURS` (1), `ABANDONED_CART_SECOND_HOURS` (24),
  `REACTIVATION_DAYS_MIN/MAX` (90/180).
- Sem SMTP configurado (`SMTP_HOST/USER/PASS`), o envio registra `skipped` e o fluxo segue: e-mail
  nunca bloqueia checkout nem entrega.
- `POST /api/send-confirmation-email` reenvia a confirmação; o destinatário é sempre o e-mail
  gravado no pedido.

Quando um pedido é aprovado (webhook ou `verify-payment`), os carrinhos em aberto do mesmo
e-mail ganham `recovered_at` (`lib/cart-recovery.js`) e o cron não manda mais o lembrete.

---

## 8. Newsletter (double opt-in)

```mermaid
flowchart TD
    A[Formulário no rodapé ou popup] --> B[POST /api/subscribe<br/>email, source, attribution]
    B --> C{Já existe?}
    C -->|confirmado e ativo| C1[Já inscrito - idempotente]
    C -->|descadastrado| C2[Reativa com novo token<br/>reaproveita token enviado há menos de 1 h]
    C -->|não| C3[INSERT email_subscribers confirmed=false]
    C2 & C3 --> D[E-mail com /confirmar-inscricao?token=]
    D --> E[GET /api/confirm-subscription<br/>TTL 72 h, uso único]
    E -->|válido| F[confirmed=true]
    E -->|inválido| G[Link expirado, peça outro]

    H[Descadastrar em qualquer e-mail<br/>/desinscrever?token=] --> I[GET ou POST /api/unsubscribe<br/>One-Click RFC 8058]
    I --> J[unsubscribed_at=now + e-mail de confirmação]
    K[/desinscrever sem token/] --> L[POST email → manda o link por e-mail<br/>nada muda sem o clique]
    J & L --> M[Resposta sempre neutra<br/>não revela se o e-mail existe]
```

---

## 9. Cliente: cadastro e login por e-mail

```mermaid
flowchart TD
    A["/login - aba Sou cliente"] --> B{Modo}
    B -->|Entrar| C[POST /api/auth/customer/login]
    B -->|Cadastrar| D[POST /api/auth/customer/register]
    B -->|Esqueci a senha| E[Seção 11]

    C --> C1[Supabase Auth password grant]
    C1 -->|ok| C2[Cookie HttpOnly customer_session<br/>HMAC-SHA256]
    C2 --> C3[Volta ao redirect ou /checkout]
    C1 -->|erro| C4[E-mail ou senha incorretos<br/>dica de não confirmado só se o Supabase sinalizar]

    D --> D1{Senha forte?<br/>8+ com maiúscula, minúscula e número}
    D1 -->|não| D2[Erro na tela]
    D1 -->|sim| D3[Supabase signup]
    D3 -->|com token| D4[Cookie + navega]
    D3 -->|sem token| D5[Verifique seu e-mail]
    D3 -->|erro| D6[Mensagem neutra - não revela se o e-mail existe]
```

As duas telas de login abrem com o seletor **Sou cliente | Sou professor(a)**
(`LoginChooser.jsx`): ele só leva de `/login` a `/admin` e vice-versa, sem mudar a autenticação.
A política de senha é validada na tela; o servidor revalida o mínimo e traduz o erro de senha
fraca do Supabase. Em `/conta`, o cliente logado vê os dados, exporta (`/api/me-export-data`) ou
exclui a conta (`/api/me-delete-account`, que anonimiza os pedidos).

---

## 10. Cliente: login com Google

```mermaid
sequenceDiagram
    autonumber
    actor U as Cliente
    participant FE as Frontend
    participant SB as Supabase Auth
    participant G as Google
    participant API as Express

    U->>FE: Continuar com o Google
    FE->>SB: signInWithOAuth google, PKCE<br/>redirectTo /login?oauth=google&redirect=...
    SB-->>U: Google
    U->>G: Autoriza
    G-->>SB: callback
    SB-->>U: /login?oauth=google&code=...
    FE->>SB: troca o code pela sessão
    FE->>API: POST /api/auth/customer/google/callback { accessToken }
    API->>SB: GET /auth/v1/user
    API-->>FE: cookie customer_session + user
    FE->>FE: signOut scope local - tokens saem do localStorage<br/>limpa o code da URL
    FE-->>U: redirect saneado ou /checkout
```

O `redirectTo` precisa estar no `uri_allow_list` do Supabase (`scripts/configure-auth.js`). O
`?redirect=` é saneado nas duas pontas (`sanitizeRedirectPath`) para não virar open redirect.

---

## 11. Redefinição de senha

```mermaid
flowchart TD
    A1[Cliente: /login → Esqueci a senha] --> B
    A2[Staff: Minha conta → Esqueci a senha atual<br/>ou Enviar link para criar senha] --> B
    A3[Staff: login do painel → Esqueci minha senha<br/>abre /login?mode=forgot&redirect=/admin] --> B
    B[supabase.auth.resetPasswordForEmail<br/>redirectTo /reset-password?redirect=...] --> C[E-mail via SMTP Resend]
    C --> D[ResetPasswordPage]
    D --> E[?code= → exchangeCodeForSession<br/>#tokens → setSession]
    E -->|ok| F[Nova senha + confirmação → updateUser]
    E -->|expirado| G[Peça um novo link]
    F --> H[Volta para /checkout, /downloads ou /admin]
```

O destino depois da troca só pode ser `/checkout`, `/downloads` ou `/admin`. Pela aba Minha conta
e pelo link "Esqueci minha senha" da tela de login do painel, o link volta ao `/admin` (login do
painel).

**Pré-requisitos.** SMTP próprio no Supabase Auth (o SMTP padrão só entrega para membros da
organização); domínio verificado no Resend; em sandbox do Resend, só o e-mail dono da conta
recebe.

---

## 12. Staff: login por senha (2º fator da administração)

```mermaid
flowchart TD
    A["/admin ou /professores sem sessão<br/>formulário - Sou professor(a)"] --> B[POST /api/admin/login<br/>email + password]
    B --> C[Supabase Auth password grant]
    C -->|inválido| C1[401 Credenciais inválidas<br/>security_events admin_login_failed]
    C -->|válido| D[Papel pelo id da conta - profiles.role]
    D -->|não é admin, master nem seller| C1
    D -->|seller| S[storeOwner = settings.storeOwner é ela?]
    D -->|admin/master| E{2º fator exigido?}
    E -->|não| S
    E -->|sim| F[requiresSecondFactor + métodos<br/>challengeToken: 120 s, uso único, preso ao IP]
    F --> F1[Só e-mail habilitado, sem app:<br/>código de 6 dígitos já vai por e-mail - vale 10 min]
    F --> G[POST de novo com challengeToken + factorCode<br/>ou sendEmailCode: true para pedir o código]
    G -->|TOTP, código do e-mail ou PIN confere| S
    G -->|código errado| G1[401 Código inválido]
    G -->|desafio expirado| F
    S --> H[Cookie admin_session HMAC<br/>8 h, SameSite=Strict, com role e storeOwner]
    H --> I{Papel}
    I -->|admin/master| J[/admin - Administração da plataforma/]
    I -->|seller| K[/professores - Painel da loja ou área simples/]
```

**Pessoa vê.** E-mail e senha; se for da administração com 2º fator ligado, um campo de código com
os métodos aceitos ("código do app autenticador, código enviado por e-mail, PIN de recuperação") e
o botão "Enviar código por e-mail" quando o e-mail é aceito.

**Sistema.**

- Rate limit de 5 tentativas / 10 min por IP (o sucesso também conta) e um balde separado de
  5 / 10 min por IP + e-mail para o 2º fator, que falha fechado (contador fora do ar → 503).
- Credencial errada e conta de outro papel dão a mesma resposta; o motivo fica só no log.
- TOTP aceita ±1 janela de 30 s. O código por e-mail não é guardado: vai selado (HMAC) dentro do
  próprio desafio.
- O 2º fator vale só para admin/master. Professor(a) — inclusive a dona da loja — entra só com a
  senha.
- A dona da loja é marcada no cookie no login: trocar a dona vale a partir do próximo login.
- Na mesma URL, sem sessão aparece o login; com sessão, o painel. Sair volta ao formulário.

---

## 13. Staff: login com Google (só professor)

```mermaid
sequenceDiagram
    autonumber
    actor P as Professor(a)
    participant FE as AdminLoginPage
    participant SB as Supabase Auth
    participant API as /api/admin/login-google

    P->>FE: Continuar com o Google
    FE->>SB: signInWithOAuth google, PKCE, prompt select_account<br/>redirectTo /admin?oauth=staff
    SB-->>FE: volta em /admin?oauth=staff&code=...
    FE->>FE: limpa oauth/code da URL - F5 não repete a troca
    FE->>API: POST { accessToken }
    API->>SB: auth.getUser(accessToken)
    alt papel admin/master
        API-->>FE: 403 Administração entra com e-mail, senha e código
    else papel diferente de seller
        API-->>FE: 401 Conta Google não cadastrada como professor(a)
    else seller
        API->>API: storeOwner?
        API-->>FE: cookie admin_session
        FE-->>P: /professores
    end
    FE->>SB: signOut scope local
```

O marcador `?oauth=staff` separa esta volta da do cliente (`?oauth=google`). Admin/master são
barrados de propósito: o Google pularia o 2º fator. Uma conta Google que nunca foi professora
nasce como cliente no primeiro OAuth e recebe o 401; o admin a promove em "Professores e clientes"
e o próximo login funciona. Rate limit próprio (`RATE_LIMITS.staffGoogleLogin`).

---

## 14. Minha conta: nome, senha e e-mail

```mermaid
flowchart TD
    A[Aba Minha conta<br/>GET /api/teacher/account] --> B{Entra com}
    B -->|e-mail e senha| C[Seus dados: nome<br/>PUT displayName - até 80 caracteres]
    B -->|e-mail e senha| D[Trocar senha<br/>senha atual + nova 2x]
    B -->|e-mail e senha| E[Trocar e-mail<br/>e-mail novo + senha atual]
    B -->|Google| G[Enviar link para criar senha<br/>resetPasswordForEmail → /reset-password?redirect=/admin]

    D --> R[POST action change-password<br/>rate limit 5 / 10 min por IP + conta]
    E --> R2[POST action change-email]
    R --> V[Confere a senha atual com login real<br/>cliente Supabase novo a cada vez]
    R2 --> V
    V -->|não confere| X[400 A senha atual não confere<br/>staff_reauth_failed]
    V -->|ok, senha| P[Admin API troca na hora]
    V -->|ok, e-mail| M[updateUser email - Supabase manda link<br/>emailRedirectTo APP_URL/admin]
    M --> M1[Tela: Enviamos um link para o e-mail novo<br/>a troca só vale depois do clique]
    M1 --> M2[Trigger on_auth_user_email_changed<br/>atualiza profiles.email]
    D --> F[Esqueci a senha atual → link por e-mail]
```

**Pessoa vê.** Nome editável; e-mail, tipo de conta ("Professor(a) · dona da loja", "Professor(a)"
ou "Administração da plataforma"), forma de login e data de criação. Contas Google veem só o botão
de criar senha: o e-mail delas é o da conta Google.

**Sistema.** Senha nova: 8+ caracteres com maiúscula, minúscula e número, diferente da atual. A
senha atual é pedida porque a sessão do painel dura 8 h. Erro de senha atual volta 400 (401 o
painel leria como sessão expirada). Cada troca grava evento de segurança e entrada no audit log.
Se a opção "Secure email change" do Supabase estiver ligada, a confirmação também passa pelo
e-mail antigo. O login por senha procura o papel pelo id da conta, então a troca de e-mail não
tranca a pessoa fora.

---

## 15. Cadastro de produto

**Dona da loja** (Painel da loja → Produtos):

```mermaid
flowchart LR
    A[Novo produto ou Editar] --> A1[Editar busca o produto completo<br/>GET /api/admin/products?id=]
    A1 --> B[ProductWizard]
    A --> B
    B --> S1[1 Básico<br/>nome, categoria, descrição<br/>+ dois botões de IA]
    S1 --> S2[2 Mídia<br/>imagens, vídeos, arquivo<br/>POST /api/admin/upload-url → PUT no Storage]
    S2 --> S3[3 Preço e tipo<br/>preço, preço original, individual/kit]
    S3 --> S4[4 Conversão<br/>benefícios, FAQ, depoimentos]
    S4 --> C{Tem id?}
    C -->|não| D[POST /api/admin/products<br/>active=true, seller_id = dona]
    C -->|sim| E[PUT /api/admin/products<br/>active preservado]
    D & E --> F[Valida mídia: imagem/vídeo https,<br/>arquivo só do Storage da loja]
    F --> G[INSERT/UPDATE products + audit log<br/>slug gerado pelo banco]
```

- Upload: imagem até 500 kB (conferido na tela; o bucket aceita até 10 MB), vídeo e arquivo até
  50 MB. O upload assinado é confirmado depois (metadados reais) e o que violar a política é
  apagado.
- IA (Gemini) no passo 1, sempre por botão e só no clique: "Escrever descrição com IA" (descrição,
  benefícios, FAQ) e "Sugerir nome, Google e preço" (nome, resumo para o Google, faixa de preço
  comparada ao catálogo). Nada entra no formulário sem clicar em "Usar…", e nada é gravado sem
  salvar. A IA recebe só o que foi digitado e nomes/categorias/preços do catálogo.
- Editar não reativa produto pausado; pausar/ativar é o botão da lista.
- A dona só lê e altera produtos com o `seller_id` dela; o de outro professor responde 404.

**Outro professor** (`/professores`, área simples): formulário curto com nome, descrição, link do
arquivo, preço e categoria → `POST /api/teacher/products` (nasce ativo e com o `seller_id` dele);
depois só pausar/ativar (`PATCH`). Sem fotos, sem edição e sem upload — ver pendência em
[06-PAINEIS](./06-PAINEIS.md).

---

## 16. Estrutura geral de chamadas

```mermaid
graph TB
    subgraph Navegador
        A[Pages + hooks useAuth, useCart, useToast]
        C[services/*]
        D[utils/api.js<br/>fetch, timeout 15 s, erro]
        E[Supabase JS - só auth<br/>carregado sob demanda]
    end

    subgraph "API: api/index.js na Vercel, server.js em dev"
        F[routes → handlers/]
        H[lib: sessões, seller-scope, store-owner,<br/>mercadopago, e-mail, gemini, rate limit]
    end

    subgraph Externos
        I[Supabase Postgres + Auth + Storage]
        J[Mercado Pago]
        K[Resend SMTP]
        L[Gemini]
        M[GA4 + Meta Pixel]
    end

    A --> C --> D -->|/api/* + cookies| F
    C -->|OAuth, reset de senha| E -->|HTTPS| I
    A -->|com consentimento| M
    F --> H
    H -->|service role| I
    H --> J
    H --> K
    H --> L
    J -.->|webhook| F
```

- O Express é o BFF: o navegador não lê nem grava tabela no Supabase; o cliente Supabase do browser
  serve só para OAuth, sessão temporária e redefinição de senha. A exceção é o PUT de mídia direto
  no Storage, com URL assinada emitida pelo servidor.
- A service role nunca sai do servidor.
- Três sessões independentes: `customer_session` (cliente), `admin_session` (staff: admin, master,
  professor) e a sessão do Supabase JS, apagada do `localStorage` logo após cada OAuth.

---

## 17. Rotina da dona da loja

Tudo no Painel da loja (`/professores`). O que cada aba mostra está em
[06-PAINEIS](./06-PAINEIS.md).

| Quando     | O que fazer                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diário     | Pedidos: algum pendente ou recusado há mais de 24 h? Dashboard: números dentro do esperado?                                                       |
| Semanal    | Vendas → Estudo de vendas (gerar nova análise); escolher 1 a 3 ajustes; atualizar Página da loja e faixas de produtos se preciso.                 |
| Mensal     | Search Console (posições, páginas em queda); Curva ABC de produtos e de clientes; Segmentos de e-mail; conferir que o cupom de reativação existe. |
| Trimestral | Despublicar (pausar) produto sem venda há 90 dias, com cuidado com produto de entrada.                                                            |

Fica com a administração da plataforma: rotação de segredos e auditoria de `security_events`
([08-SEGURANCA](./08-SEGURANCA.md)), papéis e dona da loja, revisão anual das regras
([07-NEGOCIO-E-MARKETING](./07-NEGOCIO-E-MARKETING.md)) e dos planos dos serviços.

---

## 18. Casos extremos

**Cliente pagou e não recebeu o arquivo.**

1. Pedir para abrir `/downloads?order=<order_code>&email=<e-mail>` e clicar em "Atualizar": o
   `verify-payment` consulta o Mercado Pago, aprova se for o caso e reemite link usado ou vencido
   (até 5 downloads por item).
2. A dona confere em Pedidos se o pagamento está aprovado. A administração da plataforma não tem
   tela de pedidos: consulta no Supabase.
3. Mercado Pago aprovado e pedido não: procurar `payment_amount_mismatch` ou
   `webhook_invalid_signature` em `security_events` e os logs da Vercel.
4. Erro `DOWNLOAD_UNAVAILABLE`: o produto não tem arquivo do Storage. Reenviar o arquivo pelo
   painel; o token não foi gasto.

**Reembolso.** Devolver pelo painel do Mercado Pago. O webhook marca o pedido como `refunded` (ou
`charged_back`) e queima os links. Se o webhook não chegar, nada marca o pedido: o `verify-payment`
não trata estorno e a aba Pedidos não altera status.

**Cobrança duplicada.** Conferir no Mercado Pago dois pagamentos para o mesmo `external_reference`
(o `order_code`). A idempotência impede tokens em dobro, não o segundo pagamento: estornar um deles
no Mercado Pago.

**Cliente nunca recebeu o e-mail de senha.** Conferir o SMTP do Supabase Auth e se o e-mail existe
em `auth.users`. Em último caso, definir senha temporária pela Admin API:

```bash
curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/<uid>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"<senha temporária forte>"}'
```

**Cupom expirou entre o abandono e a volta.** O servidor recalcula e o pedido segue sem o
desconto; a tela não sugere alternativa.

**Professora não consegue entrar com Google.** 401 "não cadastrada como professor(a)": a conta é de
cliente — promover em "Professores e clientes". 403: é conta da administração, que entra com
senha e código.
