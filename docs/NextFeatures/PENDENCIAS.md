# Pendências de execução

> Tudo que **ainda falta** para colocar o projeto em produção. Itens já entregues estão no histórico de [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md). Atualize aqui sempre que fechar um item.

**Como ler:**

- **§1-§2 são bloqueantes operacionais** — sem eles o que foi entregue não funciona em produção
- **§3 são decisões adiadas conscientemente** (prerender, WebP) e itens de polimento
- **§4 são tarefas de Fase 5/6** (mídia paga + otimização contínua)
- **§5 é segurança operacional** (rotação, pen-test, DKIM, etc.)
- **§6 é validação ponta-a-ponta** após deploy

---

## §1. Aplicar migrations no Supabase

Sem isso o backend tenta colunas inexistentes e quebra. **Aplicar tudo de uma vez no SQL Editor ou `npm run supabase:db:push`.** São **13 migrations** em [`supabase/migrations/`](../../supabase/migrations) (o [`supabase/schema.sql`](../../supabase/schema.sql) consolida 14 tabelas; `email_subscribers`, `email_sent_log` e `admin_audit_log` existem só nas migrations).

| Migration                                                                                                      | Conteúdo                                                                                                   | Validação rápida                                                         |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`20260524_phase0_analytics`](../../supabase/migrations/20260524000000_phase0_analytics.sql)                   | `analytics_events` + `orders.attribution_data`                                                             | `select count(*) from analytics_events;`                                 |
| [`20260525_phase1_product_slugs`](../../supabase/migrations/20260525000000_phase1_product_slugs.sql)           | `products.slug` + trigger auto-gerador                                                                     | `select slug from products limit 3;`                                     |
| [`20260526_phase2_conversion`](../../supabase/migrations/20260526000000_phase2_conversion.sql)                 | `coupons` + `abandoned_carts` + `products.{faq,reviews,benefits}` + `orders.{coupon_code,discount_amount}` | `select rowsecurity from pg_tables where tablename = 'coupons';`         |
| [`20260526_phase2_log_retention`](../../supabase/migrations/20260526100000_phase2_log_retention.sql)           | `purge_old_logs()` — retenção LGPD de logs                                                                 | `select proname from pg_proc where proname = 'purge_old_logs';`          |
| [`20260526_phase2_security_events`](../../supabase/migrations/20260526110000_phase2_security_events.sql)       | `security_events` + `purge_old_logs()` v2                                                                  | `select count(*) from security_events;`                                  |
| [`20260526_phase2_enable_pg_cron`](../../supabase/migrations/20260526120000_phase2_enable_pg_cron.sql)         | extensão `pg_cron` + job diário `purge_old_logs_daily`                                                     | `select jobname from cron.job;`                                          |
| [`20260527_phase0_retention`](../../supabase/migrations/20260527000000_phase0_analytics_retention.sql)         | `cleanup_old_analytics_events()` + `pg_cron` se disponível                                                 | `select proname from pg_proc where proname like 'cleanup%';`             |
| [`20260528_phase3_email`](../../supabase/migrations/20260528000000_phase3_email_marketing.sql)                 | `email_subscribers` + `email_sent_log` + cleanup                                                           | `select tablename from pg_tables where tablename like 'email_%';`        |
| [`20260530_phase4_admin_audit_log`](../../supabase/migrations/20260530000000_phase4_admin_audit_log.sql)       | `admin_audit_log` (auditoria de escrita do painel)                                                         | `select count(*) from admin_audit_log;`                                  |
| [`20260701_phase5_audit_immutability`](../../supabase/migrations/20260701000000_phase5_audit_immutability.sql) | `admin_audit_log` append-only (REVOKE + triggers)                                                          | `select tgname from pg_trigger where tgname like 'admin_audit_log_no%';` |
| [`20260701_phase5_payment_hardening`](../../supabase/migrations/20260701000001_phase5_payment_hardening.sql)   | UNIQUE `download_tokens(order_id, product_id)` + `increment_coupon_usage()`                                | `select proname from pg_proc where proname = 'increment_coupon_usage';`  |
| [`20260702_phase6_db_rls_hardening`](../../supabase/migrations/20260702000000_phase6_db_rls_hardening.sql)     | baseline RLS nas 17 tabelas + `handle_new_user()` + purges mensais                                         | `select count(*) from pg_policies where schemaname = 'public';`          |
| [`20260703_perf_indexes`](../../supabase/migrations/20260703000000_perf_indexes.sql)                           | 5 índices de performance (painel/cron)                                                                     | `select indexname from pg_indexes where tablename = 'orders';`           |

---

## §2. Credenciais externas e assets

> **💰 Custo:** **gratuito**. O projeto até a Fase 4 não exige assinatura.

### 2.1 Analytics + Pixel (criar contas e plugar IDs)

| O quê              | Onde criar                                                                           | Variável                              |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------- |
| GA4 Measurement ID | [analytics.google.com](https://analytics.google.com) → Admin → Create property       | `VITE_GA4_ID=G-XXXXXXXXXX`            |
| Meta Pixel ID      | [business.facebook.com/events_manager](https://business.facebook.com/events_manager) | `VITE_META_PIXEL_ID=1234567890123456` |

Setar nos dois lugares: `.env.local` (dev) + Vercel Environment Variables (prod).

### 2.2 og-default.png (1200×630)

[`src/components/SEO.jsx`](../../src/components/SEO.jsx) hoje usa `/favicon.svg` como imagem OG default (mitigação — o `og-default.png` nunca foi versionado em `public/`). Para um card social de verdade: criar 1200×630 com marca + logo + tagline, salvar em `public/og-default.png`, trocar `DEFAULT_IMAGE` no SEO.jsx e validar em [opengraph.xyz](https://www.opengraph.xyz/) após deploy.

### 2.3 APP_URL canônica no Vercel

```
APP_URL=https://profamarciarcardoso.com.br
VITE_PUBLIC_BASE_URL=https://profamarciarcardoso.com.br  (opcional para SSR futuro)
```

### 2.4 Autenticar domínio no Resend (DKIM + SPF + DMARC) — regra D6

**Bloqueia entrega real de emails de marketing.** Sandbox só entrega para o dono da conta Resend.

1. [resend.com/domains](https://resend.com/domains) → Add Domain → `profamarciarcardoso.com.br`
2. Criar os 3 registros DNS que aparecem (SPF TXT, DKIM TXT, DMARC TXT) no provedor de DNS — aguardar até 24h
3. Trocar `SMTP_FROM=Ateliê <pedidos@profamarciarcardoso.com.br>` no `.env.local` + Vercel
4. Atualizar `smtp_admin_email` no Supabase Auth (Dashboard → Authentication → SMTP) para o mesmo domínio
5. Validar entregabilidade em [mail-tester.com](https://mail-tester.com) → alvo 10/10

### 2.5 CRON_SECRET para o cron de email

Sem isso o workflow `email-cron.yml` falha 401.

1. Gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (formato do `.env.example`)
2. Setar `CRON_SECRET=<o-segredo>` em **Vercel** (Environment Variables) **e GitHub** (Settings → Secrets → Actions)
3. Setar `APP_URL` no GitHub também
4. GitHub → Actions → "Email cron" → Run workflow → validar status 200

### 2.6 Cupom de reativação `VOLTEI15`

O job `reactivation_90d` ([api/cron-email-jobs.js](../../api/cron-email-jobs.js)) envia esse código. Criar pela aba **Cupons** do admin (§3.4) ou via SQL:

```sql
insert into public.coupons (code, discount_type, discount_value, valid_until, max_uses, active)
values ('VOLTEI15', 'percent', 15, now() + interval '1 year', null, true);
```

Customizável via env `REACTIVATION_COUPON_CODE`.

### 2.7 Submeter sitemap no Search Console

Após primeiro deploy com `/sitemap.xml` no ar:

1. [search.google.com/search-console](https://search.google.com/search-console) → adicionar domínio
2. Verificar propriedade (TXT no DNS ou meta tag)
3. Sitemaps → Adicionar → `sitemap.xml`

---

## §3. Decisões adiadas (atacar quando o gatilho disparar)

### 3.1 Prerender / SSR — só se Lighthouse SEO < 95

Validar pós-deploy. Se SEO ≥ 95, fica como está. Se cair abaixo:

- **A** — `react-snap` (build-time, mais barato; para `/produtos/:slug` precisa enumerar slugs no build)
- **B** — migrar Home + ProductDetails para Next.js (custo alto)

### 3.2 Pipeline WebP/AVIF — só quando catálogo > 200 produtos

Hoje: `loading="lazy"` + `decoding="async"` + Tailwind aspect-ratio evitam CLS. ROI baixo agora (50 produtos).

**Quando o CDN entrar:**

1. Escolher entre Cloudflare Images (US$ 5/mês por 100k) ou Imgix (US$ 10/mês por 1k)
2. Trocar URLs `https://<projeto>.supabase.co/storage/...` por `https://imagens.profamarciarcardoso.com.br/<path>?w=400&fm=webp`
3. Adicionar `srcset` + `sizes` em [ProductGrid.jsx](../../src/components/ProductGrid.jsx), [HomePage.jsx](../../src/pages/HomePage.jsx), [ProductDetailsPage.jsx](../../src/pages/ProductDetailsPage.jsx)

**Mitigação imediata:** ✅ **Entregue (2026-05-30)** — guard rail no [ProductWizard.jsx](../../src/components/ProductWizard.jsx) bloqueando upload > 500kB por imagem (vídeos/arquivos seguem limitados pelo bucket no backend).

### 3.3 Lighthouse CI GitHub App (5 min, opcional)

Workflow já roda. Sem token, relatórios vão para `temporary-public-storage`. Para comentários inline no PR:

1. [github.com/apps/lighthouse-ci](https://github.com/apps/lighthouse-ci) → Install
2. GitHub Settings → Secrets → Actions → `LHCI_GITHUB_APP_TOKEN`

### 3.4 Wizards admin — ✅ ENTREGUE (2026-05-30)

- ✅ **Editar `faq`/`reviews`/`benefits`** — nova aba "Conversão" no [ProductWizard.jsx](../../src/components/ProductWizard.jsx) com editores de benefícios, FAQ e depoimentos; gravado por [admin-products.js](../../api/admin-products.js).
- ✅ **CRUD de cupons** — aba "Cupons" no painel ([CouponsTab](../../src/components/admin/tabs/CouponsTab.jsx) + [CouponWizard](../../src/components/CouponWizard.jsx)) com endpoint [admin-coupons.js](../../api/admin-coupons.js) (GET/POST/PUT/DELETE). A validação no checkout segue em [validate-coupon.js](../../api/validate-coupon.js); criar por SQL (§2.6) ainda funciona mas não é mais necessário.

### 3.5 Validar Google OAuth em produção (Fase 2)

> ℹ️ **O código está completo de ponta a ponta** — botão "Continuar com Google" + `signInWithOAuth` + callback `/auth/customer/google/callback` que valida o token no Supabase e crava cookie de sessão HttpOnly. **Não é "só wirado".**

Resta apenas **validar em produção**: o Supabase exige a URL no `uri_allow_list` (ver [scripts/configure-auth.js](../../scripts/configure-auth.js)). É config de runtime, não código faltante.

### 3.6 Acessibilidade WCAG (Fase 2)

- ✅ Áreas de toque ≥ 44×44 px no menu mobile e CTAs (regra B9) — hambúrguer, links do menu mobile e CTAs dos cards com `min-h-[44px]` (2026-05-30)
- ✅ Line-clamp em títulos de cards de produto ([ProductGrid.jsx](../../src/components/ProductGrid.jsx), HomePage, CrossSellSection, CartDrawer)
- ✅ Hierarquia visual reduzida no menu mobile — primários em peso cheio, secundários atenuados sob rótulo "Navegar" (2026-05-30)
- ✅ Contraste WCAG AA validado pelo Lighthouse CI (regra B10)

### 3.7 Login admin com Google (OAuth) — futuro

Hoje o painel só aceita e-mail + senha + 2FA opcional ([api/admin-login.js](../../api/admin-login.js)). Cliente já tem Google OAuth funcionando — dá pra reusar a infra.

**Para implementar:**

1. Botão "Entrar com Google" em [AdminPage.jsx](../../src/pages/AdminPage.jsx) reusando `signInWithOAuth({ provider: 'google' })` de [customer-auth.js:79](../../src/services/customer-auth.js#L79)
2. Novo callback `/auth/admin/google/callback` em [routes/auth.routes.js](../../routes/auth.routes.js) que:
   - Valida o `access_token` Google via Supabase
   - Exige `profile.role ∈ {admin, master}` (mesma checagem de hoje em [admin-login.js:227](../../api/admin-login.js#L227))
   - **Manter 2FA (TOTP/PIN) obrigatório** mesmo no fluxo Google — senão um Gmail comprometido entra direto no painel
   - Emite o mesmo cookie HMAC `admin_session` via `setSessionCookie()`
3. Garantir que o profile do e-mail Google tenha `role = admin` ou `master` no Supabase

**Decisão pendente:** restringir a domínio corporativo (ex: `@oqtem.com`) ou aceitar qualquer Gmail desde que o profile tenha role admin?

### 3.8 Placeholders do Dashboard (descobertos na varredura 2026-05-30)

Dois cards `PendingDataCard` em [DashboardTab.jsx](../../src/components/admin/tabs/DashboardTab.jsx) aguardam instrumentação de backend:

- **Vendas por região** — exige coluna `orders.shipping_state` + captura do UF no checkout
- **Funil de conversão (card interno do Dashboard)** — exige rastreamento de eventos (`analytics_events`/`page_views`); distinto da aba Funil, que já existe

### 3.9 Features já no código mas ausentes do histórico (reconciliadas 2026-05-30)

Já entregues, agora documentadas: CRUD de **Categorias**, **Vitrine** configurável da home, abas **Faturamento**, **Desempenho de produtos**, **Comparativo mensal** e **Segurança** (config de 2FA/TOTP/PIN pela UI), **Cross-sell**, **upload de mídia assinado** e **limpeza manual de analytics**.

---

## §4. Fase 5 e 6 (não iniciadas — ver [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md))

### Fase 5 — Mídia paga 💵 ~R$ 5.000/mês mínimo

Só atacar quando o **gatilho** disparar: 30+ dias de funil rastreado + 50+ pedidos para Curva ABC + ROAS orgânico ≥ 3x. Tarefas detalhadas em [PLANO_ECOMMERCE.md §"Fase 5"](./PLANO_ECOMMERCE.md).

### Fase 6 — Otimização contínua 🟡

Reunião semanal de métricas, A/B mensal (GrowthBook self-host), auditoria SEO mensal, limpeza trimestral de catálogo, expansão de canais (Elo7, Shorts, parcerias). Detalhes em [PLANO_ECOMMERCE.md §"Fase 6"](./PLANO_ECOMMERCE.md).

---

## §5. Segurança — operacional recorrente

Auditoria fechada em código (A1–A16). Resta o **recorrente humano** — detalhes em [PLANO_SEGURANCA.md](./PLANO_SEGURANCA.md) (histórico) e [SECURITY.md](../SECURITY.md).

| Item                                                                                                                                                                                          | Cadência                                | Onde                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| 🔁 Rotação de segredos (`ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`) | Trimestral                              | [SECURITY.md §"Rotação de secrets"](../SECURITY.md)           |
| 🎯 Pen-test focado                                                                                                                                                                            | Anual                                   | [SECURITY.md §"Pen-test focado"](../SECURITY.md)              |
| 📧 DKIM/SPF/DMARC no Resend                                                                                                                                                                   | Único — §2.4 acima                      | —                                                             |
| 🔔 `SECURITY_ALERT_WEBHOOK_URL` (Slack/Discord/Sentry)                                                                                                                                        | Opcional                                | env var                                                       |
| 📋 Checklist pré-produção (15 itens)                                                                                                                                                          | Cada release maior                      | [SECURITY.md §"Checklist pré-produção"](../SECURITY.md)       |
| 🛒 Vigiar R8 (carrinho localStorage — preços sempre recalculados do banco em [create-payment.js](../../api/create-payment.js))                                                                | Quando mexer em desconto/frete no front | [PLANO_SEGURANCA.md](./PLANO_SEGURANCA.md) (histórico R1–R12) |

---

## §6. Validação operacional (após deploy)

Checklist para marcar cada fase como ✅ "funcionando em produção":

### Fase 0 — Mensuração

- [ ] Compra de teste com `?utm_source=teste&utm_medium=email` → `orders.attribution_data` retorna o JSON
- [ ] Aba `/admin → Funil` renderiza sem erro
- [ ] Após GA4 ID + 7 dias: GA4 mostra `view_item`, `add_to_cart`, `begin_checkout`, `purchase`
- [ ] Após Pixel ID: Meta Events Manager mostra os 4 eventos

### Fase 1 — SEO

- [ ] `/produtos/<slug>` retorna produto; `/produtos/<id-antigo>` faz soft-redirect
- [ ] `view-source:` mostra `<title>`, `<meta description>`, `<script application/ld+json>` corretos
- [ ] `/sitemap.xml` válido, `/robots.txt` com `Sitemap:`
- [ ] [Rich Results Test](https://search.google.com/test/rich-results) aprovado em pelo menos 1 produto
- [ ] Lighthouse Performance ≥ 90 mobile, SEO ≥ 95

### Fase 2 — UX/Conversão

- [ ] Pelo menos 1 produto com FAQ + 3 depoimentos visíveis (§3.4 ✅ — editar pela aba "Conversão" do ProductWizard)
- [ ] Carrinho drawer não navega para `/checkout`
- [ ] Cupom de teste valida server-side (criar pela aba Cupons do admin ou via SQL — §2.6)
- [ ] Taxa de conversão `begin_checkout → purchase` ≥ 20% acima do baseline (medir após 30d de dados)

### Fase 3 — Email

- [ ] Domínio autenticado no Resend (regra D6) — §2.4
- [ ] Cron rodando — primeiros envios em `email_sent_log`
- [ ] Mail-tester.com aprovou ≥ 9/10

### Fase 4 — Análise

- [ ] Aba `/admin → Análise` carrega em < 2s
- [ ] Pareto + heatmap renderizam com pelo menos 30 dias de pedidos
- [ ] Export CSV funciona

---

## §7. Documentação a atualizar (manter sincronizado)

| Arquivo                                    | O que checar                                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [README.md](../README.md)                  | ✅ Abas do admin atualizadas (14 abas); a lista de tabelas agora vive em [ProjectDocs/04-BANCO-DE-DADOS.md](../ProjectDocs/04-BANCO-DE-DADOS.md) (inclui `analytics_events`, `coupons`, `email_subscribers`, `admin_audit_log`, etc.) |
| [ARCHITECTURE.md](../ARCHITECTURE.md)      | ✅ Endpoints novos já listados (`/track-event`, `/admin-funnel`, `/admin-segments`, `/admin-kpis`, `/admin-cohort`, `/admin-abc-*`, `/cron-email-jobs`)                                                                               |
| [SECURITY.md](../SECURITY.md)              | ✅ Rate limits novos (`/track-event` 120/min, `/validate-coupon` 20/min) + RLS de `analytics_events` já documentados                                                                                                                  |
| [SETUP.md](../SETUP.md)                    | ✅ Seções "Analytics" (GA4/Pixel), "Email" (Resend domain) e "Cron" (CRON_SECRET) presentes                                                                                                                                           |
| [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md) | Atualizar status conforme as pendências aqui forem fechando                                                                                                                                                                           |
