# Plano de Implementação — E-commerce de Alta Qualidade

> **Fases 0-4 entregues em código** (mensuração, SEO, UX/conversão, email marketing, dashboard analítico). Fases 5-6 não iniciadas. Detalhes operacionais em [PENDENCIAS.md](./PENDENCIAS.md), princípios em [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md).

## Onde está cada coisa agora

| Pergunta                                     | Resposta                                     |
| -------------------------------------------- | -------------------------------------------- |
| Quais princípios regem decisões?             | [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md) |
| O que precisa ser feito agora (operacional)? | [PENDENCIAS.md](./PENDENCIAS.md)             |
| Quanto custa cada fase (grátis vs pago)?     | §"💰 Custos" abaixo                          |
| O que ainda precisa de código?               | §"Fase 4-6" abaixo                           |
| O que mudou e quando?                        | §"Histórico" no final                        |

---

## Referências acadêmicas (fundamento das decisões)

- **FERREIRA, B. O.** _Estratégias de segmentação e personalização no e-mail marketing._ TCC, UFSC, 2025.
- **KWONG, J. C.** _Marketing digital para incremento de vendas em e-commerce de produtos personalizados._ TCC, UFRN, 2024.
- **MARQUEZ, W. T. et al.** _Estratégias de marketing digital para a alavancagem em e-commerce._ REAVI, 2018.
- **GILIOLI, R. M.; GHIGGI, T.** _E-commerce: reflexões sobre estratégias e desafios._ Revista Gestão e Serviços, 2020.
- **KOTLER, P.; KELLER, K. L.** _Marketing Management._ Pearson, 2016.

**Achados que motivaram o plano:**

- Cliente VIP/recomprador gera RPM **1227% maior** que baseline (Ferreira)
- Mídia paga bem estruturada gera **+104% em vendas** (Kwong)
- SEO + ads juntos: **+135% de visitas** (Marquez/REAVI)
- 14% das campanhas analisadas eram "Anomalia" (RPM alto, engajamento nulo) por falha de atribuição
- 35% caíram em "Incoerência Estratégica" (clica mas não compra)
- 5 axiomas que regem tudo (segmentação > personalização, mensuração antes de gasto, etc.) → [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md)

---

## 💰 Custos — gratuito vs pago

> **Decisão registrada:** o projeto roda **100% gratuito até o final da Fase 4**. Fase 5 (mídia paga) é a primeira que exige orçamento recorrente. Intenção do dono: não assinar nada pago no início.

### 🟢 Stack gratuito (suficiente para Fases 0-4)

| Função                 | Ferramenta                                 | Tier free                                  |
| ---------------------- | ------------------------------------------ | ------------------------------------------ |
| Analytics              | GA4                                        | 10M events/mês                             |
| Meta Pixel             | Pixel + Conversions API                    | ilimitado                                  |
| Email                  | Resend SMTP                                | **3.000/mês**                              |
| Cron horário           | GitHub Actions                             | 2.000 min/mês                              |
| Hospedagem             | Vercel Hobby                               | 100GB bandwidth                            |
| DB + Auth              | Supabase Free                              | **500MB DB + 50k MAU**                     |
| Heatmap / A/B (Fase 6) | Microsoft Clarity + GrowthBook self-hosted | ilimitado                                  |
| Pagamentos             | Mercado Pago                               | 4,99% + R$ 0,40 por venda (não assinatura) |

**Custo recorrente atual: R$ 0,00 fixo.** Único custo real = domínio (~R$ 40/ano).

### 💵 Fase 5 — primeira despesa recorrente real

| Canal                | Mínimo                  | Total mensal  | Receita esperada (ROAS 3x) |
| -------------------- | ----------------------- | ------------- | -------------------------- |
| Google Ads           | R$ 30/dia × 3 campanhas | R$ 2.700      | R$ 8.100                   |
| Meta Ads             | R$ 30/dia × 2 campanhas | R$ 1.800      | R$ 5.400                   |
| Pinterest (opcional) | R$ 15/dia               | R$ 450        | R$ 1.350                   |
| **Total mínimo**     | —                       | **~R$ 5.000** | **~R$ 15.000**             |

**Regra C6:** começar com R$ 30/dia, dobrar só após 7 dias com ROAS ≥ 3x.

### 🔵 Upgrades opcionais (só quando estourar tier free)

| Serviço           | Custo              | Gatilho                                     |
| ----------------- | ------------------ | ------------------------------------------- |
| Resend Pro        | US$ 20/mês         | lista > 5k inscritos OU > 100 emails/dia    |
| Supabase Pro      | US$ 25/mês         | DB > 500MB OU precisar `pg_cron` automático |
| Vercel Pro        | US$ 20/mês         | bandwidth > 100GB/mês                       |
| Cloudflare Images | US$ 5/mês por 100k | catálogo > 200 produtos                     |
| Sentry Team       | US$ 26/mês         | ErrorBoundary mostrando > 100 erros/dia     |
| Hotjar Plus       | US$ 32/mês         | quando Clarity ficar pequeno                |

### Estratégia "fica gratuito até o último momento"

A ordem das fases já mata custo: **0-4 gratuitas** produzem os dados que fazem a **Fase 5 (paga)** não ser desperdício. Curva ABC define público; conversão melhorada faz cada visita paga render mais; email reduz CAC efetivo. **Só então** vale investir.

**Gatilho para iniciar Fase 5:** funil rastreado por 30+ dias + Curva ABC com 50+ pedidos + ROAS de teste ≥ 3x no orgânico (Pinterest/Search Console).

---

## Estrutura de fases

```
Fase 0  — Fundação técnica e mensuração          🟢 Free  ✅ código entregue
Fase 1  — SEO técnico + performance              🟢 Free  ✅ código entregue
Fase 2  — UX e conversão do funil                🟢 Free  ✅ código entregue
Fase 3  — Retenção via email marketing           🟢 Free  ✅ código entregue (Resend 3k/mês grátis)
Fase 4  — Dashboard analítico (Curva ABC)        🟢 Free  ✅ código entregue
Fase 5  — Aquisição paga (Google + Meta)         💵 ~R$ 5k/mês mínimo  ⏳ não iniciada
Fase 6  — Otimização contínua e expansão         🟡 Mix free/pago  ⏳ não iniciada
```

**O que cada fase entregou + pendências operacionais (DKIM, og-image, migrations a aplicar, etc.):** [PENDENCIAS.md](./PENDENCIAS.md).

---

## Fase 4 — Dashboard analítico (Curva ABC) 🟢 Free · ✅ código entregue

**Por que importa:** sem Curva ABC, decisões de produto/estoque/campanha são intuição. Kwong validou que essa ferramenta foi decisiva para definir prioridades.

**Código entregue:** [api/admin-abc-products.js](../../api/admin-abc-products.js) (filtro por período + categoria), [api/admin-abc-customers.js](../../api/admin-abc-customers.js) (VIP/recorrente/eventual com email mascarado), [api/admin-cohort.js](../../api/admin-cohort.js) (matriz mensal), [api/admin-kpis.js](../../api/admin-kpis.js) (LTV/recompra/LTV-CAC ratio), aba **Análise** em [src/components/admin/tabs/AnalysisTab.jsx](../../src/components/admin/tabs/AnalysisTab.jsx) com Pareto + heatmap de coorte + filtros + **export CSV** ([src/utils/csv-export.js](../../src/utils/csv-export.js)), KPIs no Dashboard principal. Classificação ABC compartilhada em [lib/abc-classification.js](../../lib/abc-classification.js). Cache server-side de 1h em todos os endpoints (regra F5).

**Falta validar em produção:**

- [ ] Aba `Análise` carrega em < 2s com dados reais
- [ ] Rich Results Test + 50+ pedidos aprovados para validar coorte de 6+ meses
- [ ] **CAC** ainda retorna `null` — depende de Fase 5 (mídia paga) ou de integração com gasto manual (`ad_spend` table futura)

### O que NÃO fazer

- ❌ Recalcular Curva ABC a cada acesso → ✅ cache 1h server-side já implementado (regra F5)
- ❌ Descontinuar produto C cego — verificar antes se é produto de entrada (baixo ticket, alta conversão de novos)
- ❌ Usar Curva ABC para personalizar mensagens individualmente — usar para **público-alvo de campanha**

---

## Fase 5 — Aquisição paga (Google + Meta) 💵 ~R$ 5.000/mês mínimo · ⏳ não iniciada

> ⚠️ **PRIMEIRA FASE QUE EXIGE ORÇAMENTO RECORRENTE.** Tudo até aqui foi 100% gratuito. Só faz sentido **depois** das Fases 0-4 estarem fechadas — sem mensuração + Curva ABC + página de produto convertendo, vira IncoerÊncia Estratégica (Ferreira).

### Tarefas

1. **Público prioritário pela Curva ABC** — quais nichos são classe A (provável: educação infantil, alfabetização, volta às aulas)
2. **Google Ads — 3 campanhas** (modelo Kwong): genéricos + categoria específica + institucional
3. **Meta Ads — funis separados (regra C3)**: frio (interesse) + morno (visitantes 30d) + quente (carrinho abandonado + cross-sell); lookalike de VIPs
4. **Anúncios em AIDA (regra C8)**: benefício no título, diferencial na descrição, prova social, CTA específico
5. **Landing pages dedicadas** (`/lp/:slug`) — message match com o anúncio
6. **Otimização para `Purchase`** (regra C2) — nunca para clique ou tráfego
7. **Pinterest Business** — CPC mais baixo para conteúdo visual educacional

### O que NÃO fazer

- ❌ Iniciar com orçamento grande — começar R$ 30/dia (C6); dobrar só após 7d com ROAS ≥ 3x
- ❌ Pausar campanha no 1º dia ruim — aguardar 7 dias (C7)
- ❌ Misturar funil frio + quente no mesmo conjunto (C3)
- ❌ Otimizar para clique quando o objetivo é venda
- ❌ Anunciar para inativos totais — pior ROI possível (C10)

### Critério de aceitação

- [ ] 2 campanhas Google + 2 campanhas Meta com ≥ 7 dias de dados
- [ ] ROAS médio ≥ 3x no primeiro mês (ideal 5x até fim do trimestre)
- [ ] ≥ 1 landing por nicho prioritário no ar
- [ ] Dashboard de mídia paga no admin (CTR, CVR, CPL, CPV, ROAS por campanha)

---

## Fase 6 — Otimização contínua 🟡 Mix free/pago · ⏳ não iniciada

> **Para começar grátis:** Microsoft Clarity (heatmap) + GrowthBook self-hosted (A/B) cobrem 90% do valor. Hotjar/GrowthBook Cloud só se a operação justificar.

### Recorrências

1. **Reunião semanal de métricas (30min)** — Curva ABC, ROAS, conversão, recompra → 1-3 experimentos por semana
2. **Teste A/B mensal** em pontos críticos — hipótese clara, 7+ dias, ≥ 200 conversões por variante
3. **Auditoria mensal de SEO** — posições Search Console, páginas com queda, novos termos
4. **Limpeza trimestral de catálogo** — despublicar produtos com 0 vendas em 90d (cuidado com produto de entrada)
5. **Expansão trimestral de canais** — marketplace educacional (Elo7), YouTube Shorts/Reels, parcerias com influenciadoras

### O que NÃO fazer

- ❌ Mudar 5 coisas ao mesmo tempo — impossível aprender
- ❌ Pivotar a marca a cada trimestre — quebra SEO e brand recall
- ❌ Copiar concorrente sem entender o porquê

---

## KPIs mestres (acompanhar sempre)

| Categoria     | Métricas                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------- |
| **Aquisição** | Visitantes únicos/mês · Origem do tráfego (% orgânico/pago/direto/email/social) · CAC (após Fase 5) |
| **Conversão** | Taxa geral (visitante → compra) · Taxa por etapa do funil · Ticket médio · Abandono de carrinho     |
| **Retenção**  | Taxa de recompra (% clientes ≥ 2 pedidos) · LTV médio 12m · Frequência · Tempo entre compras        |
| **Saúde**     | ROAS por canal · **LTV/CAC ratio (alvo ≥ 3)** · Taxa de aprovação MP · NPS (após Fase 3)            |

---

## Próximo passo concreto

**Fases 0-4 estão com código pronto. O bloqueio agora é operacional, não técnico** (detalhes em [PENDENCIAS.md](./PENDENCIAS.md)):

1. Aplicar as 13 migrations no Supabase (`supabase/migrations/`, via `npm run supabase:db:push` ou SQL Editor) — 15 min
2. Plugar credenciais grátis (GA4 ID, Pixel ID, `CRON_SECRET`, Resend já está) — 1-2h
3. Autenticar domínio no Resend (DNS — propagação até 24h)
4. Criar `public/og-default.png` 1200×630 — 30 min
5. Validar Lighthouse no preview Vercel (se SEO < 95, decidir sobre prerender)
6. Submeter sitemap no Search Console

**Próximo trabalho:** Fase 5 (mídia paga) — 💵 só quando os dados das fases anteriores justificarem o investimento (gatilho: 30+ dias de funil rastreado + 50+ pedidos para Curva ABC + ROAS orgânico ≥ 3x).

---

## Histórico de revisões

| Data       | Mudança                                                                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-24 | Versão inicial — 7 fases priorizadas com 5 referências acadêmicas                                                                                                                                                                  |
| 2026-05-24 | Fase 0 entregue: GA4 + Meta Pixel + UTM + `analytics_events` + funil admin + Lighthouse CI + banner LGPD                                                                                                                           |
| 2026-05-24 | Fase 1 entregue: slugs + meta tags + JSON-LD + sitemap + robots + fontes trim                                                                                                                                                      |
| 2026-05-24 | Fase 2 entregue: refactor ProductsPage + selos de confiança (checkout + SocialProofStrip) + Skeleton + página produto convertendo + CartDrawer + cupons                                                                            |
| 2026-05-24 | Fase 3 entregue: double opt-in + 8 templates + sequência D+0/3/15/45 + abandoned cart + reactivation 90d + cron + aba Segmentos                                                                                                    |
| 2026-05-24 | Fase 4 entregue: Curva ABC produtos + clientes + coorte mensal + KPIs (LTV, recompra, LTV/CAC) + aba Análise com Pareto + heatmap + export CSV (regra I4)                                                                          |
| 2026-05-24 | Decisão registrada: stack 100% gratuito até Fase 4; Fase 5 (mídia paga) só quando dados justificarem                                                                                                                               |
| 2026-05-24 | **Doc compactado** — listas detalhadas de "Já entregue" das Fases 0-3 colapsadas; detalhes operacionais migrados para [PENDENCIAS.md](./PENDENCIAS.md) e implementação para [SECURITY.md](../ProjectDocs/08-SEGURANCA.md) / código |
