# 07 — Negócio e marketing

> Regras de negócio (o que vale para qualquer mudança que toque cliente, pagamento ou painel) e como a mensuração, o e-mail e os relatórios funcionam hoje. Quando uma regra conflitar com uma demanda urgente, **a regra vence**: atalho em e-commerce vira receita perdida.

---

## Como usar

1. **Antes de planejar:** leia as regras da área que você vai tocar.
2. **Se uma regra impedir o que você pretendia:** questione a demanda, não a regra.
3. **No PR:** passe pelo [checklist antes do merge](#checklist-antes-do-merge).
4. **Para criar ou mudar uma regra:** atualize este documento no mesmo PR, com a evidência ([quando uma regra precisa mudar](#quando-uma-regra-precisa-mudar)).

**Identificadores.** O código cita estas regras pelo ID ("regra I1", "regra D7", "regra G6"). Os axiomas são citados como "axioma A1"…"axioma A7" para não confundir com as regras da área A. O [CONTRIBUTING](../CONTRIBUTING.md) tem regras de código com o mesmo formato (A1 envelope HTTP, C3 formatação etc.): no código, "regra C3" num utilitário de formatação é do CONTRIBUTING; "regra C9" num template de e-mail é daqui. Pelo contexto não há ambiguidade. Não renumere.

---

## Axiomas

Sete princípios que sustentam as regras. Decisão que viole um axioma é inválida, mesmo que pareça vitória rápida.

| ID     | Axioma                                                             | Implicação                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | Segmentação vence personalização                                   | Esforço vai para achar o público (Curva ABC, histórico), não para `{NOME}` em escala. Ferreira (2025): campanha genérica para VIPs teve RPM 1227% acima do baseline; nome no título, RPM R$ 0 |
| **A2** | Histórico de compra prediz receita; engajamento prediz engajamento | Quem abre e-mail não é quem compra. Campanha de engajamento não substitui campanha de conversão                                                                                               |
| **A3** | Sem mensuração, não há otimização                                  | Nenhuma campanha paga ou esforço de retenção começa antes do tracking ponta a ponta. Ferreira: 14% das campanhas eram "anomalia" por falha de atribuição                                      |
| **A4** | Inativos totais drenam orçamento                                   | Nunca rodar campanha (paga ou e-mail) para lista fria sem critério. Ferreira: RPM R$ 4,94 contra baseline R$ 16,23                                                                            |
| **A5** | Cliente recorrente é o ativo mais valioso                          | Tempo desproporcional em retenção (e-mail, recompra, cross-sell) frente a aquisição                                                                                                           |
| **A6** | Atrito é inimigo da conversão                                      | Todo passo, campo ou clique entre intenção e compra precisa se justificar                                                                                                                     |
| **A7** | Confiança é pré-requisito                                          | Depoimentos reais, selos e clareza de processo são funcionalidade, principalmente em produto digital ("compra sem ver")                                                                       |

---

## Regras por área

Cada regra traz, quando aplicável, onde está no código e o que ainda falta.

### A. Mensuração e dados

**A1. Eventos canônicos obrigatórios.** Todo ponto do funil dispara o evento canônico no GA4, no Pixel e no `analytics_events` (tabela em [Mensuração](#mensuração)).

**A2. `purchase` só após confirmação real.** Nunca no redirect do Mercado Pago; só quando o backend devolve `approved`. Implementado em `DownloadsPage.jsx` via `trackPurchaseOnce` (dedup por pedido).

**A3. UTMs persistentes.** A primeira visita com `utm_*` grava em `localStorage` (30 dias) e é anexada a `orders.attribution_data`.

**A4. Consentimento LGPD.** GA4 e Pixel só carregam depois do "Aceitar todos". Eventos essenciais vão para `/api/track-event` (first-party) sem consentimento.

**A5. Sem dados pessoais em eventos.** Nunca e-mail, telefone ou CPF como propriedade de evento. Precisa correlacionar? Hash.

**A6. Histórico oficial no backend.** Pagamento, login de staff e alterações do painel ficam em `analytics_events`, `security_events` e `admin_audit_log`. GA4 não é fonte oficial (perde dados com adblock).

### B. UX e interface

- **B1. CTA principal acima da dobra** em toda página com objetivo de conversão.
- **B2. Um objetivo por página.** Produto vende o produto; captura captura e-mail; home apresenta a marca.
- **B3. Carrinho não bloqueia navegação.** Adicionar abre toast + drawer (`CartDrawer.jsx`), sem trocar de página.
- **B4. Checkout em uma página.** E-mail, nome, cupom e pagamento na mesma tela.
- **B5. Login social opcional.** Compra como convidado sempre possível.
- **B6. Mensagens de erro humanas.** "Não conseguimos confirmar seu pagamento. Tente outro cartão ou Pix.", nunca "Erro 500: payment_intent_failed".
- **B7. Loading sempre visível.** Polling e requisições assíncronas com `aria-busy`, skeleton ou stepper.
- **B8. Fonte ≥ 16px em mobile.** Abaixo disso o iOS dá zoom no input.
- **B9. Toque ≥ 44×44px** em botões, links e ícones no mobile.
- **B10. Contraste WCAG AA** (4.5:1; 3:1 para texto grande), cobrado pelo gate de acessibilidade da regra F1.

### C. Mídia paga

Valem quando a mídia paga começar ([plano](#mídia-paga-não-iniciada)).

- **C1.** Não rodar mídia sem GA4 e Pixel validados.
- **C2.** Otimizar para conversão (`purchase` / `Purchase`), nunca para clique. Exceção: remarketing em audiência fria pode otimizar para `ViewContent` nos primeiros 7 dias, para acumular dados.
- **C3.** Funil frio, morno e quente em campanhas separadas, com orçamento, anúncio e oferta próprios.
- **C4.** Público baseado em Curva ABC: venda mira lookalike de clientes classe A; cross-sell mira recompradores.
- **C5.** Landing com _message match_: a headline repete a promessa do anúncio.
- **C6.** Começar com R$ 30/dia por campanha; dobrar só após 7 dias com ROAS ≥ 3x.
- **C7.** Pausar só com 7+ dias rodando, ROAS < 1 e sem tendência de melhora.
- **C8.** Anúncio em AIDA: atenção no título, interesse na imagem, desejo com prova social, ação com CTA específico.
- **C9.** Sem personalização nominal (`{NOME}`) em título de anúncio nem em assunto de e-mail em massa. Nome só no corpo (`lib/email-templates.js`).
- **C10.** Nunca anunciar para inativos totais ou "lookalike de quem não comprou".

### D. E-mail marketing

- **D1. Double opt-in obrigatório** para a newsletter (`/confirmar-inscricao?token=`).
- **D2. Descadastro em todo e-mail de marketing**, visível. `lib/email-sender.js` anexa o rodapé e os headers RFC 8058 (`List-Unsubscribe`, `List-Unsubscribe-Post`) em todo envio de marketing; transacional não leva.
- **D3. Máximo 1 newsletter manual por semana** para o mesmo segmento. A automação (pós-compra, carrinho, reativação) é separada. Hoje o sistema não envia newsletter manual: não há tela de envio nem export de lista (ver regra I4).
- **D4. Sequência pós-compra obrigatória:** D+0 confirmação e acesso, D+3 pedido de avaliação, D+15 cross-sell da categoria, D+45 novidades da categoria. Implementada ([sequência](#e-mail)).
- **D5. Segmento, não indivíduo.** O e-mail vai para "compradores de alfabetização", não para "Maria que comprou alfabetização".
- **D6. SPF, DKIM e DMARC autenticados** no domínio de envio. Sem isso, spam e reputação queimada.
- **D7. Não enviar marketing para inativos > 180 dias.** Tag `inativo_180d`; o cron não envia reativação depois de 180 dias.
- **D8. Cupom de reativação só para inativos de 90 a 180 dias.** Para ativo é desconto a quem compraria de qualquer jeito; para inativo total não converte.

### E. SEO e conteúdo

- **E1. URL com slug, nunca UUID** (`/produtos/painel-alfabeto-cursivo`).
- **E2. `<title>` e `<meta description>` únicos** por página, via `SEO.jsx` (`react-helmet-async`).
- **E3. Schema.org `Product` + `Offer`** na página de produto, com preço, disponibilidade e imagem. Validar no [Rich Results Test](https://search.google.com/test/rich-results).
- **E4. Sitemap mantido e submetido.** `/sitemap.xml` é gerado a cada requisição (`handlers/sitemap.xml.js`) e declarado no `robots.txt`. A submissão no Search Console é operacional ([10-ROADMAP](./10-ROADMAP.md)).
- **E5. Canonical** em toda página que possa ter URL duplicada (filtros, parâmetros).
- **E6. `alt` descritivo** ("Painel de alfabeto cursivo colorido para sala do 1º ano", não "imagem.png").
- **E7. Fontes sem bloquear a renderização:** auto-hospedadas (`public/fonts`), `font-display: swap`.
- **E8. Conteúdo gratuito como porta de entrada:** ao menos 1 produto gratuito por categoria, pedindo e-mail. **Não implementado**: hoje todo pedido passa pelo Mercado Pago, que não aprova R$ 0,00 (`lib/payment-integrity.js`); produto gratuito exige fluxo próprio.

### F. Performance técnica

**F1. Lighthouse mínimo.** Gates do CI (`lighthouse.yml` em todo push/PR na `main`, `lighthouserc.json`, preset desktop sobre `dist/`):

| Categoria      | Mínimo | Efeito   |
| -------------- | ------ | -------- |
| Performance    | 70     | bloqueia |
| Accessibility  | 90     | bloqueia |
| Best Practices | 90     | aviso    |
| SEO            | 90     | bloqueia |

Alvo em produção, medido no mobile: Performance ≥ 90 e SEO ≥ 95.

- **F2. Core Web Vitals no verde:** LCP < 2,5s, CLS < 0,1, INP < 200ms.
- **F3. Bundle inicial < 200 kB gzip.** Rotas são `lazy()` em `App.jsx`.
- **F4. Imagens otimizadas:** WebP/AVIF, lazy load fora da dobra, `srcset`. Hoje o upload aceita WebP/AVIF e limita o peso, mas não há conversão nem `srcset` (pipeline adiada até o catálogo passar de 200 produtos).
- **F5. Cache de API.** Endpoints públicos (catálogo, home) com cache HTTP de pelo menos 60s (`CACHE_POLICIES.catalog`, hoje 5 min). Relatórios do painel são `no-store`, recalculados a cada abertura: dado de cliente não fica no navegador após o logout, e cache em memória não sobrevive em serverless.
- **F6. Nada síncrono no caminho crítico.** Skeleton primeiro, dados depois.

### G. Pagamentos e checkout

- **G1. Pagamento sempre verificado no backend** (`verify-payment` ou webhook). O frontend nunca decide "aprovado".
- **G2. Webhook idempotente.** O Mercado Pago repete notificações; a transição de status é atômica e só a primeira muda o pedido.
- **G3. Assinatura do webhook validada** (HMAC-SHA256 com `WEBHOOK_SECRET`, `lib/mercadopago-config.js`). Sem segredo, rejeita. **Não remover.**
- **G4. Polling é reserva, não caminho principal.** Existe em `CheckoutPage.jsx` (4s, com backoff) e `DownloadsPage.jsx` (10s) para cobrir webhook atrasado.
- **G5. Download por token efêmero.** Nunca URL direta do arquivo: token de uso único com validade e _claim_ atômico, entregue por URL assinada do Storage (`download_tokens`, `download_logs`). Link gasto de pedido aprovado é reemitido pelo "Atualizar" em `/downloads` (prova de posse: código do pedido + e-mail), com teto de 5 downloads por item (`MAX_DOWNLOADS_PER_ITEM` em `handlers/verify-payment.js`); no teto, a tela troca "Baixar" por "fale conosco".
- **G6. Cupom validado no backend.** `POST /api/validate-coupon` é só UX; a validação real é no `create-payment` (`lib/coupons.js`), com uso incrementado de forma atômica (RPC `increment_coupon_usage`). O uso reservado por pedido não pago volta ao cupom depois de 2h (`release_stale_coupon_reservations`, pg_cron a cada 15 min) e é recontado se o pagamento chegar depois (trigger `orders_reclaim_coupon_on_approval`).
- **G7. Vários meios de pagamento.** Pix, cartão e boleto pelo Checkout Pro. Não desabilitar sem dado de baixa conversão.

### H. Segurança e privacidade

Detalhes de implementação em [08-SEGURANCA](./08-SEGURANCA.md).

- **H1.** `SUPABASE_SERVICE_ROLE_KEY` nunca chega ao navegador.
- **H2.** RLS em todas as tabelas; tabela nova nasce com RLS.
- **H3.** Sessão em cookie HttpOnly + `SameSite=Strict`, assinado por HMAC.
- **H4.** Rate limit em endpoint público: `enforceRateLimit(req, res, RATE_LIMITS.<perfil>)` no handler, com contador no Postgres (decisão registrada em [02-ARQUITETURA](./02-ARQUITETURA.md)). Endpoint público novo precisa de perfil em `RATE_LIMITS`.
- **H5.** Senha com mínimo de 8 caracteres, maiúscula, minúscula e número. O formulário cobra tudo; o backend revalida o mínimo de 8, e as classes de caractere dependem da política do Supabase Auth.
- **H6.** Dados mínimos: nome e e-mail para comprar. Sem endereço (não há produto físico).
- **H7.** Direito ao esquecimento e à portabilidade, self-service: `POST /api/me-delete-account` em dois passos (pedido → confirmação por e-mail), anonimizando os pedidos; `GET /api/me-export-data` ("Baixar meus dados" em `/conta`).
- **H8.** Backup: o Supabase Free guarda 7 dias, o Pro 30. Produção com movimento real deve estar no Pro.

### I. Painéis (loja e plataforma)

- **I1. Toda escrita do painel é auditada.** `admin_audit_log` (`admin_id, action, target_type, target_id, before, after, ip, created_at`), preenchido por `lib/admin-audit.js` em produtos, categorias, cupons, usuários, settings, página da loja, dona da loja, dono do produto, upload/remoção de mídia, limpeza de eventos, IA e Minha conta. Append-only (triggers bloqueiam UPDATE/DELETE), campos sensíveis redigidos, retenção de 18 meses, cobertura testada em `handlers/__tests__/admin-audit-coverage.test.js`. A área simples do professor (`/api/teacher/products`) também audita.
- **I2. 2º fator.** Opcional, recomendado: TOTP, código por e-mail ou PIN de emergência, configurado na aba Segurança da Administração da plataforma. Vale só para admin/master; professor(a), inclusive a dona da loja, entra sem 2º fator (pendência de 2FA por conta em [10-ROADMAP](./10-ROADMAP.md)). A conta de administração deve ter 2FA ativo em produção.
- **I3. Curva ABC sempre disponível.** No Dashboard (resumo) e em Vendas → Curva ABC e coorte. Decisões de produto e mídia passam por ela.
- **I4. Export CSV em qualquer relatório.** Hoje só em Vendas → Curva ABC e coorte (produtos, clientes e coorte, via `src/utils/csv-export.js`). **Falta:** pedidos, clientes, segmentos e vendas por período.
- **I5. Sem delete físico de pedidos.** Pedido tem valor histórico: só cancelamento ou anonimização. A API do painel só lista pedidos (`handlers/admin/orders.js`), e a exclusão de conta anonimiza em vez de apagar.

---

## Mensuração

### Eventos do funil

| Etapa                 | GA4                | Meta Pixel         | Onde dispara                                      |
| --------------------- | ------------------ | ------------------ | ------------------------------------------------- |
| Ver catálogo          | `view_catalog`     | —                  | `ProductsPage.jsx` (uma vez por montagem)         |
| Ver produto           | `view_item`        | `ViewContent`      | `ProductDetailsPage.jsx`                          |
| Adicionar ao carrinho | `add_to_cart`      | `AddToCart`        | `CartProvider.jsx`                                |
| Remover do carrinho   | `remove_from_cart` | —                  | `CartProvider.jsx`                                |
| Iniciar checkout      | `begin_checkout`   | `InitiateCheckout` | `CheckoutPage.jsx` (montagem)                     |
| Compra confirmada     | `purchase`         | `Purchase`         | `DownloadsPage.jsx`, só após aprovação (regra A2) |

`view_cart` (→ `ViewCart`) está na lista canônica de `src/utils/analytics.js`, mas nenhum componente o dispara.

Como `trackEvent` decide o destino:

- Fora da lista canônica: descartado.
- Essenciais (todos menos `purchase`): sempre vão para `analytics_events` via `navigator.sendBeacon` (fallback `fetch` com `keepalive`).
- GA4 e Pixel: só com consentimento de marketing.

O backend (`handlers/track-event.js`, `lib/analytics-events.js`) aceita do cliente só `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `view_catalog`, `begin_checkout` e `client_error`; o resto é descartado em silêncio (204, ou 429 no rate limit — o front ignora os dois, tracking nunca quebra a tela). A compra entra no `analytics_events` pelo servidor: `checkout_initiated` (`create-payment`) e `payment_approved`, `payment_rejected`, `payment_cancelled`, `payment_refunded` (`webhook`). `webhook_received` está na allowlist de servidor, mas nenhum handler grava.

**Dados pessoais (regra A5).** O `sanitizeProperties` do servidor remove, em qualquer nível, toda chave cujo nome contenha `email`, `cpf`, `phone`, `telefone`, `password` ou `senha`. O do front é raso (só as chaves de topo `email`, `customer_email`, `cpf`, `phone`): a defesa que vale é a do servidor.

**Retenção.** `analytics_events` guarda no máximo 180 dias (pg_cron `cleanup_old_analytics_events`, e sob demanda por `POST /api/admin/cleanup-events`). Retenção das demais tabelas em [08-SEGURANCA](./08-SEGURANCA.md).

### UTM e atribuição

`src/utils/attribution.js` grava, na primeira visita com `utm_*`, a chave `attribution_data` no `localStorage` (30 dias, **first-touch wins**: não sobrescreve). No checkout, `create-payment` anexa o payload a `orders.attribution_data`, filtrado pela whitelist de 9 campos de `lib/attribution-sanitize.js`:

```json
{
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "alfabetizacao_q1",
  "utm_content": "...",
  "utm_term": "...",
  "referrer": "https://google.com",
  "landing_path": "/produtos/painel-alfabeto",
  "first_touch_at": "...",
  "session_id": "s_..."
}
```

O mesmo payload vai para `abandoned_carts.attribution_data` e `email_subscribers.attribution_data`. A aba Funil usa isso para pedidos, receita e participação por origem.

### Consentimento

`ConsentBanner.jsx` na primeira visita: **Aceitar todos** (habilita GA4 e Pixel) ou **Apenas essenciais**. A escolha fica em `localStorage` (`lgpd_consent`, `src/utils/consent.js`) junto com a versão da política (`CONSENT_POLICY_VERSION`); mudou a versão, o banner volta. `ConsentPreferences.jsx` permite trocar a escolha depois. O Vercel Analytics roda sem cookie e não depende do banner.

---

## Relatórios do painel

Todos recalculados a cada abertura (`no-store`, regra F5). No Painel da loja, a dona vê só os números dos materiais dela (`lib/seller-scope.js`). Telas em [06-PAINEIS](./06-PAINEIS.md); contrato dos endpoints em [09-API](./09-API.md).

### Curva ABC

`lib/abc-classification.js` (endpoints), espelhada em `src/utils/abc.js` para o widget do Dashboard e guardada pelo teste de paridade `src/utils/__tests__/abc-parity.test.js`. Classificação por receita acumulada: **A** até 80% (o 1º colocado é sempre A), **B** até 95%, **C** o resto.

- **Produtos** — `GET /api/admin/abc-products?period=month|quarter|year&categoryId=<uuid>` (padrão `month`), sobre `order_items` de pedidos aprovados. Produto C pode ser **produto de entrada** (ticket baixo, converte cliente novo): não descontinuar sem olhar.
- **Clientes** — `GET /api/admin/abc-customers?period=month|quarter|year|all` (padrão `quarter`), por `customer_email`, com relacionamento: **vip** (5+ pedidos ou classe A), **recorrente** (2–4), **eventual** (1). E-mail e nome mascarados, inclusive no CSV; `?includePII=1` existe para export interno, mas o front não usa.
- **Coorte** — `GET /api/admin/cohort?months=12` (1–36). Linhas = mês da primeira compra; colunas = M+0, M+1…; células = % da coorte ativa. Queda entre M+1 e M+3 aponta problema de pós-venda; o pico de volta às aulas é sazonalidade.

### Segmentos

`lib/customer-segmentation.js` calcula tags para cada inscrito confirmado de `email_subscribers`, a partir dos pedidos aprovados:

| Tag                  | Critério                                                | Uso                                           |
| -------------------- | ------------------------------------------------------- | --------------------------------------------- |
| `cliente_vip`        | 5+ pedidos ou LTV > `VIP_LTV_THRESHOLD` (padrão R$ 300) | Lookalike de mídia paga, lançamento exclusivo |
| `cliente_recorrente` | ≥ 2 pedidos                                             | Cross-sell por categoria                      |
| `cliente_ativo`      | compra nos últimos 90 dias                              | Base da newsletter                            |
| `inativo_30d`        | último pedido entre 31 e 89 dias                        | Lembrete de continuidade                      |
| `inativo_90d`        | último pedido entre 90 e 179 dias                       | Cupom de reativação (regra D8)                |
| `inativo_180d`       | sem compra há 180+ dias                                 | **Não enviar** (regra D7)                     |
| `categoria:<slug>`   | uma por categoria já comprada                           | Campanha por interesse                        |

`GET /api/admin/segments` (aba Segmentos de email) devolve só agregados: confirmados, pendentes, desinscritos e contagem por tag. Não há lista de e-mails nem export (regra I4). Carrinho abandonado não é tag: o cron trata direto em `abandoned_carts`.

### Funil

`GET /api/admin/funnel?days=30` (1–180; a aba oferece 7, 30 e 90). Conta **sessões únicas** por etapa em `analytics_events` (`view_catalog` → `view_item` → `add_to_cart` → `begin_checkout`); a etapa `purchase` é a contagem de pedidos aprovados no período. Devolve `funnel` (contagem e conversão da etapa anterior), `attribution` (pedidos, receita e participação por `utm_source`, com medium/campaign), `dailyPurchases` e `totals`. A aba mostra o drop-off por etapa, os totais e a atribuição; `dailyPurchases` ainda não aparece.

### Estudo de vendas

Vendas → Estudo de vendas (`lib/sales-study.js`). Calcula os números do período e do anterior (funil, receita, pedidos, ticket, recompra, Curva ABC, categorias, origem) e manda **só os agregados** ao Gemini, que devolve uma leitura em português simples. Com poucos pedidos, a resposta é fixa e a IA não é chamada (tendência com meia dúzia de pedidos é ruído). A última análise fica salva em `settings` (`salesStudy`).

### KPIs

`GET /api/admin/kpis?window=12` (1–36 meses), consumido pelo Dashboard: receita do mês contra o anterior, ticket médio, pedidos, LTV médio, taxa de recompra e LTV/CAC. `CAC` volta `null` até existir gasto de mídia integrado.

| Categoria | Métricas                                                   | Meta           |
| --------- | ---------------------------------------------------------- | -------------- |
| Aquisição | Visitantes únicos, origem do tráfego, CAC (com mídia paga) | —              |
| Conversão | Taxa geral e por etapa, ticket médio, abandono de carrinho | > 1,5% geral   |
| Retenção  | Recompra, LTV 12m, frequência, tempo entre compras         | Recompra > 20% |
| Saúde     | ROAS por canal, LTV/CAC, aprovação no Mercado Pago         | LTV/CAC ≥ 3    |

Fórmulas no [glossário](#glossário-de-kpis).

---

## E-mail

Provedor: Resend por SMTP. Templates HTML em `lib/email-templates.js`:

| Template             | Tipo         | Quando                                                                                                                                                   |
| -------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orderConfirmation`  | transacional | D+0, na primeira aprovação (webhook ou `verify-payment`, via `lib/order-confirmation.js`); inclui "conta criada para você" quando a conta é provisionada |
| `optInConfirmation`  | transacional | Double opt-in da newsletter (regra D1)                                                                                                                   |
| `unsubscribeSuccess` | transacional | Confirmação de descadastro (transacionais continuam)                                                                                                     |
| `adminLoginCode`     | transacional | Código de 2º fator por e-mail no login de admin/master (10 min, uso único)                                                                               |
| `postPurchaseD3`     | marketing    | D+3, pedido de avaliação                                                                                                                                 |
| `postPurchaseD15`    | marketing    | D+15, cross-sell da categoria comprada                                                                                                                   |
| `postPurchaseD45`    | marketing    | D+45, novidades da mesma categoria                                                                                                                       |
| `abandonedCart`      | marketing    | Carrinho abandonado, variantes `1h` e `24h`                                                                                                              |
| `reactivation90`     | marketing    | Inativo entre 90 e 180 dias, com cupom (padrão `VOLTEI15`, 15%)                                                                                          |

Definição e reset de senha saem pelo SMTP do Supabase Auth, não por este módulo.

### Sequência

```
Compra aprovada
   ▼ D+0      orderConfirmation   (na aprovação)
   ▼ D+3      postPurchaseD3      (avaliação)
   ▼ D+15     postPurchaseD15     (cross-sell da categoria)
   ▼ D+45     postPurchaseD45     (novidades da categoria)
   ▼ D+90..180, sem nova compra
              reactivation90      (cupom; janela REACTIVATION_DAYS_MIN/MAX)
   ▼ D+180+   PARA                (regra D7)
```

O cron `/api/cron-email-jobs` roda de hora em hora (`.github/workflows/email-cron.yml`, `0 * * * *` UTC) por POST com o header `X-Cron-Secret` (comparação em tempo constante). Três jobs: carrinho abandonado (1h e 24h), pós-compra (D+3, D+15, D+45) e reativação. Idempotência por `(e-mail, tipo, entidade)` em `email_sent_log`; no máximo 100 candidatos por job a cada execução.

### Quem pode receber

- **Pós-compra e reativação:** quem tem pedido aprovado (relação contratual), salvo descadastro.
- **Carrinho abandonado:** o e-mail vem de uma escrita pública (`/api/abandoned-cart`), sem prova de posse. Por isso só sai com opt-in confirmado ou pedido aprovado no mesmo endereço, o que impede usar a loja para mandar e-mail a terceiros.
- **Newsletter:** só inscrito confirmado (regra D1), no máximo 1 por semana por segmento (regra D3).

O cupom do e-mail de reativação (`REACTIVATION_COUPON_CODE`, padrão `VOLTEI15`) precisa existir na aba Cupons; o e-mail não cria o cupom.

---

## Mídia paga (não iniciada)

Chamada de "Fase 5" em comentários do código. Custa ~R$ 5.000/mês no mínimo e só começa quando o gatilho for atingido. As regras são as da área C.

**Gatilho:** 30+ dias de funil rastreado, 50+ pedidos para a Curva ABC ter dado e ROAS orgânico ≥ 3x.

| Canal                | Orçamento inicial       | Mensal        | Receita esperada (ROAS 3x) |
| -------------------- | ----------------------- | ------------- | -------------------------- |
| Google Ads           | R$ 30/dia × 3 campanhas | R$ 2.700      | R$ 8.100                   |
| Meta Ads             | R$ 30/dia × 2 campanhas | R$ 1.800      | R$ 5.400                   |
| Pinterest (opcional) | R$ 15/dia               | R$ 450        | R$ 1.350                   |
| **Total**            | —                       | **~R$ 5.000** | **~R$ 15.000**             |

Estrutura das campanhas de busca (modelo Kwong): **genérica** (termos amplos da categoria), **categoria específica** (termos com intenção) e **institucional** (marca + diferenciais).

### Depois da mídia paga: otimização contínua

- Reunião semanal de métricas (Curva ABC, ROAS, conversão, recompra) → 1 a 3 experimentos por semana.
- A/B test mensal em ponto crítico ([quando uma regra precisa mudar](#quando-uma-regra-precisa-mudar)). Ferramentas gratuitas: GrowthBook self-hosted e Microsoft Clarity (heatmap).
- Auditoria mensal de SEO no Search Console.
- Limpeza trimestral do catálogo: despublicar produto sem venda em 90 dias, salvo produto de entrada.
- Canais novos (Elo7, YouTube Shorts/Reels, parcerias) só depois de os atuais estarem medidos.

---

## Anti-padrões

**Produto e UX:** pop-up agressivo de newsletter na entrada · forçar conta para comprar · escassez falsa ("só 2 disponíveis" em produto digital) · carrossel automático no topo · mais de 1 CTA primário por tela · esconder o preço final até o fim · jargão ("checkout") onde o público não conhece.

**Mídia paga:** otimizar para clique quando o objetivo é venda · misturar frio e quente no mesmo conjunto · nome no título do anúncio · anunciar para inativos totais · dobrar orçamento sem 7 dias de dado · pausar no 1º dia ruim · criativo infinito sem público definido.

**E-mail:** comprar lista · enviar para quem não consentiu · esconder o descadastro · mais de 1 e-mail por semana ao mesmo segmento (fora a automação) · "queima total" toda semana · enviar para inativo > 180 dias.

**Mensuração:** `purchase` no redirect · dado pessoal como propriedade de evento · GA4/Pixel sem consentimento · GA4 como histórico oficial · pedido sem UTM.

**Código:** service role no frontend · tabela sem RLS · pagamento aprovado sem validação no backend · URL direta de arquivo · webhook sem assinatura · `--no-verify` em commit · `try/catch` vazio · segredo no código.

**Estratégia:** mudar a marca a cada trimestre · copiar concorrente sem entender o porquê · mudar 5 coisas de uma vez (não dá para aprender) · decidir produto sem Curva ABC · cortar produto C sem ver se é produto de entrada.

---

## Checklist antes do merge

Para PR que toque o fluxo do cliente, o pagamento ou os painéis. As regras de código estão no [CONTRIBUTING](../CONTRIBUTING.md).

**Funcional**

- [ ] Testado em mobile
- [ ] Estados de loading, erro e vazio cobertos, com mensagens humanas (B6, B7)
- [ ] Nenhum campo novo desnecessário no checkout (A6, B4)
- [ ] CTA principal continua acima da dobra (B1)

**Mensuração**

- [ ] Eventos canônicos nos pontos certos (A1)
- [ ] Nenhum dado pessoal em evento (A5)
- [ ] UTMs preservadas no fluxo (A3)

**Performance e SEO**

- [ ] Gates do Lighthouse passam (F1)
- [ ] Bundle inicial não cresceu > 10 kB sem justificativa (F3)
- [ ] Página nova com título e descrição únicos, URL com slug e, se for produto, Schema.org (E1–E3)

**Segurança**

- [ ] Nada exposto que devia ficar no backend; sem segredo no código (H1)
- [ ] RLS preservada (H2)
- [ ] Rate limit em endpoint público novo (H4)
- [ ] Escrita nova de painel grava auditoria (I1)

**Documentação**

- [ ] Doc em `docs/` atualizado se mudou comportamento descrito
- [ ] Este documento atualizado se criou ou mudou regra
- [ ] [04-BANCO-DE-DADOS](./04-BANCO-DE-DADOS.md) atualizado se mudou o schema

---

## Glossário de KPIs

| Sigla        | Nome                          | Fórmula                          | Meta                     |
| ------------ | ----------------------------- | -------------------------------- | ------------------------ |
| CTR          | Click-through rate            | cliques / impressões             | > 2% em rede de pesquisa |
| CVR          | Conversion rate               | conversões / cliques             | > 1,5% no site           |
| CPL          | Custo por lead                | investimento / leads             | varia por nicho          |
| CPV          | Custo por venda               | investimento / vendas            | < ticket médio × 0,3     |
| ROAS         | Return on ad spend            | receita / investimento           | ≥ 3x, ideal 5x           |
| LTV          | Lifetime value                | receita total / cliente          | subir sempre             |
| CAC          | Custo de aquisição de cliente | investimento / clientes novos    | < LTV / 3                |
| Ticket médio | Average order value (AOV)     | receita / pedidos                | subir via cross-sell     |
| RPM          | Receita por mil envios        | receita / (envios / 1000)        | usado em e-mail          |
| Recompra     | Taxa de recompra              | clientes com ≥ 2 pedidos / total | > 20%                    |

---

## Quando uma regra precisa mudar

1. **Hipótese clara:** "mudar X aumenta Y porque Z".
2. **Teste isolado:** A/B ou piloto com escopo limitado, mínimo 7 dias.
3. **Significância:** no mínimo 200 conversões por variante antes de concluir.
4. **No PR:** experimento, resultado e a regra nova, atualizando este documento no mesmo PR.

Sem isso é achismo, e e-commerce é caro demais para achismo.

---

## Referências

- FERREIRA, B. O. _Estratégias de segmentação e personalização no e-mail marketing._ TCC, UFSC, 2025.
- KWONG, J. C. _Marketing digital para incremento de vendas em e-commerce de produtos personalizados._ TCC, UFRN, 2024.
- MARQUEZ, W. T. et al. _Estratégias de marketing digital para a alavancagem em e-commerce._ REAVI, 2018.
- GILIOLI, R. M.; GHIGGI, T. _E-commerce: reflexões sobre estratégias e desafios._ Revista Eletrônica Gestão e Serviços, 2020.
- KOTLER, P.; KELLER, K. L. _Marketing Management._ Pearson, 2016.
- ECKERT; DAL BÓ; MILAN; EBERLE. _E-commerce: privacidade, segurança e qualidade das informações como preditores da confiança._ Pensamento Contemporâneo em Administração, 11(5), 2017.
- CARTEM; JULIÃO; SARRO. _Segurança da Informação no E-commerce B2C._ FATEC Americana, 2022.
- MOREIRA. _O comércio eletrônico, os métodos de pagamentos e os mecanismos de segurança._ REFAS 3(1), 2016.
- ALVES. _A Influência da Segurança e da Experiência do Usuário nas Preferências de Compra em Plataformas de E-commerce._ TCC, IFPB, 2025.
