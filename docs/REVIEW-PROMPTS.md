# Prompts de Review — Ateliê da Escola

> Conjunto de prompts de revisão profunda, **um por área**. Cada prompt é
> **autossuficiente**: foi feito para ser colado numa **sessão nova do Claude Opus
> 4.8 com esforço de raciocínio no máximo**, e roda independente dos demais. O
> objetivo coletivo é cobrir **todo** o projeto sob lentes diferentes.
>
> Gerado a partir de uma leitura completa do repositório (React 19 + Vite no front;
> Express 5 + funções serverless `api/*.js` na Vercel; Supabase/Postgres + RLS;
> Mercado Pago; Nodemailer/Resend).

---

## Como usar

1. Abra **uma sessão nova** para cada área (contextos isolados evitam contaminação
   de conclusões entre áreas).
2. Configure o modelo **Opus 4.8** e **esforço máximo** (`/model` + raciocínio
   estendido / "max effort").
3. Cole o bloco de prompt da área inteiro (já contém as diretrizes padrão).
4. Os reviews são **read-only por padrão**: o revisor analisa e reporta, **não
   altera código** a menos que você peça explicitamente um modo `--fix`.
5. Rode as áreas em paralelo (sessões/abas diferentes) ou em sequência. Sugestão de
   ordem por risco: **1 → 2 → 3 → 7 → 4 → 6 → 5 → 8 → 9 → 10**.

### Diretrizes padrão (já embutidas em cada prompt)

- **Modelo/esforço:** Opus 4.8, esforço de raciocínio no máximo. Pense a fundo antes
  de concluir.
- **Leia tudo no escopo:** abra **cada arquivo** listado no escopo da área, por
  inteiro — não amostre, não adivinhe. Siga imports/dependências quando relevante.
- **Verifique, não confie:** os "pontos quentes" de cada prompt são **hipóteses a
  confirmar**, derivadas de uma leitura inicial. Confirme cada um no código atual
  (linhas podem ter mudado) e marque como confirmado / refutado / inconclusivo.
- **Sem alarme falso:** só reporte o que você consegue sustentar com referência
  `arquivo:linha`. Para cada achado, dê o **nível de confiança**.
- **Severidade:** `CRÍTICO` (exploração remota / perda de dados / fraude financeira)
  · `ALTO` · `MÉDIO` · `BAIXO` · `INFO`.

### Formato de saída (todas as áreas)

Para cada achado:

| Campo          | Conteúdo                                                      |
| -------------- | ------------------------------------------------------------- |
| **ID**         | `AREA-01`, `AREA-02`…                                         |
| **Severidade** | CRÍTICO / ALTO / MÉDIO / BAIXO / INFO                         |
| **Confiança**  | Alta / Média / Baixa                                          |
| **Local**      | `arquivo:linha` (um ou mais)                                  |
| **Problema**   | O que está errado, em 1–3 frases                              |
| **Impacto**    | O que um atacante/usuário/operador consegue fazer, ou o custo |
| **Repro/PoC**  | Passos ou trecho que demonstra (quando aplicável)             |
| **Correção**   | Recomendação concreta e mínima                                |

Feche com: **(a)** tabela-resumo ordenada por severidade; **(b)** os **3 itens mais
urgentes**; **(c)** o que ficou **inconclusivo** e por quê.

---

## Índice das áreas

1. [Pagamentos & Webhook (Mercado Pago)](#área-1--pagamentos--webhook-mercado-pago)
2. [Autenticação & Sessões](#área-2--autenticação--sessões)
3. [Banco de Dados & RLS (Supabase)](#área-3--banco-de-dados--rls-supabase)
4. [API Backend / Handlers Serverless](#área-4--api-backend--handlers-serverless)
5. [Frontend React (arquitetura, estado, performance)](#área-5--frontend-react)
6. [LGPD / Privacidade & Compliance](#área-6--lgpd--privacidade--compliance)
7. [Segurança de Aplicação / AppSec (OWASP)](#área-7--segurança-de-aplicação--appsec)
8. [Qualidade de Código & Arquitetura](#área-8--qualidade-de-código--arquitetura)
9. [Testes & Confiabilidade](#área-9--testes--confiabilidade)
10. [DevOps, Deploy & Configuração](#área-10--devops-deploy--configuração)

---

## Área 1 — Pagamentos & Webhook (Mercado Pago)

```text
PAPEL: Você é um revisor sênior de segurança de pagamentos. Modelo: Opus 4.8,
esforço de raciocínio NO MÁXIMO. Pense a fundo. Review READ-ONLY: relate, não
altere arquivos.

CONTEXTO: E-commerce de produtos digitais. Checkout via Mercado Pago (preference +
webhook). Preços/descontos devem ser calculados no servidor. Pós-pagamento gera
"download tokens" de uso único para baixar o arquivo do produto.

ESCOPO — leia CADA arquivo por inteiro:
- api/create-payment.js
- api/verify-payment.js
- api/webhook.js
- api/validate-coupon.js
- api/abandoned-cart.js
- api/download.js
- lib/mercadopago-config.js
- lib/storage-signed-url.js
- validation/payment.schemas.js
- routes/payment.routes.js
- api/__tests__/webhook-signature.test.js
- server.js (apenas a parte de rate limit / body parser / trust proxy)

O QUE AUDITAR:
1. Cálculo de total no servidor: o preço cobrado vem SEMPRE do banco, nunca do
   client? Quantidade, subtotal, desconto e total são recalculados server-side?
   Há como manipular preço, quantidade negativa, ou item inexistente?
2. Verificação de assinatura do webhook (HMAC-SHA256, manifest id/request-id/ts):
   correta? Comparação timing-safe? Há bypass por ambiente (ex.: NODE_ENV/APP_ENV
   == 'test')? Qual segredo é usado e há fallback para um segredo fraco/compartilhado?
3. Idempotência e corrida no webhook: dois webhooks para o mesmo pagamento geram
   tokens duplicados? O status do pedido é sobrescrito? Há checagem de estado
   anterior antes de marcar como aprovado/completo? Falta replay-protection (ts antigo)?
4. Download tokens: geração (entropia), expiração, e o "uso único" — a marcação de
   used=true é atômica (UPDATE ... WHERE used=false) ou há janela de corrida que
   permite baixar 2x? IDOR: dá para baixar token de outro pedido?
5. verify-payment: enumeração de pedidos (orderId + email), rate limiting, comparação
   de email timing-safe, vazamento de informação por mensagens/timings distintos.
6. Cupons: validação server-side (ativo, datas, max_uses, min_order, applies_to),
   incremento de used_count (corrida que fura o limite), desconto negativo/maior que
   o total, aplicação a itens não elegíveis.
7. Signed URL do Storage: TTL, exposição da service-role key, validação do path
   (path traversal / bucket errado).
8. Validação de entrada (zod) cobre todos os campos? Limites de tamanho de body?

PONTOS QUENTES (hipóteses a CONFIRMAR no código atual):
- Possível bypass de assinatura quando runtimeEnv === 'test' em api/webhook.js.
- Fallback de WEBHOOK_SECRET para MERCADOPAGO_ACCESS_TOKEN em lib/mercadopago-config.js.
- Update incondicional do pedido no webhook (sobrescreve completed_at; sem checar
  estado anterior).
- Marcação de download token como usado possivelmente NÃO atômica (check-then-update).
- /verify-payment sem rate limit dedicado; order_code com prefixo de timestamp.
- Incremento de coupon.used_count com corrida "tolerada" (read-modify-write).

Para cada item, classifique severidade, confiança e dê PoC quando der. Use o formato
de saída padrão (tabela por achado + resumo + top-3 + inconclusivos).
```

---

## Área 2 — Autenticação & Sessões

```text
PAPEL: Revisor sênior de IAM/AppSec. Modelo: Opus 4.8, esforço NO MÁXIMO. Pense a
fundo. Review READ-ONLY.

CONTEXTO: Dois mundos de auth. (a) ADMIN: e-mail/senha + 2FA opcional (TOTP/PIN);
sessão é cookie HMAC opaco `admin_session` (sub:'admin', sem identidade individual).
(b) CLIENTE: Supabase Auth (e-mail/senha + Google OAuth PKCE); o backend valida o
token e emite cookie HttpOnly `customer_session` (HMAC). Há um "dev bypass" do painel
admin controlado por env VITE_ALLOW_ADMIN_BYPASS.

ESCOPO — leia CADA arquivo por inteiro:
- lib/admin-session.js
- lib/customer-session.js
- lib/admin-audit.js
- api/admin-login.js
- api/admin-session.js
- api/admin-logout.js
- api/me-delete-account.js
- services/supabase-auth.js
- src/services/admin-auth.js
- src/services/customer-auth.js
- src/components/ProtectedRoute.jsx
- src/providers/AuthProvider.jsx
- middleware/auth.middleware.js
- routes/auth.routes.js
- routes/api-compat.routes.js (somente rate limiters e montagem dos endpoints auth/admin)

O QUE AUDITAR:
1. Geração/validação do token de sessão (HMAC): algoritmo, encoding, verificação de
   assinatura ANTES de parsear payload, checagem de exp, comparação timing-safe.
2. Segredos: há fallback hardcoded em dev (ex.: 'dev-admin-session-secret-change-me')?
   Em produção é obrigatório? Risco de vazar dev secret para prod.
3. Flags de cookie: HttpOnly, Secure (só em prod?), SameSite (Lax vs Strict), Path,
   Max-Age. Implicações de CSRF de cada escolha.
4. 2FA: TOTP (RFC 4226/6238) — janela de drift, comparação timing-safe, segredo do
   challenge, TTL do challenge token, nonce. PIN de fallback — força, brute force,
   rate limiting. É possível pular o segundo fator?
5. Dev bypass do painel (VITE_ALLOW_ADMIN_BYPASS): o backend continua exigindo sessão?
   O bypass é só de UI? O que acontece se vazar `true` para produção? Está no bundle?
6. CSRF: há tokens anti-CSRF? Ou depende de SameSite + CORS + checagem de Origin?
   Endpoints admin de escrita (POST/PUT/DELETE) estão protegidos contra CSRF?
7. Rate limiting de login (admin e cliente): janela, limite, skipSuccessfulRequests,
   chave por IP (e o trust proxy correto). Enumeração de usuário por mensagens.
8. Exclusão de conta LGPD (me-delete-account): token assinado, TTL, purpose, two-step;
   vaza token em dev (devConfirmUrl)? Anonimização vs hard delete.
9. Fluxo OAuth (PKCE) no client: troca de code, limpeza de URL, fixação de sessão,
   consumo do callback em AuthProvider.

PONTOS QUENTES (CONFIRMAR):
- Segredos de sessão com fallback fraco em dev (admin e customer).
- Secure flag só em produção; SameSite=Lax no admin (CSRF via navegação top-level?).
- Ausência de tokens CSRF dedicados em rotas admin de escrita.
- VITE_ALLOW_ADMIN_BYPASS no bundle do front; risco de configuração vazar p/ prod.
- devConfirmUrl expondo token de exclusão fora de produção.
- admin_session sem identidade individual → audit log atribui a 'admin' genérico.

Formato de saída padrão. Dê PoC/repro para CSRF, forja de sessão e bypass de 2FA.
```

---

## Área 3 — Banco de Dados & RLS (Supabase)

```text
PAPEL: Revisor sênior de Postgres/Supabase e modelagem de dados. Modelo: Opus 4.8,
esforço NO MÁXIMO. Pense a fundo. Review READ-ONLY.

CONTEXTO: Postgres no Supabase com RLS habilitado em todas as tabelas. Padrão de
segurança "service-role por default": tabelas sensíveis (security_events,
download_logs, download_tokens, admin_audit_log, coupons, settings, email_*) ficam
com RLS ON e ZERO policies = só a service-role acessa. Backend usa service-role key;
front usa anon key. Migrations versionadas por "phase".

ESCOPO — leia TODOS os .sql por inteiro:
- supabase/migrations/*.sql (todas as fases, em ordem cronológica)
- supabase/schema.sql, supabase/security-hardening.sql (se existirem)
- supabase/snippets/* (se existirem)
- lib/supabase.js
- services/supabase-auth.js
(consulte api/* só para confirmar qual chave — anon vs service-role — toca cada tabela)

O QUE AUDITAR:
1. Inventário de RLS por tabela: RLS habilitado? Quais policies (SELECT/INSERT/UPDATE/
   DELETE)? Quais tabelas são "service-role only" (RLS ON, sem policy)? Confirme que
   nenhuma sensível ficou SEM RLS por engano.
2. Policies permissivas demais: alguma policy com `using (true)` / `with check (true)`
   que permita um usuário ler/alterar dados de OUTRO usuário? (atenção especial a
   abandoned_carts UPDATE, page_views, analytics_events INSERT).
3. Vazamento cross-tenant: orders/order_items/user_products/profiles — a policy
   amarra corretamente em auth.uid() / jwt email? Há caminho para ver pedido alheio?
4. analytics_events: o client consegue gravar PII (customer_email, order_id)? O
   whitelist de event_name é aplicado no INSERT?
5. Triggers e funções: handle_new_user (cria profile no signup) está DEFINIDA e com
   trigger em auth.users? slugify/ensure_slug, set_updated_at, purge/cleanup de logs.
   SECURITY DEFINER com search_path fixo? Permissões revogadas de anon/authenticated?
6. pg_cron: jobs de retenção/limpeza existem e estão agendados? Cobrem todas as
   tabelas de log? (atenção a page_views e admin_audit_log sem purge).
7. Integridade referencial: FKs, ON DELETE (CASCADE/SET NULL/RESTRICT) coerentes com
   o fluxo LGPD (apagar auth.users → o que acontece com orders/profiles/user_products?).
8. Índices: FKs sem índice (varredura sequencial)? Atenção a order_items.product_id,
   download_logs.order_id, analytics_events.(product_id,order_id), user_products.*.
9. Constraints: CHECKs (ex.: role UPPERCASE, discount_type), UNIQUE, NOT NULL —
   divergências entre schema.sql e as migrations.

PONTOS QUENTES (CONFIRMAR):
- Policy de UPDATE de abandoned_carts possivelmente `using(true)` → edição cross-user.
- handle_new_user referenciada mas talvez não definida no SQL versionado.
- Faltam índices em várias FKs (lista acima).
- Tabelas sem política de retenção: page_views, admin_audit_log, email_subscribers
  (unconfirmed) crescem sem limite.
- Divergências schema.sql × migrations (ex.: abandoned_carts.email NOT NULL).

Para cada policy citada, mostre o SQL e explique o caminho de exploração. Formato
de saída padrão.
```

---

## Área 4 — API Backend / Handlers Serverless

```text
PAPEL: Revisor sênior de backend Node. Modelo: Opus 4.8, esforço NO MÁXIMO. Pense a
fundo. Review READ-ONLY.

CONTEXTO: Cada endpoint é um arquivo em api/*.js (handler estilo Vercel
(req,res)=>...). Rodam tanto na Vercel quanto no Express local, montados por
routes/*.js (api-compat.routes.js monta quase tudo). lib/* concentra lógica
reutilizável. Foco: corretude, consistência, robustez e paridade Vercel↔Express.

ESCOPO:
- TODOS os arquivos em api/ que NÃO sejam de pagamento/auth (esses têm reviews
  próprios). Inclua: products.js, product-details.js, home-sections.js, cross-sell.js,
  customer-orders.js, track-event.js, subscribe.js, confirm-subscription.js,
  unsubscribe.js, send-confirmation-email.js, cron-email-jobs.js, sitemap.xml.js,
  admin-dashboard.js, admin-products.js, admin-categories.js, admin-coupons.js,
  admin-orders.js, admin-users.js, admin-settings.js, admin-upload-url.js,
  admin-funnel.js, admin-segments.js, admin-kpis.js, admin-cohort.js,
  admin-abc-products.js, admin-abc-customers.js, admin-cleanup-events.js,
  admin-login/logout/session (só a parte de roteamento), download.js.
- routes/*.js (todas), middleware/*.js (auth, error, validate), utils/app-error.js
- lib/supabase.js, lib/email-sender.js, lib/email-templates.js, lib/analytics-events.js,
  lib/abc-classification.js, lib/customer-segmentation.js, lib/security-logger.js
- vercel.json (mapeamento de rotas) e server.js (montagem Express)

O QUE AUDITAR:
1. Paridade Vercel↔Express: toda rota servida na Vercel está montada no Express e
   vice-versa? vercel.json bate com routes/*.js? Algum endpoint órfão/duplicado?
2. AuthN/AuthZ por endpoint: TODO endpoint admin chama ensureAdminSession ANTES de
   qualquer efeito colateral? Algum endpoint sensível sem checagem? Endpoints de
   cliente validam a sessão do dono dos dados (IDOR em customer-orders, download)?
3. Validação de entrada: query/body validados (zod/manual)? Coerção de tipos,
   limites, paginação (limit/offset sem teto?), ordenação por coluna controlada por
   client (SQL/PostgREST injection via `order`/`select`)?
4. Cron endpoints (cron-email-jobs, admin-cleanup-events): exigem CRON_SECRET? Podem
   ser disparados por terceiros? Idempotência.
5. Upload (admin-upload-url): validação de mimeType/kind, tamanho, geração de path
   sem colisão e sem path traversal, escopo do signed upload.
6. Tratamento de erro: erros viram status corretos (400 vs 500), sem vazar stack/SQL/
   segredos ao client; error.middleware uniformiza; logs não vazam PII.
7. Consistência de respostas (envelope {success,...}), códigos HTTP, headers CORS por
   endpoint admin (setAdminCorsHeaders), tratamento de OPTIONS/preflight.
8. Uso de service-role vs anon no backend: nunca expor service-role ao client; toda
   query que ignora RLS é intencional.
9. E-mail (subscribe/confirm/unsubscribe): double opt-in, tokens, SSRF/injeção em
   templates, rate limiting, header injection.

PONTOS QUENTES (CONFIRMAR):
- Endpoints admin recém-adicionados (admin-coupons) podem não ter o mesmo guard/
  audit dos demais.
- Ordenação/seleção dinâmica vinda do client em queries PostgREST.
- Cron endpoints sem segredo, expostos publicamente.
- Divergências entre vercel.json e routes/api-compat.routes.js.

Formato de saída padrão. Faça uma TABELA "endpoint × auth × validação × audit log"
cobrindo todos os api/*.
```

---

## Área 5 — Frontend React

```text
PAPEL: Revisor sênior de frontend React. Modelo: Opus 4.8, esforço NO MÁXIMO. Pense a
fundo. Review READ-ONLY.

CONTEXTO: React 19 + Vite + Tailwind. Sem TypeScript (JS + PropTypes). Estado via
Context (Auth/Cart/Toast), sem Redux. Rotas lazy. Painel admin com 14 tabs + wizards.
Fetch via wrapper próprio (src/utils/api.js). Carrinho persistido em localStorage.

ESCOPO:
- src/main.jsx, src/App.jsx, src/constants/routes.js
- src/providers/* (Auth, Cart, Toast)
- src/hooks/* (useAuth, useCart, useProductFilters, useToast)
- src/utils/* (api, analytics, attribution, cart-storage, consent, csv-export, currency)
- src/services/* (products, admin-panel, admin-products, customer-auth, admin-auth,
  supabase-browser)
- src/components/*.jsx (Shell, CartDrawer, ProductGrid, ProductWizard, CouponWizard,
  ModalWizard, ErrorBoundary, ProtectedRoute, SEO, ConsentBanner, etc.)
- src/components/admin/** (tabs, ui, utils)
- src/pages/*.jsx (Home, Products, ProductDetails, Checkout, CustomerAuth, Admin,
  Downloads, ResetPassword, Subscription, Legal, NotFound)

O QUE AUDITAR:
1. Arquitetura de estado: limites de Context corretos? Re-renders excessivos (valor de
   context sem useMemo, callbacks sem useCallback)? Estado derivado caro recalculado.
2. Performance: listas grandes sem virtualização (catálogo 200+ itens); componentes
   reusados sem React.memo (ProductCard); imagens sem lazy/sizes; bundle do admin no
   caminho crítico; localStorage escrito sem debounce a cada mudança de carrinho.
3. Data fetching: tratamento de loading/erro consistente; cancelamento (AbortController/
   isMounted) para evitar setState após unmount; ausência de retry; race entre
   requisições; estados vazios.
4. Formulários: uso (parcial) de react-hook-form vs validação manual; zod está nas
   deps mas é usado no front? Mensagens de erro, acessibilidade dos campos, duplo
   submit, validação client espelha a do servidor?
5. Acessibilidade: foco/focus-trap em modais e drawer (CartDrawer, ModalWizard),
   Escape, aria-* , navegação por teclado, contraste, indicadores só por cor, alt de
   imagens, landmarks.
6. Segurança no client: nenhum segredo além de VITE_* públicos (anon key ok); XSS
   (dangerouslySetInnerHTML / innerHTML / JSON-LD); open redirect em pós-login/OAuth;
   dados sensíveis em localStorage; logs verbosos.
7. Consistência/UX: tratamento de offline/erro de rede, toasts, polling do checkout
   (limite de tentativas, cancelamento), feedback de upload (XHR progress).
8. Manutenibilidade: duplicação entre tabs, componentes gigantes (ProductWizard),
   PropTypes completos, dead code (ex.: componentes removidos referenciados).

PONTOS QUENTES (CONFIRMAR):
- ProductCard e listas do catálogo sem memo/virtualização.
- Escrita de localStorage do carrinho sem debounce.
- Falta de focus-trap em CartDrawer/modais.
- zod presente nas dependências, mas não usado no front (validação só manual).
- Polling de checkout (~150 tentativas) — cancelamento e limites.

Formato de saída padrão. Separe achados em: Correção (bug), Performance,
Acessibilidade, Segurança-client, Manutenibilidade.
```

---

## Área 6 — LGPD / Privacidade & Compliance

```text
PAPEL: Revisor de privacidade/DPO técnico (LGPD). Modelo: Opus 4.8, esforço NO
MÁXIMO. Pense a fundo. Review READ-ONLY.

CONTEXTO: Loja brasileira; coleta e-mail, CPF, telefone, endereço, IP, user-agent,
UTMs. Há consentimento de cookies/marketing, analytics first-party, newsletter com
double opt-in, e exclusão de conta (direito ao esquecimento). Retenção de logs via
pg_cron. Trata-se de conformidade com a LGPD (Lei 13.709/2018).

ESCOPO:
- src/utils/consent.js, src/components/ConsentBanner.jsx
- src/utils/analytics.js, src/utils/attribution.js, api/track-event.js,
  lib/analytics-events.js
- api/me-delete-account.js (fluxo de exclusão/anonimização)
- api/subscribe.js, confirm-subscription.js, unsubscribe.js (double opt-in)
- supabase/migrations/*.sql (retenção/purge, colunas de PII, anonimização)
- src/pages/LegalPages.jsx (política de privacidade/termos)
- docs/SECURITY.md, docs/ProjectDocs/08-SEGURANCA.md, 10-MARKETING-ANALYTICS.md,
  11-REGRAS-NEGOCIO.md
- lib/security-logger.js, lib/admin-audit.js (PII em logs)

O QUE AUDITAR:
1. Base legal e consentimento: marketing/analytics só disparam APÓS consentimento?
   O banner permite recusar tão fácil quanto aceitar? Versão da política força
   re-consentimento? Consentimento é registrado/auditável?
2. Minimização: coleta-se só o necessário? PII (email/cpf/telefone) vaza para
   analytics_events, GA4, Meta Pixel, logs, ou para o client? IP é anonimizado?
3. Direito ao esquecimento: exclusão de conta realmente apaga/anonimiza em TODAS as
   tabelas (orders, order_items, user_products, download_logs, abandoned_carts,
   email_subscribers, analytics)? Hard delete vs anonimização — sobra PII em algum
   lugar? Tokens/sessões revogados?
4. Retenção: cada tabela com PII tem prazo e purge automático? page_views,
   admin_audit_log, email_subscribers (unconfirmed) têm retenção? Prazos coerentes e
   documentados?
5. Portabilidade/acesso: existe forma de o titular exportar/ver os próprios dados?
6. Compartilhamento com terceiros: GA4, Meta Pixel, Mercado Pago, Resend, Supabase —
   estão na política? Transferência internacional mencionada?
7. Segurança de PII: CPF/telefone em claro no banco — criptografia/tokenização? PII
   em logs (security_events, audit, console)?
8. Documentos legais: política de privacidade e termos existem, são acessíveis, e
   batem com a coleta real? Contato do encarregado/DPO?

PONTOS QUENTES (CONFIRMAR):
- IP/user-agent armazenados sem anonimização (download_logs, page_views,
  security_events).
- page_views e admin_audit_log sem política de retenção.
- Cobertura da anonimização no me-delete-account (todas as tabelas?).
- Política de privacidade x coleta real (terceiros, prazos) podem estar dessincronizadas.

Formato de saída padrão. Mapeie um "inventário de dados pessoais": dado × onde é
coletado × onde é armazenado × base legal × retenção × como é apagado.
```

---

## Área 7 — Segurança de Aplicação / AppSec

```text
PAPEL: Pentester/AppSec sênior fazendo threat modeling do sistema inteiro. Modelo:
Opus 4.8, esforço NO MÁXIMO. Pense a fundo como atacante. Review READ-ONLY.

CONTEXTO: É a lente de segurança TRANSVERSAL (complementa, sem repetir em detalhe, as
áreas 1/2/3). Foco em OWASP Top 10, configuração de borda, segredos e superfície de
ataque ponta a ponta. Stack: Express 5 + Vercel functions, Supabase, Mercado Pago.

ESCOPO:
- server.js (CORS, helmet, rate limit, body limit, trust proxy)
- lib/security-headers.js (CSP, HSTS, frame-ancestors, etc.)
- lib/security-logger.js, lib/admin-audit.js
- middleware/* (auth, error, validate)
- vercel.json (headers, rewrites, funções)
- .env.example, .env.local.template, .env.production, .env.test (NÃO leia segredos
  reais; avalie quais variáveis existem e se há segredos comitados por engano)
- .gitignore (segredos/artefatos ignorados?)
- HANDOFF.md e qualquer doc — procure por SEGREDOS VAZADOS em texto (PATs, tokens,
  senhas, service-role keys).
- Varredura ampla por padrões: process.env, crypto, child_process, fetch/axios para
  hosts externos, console.log de dados sensíveis, eval/Function.

O QUE AUDITAR (OWASP + infra):
1. Gestão de segredos: há segredos commitados (PAT do Supabase, service-role,
   MERCADOPAGO_ACCESS_TOKEN, senhas) em .env*, docs, HANDOFF.md, código ou histórico?
   Liste-os e marque para ROTAÇÃO. Front expõe só VITE_* públicos?
2. CORS: configuração default libera qualquer localhost; o modo '*' + credentials é
   tratado? Em prod, a allowlist é estrita? Reflexão de Origin perigosa?
3. CSP/headers: CSP cobre script/style/connect/frame? 'unsafe-inline' justificado?
   HSTS/preload em prod? frame-ancestors none? x-powered-by off?
4. Rate limiting: cobertura (global, auth, login, endpoints caros/cron), chave por IP
   correta com trust proxy=1, bypass via header forjado.
5. Injeção: SQL/PostgREST (order/select/filter dinâmicos), command injection, SSRF
   (fetch para URL controlada — webhooks, signed URL, e-mail), path traversal
   (download, upload, storage).
6. Superfície: endpoints não autenticados que disparam efeito/custo (e-mail, cron,
   analytics), enumeração (pedidos, cupons, usuários), DoS (body grande, regex,
   loops de polling).
7. Logging/monitoração: eventos de segurança registrados, alertas (webhook
   Slack/Discord/Sentry), PII redigida, sem vazar em erro 500.
8. Dependências: versões com CVE conhecido (express 5, supabase-js, mercadopago,
   nodemailer); npm audit conceitual.

PONTOS QUENTES (CONFIRMAR):
- HANDOFF.md contém PATs do Supabase e credenciais de admin/clientes em texto claro —
  confirmar e exigir rotação + remoção do histórico git.
- .env reais versionados? Conferir .gitignore e git ls-files.
- CORS default (qualquer localhost) e tratamento de '*' com credentials.
- trust proxy=1 vs spoofing de X-Forwarded-For fora da Vercel.

Formato de saída padrão. Inclua uma seção "SEGREDOS A ROTACIONAR JÁ" no topo se achar
algum. Modele as 5 principais cadeias de ataque ponta a ponta.
```

---

## Área 8 — Qualidade de Código & Arquitetura

```text
PAPEL: Arquiteto/tech lead revisando manutenibilidade. Modelo: Opus 4.8, esforço NO
MÁXIMO. Pense a fundo. Review READ-ONLY.

CONTEXTO: Projeto cresceu em "fases". Mesmo handler roda em Vercel e Express
(api/* + routes/*). Front sem TS. Há docs extensos em docs/ProjectDocs e um HANDOFF.md
que diz que parte das mudanças recentes (cupons, upload) não foi totalmente auditada.

ESCOPO (amostragem ampla + pontos estruturais):
- Estrutura geral: api/, lib/, routes/, middleware/, services/, validation/, utils/,
  src/ — coerência de camadas e responsabilidades.
- Duplicação: lógica repetida entre api/* e lib/*; entre tabs do admin; sanitização de
  atribuição/PII repetida (create-payment vs abandoned-cart vs analytics); parsing de
  cookies; envelopes de resposta.
- Componentes gigantes: src/components/ProductWizard.jsx, AdminPage.jsx,
  useProductFilters.js — coesão, tamanho, testabilidade.
- Consistência: convenções de nome, padrão de erro (utils/app-error.js usado em todo
  lugar?), idioma (pt/en misturados), estilo de export, async/await vs promises.
- Dead code / inconsistência doc×código: itens do HANDOFF.md e docs/13-ROADMAP-
  PENDENCIAS.md ainda válidos? Referências a arquivos removidos (ex.: TrustBadgeRow)?
- Configs: package.json scripts, vite.config.js, tailwind.config.js, lighthouserc.json
  — coerência e itens obsoletos.

O QUE AUDITAR:
1. Aderência à arquitetura descrita em docs/ARCHITECTURE.md e 02-ARQUITETURA.md — o
   código bate com a doc? Onde divergiu?
2. Acoplamento/coesão entre camadas; vazamento de responsabilidade (ex.: lógica de
   negócio em handler vs lib).
3. Duplicação significativa (DRY) e oportunidades de extração para lib/ compartilhada.
4. Tratamento de erro uniforme e previsível em todo o backend.
5. Legibilidade: funções longas, aninhamento profundo, nomes, comentários úteis vs
   ruído, números mágicos.
6. Gestão de dependências: libs não usadas (zod no front?), libs redundantes.
7. Riscos de manutenção apontados no próprio HANDOFF (cupons/upload não auditados,
   pendências) — confirmar estado atual.
8. TODO/FIXME/HACK e código comentado.

Formato de saída padrão (mas severidade aqui = "dívida técnica": ALTO = trava evolução
ou esconde bugs; MÉDIO = atrito recorrente; BAIXO = cosmético). Entregue também um
"top 5 refactors de maior alavancagem" com esforço estimado (P/M/G).
```

---

## Área 9 — Testes & Confiabilidade

```text
PAPEL: Engenheiro de qualidade/SDET sênior. Modelo: Opus 4.8, esforço NO MÁXIMO.
Pense a fundo. Review READ-ONLY.

CONTEXTO: Testes com Vitest (+ Testing Library, jsdom). Há ~12 arquivos de teste
espalhados (api/__tests__, lib/__tests__, validation/__tests__, src/**/__tests__).
CI no GitHub Actions. Funções de pagamento, auth e RLS são as de maior risco.

ESCOPO:
- TODOS os arquivos *.test.* do repo (api/__tests__, lib/__tests__,
  validation/__tests__, src/pages/__tests__, src/utils/__tests__, etc.)
- src/test/setupTests.js, vitest config (vite.config.js / package.json)
- .github/workflows/* (pipelines de teste/lint/build), lighthouserc.json
- package.json (scripts test/check)
- Para medir COBERTURA conceitual: cruze os testes existentes com os módulos de
  maior risco (api/webhook, create-payment, verify-payment, download, validate-coupon,
  lib/admin-session, lib/customer-session, lib/mercadopago-config, RLS).

O QUE AUDITAR:
1. Cobertura por risco: os caminhos críticos (assinatura de webhook, idempotência,
   cálculo de total/desconto, uso único de token, validação de sessão/HMAC, 2FA,
   policies RLS) têm teste? Onde estão os maiores buracos?
2. Qualidade dos testes: testam comportamento real ou só "passa fumaça"? Asserções
   significativas? Casos de borda e caminho de erro, não só o feliz?
3. Determinismo: dependência de relógio (Date.now), rede real, ordem de execução,
   estado compartilhado, flakiness. Mocks corretos do Supabase/MP/SMTP?
4. Testes de segurança: existem testes que travam regressões (ex.: rejeitar
   assinatura inválida, bloquear bypass, negar acesso cross-user)?
5. Frontend: componentes/hooks críticos (cart, checkout, auth, useProductFilters)
   cobertos? Testes de acessibilidade?
6. CI: o pipeline roda testes + build + lint? Bloqueia merge? Há lint/format
   configurado (ESLint/Prettier)? Lighthouse CI no fluxo?
7. Estratégia: falta pirâmide (unit/integração/e2e)? Vale propor testes de integração
   para o fluxo de compra ponta a ponta?

PONTOS QUENTES (CONFIRMAR):
- Webhook tem teste de assinatura; mas idempotência/corrida e download token único
  podem não ter cobertura.
- RLS policies provavelmente sem teste automatizado.
- Possível ausência de ESLint/Prettier no projeto.

Formato de saída padrão. Entregue: (a) matriz "módulo crítico × tem teste? × qualidade";
(b) os 10 testes ausentes de maior valor, já redigidos como descrição de caso
(Arrange/Act/Assert).
```

---

## Área 10 — DevOps, Deploy & Configuração

```text
PAPEL: Engenheiro de plataforma/DevOps sênior. Modelo: Opus 4.8, esforço NO MÁXIMO.
Pense a fundo. Review READ-ONLY.

CONTEXTO: Deploy na Vercel (funções api/*.js). Dev local com Express (server.js) +
Vite (concurrently). Supabase gerenciado (migrations via CLI). pg_cron + GitHub
Actions para jobs de e-mail/limpeza. Múltiplos arquivos .env por ambiente.

ESCOPO:
- vercel.json (rotas, funções, headers, regions, crons)
- server.js (boot, validação de segredos obrigatórios em prod, portas)
- package.json (scripts dev/build/test/supabase), vite.config.js, postcss/tailwind
  config, lighthouserc.json, index.html
- .env.example, .env.local.template, .env.production, .env.test (estrutura, NÃO
  segredos) — completude e consistência das variáveis exigidas
- .github/workflows/* (CI/CD, cron de e-mail, lighthouse) e .github/appmod/*
- supabase/ (fluxo de migrations, ordem, idempotência; pg_cron precisa de extensão)
- docs/12-DEPLOY-OPERACAO.md, docs/RELEASE-CHECKLIST.md, docs/SETUP.md,
  docs/SUPABASE-SETUP.md, scripts/*

O QUE AUDITAR:
1. Boot/validação de ambiente: server.js exige os segredos certos em prod (lista
   REQUIRED_PRODUCTION_SECRETS completa?) e falha cedo? APP_URL https enforcado?
2. Paridade dev↔prod: o que roda no Express local mas não na Vercel (e vice-versa)?
   sitemap, crons, headers — consistentes entre server.js e vercel.json?
3. Variáveis de ambiente: todo segredo usado no código está documentado em algum
   .env.example/template? Variáveis órfãs ou faltando? Defaults perigosos.
4. CI/CD: workflows rodam test+build, falham o deploy em erro, protegem branch?
   Secrets do Actions (CRON_SECRET etc.) referenciados corretamente? Permissões
   mínimas dos jobs?
5. Crons: GitHub Actions cron + pg_cron — duplicidade ou lacuna? CRON_SECRET valida o
   chamador? Timezone/cadência corretas? Falha silenciosa?
6. Migrations: ordem cronológica consistente, idempotentes (IF NOT EXISTS),
   reversíveis? pg_cron/extensões habilitadas via migration? Risco de aplicar fora de
   ordem.
7. Build/artefatos: dist/ e tcc-build/ versionados por engano? .gitignore adequado?
   Source maps expostos em prod? Tamanho de bundle.
8. Operação: healthcheck, observabilidade, rollback, runbook (RELEASE-CHECKLIST
   cobre o essencial?), backup do banco.

PONTOS QUENTES (CONFIRMAR):
- Artefatos buildados (dist/, tcc-build/) possivelmente versionados.
- Consistência entre rotas do server.js e vercel.json (ex.: sitemap, crons).
- Workflows de cron dependem de CRON_SECRET configurado no Actions.
- Completação dos .env.example frente às env vars realmente lidas no código.

Formato de saída padrão. Entregue um "checklist de prontidão para produção"
(go/no-go) com itens marcáveis.
```

---

## Cobertura — o que cada área cobre

| Camada do projeto                     | Áreas que a revisam |
| ------------------------------------- | ------------------- |
| `api/` pagamento/auth                 | 1, 2, 7             |
| `api/` demais handlers                | 4, 7                |
| `lib/` sessões/segurança              | 2, 7                |
| `lib/` pagamento/storage/email        | 1, 4                |
| `supabase/migrations` + RLS           | 3, 6                |
| `src/` (front + admin)                | 5, 6, 8             |
| `routes/`, `middleware/`, `server.js` | 4, 7, 10            |
| Privacidade/LGPD transversal          | 6                   |
| Segredos/config/deploy                | 7, 10               |
| Testes/CI                             | 9, 10               |
| Arquitetura/dívida técnica            | 8                   |

> Sobreposição entre áreas é intencional: cada uma olha o mesmo código sob uma lente
> diferente. Ao consolidar, deduplique achados que aparecerem em mais de uma área.
