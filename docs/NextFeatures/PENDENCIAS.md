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

Sem isso o backend tenta colunas inexistentes e quebra. **Aplicar tudo de uma vez no SQL Editor ou `npm run supabase:db:push`.**

| Migration | Conteúdo | Validação rápida |
|---|---|---|
| [`20260524_phase0_analytics`](../supabase/migrations/20260524000000_phase0_analytics.sql) | `analytics_events` + `orders.attribution_data` | `select count(*) from analytics_events;` |
| [`20260525_phase1_product_slugs`](../supabase/migrations/20260525000000_phase1_product_slugs.sql) | `products.slug` + trigger auto-gerador | `select slug from products limit 3;` |
| [`20260526_phase2_conversion`](../supabase/migrations/20260526000000_phase2_conversion.sql) | `coupons` + `abandoned_carts` + `products.{faq,reviews,benefits}` + `orders.{coupon_code,discount_amount}` | `select rowsecurity from pg_class where relname = 'coupons';` |
| [`20260527_phase0_retention`](../supabase/migrations/20260527000000_phase0_analytics_retention.sql) | `cleanup_old_analytics_events()` + `pg_cron` se disponível | `select proname from pg_proc where proname like 'cleanup%';` |
| [`20260528_phase3_email`](../supabase/migrations/20260528000000_phase3_email_marketing.sql) | `email_subscribers` + `email_sent_log` + cleanup | `select tablename from pg_tables where tablename like 'email_%';` |

---

## §2. Credenciais externas e assets

> **💰 Custo:** **gratuito**. O projeto até a Fase 4 não exige assinatura.

### 2.1 Analytics + Pixel (criar contas e plugar IDs)

| O quê | Onde criar | Variável |
|---|---|---|
| GA4 Measurement ID | [analytics.google.com](https://analytics.google.com) → Admin → Create property | `VITE_GA4_ID=G-XXXXXXXXXX` |
| Meta Pixel ID | [business.facebook.com/events_manager](https://business.facebook.com/events_manager) | `VITE_META_PIXEL_ID=1234567890123456` |

Setar nos dois lugares: `.env.local` (dev) + Vercel Environment Variables (prod).

### 2.2 og-default.png (1200×630)

[`src/components/SEO.jsx`](../src/components/SEO.jsx) referencia `/og-default.png` mas o arquivo **não existe** em `public/`. Criar com marca + logo + tagline, salvar em `public/og-default.png`, validar em [opengraph.xyz](https://www.opengraph.xyz/) após deploy.

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

1. Gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. Setar `CRON_SECRET=<o-segredo>` em **Vercel** (Environment Variables) **e GitHub** (Settings → Secrets → Actions)
3. Setar `APP_URL` no GitHub também
4. GitHub → Actions → "Email cron" → Run workflow → validar status 200

### 2.6 Cupom de reativação `VOLTEI15`

O job `reactivation_90d` envia esse código:

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
3. Adicionar `srcset` + `sizes` em [ProductGrid.jsx](../src/components/ProductGrid.jsx), [HomePage.jsx](../src/pages/HomePage.jsx), [ProductDetailsPage.jsx](../src/pages/ProductDetailsPage.jsx)

**Mitigação imediata (já entra no próximo batch):** guard rail no [ProductWizard.jsx](../src/components/ProductWizard.jsx) bloqueando upload > 500kB por imagem.

### 3.3 Lighthouse CI GitHub App (5 min, opcional)

Workflow já roda. Sem token, relatórios vão para `temporary-public-storage`. Para comentários inline no PR:
1. [github.com/apps/lighthouse-ci](https://github.com/apps/lighthouse-ci) → Install
2. GitHub Settings → Secrets → Actions → `LHCI_GITHUB_APP_TOKEN`

### 3.4 Wizards admin (Fase 2 — sem isso os dados ficam vazios via UI)

- **Editar `faq`/`reviews`/`benefits`** em [ProductWizard.jsx](../src/components/ProductWizard.jsx) — hoje só por SQL
- **CRUD de cupons** — hoje só por SQL (modelo em §2.6)

Sem isso, página de produto renderiza sem benefícios/FAQ/reviews (arrays vazios).

### 3.5 Validar Google OAuth em produção (Fase 2)

Botão "Continuar com Google" no Checkout já está wirado. Precisa testar callback com domínio real — Supabase exige URL no `uri_allow_list` (ver [scripts/configure-auth.js](../scripts/configure-auth.js)).

### 3.6 Acessibilidade WCAG (Fase 2)

- ⏳ Áreas de toque ≥ 44×44 px no menu mobile e CTAs (regra B9) — botão do carrinho já passou
- ⏳ Line-clamp em títulos de cards de produto (já parcial em [ProductGrid.jsx](../src/components/ProductGrid.jsx))
- ⏳ Hierarquia visual reduzida no menu mobile
- ✅ Contraste WCAG AA validado pelo Lighthouse CI (regra B10)

### 3.7 Login admin com Google (OAuth) — futuro

Hoje o painel só aceita e-mail + senha + 2FA opcional ([api/admin-login.js](../api/admin-login.js)). Cliente já tem Google OAuth funcionando — dá pra reusar a infra.

**Para implementar:**
1. Botão "Entrar com Google" em [AdminPage.jsx](../src/pages/AdminPage.jsx) reusando `signInWithOAuth({ provider: 'google' })` de [customer-auth.js:72](../src/services/customer-auth.js#L72)
2. Novo callback `/auth/admin/google/callback` em [routes/auth.routes.js](../routes/auth.routes.js) que:
   - Valida o `access_token` Google via Supabase
   - Exige `profile.role ∈ {admin, master}` (mesma checagem de hoje em [admin-login.js:234](../api/admin-login.js#L234))
   - **Manter 2FA (TOTP/PIN) obrigatório** mesmo no fluxo Google — senão um Gmail comprometido entra direto no painel
   - Emite o mesmo cookie HMAC `admin_session` via `setSessionCookie()`
3. Garantir que o profile do e-mail Google tenha `role = admin` ou `master` no Supabase

**Decisão pendente:** restringir a domínio corporativo (ex: `@oqtem.com`) ou aceitar qualquer Gmail desde que o profile tenha role admin?

---

## §4. Fase 5 e 6 (não iniciadas — ver [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md))

### Fase 5 — Mídia paga 💵 ~R$ 5.000/mês mínimo

Só atacar quando o **gatilho** disparar: 30+ dias de funil rastreado + 50+ pedidos para Curva ABC + ROAS orgânico ≥ 3x. Tarefas detalhadas em [PLANO_ECOMMERCE.md §"Fase 5"](./PLANO_ECOMMERCE.md).

### Fase 6 — Otimização contínua 🟡

Reunião semanal de métricas, A/B mensal (GrowthBook self-host), auditoria SEO mensal, limpeza trimestral de catálogo, expansão de canais (Elo7, Shorts, parcerias). Detalhes em [PLANO_ECOMMERCE.md §"Fase 6"](./PLANO_ECOMMERCE.md).

---

## §5. Segurança — operacional recorrente

Auditoria fechada em código (A1–A16). Resta o **recorrente humano** — detalhes em [PLANO_SEGURANCA.md](./PLANO_SEGURANCA.md) e [SECURITY.md](./SECURITY.md).

| Item | Cadência | Onde |
|---|---|---|
| 🔁 Rotação de segredos (`ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`) | Trimestral | [SECURITY.md §"Rotação"](./SECURITY.md) |
| 🎯 Pen-test focado | Anual | [SECURITY.md §"Pen-test"](./SECURITY.md) |
| 📧 DKIM/SPF/DMARC no Resend | Único — §2.4 acima | — |
| 🔔 `SECURITY_ALERT_WEBHOOK_URL` (Slack/Discord/Sentry) | Opcional | env var |
| 📋 Checklist pré-produção (15 itens) | Cada release maior | [SECURITY.md §"Checklist pré-produção"](./SECURITY.md) |
| 🛒 Vigiar R8 (carrinho localStorage) | Quando mexer em desconto/frete no front | [PLANO_SEGURANCA.md §3](./PLANO_SEGURANCA.md) |

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
- [ ] Pelo menos 1 produto com FAQ + 3 depoimentos visíveis (depende de §3.4)
- [ ] Carrinho drawer não navega para `/checkout`
- [ ] Cupom de teste valida server-side (criar via SQL primeiro)
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

| Arquivo | O que checar |
|---|---|
| [README.md](./README.md) | Lista de tabelas (incluir `analytics_events`, `coupons`, `email_subscribers`, etc.); abas do admin |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Diagrama com endpoints novos (`/api/track-event`, `/admin-funnel`, `/admin-segments`, `/admin-abc-*`, `/cron-email-jobs`) |
| [SECURITY.md](./SECURITY.md) | Rate limits novos (`/track-event` 120/min, `/validate-coupon` 20/min) + RLS de `analytics_events` |
| [SETUP.md](./SETUP.md) | Seções "Analytics" (GA4/Pixel), "Email" (Resend domain), "Cron" (CRON_SECRET) |
| [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md) | Atualizar status conforme as pendências aqui forem fechando |
