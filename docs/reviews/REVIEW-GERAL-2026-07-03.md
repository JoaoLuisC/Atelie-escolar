> ## 📅 Retrato histórico — 03/07/2026
>
> O mais antigo dos relatórios, anterior a toda a série de correções de 2026.
> **A maior parte dos achados foi corrigida.** Este documento não se atualiza —
> ele é o retrato do dia. Estado atual: [CONTRIBUTING.md](../../CONTRIBUTING.md).

# Review Geral Consolidado — Ateliê da Escola

**Data:** 2026-07-03 · **Modo:** read-only (nenhum arquivo de código alterado) · **Método:** 5 auditorias paralelas (segurança, performance, frontend/UX/a11y, qualidade/arquitetura, testes/DevOps) com reconciliação e deduplicação manual. Achados marcados **[verificado]** foram confirmados diretamente no código durante a consolidação.

> Fato estrutural que amplifica vários achados: em produção o `vercel.json` roteia `/api/*` direto para as funções serverless. **`server.js` e `routes/*` não rodam em produção** — logo, nenhum middleware do Express (rate limiting, `helmet`/CSP, body-limit, error handler) existe em prod. Cada handler serverless precisa se proteger sozinho.

---

## Sumário executivo

| Severidade | Qtde | Destaques                                                                                                                               |
| ---------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 Crítico | 3    | Segredos de produção vazados no git (PATs Supabase + token MP + Firebase)                                                               |
| 🟠 Alto    | 16   | Rate limiting e headers de segurança ausentes em prod · 9 vulns npm · login admin 2FA quebrado · N+1 no checkout · cron estoura timeout |
| 🟡 Médio   | ~30  | Oráculos de auth · CDN sem SWR · a11y de modais · god-components · envelope de erro inconsistente                                       |
| 🔵 Baixo   | ~25  | Acentuação · headings · logging · classificação de deps                                                                                 |

**Ações imediatas (hoje):** rotacionar os segredos vazados (item C-1/C-2) — o resto do review pode esperar, isto não. Depois: `npm audit fix`, commitar o lockfile, criar gate de testes na CI.

**O que já está bem feito** (não regredir): correções de pagamento/webhook/RLS das rodadas anteriores estão intactas e verificadas; cookies de sessão com flags corretas; comparações timing-safe em todos os segredos; sem IDOR nos pedidos/downloads; LGPD real no delete-account; rotas públicas com `React.lazy`; SEO/JSON-LD sólido; consentimento LGPD fazendo gating de GA4/Pixel. Detalhe na seção final.

---

## 🔴 CRÍTICO — rotacionar segredos agora

### C-1. PATs do Supabase commitados em `HANDOFF.md` (arquivo versionado hoje) **[verificado]**

`HANDOFF.md` está trackeado no git e contém **3 Personal Access Tokens** `sbp_…` reais (44+ caracteres), inclusive num exemplo `curl -H "Authorization: Bearer sbp_…"`. Um PAT dá acesso à **Management API de toda a conta Supabase** (todos os projetos). O próprio arquivo admite "está vazado — ROTACIONAR", mas o token continua lá.
**Ação:** revogar os 3 PATs no dashboard Supabase → remover do arquivo → `git filter-repo` para expurgar do histórico.

### C-2. Segredos de produção no histórico do git (`.env.production` / `.env.test`) **[verificado]**

O commit `1eab297` adicionou `.env.production` com valores **reais de produção**: `MERCADOPAGO_ACCESS_TOKEN=APP_USR-…` (token de produção do MP — acesso a cobranças reais), `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET` e `FIREBASE_PRIVATE_KEY`. Um commit posterior os deletou, mas **seguem recuperáveis** (`git show 1eab297:.env.production`).
**Ação:** rotacionar TODOS esses segredos (o token MP de produção é o mais urgente) → expurgar do histórico. Estado atual OK: `.gitignore` cobre `.env*` e nenhum `.env` está trackeado hoje — o problema é só o histórico.

### C-3. Migrations de segurança com timestamp duplicado bloqueiam o `db push` **[verificado]**

Existem dois arquivos `supabase/migrations/20260701000000_*.sql` (`phase5_audit_immutability` e `phase5_payment_hardening`) com o **mesmo timestamp de 14 dígitos**, que a CLI do Supabase usa como PK em `schema_migrations`. A ordem de aplicação fica indefinida e o `supabase db push` pode falhar ou registrar só uma — justamente as migrations que aplicam `UNIQUE(order_id, product_id)`, `increment_coupon_usage` atômica e imutabilidade de auditoria (as correções de segurança das rodadas anteriores). Se essas migrations ainda não foram aplicadas em produção, as correções de pagamento estão **incompletas em prod**.
**Ação:** renomear uma para `20260701000001_…` e confirmar que ambas foram aplicadas em produção.

---

## 🟠 ALTO

### Segurança & Infra

**A-1. Rate limiting inexistente em produção** _(segurança + devops)_
Todos os limiters (`authLimiter`, `verifyPaymentLimiter`, etc.) vivem em `server.js`/`routes/*`, que não rodam na Vercel. Grep por rate-limit em `api/` = zero. Em produção ficam **ilimitados**: `admin-login` (brute-force de senha/TOTP), `verify-payment` (PII + tokens de download), `subscribe`/`abandoned-cart`/`validate-coupon`/`track-event` (enumeração de cupom, inflação de tabelas, disparo de e-mail em massa). Correção: limiter na borda (Vercel Middleware + Upstash/KV) por IP+rota, ou Vercel WAF.

**A-2. Sem headers de segurança em produção (CSP/HSTS/X-Frame-Options)** _(devops)_
`vercel.json` não tem seção `headers`. O `lib/security-headers.js` (helmet + CSP, com 8 testes passando) só é usado pelo Express dev. A SPA e as funções vão para produção **sem nenhum header de segurança**. Correção: adicionar bloco `headers` no `vercel.json` reaproveitando as diretivas já testadas.

**A-3. 9 vulnerabilidades npm em produção (4 HIGH)** _(devops)_
`npm audit --omit=dev`: **nodemailer 8.0.5** (CRLF injection em headers, leitura arbitrária de arquivo + SSRF, TLS mal validado → fix 9.0.3), **react-router 7.14** (deserialização turbo-stream, open-redirect `//`, CSRF, DoS → fix 7.18.1), **ws** (memory disclosure/DoS). O e-commerce **envia e-mail transacional com o nodemailer vulnerável hoje**. Quase tudo resolve com `npm audit fix` (sem `--force`).

**A-4. `package-lock.json` no `.gitignore` → build não-reproduzível e CI quebrado** _(devops)_ **[verificado]**
O lockfile não é trackeado (confirmado). A Vercel resolve ranges `^` na hora do deploy (o build de produção pode mudar sem commit), e o `lighthouse.yml` (`npm ci` + `cache:npm`) **falha em todo push** por falta de lockfile. Correção: remover a linha do `.gitignore` e commitar o lockfile.

**A-5. Sem gate de testes na CI** _(devops + qualidade)_
Só existem `lighthouse.yml` (quebrado pelo A-4) e `email-cron.yml`. `npm test`/`npm run check` não rodam em lugar nenhum; a Vercel roda só `vite build`. Os 110 testes (12 arquivos, todos passando) só rodam localmente. Qualquer regressão de pagamento/auth chega a `main` sem alarme. Correção: `test.yml` com `npm ci && npm run check` em PR/push, como required check.

**A-6. `admin-settings` GET vaza o segredo do 2FA** _(segurança)_ **[verificado]**
`api/admin-settings.js:107-108` faz `readSetting('adminConfig')` e devolve `{ value }` **bruto**, incluindo `totpSecret` e `fallbackPin`. Qualquer sessão admin (ou um XSS no painel, ou cache/histórico do browser) exfiltra o segredo TOTP, anulando o segundo fator. Correção: no GET, retornar só flags (`has2FA`, `hasPin`) e nunca os segredos.

### Correção / Bugs

**A-7. Login admin com 2FA está quebrado (TypeError garantido)** _(frontend)_ **[verificado]**
`src/providers/AuthProvider.jsx:84-86` chama `await loginAdmin(credentials)` mas **não retorna** o resultado e seta `setAdminAuthenticated(true)` incondicionalmente. Em `AdminLoginPage.jsx:53`, `const data = await loginAdmin(...)` recebe `undefined` → `data.requiresSecondFactor` lança TypeError. Resultado: admin com 2FA vê toast de erro e é marcado autenticado sem cookie → cascata de 401. Correção (~5 linhas): `return await loginAdmin(credentials)` e só autenticar quando `!data.requiresSecondFactor`.

**A-8. `window.open` do pagamento é bloqueável, sem fallback** _(frontend)_
`src/pages/CheckoutPage.jsx:232` abre a URL do MP após o `await fetch`, fora da ativação de gesto (Safari/iOS bloqueia). Se bloqueado, a UI diz "finalize pela aba que abrimos" mas nenhuma aba existe e a URL nunca é mostrada — **o cliente não consegue pagar**. Correção: renderizar sempre um link/botão visível com `paymentUrl`.

**A-9. Checkout trava por até 10 min sem opção de cancelar** _(frontend)_
`CheckoutPage.jsx:106-121` só libera `processing` quando o polling aprova/rejeita ou estoura ~10 min. Fechar a aba do MP sem pagar deixa inputs/cupom/botão desabilitados sem saída além de recarregar. Correção: botão "Cancelar e tentar de novo" que zera `pendingOrderId`/`processing`.

### Performance

**A-10. N+1 duplo no checkout (caminho mais crítico do negócio)** _(performance)_
`api/create-payment.js:87-126` faz um SELECT por item no loop, depois `:182-191` um INSERT por item em `order_items`. Carrinho de 10 itens ≈ 25 roundtrips sequenciais (2-4s de latência). Correção: 1 SELECT `id=in.(…)` + 1 INSERT em lote (o helper já aceita array).

**A-11. `admin-dashboard` baixa 7 tabelas inteiras sem `LIMIT` e agrega em JS** _(performance)_
`api/admin-dashboard.js:56-90` faz dump de products, categories, profiles, orders, order_items, download_logs e settings, e agrega em JS. Além do payload crescer sem teto, o **PostgREST corta em ~1000 linhas** → acima de 1000 pedidos os números do admin ficam **silenciosamente errados**. Agravado pelo refetch a cada troca de aba (A-14). Correção: agregações em SQL (RPC/view) + paginação.

**A-12. Catálogo público escaneia `orders` + `order_items` inteiros a cada MISS de CDN** _(performance)_
`api/products.js:34-60` (e `home-sections.js:135`) baixa todas as orders aprovadas e todos os order_items só para somar `soldCount` em JS. Custo cresce com as vendas e é pago a cada 5 min (expiração do CDN). Correção: RPC com `GROUP BY product_id` ou coluna denormalizada `sold_count` atualizada no webhook.

**A-13. Cron de e-mails sequencial sem `maxDuration` → estoura o timeout da Vercel** _(performance + devops)_
`api/cron-email-jobs.js` faz 5-8 queries + roundtrip SMTP (transporter novo por envio) por candidato, sequencial, com limites de 500 carrinhos + 500 pedidos por janela. `vercel.json` não define `functions.maxDuration` (default 10-15s) → o job é **cortado no meio** em qualquer volume real e a fila nunca esvazia (a idempotência evita duplicata, mas não conclui). Correção: `maxDuration` alto + processamento em batches com cursor + pré-carregar subscribers/sent_log da janela em lote.

### Testes

**A-14. Superfície de auth de cliente nasceu 100% sem teste** _(testes)_
Os 6 handlers `api/auth/customer/*` + `lib/customer-auth-handlers.js` + `lib/env-secret.js` não têm um único teste — mesmo padrão dos achados críticos TEST-01/02 (ainda abertos: `lib/admin-session.js`, `lib/customer-session.js`, `api/admin-login.js` com zero cobertura). Fluxo de dinheiro (create-payment/webhook/download) segue com 1 assert de borda cada. Correção: começar por `env-secret.test.js` (puro, trivial) e `customer-auth-handlers.test.js`.

### Qualidade

**A-15. God-components e handlers monolíticos** _(qualidade)_
`src/pages/AdminPage.jsx` (524 linhas, 18 `useState`, switch de 15 casos), `src/components/ProductWizard.jsx` (826 linhas, editores byte-idênticos duplicados 3×), `DashboardTab.jsx` (643), `AnalysisTab.jsx` (570), `cron-email-jobs.js` (374). O padrão certo já foi adotado em `lib/customer-auth-handlers.js` — falta replicar. Correção incremental: extrair hooks por domínio e sub-componentes.

**A-16. Envelope de erro em 3 formatos simultâneos** _(qualidade)_
9 handlers respondem `{error}`, 33 respondem `{success:false,error}`, e o formato aninhado `{success:false,error:{message,code}}` agora é código de produção via `api/_notfound.js:8` (o achatamento em `src/utils/api.js:7-13` virou obrigatório). Correção: helper `sendError/sendSuccess` padronizando no envelope aninhado.

---

## 🟡 MÉDIO

### Segurança

- **Oráculo de senha no admin-login** _(verificado)_ — `admin-login.js:221` responde 401 (credencial errada) vs `:235` 403 (senha certa, sem role). A diferença confirma a senha a um atacante → validador de credential-stuffing. Responder 401 genérico nos dois casos.
- **Enumeração de usuários** — `lib/customer-auth-handlers.js:88-90,121-122` revela "e-mail já cadastrado" (register) e distingue "não confirmado" de "senha incorreta" (login). Neutralizar as mensagens.
- **OAuth Google sem `state`/PKCE e `redirect` não validado** — `lib/customer-auth-handlers.js:195-216` propaga `req.query.redirect` sem checar same-site (open-redirect + login-CSRF). Gerar `state` em cookie e validar; rejeitar `redirect` que não comece por `/`.
- **`abandoned-cart` público gera e-mail para vítima arbitrária** — `api/abandoned-cart.js:33` grava qualquer `{email,items}` via service-role; o cron manda lembrete com nome de item semi-controlado. Exige rate limit + opt-in.
- **Sessão stateless sem revogação nem revalidação de role** — `lib/admin-session.js:129`/`customer-session.js:109` só validam assinatura+exp; admin rebaixado mantém acesso até 8h e "logout" não invalida token capturado. Considerar `token_version` em `profiles`.
- **`product-details` expõe produtos inativos/rascunho** — `api/product-details.js:38` não filtra `active=true` (ao contrário de `products.js:24`). Filtrar.
- **Segredos de sessão/cron/webhook não declarados no `vercel.json`** — `ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, `CRON_SECRET`, `SMTP_*` ausentes do bloco `env`; se faltarem no painel, auth/webhook/cron quebram silenciosamente (fail-closed). Documentar e validar no deploy.

### Performance & Banco

- **Faltam índices** — `orders (payment_status, completed_at)` (dashboards/KPIs/cohort/ABC/cron filtram por isso; só existe o single-column de baixa seletividade); `email_sent_log (email, kind, entity_id)` (dedup do cron faz seq-scan); `abandoned_carts (updated_at)`; opcional `orders (created_at desc)`.
- **`customer-orders` usa `ilike` que não bate o índice** — `api/customer-orders.js:65` faz seq-scan de orders a cada "meus pedidos"; causa raiz: `create-payment.js:168` grava e-mail sem lowercase. Normalizar no INSERT + trocar para `eq`.
- **Filtro `in.(…)` com milhares de UUIDs na URL** — `admin-abc-products.js:62` (até 10k ids → ~370KB de URL), `cross-sell.js:53`, `customer-orders.js:77`. Estoura o limite de URL quando o histórico crescer. Usar join/RPC no banco.
- **Listagens admin sem paginação** — `admin-orders.js` e `admin-users.js` baixam tudo e filtram/agregam em JS (distorcidos pelo cap de 1000). Filtrar na query + `range` + agregar em SQL.
- **CDN sem `stale-while-revalidate` nem ETag** — os 4 endpoints públicos cacheáveis têm `s-maxage=300` mas a cada expiração um usuário real paga o full-scan do A-12. Adicionar `stale-while-revalidate=3600` (4 linhas).
- **`api/__tests__/*.test.js` deployados como funções serverless** — o glob `api/**/*.js` do `vercel.json` inclui os testes (viram endpoints 500 expostos + consomem slots). Excluir do build.
- **Webhook faz N INSERTs de token sequenciais + provisioning inline** — `api/webhook.js:33-64,137` sob timeout de 10s; margem apertada. Insert em lote + provisioning best-effort assíncrono.

### Frontend / UX / A11y

- **Cupom não revalidado ao mudar o carrinho** — `CheckoutPage.jsx:248` mantém `appliedCoupon` após remover itens; desconto exibido pode divergir do cobrado. Limpar/revalidar em toda mudança de `cart`.
- **Convidado vira "logado" na UI** — `CheckoutPage.jsx:205` cria sessão client-side fake; header mostra "Meus produtos"/"Sair" sem sessão real. Guardar e-mail de convidado em estado separado.
- **Download navega na mesma aba; token expirado vira JSON cru** — `DownloadsPage.jsx:404`; sem tratamento de erro nem "gerar novo link". O path `/api` fixo ignora `getApiBaseUrl()` (quebra em dev). Fazer via fetch→blob com erro inline.
- **Erros de auth só em toast de 2,4s, sem validação inline** — `CustomerAuthPage.jsx:26-94`; some antes de ler, campos sem `required`/`aria-invalid`, requisitos de senha só no placeholder. Erro persistente inline + toast de erro mais longo.
- **Política de senha inconsistente** — reset aceita 6 chars (`ResetPasswordPage.jsx:88`), cadastro exige 8 + complexidade (`CustomerAuthPage.jsx:57`). Alinhar.
- **CartDrawer com `aria-modal` mas sem focus trap** — `CartDrawer.jsx:28-35`; Tab alcança a página atrás (aria-modal mente), foco não vai ao drawer nem retorna ao fechar. Implementar trap + gestão de foco.
- **Modais admin sem Esc/trap; ARIA inválida** — `ModalWizard.jsx:24-50` e `OrderDetailModal.jsx`; `<dialog open>` sem `showModal()`, `role="tablist"` sem `role="tab"`. Risco extra: Enter no input dispara submit e o wizard valida só o step 2 → salva produto incompleto.
- **Input de cupom sem label** — `CouponField.jsx:112` só placeholder. Adicionar `aria-label`.
- **Animações infinitas sem `prefers-reduced-motion`** — marquees/emojis em `HomePage.jsx` e `tailwind.config.js:51`. Guardar atrás de `motion-reduce:animate-none`.
- **Contraste abaixo de AA** — `text-slate-400` em textos de 11-12px (`DownloadsPage.jsx:298`, `Shell.jsx:181`); placeholders `text-white/70` sobre gradiente quase invisíveis. Usar slate-500+.
- **Redirect canônico duplica fetch e `view_item`** — `ProductDetailsPage.jsx:88-96` infla o funil 2× em links legados. Trackear só quando `canonicalSlug === slug`.
- **OG image e favicon não existem** — `SEO.jsx:6` aponta `og-default.png` (ausente do repo) e não há favicon; compartilhamentos em WhatsApp/Instagram (canal principal) saem sem preview. Subir os assets.
- **`prose` sem o plugin typography** — `LegalPages.jsx:17` usa `prose prose-slate` mas `@tailwindcss/typography` não está instalado; Política/Termos renderizam sem hierarquia. Instalar o plugin.
- **Inputs com 14px causam zoom no iOS** — todos os campos de checkout/login; usar 16px em mobile (`text-base sm:text-sm`).

### Qualidade / Arquitetura

- **Guard admin é boilerplate manual em 15 handlers** — sem `withAdminGuard`; divergências reais (OPTIONS 200 vs 204, ordem 405↔sessão). Handler novo pode esquecer o guard.
- **Validação sem rede de erro no serverless** — checagens de método fora do `try` (`products.js:8-14`) viram 500 genérico em prod vs tratado no Express. Criar `withErrorEnvelope`.
- **3 mecanismos de acesso ao Supabase** — `lib/supabase.js` (REST), `services/supabase-auth.js` (SDK) e `supabaseAuthRequest` cru em `lib/customer-auth-handlers.js:37`; env lida em 3 lugares. Consolidar.
- **Dependência handler→handler** — `create-payment.js:6` faz `require('./validate-coupon')`; regra de cupom mora num handler HTTP. Extrair `lib/coupons.js` (habilita o Zod, hoje sem nenhum consumidor vivo).
- **Cache TTL sobre `Map` replicado** em kpis/abc/cohort/funnel — e é inútil em serverless (zera a cada cold start). Extrair helper e/ou usar cache externo.
- **BFF morto** — `POST /produtos` e `GET /auth/me` (Express-only, sem consumidor no front) + `validation/payment.schemas.js` (100% órfão) + middleware exclusivo. Remover ou migrar o admin para eles.
- **Duas árvores de docs divergindo** — `docs/*.md` vs `docs/ProjectDocs/*.md`; `02-ARQUITETURA.md:38` afirma "rate-limit centralizado" (verdade só em dev — mascara o A-1). Consolidar.
- **Deps classificadas contra o runtime real** — `express`, `cors`, `helmet`, `express-rate-limit`, `dotenv`, `zod` em `dependencies` mas só usadas por código dev-only; `vercel` em devDeps sem script que o use. Reclassificar.

---

## 🔵 BAIXO (seleção)

- **Logout de cliente sem checagem de Origin** (CSRF de logout forçado; admin-logout já valida) — `api/auth/customer/logout.js`.
- **CORS admin reflete localhost em produção com credenciais** — `lib/admin-session.js:148`.
- **Erro de negócio como HTTP 200** — `validate-coupon.js:109` responde `200 {success:false}`; usar 422.
- **Logging sem padrão** — inglês+objeto (`products.js:96`) vs tag+message (`cron-email-jobs.js:371`).
- **Acentuação faltando em strings visíveis** _(frontend + qualidade)_ — "ja esta", "Nao foi possivel", "Sessao invalida", "Codigo invalido" em ~8 arquivos, inclusive código novo (`customer-auth-handlers.js`). Passa impressão de descuido em telas de dinheiro/senha.
- **Hierarquia de headings quebrada** — ProductDetails sem `h1`, Checkout começa em `h3`, footer salta para `h4`.
- **`defaultProps` em function component** (removido no React 19) — `StatusStepper.jsx:54`.
- **fetches sem cancelamento (race)** — `DownloadsPage.jsx:105-168` + `eslint-disable` decorativos (não há ESLint).
- **`inputClass` e CTA primário duplicados** com divergências em 4 páginas + 2 wizards — extrair `Button`/`Input` compartilhados.
- **bootstrap-icons via CDN de terceiro, render-blocking, sem preconnect** — `index.html:18`; se o CDN cair, todos os ícones somem. Auto-hospedar/subset ou SVG inline.
- **Imagens sem `srcset`/dimensões** — `ProductGrid.jsx:24` baixa a arte original em card de ~300px. Pipeline de thumbnail.
- **Colisão de nomes `admin-session.js`** (handler em `api/` vs lib em `lib/`) — renomear o handler.
- **Sem ESLint/Prettier** no projeto — nenhuma barreira de análise estática.
- **`CRON_SECRET` e outras envs ausentes do `.env.example`** — onboarding quebra o cron sem aviso.
- **Bootstrap de sessão em série** — `AuthProvider.jsx:28` encadeia `getAdminSession` + `fetchCustomerSession`; usar `Promise.all`.

---

## ✅ Verificado-OK (o que está sólido — não regredir)

- **Correções anteriores intactas:** webhook fail-closed sem fallback para access token (`mercadopago-config.js:112`); `UNIQUE(order_id,product_id)` + `increment_coupon_usage` atômica; trigger `profiles_guard_privileged_cols`.
- **Cookies de sessão** com `HttpOnly; SameSite=Strict; Secure` (prod) em admin e cliente.
- **Comparações timing-safe** com guarda de comprimento em toda verificação de segredo (sessão, TOTP, PIN, token de exclusão).
- **Sem IDOR:** `customer-orders` deriva e-mail da sessão; `download` faz claim atômico de uso único; `send-confirmation-email` só envia ao dono.
- **Sem mass-assignment:** `admin-users` restringe roles atribuíveis e bloqueia editar/excluir admin.
- **Sem XSS/header-injection em e-mails:** `email-templates.js` escapa todos os campos.
- **Sem injeção PostgREST:** filtros via `URLSearchParams` com operador `eq` controlado.
- **LGPD real** no delete-account (deleteUser + anonimização + limpeza de tokens + unsubscribe, com token E sessão do dono).
- **`track-event`** com allowlist de eventos + remoção de PII em qualquer profundidade.
- **Todos os 15 `admin-*`** chamam `ensureAdminSession` + CSRF por Origin/Referer.
- **Frontend:** rotas com `React.lazy` (AdminPage fora do bundle público), `manualChunks` configurado, SEO/canonical/JSON-LD, consentimento fazendo gating de GA4/Pixel, contexts memoizados sem re-render em árvore.
- **`routes/api-compat.routes.js`** é desenho correto: embrulha os mesmos handlers de `api/*`, sem duplicação de lógica.

---

## Plano de ação sugerido (ordem de custo-benefício)

1. **Hoje:** rotacionar segredos (C-1, C-2) e expurgar do histórico; renomear a migration duplicada e confirmar aplicação em prod (C-3).
2. **Esta semana (quick wins de alto impacto):** `npm audit fix` (A-3) · commitar lockfile (A-4) · corrigir login 2FA — 5 linhas (A-7) · redigir segredo no `admin-settings` GET (A-6) · seção `headers` no `vercel.json` (A-2) · excluir `api/__tests__` do deploy · `maxDuration` no cron (A-13).
3. **Curto prazo:** rate limiting na borda (A-1) · gate de testes na CI (A-5) · batch no checkout + tokens (A-10) · 3 índices no banco · fallback do `window.open` e botão cancelar no checkout (A-8, A-9).
4. **Médio prazo:** agregações do dashboard/catálogo em SQL (A-11, A-12) · testes de auth e sessão (A-14) · `state`/PKCE no OAuth · focus trap nos modais · helpers `sendError`/`withAdminGuard` (A-16) · extração dos god-components (A-15).
5. **Contínuo:** ESLint/Prettier · consolidar docs · sweep de acentuação · constantes de domínio compartilhadas.
