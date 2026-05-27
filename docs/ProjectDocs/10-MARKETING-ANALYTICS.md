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

| Etapa | Evento GA4 | Evento Meta Pixel | Onde dispara |
|---|---|---|---|
| Ver produto | `view_item` | `ViewContent` | `ProductDetailsPage.jsx` |
| Adicionar ao carrinho | `add_to_cart` | `AddToCart` | `CartProvider.jsx` (action `addItem`) |
| Iniciar checkout | `begin_checkout` | `InitiateCheckout` | `CheckoutPage.jsx` (mount) |
| Compra confirmada | `purchase` | `Purchase` | `DownloadsPage.jsx` **somente após confirmação real** (regra A2) |

**Padrão (regra A1):** todo novo touchpoint do funil deve disparar o evento canônico correspondente em ambos os trackers + `track-event` no `analytics_events`.

### Implementação

```js
// src/utils/analytics.js (pseudo)
export function trackEvent(name, params = {}) {
  if (!consent.granted) return;       // LGPD gate
  window.gtag?.('event', name, params);
  window.fbq?.('track', mapToFbqName(name), params);
  fetch('/api/track-event', { method: 'POST', body: JSON.stringify({ event_name: name, properties: params, session_id }) });
}
```

### Whitelist no backend

`api/track-event.js` valida o `event_name` contra uma whitelist (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `view_category`, `search`, `add_to_wishlist`, etc.). Eventos fora da lista retornam 400.

### Dados pessoais
**Nunca** envie email, telefone ou CPF como propriedade de evento (regra A5). Use hash sha256 se precisar correlacionar.

---

## 2. UTM e atribuição

Toda primeira visita com `utm_*` na URL grava em `localStorage` via `utils/attribution.js` com TTL de 30 dias. Quando o cliente faz checkout, as UTMs são anexadas a `orders.attribution_data` (JSONB):

```json
{
  "first_touch": {
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "alfabetizacao_q1",
    "referrer": "https://google.com",
    "timestamp": "2026-05-24T..."
  },
  "last_touch": { ... }
}
```

Permite atribuição correta de receita: o pedido sabe de qual campanha veio. A aba **Funil** + **Análise** usa isso para reportar ROAS por canal.

---

## 3. Consentimento LGPD

`ConsentBanner.jsx` aparece na primeira visita com 3 opções:
- **Aceitar** — habilita GA4 + Meta Pixel
- **Rejeitar** — bloqueia
- **Personalizar** — futuro (modal granular)

Estado em `localStorage` via `utils/consent.js`. Eventos essenciais (carrinho, checkout, `purchase`) podem rodar como "first-party only" sem consent — não vão para Google/Meta, mas vão para `analytics_events`.

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
- **OG tags** com `og-default.png` (1200×630) — ⚠️ imagem ainda não criada, pendência §13

### Submeter sitemap (pós-deploy)
1. [search.google.com/search-console](https://search.google.com/search-console) → adicionar domínio
2. Verificar propriedade (TXT no DNS ou meta tag)
3. Sitemaps → Adicionar → `sitemap.xml`

### Lighthouse alvo (regra F1)
- Performance ≥ 90 (mobile) / 95 (desktop)
- Accessibility ≥ 90
- Best Practices ≥ 90
- SEO ≥ 95

CI bloqueia PR que derrube qualquer um.

---

## 5. Curva ABC

A Curva ABC é central para tomada de decisão (regra I3). Implementação em `lib/abc-classification.js` (compartilhada entre produtos e clientes).

### Produtos

`GET /api/admin-abc-products?period=90d&category=alfabetizacao`

Classifica:
- **Classe A** — top 20% de produtos = ~80% receita
- **Classe B** — próximos 30% = ~15% receita
- **Classe C** — últimos 50% = ~5% receita

Cuidado: produto C **pode ser produto de entrada** (baixo ticket, alta conversão de novos). Não descontinuar cego (regra anti-pattern em [11-REGRAS-NEGOCIO](./11-REGRAS-NEGOCIO.md)).

### Clientes

`GET /api/admin-abc-customers?period=12m`

Segmenta:
- **VIP** — top 20% por receita acumulada
- **Recorrente** — ≥ 2 pedidos
- **Eventual** — 1 pedido

Email **mascarado** (`m***@gmail.com`) para LGPD. Detalhe completo (não mascarado) só via "Exportar CSV" assinado.

### Coorte

`GET /api/admin-cohort?period=12m`

Matriz: linhas = mês de aquisição, colunas = meses subsequentes, células = % que voltou a comprar.

Detecta retenção cedendo (drop entre meses 1-3 indica problema de pós-venda).

---

## 6. Segmentação para campanhas (RFM)

Implementação em `lib/customer-segmentation.js`. Segmentos pré-definidos:

| Segmento | Critério | Para que serve |
|---|---|---|
| VIP | top 20% receita | Lookalike de mídia paga, lançamentos exclusivos |
| Recorrentes | ≥ 2 pedidos | Cross-sell baseado em categoria comprada |
| Eventuais | 1 pedido | Segunda compra (D+15, D+30) |
| Inativos 60-90d | sem compra entre 60 e 90d | Lembrete de continuidade |
| Inativos 90-180d | sem compra entre 90 e 180d | **Cupom de reativação `VOLTEI15`** (regra D8) |
| Inativos > 180d | sem compra > 180d | **NÃO ENVIAR** (regra D7) |
| Carrinho abandonado | `abandoned_carts.recovered_at IS NULL` | Lembrete por e-mail |

Acessível na aba **Segmentos** do admin + export CSV para envio externo (regra I4).

---

## 7. Email marketing

Detalhes em [05-FLUXOS §9](./05-FLUXOS.md) e regras em [11-REGRAS-NEGOCIO §D](./11-REGRAS-NEGOCIO.md).

### Templates (`lib/email-templates.js`)

8 templates HTML mobile-friendly:
1. `confirmation` — D+0, transacional (após pagamento)
2. `download_link` — re-envio de link de download
3. `password_reset` — wrapped pelo Supabase Auth SMTP
4. `signup_confirm` — wrapped pelo Supabase Auth SMTP
5. `post_purchase_d3` — D+3, pesquisa de satisfação
6. `post_purchase_d15` — D+15, cross-sell
7. `abandoned_cart_reminder` — lembrete 1-2h após abandono
8. `reactivation_90d` — campanha de reativação com cupom

Todos com **link de descadastro 1-clique** em todo footer (regra D2).

### Sequência pós-compra

```
Compra aprovada
   │
   ▼ D+0
[confirmation] ─── enviada inline
   │
   ▼ D+3
[post_purchase_d3] ─── pesquisa de satisfação / review
   │
   ▼ D+15
[post_purchase_d15] ─── cross-sell baseado em categoria
   │
   ▼ D+90 (se sem nova compra)
[reactivation_90d] ─── cupom VOLTEI15
   │
   ▼ D+180+
PARAR (regra D7) ─── inativos não recebem mais
```

Cron `/api/cron-email-jobs` chamado de hora em hora.

### Frequência e qualidade
- Máximo **1 newsletter manual/semana** para o mesmo segmento (regra D3)
- Double opt-in obrigatório (regra D1)
- Domínio com **SPF + DKIM + DMARC** autenticados no DNS (regra D6)

### Provider: Resend
- Free: 3.000 emails/mês (~100/dia)
- Pro: 50.000/mês (US$ 20/mês) — só quando lista > 5k inscritos

Setup em [03-SETUP §5](./03-SETUP.md).

---

## 8. Funil de conversão

`GET /api/admin-funnel?period=30d&category=...&utm_source=...`

Retorna:
```json
{
  "stages": [
    { "name": "page_view", "count": 10000, "rate": 1.0 },
    { "name": "view_item", "count": 5000, "rate": 0.50 },
    { "name": "add_to_cart", "count": 1000, "rate": 0.20 },
    { "name": "begin_checkout", "count": 500, "rate": 0.50 },
    { "name": "purchase", "count": 150, "rate": 0.30 }
  ],
  "overallConversion": 0.015
}
```

Aba **Funil** renderiza com drop-off por etapa + comparação período anterior.

---

## 9. KPIs mestres

| Categoria | Métricas | Meta saudável |
|---|---|---|
| **Aquisição** | Visitantes únicos · Origem tráfego · CAC (após Fase 5) | depende do volume |
| **Conversão** | Taxa geral · Por etapa · Ticket médio · Abandono de carrinho | > 1.5% geral |
| **Retenção** | Recompra · LTV 12m · Frequência · Tempo entre compras | Recompra > 20% |
| **Saúde** | ROAS por canal · **LTV/CAC ≥ 3** · Aprovação MP · NPS | LTV/CAC ≥ 3 |

Glossário em [11-REGRAS-NEGOCIO §glossário](./11-REGRAS-NEGOCIO.md).

---

## 10. Mídia paga (Fase 5 — ainda não iniciada)

> ⚠️ **Custa ~R$ 5.000/mês mínimo.** Só faz sentido depois de Fases 0-4 fechadas.

### Gatilho para iniciar
- 30+ dias de funil rastreado
- 50+ pedidos para Curva ABC ter dados
- ROAS orgânico ≥ 3x no Pinterest / Search Console

### Estrutura planejada

| Canal | Mínimo diário | Total mensal | Receita esperada (ROAS 3x) |
|---|---|---|---|
| Google Ads | R$ 30/dia × 3 campanhas | R$ 2.700 | R$ 8.100 |
| Meta Ads | R$ 30/dia × 2 campanhas | R$ 1.800 | R$ 5.400 |
| Pinterest (opcional) | R$ 15/dia | R$ 450 | R$ 1.350 |
| **Total mínimo** | — | **~R$ 5.000** | **~R$ 15.000** |

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

| Função | Ferramenta | Tier free |
|---|---|---|
| Analytics | GA4 | 10M events/mês |
| Pixel | Meta Pixel + Conversions API | ilimitado |
| Email | Resend SMTP | 3.000/mês |
| Cron horário | GitHub Actions | 2.000 min/mês |
| Hospedagem | Vercel Hobby | 100GB bandwidth |
| DB + Auth | Supabase Free | 500MB DB + 50k MAU |
| Heatmap/A/B (Fase 6) | Microsoft Clarity + GrowthBook self-hosted | ilimitado |
| Pagamentos | Mercado Pago | 4,99% + R$ 0,40 por venda (não assinatura) |

### Upgrades opcionais (só quando estourar)

| Serviço | Custo | Gatilho |
|---|---|---|
| Resend Pro | US$ 20/mês | lista > 5k inscritos OU > 100 emails/dia |
| Supabase Pro | US$ 25/mês | DB > 500MB OU precisar `pg_cron` automático |
| Vercel Pro | US$ 20/mês | bandwidth > 100GB/mês |
| Cloudflare Images | US$ 5/mês por 100k | catálogo > 200 produtos |
| Sentry Team | US$ 26/mês | ErrorBoundary mostrando > 100 erros/dia |
| Hotjar Plus | US$ 32/mês | quando Clarity ficar pequeno |

---

## 13. Resumo: como medir o sucesso

### Curto prazo (1-3 meses pós Fase 4 entregue)
- [ ] Migrations aplicadas → `analytics_events` populada
- [ ] GA4 + Pixel disparando os 4 eventos canônicos
- [ ] Domínio autenticado no Resend (SPF/DKIM/DMARC)
- [ ] Sitemap submetido no Search Console
- [ ] Lighthouse ≥ 90/95
- [ ] Conversão `add_to_cart → purchase` baseline medida (30+ dias de dados)

### Médio prazo (3-6 meses)
- [ ] Recompra ≥ 20% (visível na aba **Análise** → KPIs)
- [ ] LTV 12m subindo
- [ ] Curva ABC com 50+ pedidos → dá pra planejar Fase 5
- [ ] Taxa de carrinhos recuperados > 10%

### Longo prazo (6-12 meses)
- [ ] Fase 5 ativa com ROAS médio ≥ 3x
- [ ] LTV/CAC ≥ 3
- [ ] Posições orgânicas em ≥ 3 termos relevantes (top 10 Google)
- [ ] Lista de email > 1.000 inscritos confirmados
