# 10 — Marketing & analytics

> Mensuração, atribuição, Curva ABC, segmentação, email marketing, funil. O fundamento estratégico está em [11-REGRAS-NEGOCIO](./11-REGRAS-NEGOCIO.md) (princípios invioláveis) e o roadmap das fases pagas em [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md).

---

## Filosofia

Cinco achados acadêmicos guiam todas as decisões de marketing (ver [11-REGRAS-NEGOCIO §referências](./11-REGRAS-NEGOCIO.md)):

1. **Segmentação > personalização nominal** — cliente VIP recompra com RPM 1227% maior que baseline (Ferreira, 2025)
2. **Sem mensuração, não há otimização** — 14% das campanhas analisadas eram "Anomalia" por falha de atribuição
3. **Mídia paga bem estruturada gera +104% em vendas** (Kwong, 2024)
4. **SEO + ads juntos geram +135% de visitas** (Marquez, 2018)
5. **Inativos > 180d drenam orçamento** — pior ROAS possível

Por isso o plano é **gratuito até a Fase 4** (mensuração + SEO + UX + email + dashboard analítico), e só depois disso (com dados que justificam) gastar em mídia paga.

---

## 1. Eventos canônicos do funil

| Etapa                 | Evento GA4       | Evento Meta Pixel  | Onde dispara                                                                                                   |
| --------------------- | ---------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Ver catálogo          | `view_catalog`   | —                  | `ProductsPage.jsx` (uma vez por montagem)                                                                      |
| Ver produto           | `view_item`      | `ViewContent`      | `ProductDetailsPage.jsx`                                                                                       |
| Adicionar ao carrinho | `add_to_cart`    | `AddToCart`        | `CartProvider.jsx` (`addToCart`; `removeFromCart` dispara `remove_from_cart`)                                  |
| Iniciar checkout      | `begin_checkout` | `InitiateCheckout` | `CheckoutPage.jsx` (mount)                                                                                     |
| Compra confirmada     | `purchase`       | `Purchase`         | `DownloadsPage.jsx` via `trackPurchaseOnce` (dedup por `orderId`) **somente após confirmação real** (regra A2) |

A lista canônica completa do cliente (`src/utils/analytics.js`) tem 7 eventos: `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `view_catalog`, `begin_checkout`, `purchase` (`view_cart` está na lista, mas hoje nenhum componente o dispara). O mapa para Meta cobre `view_item`→ViewContent, `add_to_cart`→AddToCart, `view_cart`→ViewCart, `begin_checkout`→InitiateCheckout, `purchase`→Purchase.

**Padrão (regra A1):** todo novo touchpoint do funil deve disparar o evento canônico correspondente em ambos os trackers + `track-event` no `analytics_events`.

### Implementação

```js
// src/utils/analytics.js (simplificado)
export function trackEvent(name, params = {}) {
  if (!CANONICAL_EVENTS.has(name)) return; // só eventos canônicos
  const clean = sanitizeProperties(params); // remove email/cpf/phone
  // Backend (analytics_events): essenciais (todos exceto purchase) sempre;
  // demais só com consentimento — via navigator.sendBeacon (fallback fetch keepalive)
  if (isEssential(name) || hasMarketingConsent()) postEventToBackend(name, clean);
  if (!hasMarketingConsent()) return; // GA4 e Pixel: só com consent
  window.gtag?.('event', name, clean);
  window.fbq?.('track', META_EVENT_MAP[name], metaPayload);
}
```

### Whitelist no backend

`api/track-event.js` valida o `event_name` via `isClientEventAllowed` (`lib/analytics-events.js`). Eventos de cliente permitidos: `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `view_catalog`, `begin_checkout`, `client_error`. Eventos fora da lista são **descartados em silêncio** (o endpoint sempre responde 204 — tracking nunca quebra a UX).

`purchase` do cliente **não** entra no `analytics_events`: as compras entram server-side pela allowlist de servidor — `checkout_initiated` (gravado em `create-payment`) e `payment_approved` / `payment_rejected` / `payment_cancelled` (gravados no `webhook`). A allowlist de servidor também inclui `webhook_received`, mas nenhum handler grava esse evento hoje.

### Dados pessoais

**Nunca** envie email, telefone ou CPF como propriedade de evento (regra A5). No backend, o `sanitizeProperties` de `lib/analytics-events.js` remove, em qualquer nível de aninhamento, qualquer chave cujo nome **contenha** `email`, `cpf`, `phone`, `telefone`, `password` ou `senha`. No frontend, o `sanitizeProperties` de `src/utils/analytics.js` é mais raso: só deleta as chaves exatas de topo `email`, `customer_email`, `cpf` e `phone` — a defesa robusta é a do servidor. Use hash sha256 se precisar correlacionar.

### Retenção

`analytics_events` guarda no máximo **180 dias**: purge mensal via `pg_cron` (`cleanup_old_analytics_events`, migration phase0_analytics_retention) e sob demanda pelo admin via `POST /api/admin-cleanup-events`.

---

## 2. UTM e atribuição

Toda primeira visita com `utm_*` na URL grava em `localStorage` (chave `attribution_data`) via `src/utils/attribution.js`, com TTL de 30 dias e política **first-touch wins** (UTMs já capturadas não são sobrescritas — Curva ABC e receita de aquisição refletem a origem inicial). Quando o cliente faz checkout, `create-payment` anexa o payload a `orders.attribution_data` (JSONB), filtrado pela whitelist canônica de 9 campos de `lib/attribution-sanitize.js`:

```json
{
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "alfabetizacao_q1",
  "utm_content": "...",
  "utm_term": "...",
  "referrer": "https://google.com",
  "landing_path": "/produtos/painel-alfabeto",
  "first_touch_at": "2026-05-24T...",
  "session_id": "s_..."
}
```

O mesmo payload sanitizado também é persistido em `abandoned_carts.attribution_data` e `email_subscribers.attribution_data`. Permite atribuição correta de receita: o pedido sabe de qual campanha veio. A aba **Funil** usa isso para reportar pedidos, receita e share por origem (`utm_source`, com breakdown por medium/campaign).

---

## 3. Consentimento LGPD

`ConsentBanner.jsx` aparece na primeira visita com 2 opções:

- **Aceitar todos** — habilita GA4 + Meta Pixel
- **Apenas essenciais** — bloqueia os trackers de marketing

Estado em `localStorage` (chave `lgpd_consent`) via `utils/consent.js` (`CONSENT_POLICY_VERSION = '2026-05-24'`). Eventos essenciais (todos os canônicos, exceto `purchase`) rodam como "first-party only" sem consent — não vão para Google/Meta, mas vão para `analytics_events`. O `purchase` do cliente só dispara com consentimento (GA4/Pixel); no `analytics_events`, a compra entra server-side como `payment_approved` via webhook, independente de consent.

---

## 4. SEO

Detalhes da implementação em [02-ARQUITETURA §SEO](./02-ARQUITETURA.md) e regras em [11-REGRAS-NEGOCIO §E](./11-REGRAS-NEGOCIO.md).

Resumo do que está implementado:

- **Slugs** em todos os produtos e categorias (URLs como `/produtos/painel-alfabeto-cursivo`)
- **`<title>` e `<meta description>` únicos** por página via `SEO.jsx` (`react-helmet-async`)
- **Schema.org `Product` + `Offer`** em página de produto (JSON-LD)
- **Sitemap dinâmico** em `/sitemap.xml` (gerado por `api/sitemap.xml.js`)
- **robots.txt** em `public/robots.txt` com `Sitemap:` declarado
- **Canonical URLs** em todas as páginas
- **OG tags** com fallback `/favicon.svg` como imagem default (`SEO.jsx` só emite `og:image`/`twitter:image` para asset que existe; o antigo `og-default.png` nunca foi versionado) — páginas de produto sobrescrevem com a imagem do produto

### Submeter sitemap (pós-deploy)

1. [search.google.com/search-console](https://search.google.com/search-console) → adicionar domínio
2. Verificar propriedade (TXT no DNS ou meta tag)
3. Sitemaps → Adicionar → `sitemap.xml`

### Lighthouse alvo (regra F1)

- Performance ≥ 90 (mobile) / 95 (desktop)
- Accessibility ≥ 90
- Best Practices ≥ 90
- SEO ≥ 95

O que a CI efetivamente cobra hoje (`lighthouse.yml` + `lighthouserc.json`, LHCI rodando estático sobre `dist/`, preset desktop): performance ≥ 0.80 (erro), accessibility ≥ 0.90 (erro), SEO ≥ 0.90 (erro), best-practices ≥ 0.90 (só warn, não bloqueia).

---

## 5. Curva ABC

A Curva ABC é central para tomada de decisão (regra I3). Implementação em `lib/abc-classification.js` (compartilhada entre os endpoints server-side e o widget do Dashboard via `derive.js`). Classificação por receita acumulada (`classifyByCumulative`): **A** = itens até 80% da receita acumulada, **B** = até 95%, **C** = o restante. Todos os endpoints abaixo têm cache in-memory de 1h (regra F5) e aceitam `?nocache=1`.

### Produtos

`GET /api/admin-abc-products?period=month|quarter|year&categoryId=<uuid>` (default `month`)

Curva ABC de produtos por receita, baseada em `order_items` de pedidos aprovados; retorna `items` (rank, share, % acumulado, classe) + `summary {A,B,C}`.

Cuidado: produto C **pode ser produto de entrada** (baixo ticket, alta conversão de novos). Não descontinuar cego (regra anti-pattern em [11-REGRAS-NEGOCIO](./11-REGRAS-NEGOCIO.md)).

### Clientes

`GET /api/admin-abc-customers?period=month|quarter|year|all` (default `quarter`)

Agrupa pedidos aprovados por `customer_email`, aplica a mesma curva ABC e acrescenta classificação de relacionamento:

- **vip** — 5+ pedidos OU classe A da curva
- **recorrente** — 2-4 pedidos
- **eventual** — 1 pedido

Email **mascarado** (`cli***@dominio.com`) para LGPD — inclusive no export CSV da aba **Análise**. O parâmetro `?includePII=1` existe no endpoint para export interno, mas o frontend não o usa.

### Coorte

`GET /api/admin-cohort?months=12` (1-36)

Matriz: linhas = mês da primeira compra (coorte), colunas = índice de meses subsequentes (M+0, M+1, ...), células = % da coorte ativa naquele mês relativo.

Detecta retenção cedendo (drop entre meses 1-3 indica problema de pós-venda) e separa sazonalidade do ano letivo (volta às aulas = pico).

As três visões ficam na aba **Análise** do admin, cada uma com botão de export CSV (`utils/csv-export.js`).

---

## 6. Segmentação para campanhas

Implementação em `lib/customer-segmentation.js`: tags calculadas a partir dos pedidos com `payment_status='approved'` de cada subscriber confirmado de `email_subscribers`:

| Tag                  | Critério                                                 | Para que serve                                  |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `cliente_vip`        | 5+ pedidos OU LTV > `VIP_LTV_THRESHOLD` (default R$ 300) | Lookalike de mídia paga, lançamentos exclusivos |
| `cliente_recorrente` | ≥ 2 pedidos                                              | Cross-sell baseado em categoria comprada        |
| `cliente_ativo`      | compra nos últimos 90 dias                               | Base saudável para newsletter                   |
| `inativo_30d`        | último pedido há mais de 30 e menos de 90 dias (31–89)   | Lembrete de continuidade                        |
| `inativo_90d`        | último pedido entre 90 e 179 dias                        | **Cupom de reativação `VOLTEI15`** (regra D8)   |
| `inativo_180d`       | sem compra ≥ 180d                                        | **NÃO ENVIAR** (regra D7)                       |
| `categoria:<slug>`   | uma por categoria já comprada                            | Segmentar campanhas por interesse               |

Carrinho abandonado não é tag: é tratado direto pelo cron sobre `abandoned_carts` (`recovered_at IS NULL`), com lembretes ~1h e ~24h.

Acessível na aba **Segmentos** do admin via `GET /api/admin-segments` (cache 30 min): relatório **agregado** (totais de confirmados/pendentes/desinscritos + contagem por tag), sem lista bruta de e-mails. O export CSV para envio externo (regra I4) ainda não existe — o código prevê endpoint dedicado com confirmação.

---

## 7. Email marketing

Detalhes em [05-FLUXOS §8-9](./05-FLUXOS.md) (carrinho abandonado/reativação e newsletter) e regras em [11-REGRAS-NEGOCIO §D](./11-REGRAS-NEGOCIO.md).

### Templates (`lib/email-templates.js`)

8 templates HTML mobile-friendly:

1. `orderConfirmation` — D+0, transacional (após pagamento; inclui bloco "conta criada para você" quando a conta é provisionada)
2. `optInConfirmation` — double opt-in da newsletter (`/confirmar-inscricao?token=`, regra D1)
3. `postPurchaseD3` — D+3, pedido de avaliação
4. `postPurchaseD15` — D+15, cross-sell por categoria comprada
5. `postPurchaseD45` — D+45, novidades da mesma categoria
6. `abandonedCart` — lembrete de carrinho abandonado, variantes `1h` e `24h`
7. `reactivation90` — reativação com cupom (default `VOLTEI15`, 15%)
8. `unsubscribeSuccess` — confirmação de descadastro (transacionais continuam)

Reset de senha e confirmação de cadastro ficam a cargo do SMTP do Supabase Auth (não são templates deste módulo).

O footer com **link de descadastro 1-clique** (regra D2) é auto-appendado por `lib/email-sender.js` em todos os kinds de marketing, junto com os headers RFC 8058 `List-Unsubscribe`/`List-Unsubscribe-Post`; transacionais não levam footer de descadastro.

### Sequência pós-compra

```
Compra aprovada
   │
   ▼ D+0
[orderConfirmation] ─── enviada inline (webhook)
   │
   ▼ D+3
[postPurchaseD3] ─── pedido de avaliação / review
   │
   ▼ D+15
[postPurchaseD15] ─── cross-sell baseado em categoria
   │
   ▼ D+45
[postPurchaseD45] ─── novidades da mesma categoria
   │
   ▼ D+90 a D+180 (se sem nova compra)
[reactivation90] ─── cupom VOLTEI15 (janela REACTIVATION_DAYS_MIN/MAX, default 90/180)
   │
   ▼ D+180+
PARAR (regra D7) ─── inativos não recebem mais
```

Cron `/api/cron-email-jobs` chamado de hora em hora pelo GitHub Actions (`email-cron.yml`, `0 * * * *` UTC) via POST com header `X-Cron-Secret` (= `CRON_SECRET`, comparação timing-safe). Idempotência via `email_sent_log`; máx. 100 candidatos por sub-job por execução.

### Frequência e qualidade

- Máximo **1 newsletter manual/semana** para o mesmo segmento (regra D3)
- Double opt-in obrigatório (regra D1)
- Domínio com **SPF + DKIM + DMARC** autenticados no DNS (regra D6)

### Provider: Resend

- Free: 3.000 emails/mês (~100/dia)
- Pro: 50.000/mês (US$ 20/mês) — só quando lista > 5k inscritos

Setup em [03-SETUP §2.5 e §5](./03-SETUP.md).

---

## 8. Funil de conversão

`GET /api/admin-funnel?days=30` (1-180; a aba oferece 7/30/90 dias; cache 1h, `?nocache=1` invalida)

Conta **sessões únicas** por etapa em `analytics_events`; a etapa `purchase` vem da contagem de pedidos aprovados do período (não de evento de cliente). Retorna:

```json
{
  "success": true,
  "windowDays": 30,
  "funnel": [
    {
      "key": "view_catalog",
      "label": "Visitas ao catálogo",
      "count": 10000,
      "conversionFromPrevious": 1.0
    },
    {
      "key": "view_item",
      "label": "Visualizou produto",
      "count": 5000,
      "conversionFromPrevious": 0.5
    },
    {
      "key": "add_to_cart",
      "label": "Adicionou ao carrinho",
      "count": 1000,
      "conversionFromPrevious": 0.2
    },
    {
      "key": "begin_checkout",
      "label": "Iniciou checkout",
      "count": 500,
      "conversionFromPrevious": 0.5
    },
    { "key": "purchase", "label": "Compra aprovada", "count": 150, "conversionFromPrevious": 0.3 }
  ],
  "attribution": { "items": [], "totalRevenue": 0, "totalApproved": 0 },
  "dailyPurchases": [],
  "totals": { "sessions": 0, "events": 0, "approvedOrders": 0, "revenue": 0 }
}
```

Aba **Funil** renderiza com drop-off por etapa + tabela de atribuição por origem (pedidos, receita, share) + compras diárias.

---

## 9. KPIs mestres

| Categoria     | Métricas                                                     | Meta saudável     |
| ------------- | ------------------------------------------------------------ | ----------------- |
| **Aquisição** | Visitantes únicos · Origem tráfego · CAC (após Fase 5)       | depende do volume |
| **Conversão** | Taxa geral · Por etapa · Ticket médio · Abandono de carrinho | > 1.5% geral      |
| **Retenção**  | Recompra · LTV 12m · Frequência · Tempo entre compras        | Recompra > 20%    |
| **Saúde**     | ROAS por canal · **LTV/CAC ≥ 3** · Aprovação MP · NPS        | LTV/CAC ≥ 3       |

Parte disso já é servido por `GET /api/admin-kpis?window=12` (1-36 meses, cache 1h): receita MTD vs mês anterior, ticket médio, pedidos, LTV médio e taxa de recompra — `CAC` retorna `null` até existir mídia paga (Fase 5). Consumido pela aba **Dashboard**.

Glossário em [11-REGRAS-NEGOCIO §glossário](./11-REGRAS-NEGOCIO.md).

---

## 10. Mídia paga (Fase 5 — ainda não iniciada)

> ⚠️ **Custa ~R$ 5.000/mês mínimo.** Só faz sentido depois de Fases 0-4 fechadas.

### Gatilho para iniciar

- 30+ dias de funil rastreado
- 50+ pedidos para Curva ABC ter dados
- ROAS orgânico ≥ 3x no Pinterest / Search Console

### Estrutura planejada

| Canal                | Mínimo diário           | Total mensal  | Receita esperada (ROAS 3x) |
| -------------------- | ----------------------- | ------------- | -------------------------- |
| Google Ads           | R$ 30/dia × 3 campanhas | R$ 2.700      | R$ 8.100                   |
| Meta Ads             | R$ 30/dia × 2 campanhas | R$ 1.800      | R$ 5.400                   |
| Pinterest (opcional) | R$ 15/dia               | R$ 450        | R$ 1.350                   |
| **Total mínimo**     | —                       | **~R$ 5.000** | **~R$ 15.000**             |

### Regras (extraídas de [11-REGRAS-NEGOCIO §C](./11-REGRAS-NEGOCIO.md))

- C1: tracking funcionando antes de subir campanha
- C2: otimizar para `purchase`, nunca para clique
- C3: funil frio, morno e quente em campanhas separadas
- C4: público baseado em Curva ABC (lookalike de VIPs)
- C5: landing com message match do anúncio
- C6: começar com R$ 30/dia; dobrar só após 7d ROAS ≥ 3x
- C7: pausar/matar só após 7+ dias rodando + ROAS < 1 sem tendência
- C8: anúncios em AIDA (Atenção, Interesse, Desejo, Ação)
- C9: zero personalização nominal em escala (regra D5 também)
- C10: nunca anunciar para inativos totais (pior ROI)

### Estrutura de campanhas (modelo Kwong)

1. **Genérica** — palavras-chave amplas para a categoria
2. **Categoria específica** — termos com intenção
3. **Institucional** — marca + diferenciais

---

## 11. Otimização contínua (Fase 6 — não iniciada)

### Recorrências planejadas

1. **Reunião semanal de métricas (30 min)** — Curva ABC, ROAS, conversão, recompra → 1-3 experimentos por semana
2. **Teste A/B mensal** em pontos críticos — hipótese clara, 7+ dias, ≥ 200 conversões por variante (GrowthBook self-hosted)
3. **Auditoria mensal de SEO** — posições Search Console, páginas com queda, novos termos
4. **Limpeza trimestral de catálogo** — despublicar produtos com 0 vendas em 90d (cuidado com produto de entrada)
5. **Expansão trimestral de canais** — marketplace educacional (Elo7), YouTube Shorts/Reels, parcerias com influenciadoras

### Stack gratuito para Fase 6

- **Microsoft Clarity** — heatmap + session recording (ilimitado, grátis)
- **GrowthBook self-hosted** — A/B testing (grátis se hostado no Vercel)

Hotjar / GrowthBook Cloud só se Clarity ficar pequeno.

---

## 12. Custos vs gratuito

### Atualmente (0-4 entregues)

**R$ 0,00 fixo mensal.** Único custo real = domínio ~R$ 40/ano.

| Função               | Ferramenta                                 | Tier free                                  |
| -------------------- | ------------------------------------------ | ------------------------------------------ |
| Analytics            | GA4                                        | 10M events/mês                             |
| Pixel                | Meta Pixel + Conversions API               | ilimitado                                  |
| Email                | Resend SMTP                                | 3.000/mês                                  |
| Cron horário         | GitHub Actions                             | 2.000 min/mês                              |
| Hospedagem           | Vercel Hobby                               | 100GB bandwidth                            |
| DB + Auth            | Supabase Free                              | 500MB DB + 50k MAU                         |
| Heatmap/A/B (Fase 6) | Microsoft Clarity + GrowthBook self-hosted | ilimitado                                  |
| Pagamentos           | Mercado Pago                               | 4,99% + R$ 0,40 por venda (não assinatura) |

### Upgrades opcionais (só quando estourar)

| Serviço           | Custo              | Gatilho                                     |
| ----------------- | ------------------ | ------------------------------------------- |
| Resend Pro        | US$ 20/mês         | lista > 5k inscritos OU > 100 emails/dia    |
| Supabase Pro      | US$ 25/mês         | DB > 500MB OU precisar `pg_cron` automático |
| Vercel Pro        | US$ 20/mês         | bandwidth > 100GB/mês                       |
| Cloudflare Images | US$ 5/mês por 100k | catálogo > 200 produtos                     |
| Sentry Team       | US$ 26/mês         | ErrorBoundary mostrando > 100 erros/dia     |
| Hotjar Plus       | US$ 32/mês         | quando Clarity ficar pequeno                |

---

## 13. Resumo: como medir o sucesso

### Curto prazo (1-3 meses pós Fase 4 entregue)

- [ ] Migrations aplicadas → `analytics_events` populada
- [ ] GA4 + Pixel disparando os eventos canônicos do funil
- [ ] Domínio autenticado no Resend (SPF/DKIM/DMARC)
- [ ] Sitemap submetido no Search Console
- [ ] Lighthouse ≥ 90/95
- [ ] Conversão `add_to_cart → purchase` baseline medida (30+ dias de dados)

### Médio prazo (3-6 meses)

- [ ] Recompra ≥ 20% (visível nos KPIs da aba **Dashboard**, via `/api/admin-kpis`)
- [ ] LTV 12m subindo
- [ ] Curva ABC com 50+ pedidos → dá pra planejar Fase 5
- [ ] Taxa de carrinhos recuperados > 10%

### Longo prazo (6-12 meses)

- [ ] Fase 5 ativa com ROAS médio ≥ 3x
- [ ] LTV/CAC ≥ 3
- [ ] Posições orgânicas em ≥ 3 termos relevantes (top 10 Google)
- [ ] Lista de email > 1.000 inscritos confirmados
