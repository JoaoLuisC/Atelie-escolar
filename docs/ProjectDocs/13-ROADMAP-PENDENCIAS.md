# 13 — Roadmap & pendências

> O que ainda falta para colocar tudo em produção + Fases 5 e 6 (não iniciadas). Itens entregues e fechados estão no histórico ao final.
>
> **Como ler:**
>
> - **§1-§2 são bloqueantes operacionais** — sem eles, o que está em código não funciona em prod
> - **§3 são decisões adiadas conscientemente** + itens de polimento
> - **§4 são Fases 5 e 6** (não iniciadas, exigem investimento)
> - **§5 é segurança operacional** (rotação, pen-test, DKIM)
> - **§6 é validação ponta-a-ponta** pós-deploy
> - **§7 é histórico** do que já foi entregue

---

## §1. Aplicar migrations no Supabase

Sem isso o backend consulta colunas que não existem e quebra.

```bash
npm run supabase:db:push     # aplica as 18 migrations de supabase/migrations/
```

A lista completa, com o que cada uma faz, é mantida em
[04-BANCO-DE-DADOS §migrations](./04-BANCO-DE-DADOS.md) — e mora **só lá**. As queries de
validação pós-aplicação estão na mesma seção.

**Status:** aplicação em produção não confirmada.

---

## §2. Credenciais externas e assets (custo zero)

### 2.1 Analytics + Pixel (criar contas e plugar IDs)

| O quê              | Onde criar                                                                           | Variável                              |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------- |
| GA4 Measurement ID | [analytics.google.com](https://analytics.google.com) → Admin → Create property       | `VITE_GA4_ID=G-XXXXXXXXXX`            |
| Meta Pixel ID      | [business.facebook.com/events_manager](https://business.facebook.com/events_manager) | `VITE_META_PIXEL_ID=1234567890123456` |

Setar nos dois lugares: `.env.local` (dev) + Vercel Environment Variables (prod, Production env).

### 2.2 `og-default.png` (1200×630)

[`src/components/SEO.jsx`](../../src/components/SEO.jsx) **não referencia mais** o `og-default.png` inexistente — a referência quebrada foi corrigida e o fallback atual (`DEFAULT_IMAGE`) é `/favicon.svg`, que existe em `public/`. Pendência de polimento: criar imagem OG real com marca + logo + tagline, salvar em `public/og-default.png`, apontar `DEFAULT_IMAGE` para ela (SVG não renderiza como preview na maioria das redes) e validar em [opengraph.xyz](https://www.opengraph.xyz/) após deploy.

### 2.3 APP_URL canônica no Vercel

```
APP_URL=https://profamarciarcardoso.com.br
VITE_PUBLIC_BASE_URL=https://profamarciarcardoso.com.br  (opcional para SSR futuro)
```

### 2.4 Autenticar domínio no Resend (DKIM + SPF + DMARC) — regra D6

**Bloqueia entrega real de emails de marketing.** Sandbox só entrega para o dono da conta Resend.

1. [resend.com/domains](https://resend.com/domains) → Add Domain → `profamarciarcardoso.com.br`
2. Criar os 3 registros DNS que aparecem (SPF TXT, DKIM TXT, DMARC TXT) no provedor DNS — aguardar até 24h
3. Trocar `SMTP_FROM="Ateliê da Escola <pedidos@profamarciarcardoso.com.br>"` no `.env.local` + Vercel
4. Atualizar `smtp_admin_email` no Supabase Auth (Dashboard → Authentication → SMTP) para o mesmo domínio
5. Validar entregabilidade em [mail-tester.com](https://mail-tester.com) → alvo 10/10

### 2.5 CRON_SECRET para o cron de email

Sem isso o workflow `email-cron.yml` falha 401.

1. Gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (formato do `.env.example`)
2. Setar `CRON_SECRET=<o-segredo>` em **Vercel** (Environment Variables) **e GitHub** (Settings → Secrets → Actions)
3. Setar `APP_URL` no GitHub também
4. GitHub → Actions → "Email cron" → Run workflow → validar status 200

### 2.6 Cupom de reativação `VOLTEI15`

O job `reactivation_90d` envia esse código. Criar pela aba **Cupons** do admin ou via SQL:

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

Hoje: `loading="lazy"` + `decoding="async"` + Tailwind `aspect-ratio` evitam CLS. ROI baixo agora (~50 produtos).

**Quando o CDN entrar:**

1. Escolher entre Cloudflare Images (US$ 5/mês por 100k) ou Imgix (US$ 10/mês por 1k)
2. Trocar URLs `https://<projeto>.supabase.co/storage/...` por `https://imagens.profamarciarcardoso.com.br/<path>?w=400&fm=webp`
3. Adicionar `srcset` + `sizes` em `ProductGrid.jsx`, `HomePage.jsx`, `ProductDetailsPage.jsx`

**Mitigação imediata:** ✅ **Entregue (2026-05-30)** — guard rail no `ProductWizard.jsx` bloqueando upload > 500kB por imagem.

### 3.3 Lighthouse CI GitHub App (5 min, opcional)

Workflow já roda. Sem token, relatórios vão para `temporary-public-storage`. Para comentários inline no PR:

1. [github.com/apps/lighthouse-ci](https://github.com/apps/lighthouse-ci) → Install
2. GitHub Settings → Secrets → Actions → `LHCI_GITHUB_APP_TOKEN`

### 3.4 Wizards admin — ✅ ENTREGUE (2026-05-30)

- ✅ **Editar `faq`/`reviews`/`benefits`** — aba "Conversão" no `ProductWizard.jsx` com editores de benefícios, FAQ e depoimentos; gravado por `handlers/admin/products.js`.
- ✅ **CRUD de cupons** — aba "Cupons" no painel (`CouponsTab` + `CouponWizard`) com endpoint `handlers/admin/coupons.js` (GET/POST/PUT/DELETE). Validação no checkout segue em `validate-coupon.js`.

### 3.5 Validar Google OAuth em produção

> ℹ️ **O código está completo de ponta a ponta** — botão "Continuar com Google" + `signInWithOAuth` + callback `/api/auth/customer/google/callback` (`handlers/auth/customer/google/callback.js`) que valida o token no Supabase e crava cookie HttpOnly. Não é "só wirado".

Resta apenas **validar em produção**: o Supabase exige a URL no `uri_allow_list` (ver `scripts/configure-auth.js`) — config de runtime, não código.

### 3.6 Acessibilidade WCAG (Fase 2 finalização)

- ✅ Áreas de toque ≥ 44×44 px no menu mobile e CTAs (regra B9) — hambúrguer, links do menu mobile e CTAs dos cards com `min-h-[44px]` (2026-05-30)
- ✅ Line-clamp em títulos de cards de produto (`ProductGrid.jsx`, `HomePage.jsx`, `CrossSellSection.jsx`, `CartDrawer.jsx`)
- ✅ Hierarquia visual reduzida no menu mobile — primários em peso cheio, secundários atenuados sob rótulo "Navegar" (2026-05-30)
- ✅ Contraste WCAG AA validado pelo Lighthouse CI (regra B10)

### 3.7 Login admin com Google (OAuth) — futuro

Hoje o painel só aceita e-mail + senha + 2FA opcional (`handlers/admin/login.js`). Cliente já tem Google OAuth funcionando — dá pra reusar a infra.

**Para implementar:**

1. Botão "Entrar com Google" em `AdminLoginPage.jsx` reusando `signInWithOAuth({ provider: 'google' })` de `src/services/customer-auth.js`
2. Novo callback `/api/auth/admin/google/callback` (função em `api/`, espelhada em dev via `routes/api-compat.routes.js`) que:
   - Valida o `access_token` Google via Supabase
   - Exige `profile.role ∈ {ADMIN, MASTER}` (mesma checagem de hoje em `admin-login.js`)
   - **Manter 2FA (TOTP/PIN) obrigatório** mesmo no fluxo Google — senão um Gmail comprometido entra direto no painel
   - Emite o mesmo cookie HMAC `admin_session`
3. Garantir que o profile do e-mail Google tenha `role = ADMIN` ou `MASTER` no Supabase

**Decisão pendente:** restringir a domínio corporativo (ex: `@oqtem.com`) ou aceitar qualquer Gmail desde que o profile tenha role admin?

### 3.8 LGPD self-service: direito ao esquecimento — ✅ IMPLEMENTADO

> **Entregue.** Fluxo ponta a ponta em `handlers/me-delete-account.js` (anonimização,
> limpeza de tokens, unsubscribe, confirmação por e-mail em 2 passos), rota com
> rate-limit em `routes/api-compat.routes.js`, UI em `src/pages/CustomerAuthPage.jsx`
> e client em `src/services/customer-auth.js`. Mantido abaixo como registro histórico.

Hoje a exclusão de conta é feita via admin (regra H7). Implementar endpoint público:

- `/api/me/delete-account` (auth required) que:
  1. Anonimiza `orders.customer_email` (substitui por hash)
  2. Deleta `profiles` (mantém `orders.customer_id` NULL para histórico)
  3. Deleta `user_products`, `download_tokens`
  4. Marca em `email_subscribers` como `unsubscribed`
  5. Loga em `security_events` como `account_self_deleted`
- Página em `/conta` com botão "Excluir minha conta"
- Confirmação por email antes de executar

### 3.9 Admin audit log — ✅ IMPLEMENTADO

> **Entregue.** `lib/admin-audit.js` (`logAdminAction`) + migrations phase4/phase5,
> chamado nos endpoints admin de escrita. Mantido abaixo como registro histórico.

Tabela `admin_audit_log` (regra I1): `admin_id, action, target_type, target_id, before, after, created_at`. Adicionar trigger em todos os endpoints admin que escrevem.

### 3.10 Placeholders do Dashboard (descobertos na varredura 2026-05-30)

Dois cards `PendingDataCard` em `DashboardTab.jsx` aguardam instrumentação de backend:

- **Vendas por região** — exige coluna `orders.shipping_state` + captura do UF no checkout
- **Funil de conversão (card interno do Dashboard)** — exige rastreamento de eventos (`analytics_events`/`page_views`); distinto da aba Funil, que já existe

---

## §4. Fase 5 e 6 (não iniciadas)

### Fase 5 — Mídia paga 💵 ~R$ 5.000/mês mínimo

Só atacar quando o **gatilho** disparar:

- 30+ dias de funil rastreado
- 50+ pedidos para Curva ABC
- ROAS orgânico ≥ 3x

Tarefas detalhadas em [10-MARKETING-ANALYTICS §10](./10-MARKETING-ANALYTICS.md). Resumo:

- Curva ABC mostra nichos prioritários
- Google Ads: 3 campanhas (genérica + categoria + institucional)
- Meta Ads: funis separados (frio + morno + quente)
- Lookalike de VIPs (regra C4)
- Landing pages dedicadas com message match (regra C5)
- Otimizar para `purchase` (regra C2)
- Começar R$ 30/dia (regra C6), dobrar só após ROAS ≥ 3x

### Fase 6 — Otimização contínua 🟡

Reunião semanal de métricas, A/B mensal (GrowthBook self-host), auditoria SEO mensal, limpeza trimestral de catálogo, expansão de canais (Elo7, Shorts, parcerias com influenciadoras).

Stack gratuito: Microsoft Clarity (heatmap) + GrowthBook self-hosted (A/B). Hotjar / GrowthBook Cloud só se Clarity ficar pequeno.

---

## §5. Segurança — operacional recorrente

Auditoria fechada em código (A1–A16, ver histórico). Resta o **recorrente humano**:

| Item                                                                                                                                                                                          | Cadência                                | Onde                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| 🔁 Rotação de segredos (`ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`) | Trimestral                              | [08-SEGURANCA §11.2](./08-SEGURANCA.md) |
| 🎯 Pen-test focado                                                                                                                                                                            | Anual                                   | [08-SEGURANCA §11.3](./08-SEGURANCA.md) |
| 📧 DKIM/SPF/DMARC no Resend                                                                                                                                                                   | Único — §2.4 acima                      | —                                       |
| 🔔 `SECURITY_ALERT_WEBHOOK_URL` (Slack/Discord/Sentry)                                                                                                                                        | Opcional                                | env var                                 |
| 📋 Checklist pré-produção (17 itens)                                                                                                                                                          | Cada release maior                      | [08-SEGURANCA §12](./08-SEGURANCA.md)   |
| 🛒 Vigiar R8 (carrinho localStorage)                                                                                                                                                          | Quando mexer em desconto/frete no front | —                                       |

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

- [ ] Pelo menos 1 produto com FAQ + 3 depoimentos visíveis (§3.4 entregue — criar pela aba "Conversão" do `ProductWizard`)
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

## §7. Histórico do que foi entregue

| Data       | Marco                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-24 | **Auditoria de segurança fechada (A1–A16).** Histórico do git auditado, webhook exige assinatura, segredos validados no boot, fallbacks inseguros removidos, CORS wildcard tirado, `serviceRoleHelpers` força opt-in pra service-role, `order_code` com 128 bits + email obrigatório em `/verify-payment`, `Referrer-Policy: no-referrer` no download, `/privacidade` + `/termos` publicadas, `.env.example` migrado de Gmail para Resend, `purge_old_logs()` com `pg_cron`, CSP estrita, Zod do produto bloqueia `javascript:`/`data:`, rate-limit dedicado em `/verify-payment`, log estruturado em `security_events`. |
| 2026-05-24 | **Fase 0 entregue** — GA4 + Meta Pixel + UTM + `analytics_events` + funil admin + Lighthouse CI + banner LGPD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-05-24 | **Fase 1 entregue** — slugs + meta tags + JSON-LD + sitemap + robots + fontes trim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-05-24 | **Fase 2 entregue** — refactor ProductsPage + selos de confiança (checkout + SocialProofStrip) + Skeleton + página produto convertendo + CartDrawer + cupons                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-24 | **Fase 3 entregue** — double opt-in + 8 templates + sequência D+0/3/15/45 + abandoned cart + reactivation 90d + cron + aba Segmentos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-05-24 | **Fase 4 entregue** — Curva ABC produtos + clientes + coorte mensal + KPIs (LTV, recompra, LTV/CAC) + aba Análise com Pareto + heatmap + export CSV                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-05-24 | **Decisão registrada:** stack 100% gratuito até Fase 4; Fase 5 (mídia paga) só quando dados justificarem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-24 | **Documentação consolidada** em `docs/ProjectDocs/` — 13 documentos numerados como fonte única                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-05-30 | **§3.4 fechada — Wizards admin** — aba "Conversão" no `ProductWizard` (FAQ/depoimentos/benefícios) + CRUD de cupons no painel (`CouponsTab`/`CouponWizard`/`handlers/admin/coupons.js`). Produtos e cupons deixam de depender de SQL bruto.                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-30 | **§3.2 e §3.6 fechadas — Acessibilidade + guard rail** — toques ≥ 44px (hambúrguer, menu mobile, CTAs dos cards), hierarquia reduzida no menu mobile, line-clamp confirmado e bloqueio de upload de imagem > 500kB.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-05-30 | **Reconciliação de documentação** — features já no código mas ausentes do histórico mapeadas: CRUD de Categorias, Vitrine configurável, abas Faturamento/Desempenho/Comparativo/Segurança (2FA pela UI), Cross-sell, upload assinado, cleanup manual de analytics. §3.5 (Google OAuth do cliente) reclassificada de "wirado" para "código completo, falta validar em prod".                                                                                                                                                                                                                                              |
| 2026-07-01 | **Hardening Fase 5** — `admin_audit_log` append-only (revoke + triggers anti update/delete), dedup + UNIQUE `(order_id, product_id)` em `download_tokens` (webhooks MP reentregues) e `increment_coupon_usage()` atômico respeitando `max_uses`.                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-02 | **Hardening de RLS (Fase 6)** — baseline versionado em migration: RLS habilitado nas 17 tabelas, trigger guard de `profiles` (anti-escalonamento), remoção de escrita pública em `abandoned_carts`/`page_views`, `handle_new_user()` versionado, `purge_old_logs()` v3 + `purge_stale_email_subscribers()` agendados via `pg_cron`.                                                                                                                                                                                                                                                                                      |
| 2026-07-03 | **Índices de performance** — 5 índices para as consultas quentes do painel/cron (`orders`, `email_sent_log`, `abandoned_carts`) em `20260703000000_perf_indexes.sql`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## Próximo passo concreto

**Fases 0-4 estão com código pronto.** Bloqueio agora é operacional:

1. ⏳ Aplicar as 18 migrations no Supabase — 15 min (§1; aplicação em prod não confirmada)
2. ⏳ Plugar credenciais grátis (GA4 ID, Pixel ID, `CRON_SECRET`, Resend já está) — 1-2h
3. ⏳ Autenticar domínio no Resend (DNS — propagação até 24h)
4. ⏳ Criar `public/og-default.png` 1200×630 — 30 min
5. ⏳ Validar Lighthouse no preview Vercel (se SEO < 95, decidir sobre prerender)
6. ⏳ Submeter sitemap no Search Console

**Próximo trabalho de produto:** Fase 5 (mídia paga) — 💵 só quando dados justificarem (gatilho: 30+ dias de funil rastreado + 50+ pedidos + ROAS orgânico ≥ 3x).
