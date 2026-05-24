# Plano de Implementação — E-commerce de Alta Qualidade

> Documento mestre para transformar o Ateliê da Escola em uma operação de e-commerce robusta, mensurável e escalável. Baseado em evidência acadêmica (TCC Ferreira/UFSC 2025, TCC Kwong/UFRN 2024, Marquez et al./REAVI 2018, Gilioli & Ghiggi 2020) e nas particularidades do projeto atual (React 19 + Express + Supabase + Mercado Pago, B2C, produtos digitais educacionais).

## Como usar este documento

- Este é o **plano de execução**. Para os princípios e o "o que não fazer" durante o dia a dia, consulte [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md).
- Antes de iniciar qualquer tarefa abaixo, leia o **Princípio norteador** da fase para entender o porquê.
- Cada fase tem critério de aceitação objetivo. Não avance sem fechar a anterior — esse é exatamente o "gap de mensuração" que o estudo do Ferreira identificou como o erro mais comum em e-commerce brasileiro.
- Quando este plano conflitar com uma demanda urgente, o plano vence. Atalho em e-commerce vira dívida em receita perdida.

---

## Visão geral

**Onde queremos chegar em 90 dias:**

| Eixo | Estado atual | Estado-alvo |
|---|---|---|
| Mensuração | Funil opaco; sem GA4/Pixel; atribuição inexistente | Funil completo rastreado; eventos canônicos em GA4 + Meta + Supabase |
| Aquisição | Tráfego orgânico não otimizado; sem mídia paga estruturada | SEO técnico aplicado + 2 canais pagos rodando com Curva ABC |
| Conversão | UX poluída; sem prova social estruturada; sem páginas de captura | Funil enxuto, com trust signals e CTAs alinhados ao público |
| Retenção | Email só para confirmação; sem segmentação; sem recompra | Sequências automatizadas + segmentação por histórico |
| Operação | Admin funcional, mas sem visão analítica | Dashboard com Curva ABC, coorte e indicadores de saúde |

**Princípios que regem o plano (ver detalhes em [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md)):**

1. **Segmentação vence personalização.** Foco em encontrar o público certo, não em escrever mensagens elaboradas.
2. **Histórico de compra prediz receita; engajamento prediz engajamento.** Não confunda.
3. **Sem mensuração, não há otimização.** Cada gasto sem tracking é especulação.
4. **Inativos totais drenam orçamento.** A pior aposta é tentar reativar quem nunca demonstrou interesse real.
5. **Cliente recorrente é o ativo mais caro de adquirir e o mais barato de manter.**

---

## Diagnóstico atual (gaps identificados)

Da leitura do código + docs do projeto, os seguintes gaps são bloqueadores para escalar:

1. **Sem analytics de funil.** Não há GA4, Meta Pixel, nem rastreamento de eventos canônicos (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`).
2. **Sem UTM tracking persistente.** Atribuição de campanhas será incorreta no momento que houver mídia paga.
3. **Email marketing limitado a confirmação.** [api/send-confirmation-email.js](../api/send-confirmation-email.js) cobre só o transacional.
4. **Sem segmentação de clientes.** A tabela `profiles` existe, mas não há classificação por LTV, recência ou nicho.
5. **SEO técnico mínimo.** URLs com UUID (`/produtos/<id>` em vez de slugs), sem schema.org, sem meta tags dinâmicas, sem sitemap.
6. **Páginas pesadas e com objetivo ambíguo.** [ProductsPage.jsx](../src/pages/ProductsPage.jsx) acumula busca, filtro, ordenação e renderização. Sem foco de conversão.
7. **Sem prova social estruturada.** Depoimentos existem visualmente, mas não há revisões reais por produto.
8. **Sem dashboard analítico.** Admin lê pedidos individualmente; falta visão de Curva ABC, coorte, cohorts sazonais.
9. **Performance não monitorada.** Sem Lighthouse CI, sem Core Web Vitals tracking.
10. **Carrinho frágil para cross-sell.** O `CartProvider` armazena items, mas não há produtos relacionados nem upsell pós-add.

---

## Estrutura de fases

```
Fase 0  ─ Fundação técnica e mensuração          (Semanas 1-2)
Fase 1  ─ SEO técnico + performance              (Semanas 3-4)
Fase 2  ─ UX e conversão do funil                (Semanas 4-5)
Fase 3  ─ Retenção via email marketing           (Semanas 5-6)
Fase 4  ─ Dashboard analítico (Curva ABC)        (Semana 6)
Fase 5  ─ Aquisição paga (Google + Meta)         (Semanas 7-8)
Fase 6  ─ Otimização contínua e expansão         (Semana 9+)
```

Sobreposição proposital nas semanas 4-6: front-end e analytics rodam em paralelo enquanto o tracking começa a colher dados.

---

## Fase 0 — Fundação técnica e mensuração

**Duração:** 2 semanas
**Por que primeiro:** o estudo do Ferreira mostrou que 14% das campanhas analisadas se enquadraram em "ANOMALIA" (RPM alto, mas engajamento nulo) por falha de atribuição. Sem mensuração, todo investimento posterior é especulação.

### Objetivos
- Rastrear cada etapa do funil de forma confiável.
- Persistir origem de cada visita até a compra (atribuição multi-touch básica).
- Bloquear deploys que degradem indicadores de performance.

### Tarefas

1. **Implementar GA4**
   - Criar propriedade Google Analytics 4
   - Adicionar tag base no [index.html](../index.html) ou via `<Helmet>` em [main.jsx](../src/main.jsx)
   - Disparar eventos canônicos em pontos específicos:
     - `view_item` em [ProductDetailsPage.jsx](../src/pages/ProductDetailsPage.jsx) no `useEffect` de carregamento
     - `add_to_cart` em [CartProvider.jsx](../src/providers/CartProvider.jsx) no `addToCart()`
     - `begin_checkout` em [CheckoutPage.jsx](../src/pages/CheckoutPage.jsx) ao montar
     - `purchase` em [DownloadsPage.jsx](../src/pages/DownloadsPage.jsx) quando o pedido for confirmado como aprovado

2. **Implementar Meta Pixel**
   - Mesma estrutura do GA4, mas com eventos `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`
   - Adicionar `fbq('track', 'Purchase', { value, currency: 'BRL' })` no callback de pagamento aprovado

3. **UTM tracking persistente**
   - Criar `src/utils/attribution.js` que, na primeira visita, lê `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` da URL e grava em `localStorage` com TTL de 30 dias
   - No `create-payment`, enviar essas UTMs no payload e persistir em uma nova coluna `attribution_data` (jsonb) na tabela `orders`
   - Migration SQL nova em [supabase/](../supabase/)

4. **Eventos canônicos no backend**
   - Em [api/create-payment.js](../api/create-payment.js), logar evento `checkout_initiated` em uma nova tabela `analytics_events` (event_name, user_id, order_id, properties jsonb, created_at)
   - Em [api/webhook.js](../api/webhook.js), logar `payment_approved` e `payment_rejected`

5. **Dashboard de funil no admin**
   - Nova aba `Funil` em [src/components/admin/tabs/](../src/components/admin/tabs/)
   - Endpoint [api/admin-funnel.js](../api/admin-funnel.js) que retorna:
     ```
     visitors → product_views → add_to_cart → begin_checkout → purchase
     ```
   - Mostrar taxa de conversão entre cada etapa e variação semanal

6. **Lighthouse CI**
   - Adicionar workflow GitHub Actions rodando Lighthouse em cada PR
   - Falhar build se performance < 80, accessibility < 90, SEO < 90

7. **Sentry (ou alternativa) para erros frontend**
   - Capturar erros no React + erros do Express
   - Sem isso, vamos perder bugs silenciosos em produção

### O que não fazer
- ❌ Adicionar tracking sem revisar privacidade/LGPD. Implementar banner de consentimento simples antes dos pixels.
- ❌ Disparar `purchase` no Mercado Pago redirect — só dispare quando o pedido for confirmado como aprovado pelo backend.
- ❌ Duplicar eventos (cuidado com `useEffect` que dispara em re-render).

### Critério de aceitação
- [ ] GA4 mostra funil completo `visitor → purchase` por 7 dias consecutivos
- [ ] Meta Pixel valida eventos no Events Manager
- [ ] UTMs aparecem em `orders.attribution_data` em compras de teste
- [ ] Aba `Funil` do admin renderiza com dados reais
- [ ] CI bloqueia PR que derrube Lighthouse abaixo do threshold

### KPIs a observar daqui em diante
- Taxa de conversão por etapa do funil
- Origem (UTM source) que mais gera `purchase` vs `begin_checkout` abandonado
- Tempo médio entre `view_item` e `purchase`

---

## Fase 1 — SEO técnico + performance

**Duração:** 2 semanas
**Por que agora:** o Ateliê vende produtos com demanda orgânica direta no Google ("atividade de alfabetização PDF", "painel sala de aula"). Cada dia sem SEO técnico é tráfego gratuito perdido. O REAVI documentou 135% de aumento de visitas com SEO + ads — sem o SEO, ads ficam caros demais.

### Objetivos
- Aparecer no Google para buscas relevantes do nicho educacional.
- Reduzir tempo de carregamento da home e páginas de produto.
- Garantir que cada produto seja "compartilhável" em redes sociais (Open Graph).

### Tarefas

1. **URLs amigáveis (slugs)**
   - Adicionar coluna `slug` em `products` (gerada de `name` via trigger ou no momento da criação)
   - Atualizar rotas em [App.jsx](../src/App.jsx) para aceitar `/produtos/:slug`
   - Atualizar [api/product-details.js](../api/product-details.js) para buscar por slug
   - Redirect 301 de URLs antigas (`/produtos/<uuid>` → `/produtos/<slug>`) — preservar SEO existente

2. **Meta tags dinâmicas por página**
   - Instalar `react-helmet-async`
   - Wrapper `<SEO>` em `src/components/SEO.jsx` com props `title`, `description`, `image`, `type`
   - Aplicar em todas as pages com conteúdo único (Home, Products, ProductDetails, categorias se houver)

3. **Schema.org structured data**
   - Em [ProductDetailsPage.jsx](../src/pages/ProductDetailsPage.jsx), injetar JSON-LD do tipo `Product` + `Offer` com preço, disponibilidade, imagem
   - Em [HomePage.jsx](../src/pages/HomePage.jsx), `Organization` + `WebSite` (com `SearchAction`)
   - Validar em https://search.google.com/test/rich-results

4. **Sitemap.xml e robots.txt dinâmicos**
   - Endpoint [api/sitemap.xml.js](../api/sitemap.xml.js) que gera sitemap das categorias + produtos ativos
   - [public/robots.txt](../public/robots.txt) apontando para o sitemap
   - Submeter no Google Search Console

5. **SSR ou prerender para páginas críticas**
   - Avaliar duas opções:
     - **Opção A (mais barata):** prerender via [react-snap](https://github.com/stereobooster/react-snap) ou similar — gera HTML estático no build
     - **Opção B (mais robusta):** migrar Home e páginas de produto para Next.js (decisão maior, registrar no [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md) se for adotada)
   - Decisão: começar com prerender de Home + ProductDetails + ProductsPage. Migrar só se Lighthouse SEO não chegar a 95.

6. **Otimização de imagens**
   - Conversão automática para WebP/AVIF
   - `loading="lazy"` em todas imagens fora da dobra
   - `srcset` responsivo por viewport
   - CDN (Cloudflare Images ou similar) na frente do Supabase Storage se imagens crescerem

7. **Core Web Vitals**
   - LCP < 2.5s na home
   - CLS < 0.1 em todas as páginas (cuidado com a marquee do hero)
   - INP < 200ms (cuidado com handlers pesados em filtros do catálogo)

### O que não fazer
- ❌ Encher meta description com palavras-chave repetidas (keyword stuffing) — Google pune e o leitor ignora.
- ❌ Esquecer de configurar canonical URLs — duplicidade de conteúdo entre slug novo e UUID antigo penaliza.
- ❌ Carregar todas as fontes do Google ao mesmo tempo. Auto-host as 2-3 essenciais e use `font-display: swap`.

### Critério de aceitação
- [ ] URLs de produto usam slug, com redirect 301 dos UUIDs antigos
- [ ] Lighthouse SEO ≥ 95 nas páginas críticas
- [ ] Lighthouse Performance ≥ 90 mobile, ≥ 95 desktop
- [ ] Rich Results Test aprovado em ProductDetails
- [ ] Sitemap submetido no Search Console e indexado em até 7 dias

---

## Fase 2 — UX e conversão do funil

**Duração:** 2 semanas
**Por que agora:** o Ferreira mostrou que "Incoerência Estratégica" (clica mas não compra) foi o cenário mais frequente — 35% das campanhas. Mesmo trazendo tráfego perfeito, perdemos vendas se o funil for confuso.

### Objetivos
- Reduzir abandono no checkout.
- Reforçar credibilidade antes do formulário de pagamento.
- Tornar a página de produto uma máquina de conversão.

### Tarefas

> Boa parte das tarefas desta fase já está prevista em [plano-melhorias-fluxo-cliente.md](./plano-melhorias-fluxo-cliente.md). Aqui as priorizamos e ampliamos.

1. **Refatorar [ProductsPage.jsx](../src/pages/ProductsPage.jsx)**
   - Extrair `useCatalogFilters` e `useCatalogProducts` (conforme plano de melhorias)
   - Reduzir poluição visual do card (máximo: imagem, categoria, título, preço, CTA)
   - CTA visível sem hover em mobile

2. **Página de produto orientada à conversão**
   - Galeria com 3-5 imagens (já tem múltiplas imagens, mas dar destaque)
   - Vídeo demo se houver
   - Quadro de benefícios em bullets curtos ("pronto para imprimir", "PDF editável", "alta resolução")
   - Bloco de prova social: 3 depoimentos de professores reais com nome, cidade e nível de ensino
   - FAQ por produto (3-5 perguntas)
   - Botão "Adicionar ao carrinho" + "Comprar agora" (este pula carrinho e vai direto ao checkout)
   - Bloco "quem comprou também levou" (produtos relacionados — cross-sell)

3. **Trust signals no checkout**
   - Faixa acima da dobra com 3-4 selos: "Compra segura", "Acesso imediato", "Pagamento via Mercado Pago", "Suporte por email"
   - Resumo do pedido visível durante todo o preenchimento
   - Mensagem calma durante polling: "Estamos confirmando seu pagamento. Você pode fechar essa aba."

4. **AsyncStepper para fluxo de pagamento**
   - 3 etapas: Pedido criado → Pagamento em análise → Acesso liberado
   - Implementar conforme [plano-melhorias-fluxo-cliente.md](./plano-melhorias-fluxo-cliente.md)
   - Aplicar em CheckoutPage e DownloadsPage

5. **Carrinho persistente e visível**
   - Ícone do carrinho no [Shell.jsx](../src/components/Shell.jsx) com badge de quantidade
   - Drawer lateral abre ao clicar (sem navegar para outra página)
   - Permite remover item e atualizar quantidade direto do drawer

6. **Recuperação de carrinho abandonado**
   - Capturar email logo no início do checkout (antes mesmo de "Ir para pagamento")
   - Se o usuário sair sem completar, agendar email automático em 1h e 24h
   - Implementar com job scheduler simples (cron via Supabase ou Vercel Cron)

7. **Login social no checkout**
   - Botão "Continuar com Google" já existe (verificar funcionamento)
   - Permitir checkout como convidado com email apenas (não forçar cadastro)

8. **Cupons de desconto**
   - Tabela `coupons` (code, discount_type: percent|fixed, discount_value, valid_from, valid_until, max_uses, used_count, applies_to)
   - Campo "Tem um cupom?" no checkout
   - Validação no backend, nunca no front

### O que não fazer
- ❌ Pop-up de "newsletter" agressivo logo na entrada — desaba conversão e queima trust.
- ❌ Forçar criação de conta para finalizar compra. Email é suficiente.
- ❌ Esconder o preço total final (com descontos) até o último passo. Transparência converte.
- ❌ Usar contadores de escassez falsos ("Apenas 2 disponíveis!" em produto digital). Quebra confiança quando descoberto.
- ❌ Personalizar o título do anúncio/email com o nome do cliente em P2 (alta personalização nominal). O estudo do Ferreira mostrou que isso gera R$ 0 em RPM no contexto analisado — não é garantia universal de melhoria.

### Critério de aceitação
- [ ] Taxa de conversão `begin_checkout → purchase` aumenta no mínimo 20%
- [ ] Tempo médio no checkout cai (medido via GA4)
- [ ] Carrinho abandonado dispara email automático
- [ ] Pelo menos 1 cross-sell funcional em ProductDetailsPage

---

## Fase 3 — Retenção via email marketing

**Duração:** 2 semanas
**Por que agora:** Ferreira mostrou que cliente VIP e recomprador gera RPM 1227% maior que baseline. Aqui está o maior multiplicador de receita do plano inteiro.

### Objetivos
- Transformar compradores únicos em compradores recorrentes.
- Construir um canal de comunicação independente das plataformas de anúncio.
- Trabalhar a sazonalidade do calendário escolar.

### Tarefas

1. **Escolher provedor de email transacional + marketing**
   - Opções: Resend, Brevo, Mailgun, Amazon SES (transacional) + Mailchimp ou Brevo (marketing)
   - Recomendação: **Brevo** (faz os dois com plano gratuito generoso) ou **Resend** + planilha de templates próprios
   - Migrar [api/send-confirmation-email.js](../api/send-confirmation-email.js) para usar o provedor escolhido

2. **Lista única de contatos com tags**
   - Estrutura mínima de tags:
     - `cliente_ativo` (comprou nos últimos 90 dias)
     - `cliente_recorrente` (≥ 2 pedidos)
     - `cliente_vip` (≥ 5 pedidos OU LTV > R$ X)
     - `inativo_30d`, `inativo_90d`, `inativo_180d`
     - Tags por categoria comprada (`alfabetizacao`, `matematica`, `volta_as_aulas` etc.)

3. **Sequência pós-compra (automática)**
   - **D+0:** confirmação + links de download (já existe, melhorar copy)
   - **D+3:** "Como foi sua experiência?" + CTA para review
   - **D+15:** Produto complementar baseado na compra
   - **D+45:** Novidade da mesma categoria

4. **Newsletter sazonal (manual ou semi-automática)**
   - Calendário editorial alinhado ao ano letivo:
     - Janeiro: planejamento anual
     - Fevereiro: volta às aulas
     - Maio: Dia das Mães
     - Junho: festa junina
     - Agosto: Dia dos Pais
     - Setembro: independência / folclore
     - Outubro: Dia do Professor
     - Novembro: consciência negra
     - Dezembro: encerramento e festas

5. **Campanha de reativação para inativos 90 dias**
   - Cupom de 15% para quem não compra há 90+ dias
   - Sem cupom para inativos 180+ (custo não compensa, conforme estudo Ferreira)

6. **Segmentação por categoria de compra**
   - Cliente que comprou material de alfabetização recebe ofertas de alfabetização
   - Não enviar oferta de matemática para quem só consome conteúdo de educação infantil
   - **Atenção:** a segmentação é por **categoria**, não por nome do cliente. Não cair na cilada da personalização excessiva.

7. **Sinal de double opt-in para LGPD**
   - Toda inscrição em newsletter requer confirmação por email
   - Link de descadastro em todos os emails (obrigatório por lei)

### O que não fazer
- ❌ Enviar para inativos totais (sem nenhum sinal de interesse) — Ferreira mostrou que rende pior que envio em massa.
- ❌ Comprar lista de emails. Nunca. Sob nenhuma circunstância.
- ❌ Usar `[nome]` no assunto de email de massa. P2 (alta personalização nominal) deu RPM zero no estudo. Use no corpo, sutilmente.
- ❌ Mais de 1 email por semana para o mesmo segmento (a não ser que seja sequência automatizada de compra).
- ❌ Promoções "queima total!" toda semana. Vira ruído e queima margem.

### Critério de aceitação
- [ ] Provedor configurado e domínio autenticado (SPF, DKIM, DMARC)
- [ ] Sequência pós-compra disparando para 100% das compras aprovadas
- [ ] Lista segmentada com tags atualizadas automaticamente
- [ ] Primeira newsletter sazonal enviada com taxa de abertura > 25%
- [ ] Receita atribuída ao canal email visível no GA4 (UTM `utm_source=email`)

---

## Fase 4 — Dashboard analítico (Curva ABC)

**Duração:** 1 semana
**Por que agora:** sem visão de Curva ABC, todas as decisões de produto, estoque e campanha são intuição. Kwong validou que essa única ferramenta foi decisiva para definir prioridades.

### Objetivos
- Identificar os 20% de produtos que geram 80% da receita.
- Identificar os 20% de clientes que geram 80% da receita.
- Visualizar coorte de retenção.
- Dar à dona da loja autonomia para decidir sem precisar de SQL.

### Tarefas

1. **Endpoint de Curva ABC de produtos**
   - [api/admin-abc-products.js](../api/admin-abc-products.js)
   - Período configurável (último mês, trimestre, ano)
   - Retorna: produto, vendas, receita, % do total, % acumulado, classe (A/B/C)

2. **Endpoint de Curva ABC de clientes**
   - [api/admin-abc-customers.js](../api/admin-abc-customers.js)
   - Mesma estrutura, mas por cliente
   - Classifica em VIP (A), recorrente (B), eventual (C)

3. **Endpoint de coorte mensal**
   - [api/admin-cohort.js](../api/admin-cohort.js)
   - Linha = mês da primeira compra; coluna = mês de atividade subsequente
   - Mostra quantos % dos clientes que compraram no mês X ainda compram no mês X+N

4. **Aba `Análise` no admin**
   - Visualização da Curva ABC com gráfico de Pareto
   - Tabela de coorte com heatmap
   - Filtros: período, categoria, canal de aquisição
   - Export CSV de cada visão

5. **Indicadores de saúde no Dashboard principal**
   - Receita do mês vs mês anterior
   - Ticket médio
   - Taxa de recompra (clientes recorrentes / total)
   - LTV médio
   - CAC (quando mídia paga estiver rodando)
   - LTV/CAC ratio

### O que não fazer
- ❌ Recalcular Curva ABC a cada acesso. Cachear por 1h no servidor.
- ❌ Tomar decisões cegas no critério "produto categoria C deve sair". Antes de descontinuar, verifique se é produto de entrada (baixo ticket, alta conversão de novos clientes).
- ❌ Usar Curva ABC para personalizar mensagens individualmente. Use para definir **público-alvo de campanha**, conforme estudo Ferreira.

### Critério de aceitação
- [ ] Aba `Análise` carrega em < 2s
- [ ] Curva ABC exibe gráfico de Pareto correto
- [ ] Coorte mensal renderiza com pelo menos 6 meses de dados (mesmo que parciais)
- [ ] Export CSV funciona

---

## Fase 5 — Aquisição paga (Google + Meta)

**Duração:** 2 semanas
**Por que agora:** só nesta fase, com tudo anterior pronto. Kwong demonstrou +104% em vendas com mídia paga bem estruturada; sem mensuração + público mapeado + página de captura, o resultado seria ruído.

### Objetivos
- Estabelecer presença em Google Ads (rede de pesquisa) e Meta Ads (Instagram).
- Validar que o ROAS atende meta (mínimo 3x no primeiro mês, 5x até o fim do trimestre).
- Construir audiências de remarketing.

### Tarefas

1. **Definir audiência prioritária com base na Curva ABC**
   - Quais nichos são classe A? (provável: educação infantil, alfabetização, volta às aulas)
   - Esses são os públicos a serem segmentados nas campanhas

2. **Estrutura de campanhas Google Ads (modelo Kwong)**
   - **Campanha 1: Produtos genéricos** (rede de pesquisa)
     - Grupos: "personalizado", "PDF", "imprimir"
     - Palavras-chave com correspondência de frase e exata
   - **Campanha 2: Categoria específica** (uma por nicho A da Curva ABC)
   - **Campanha 3: Institucional** (palavras-chave com nome da marca)

3. **Anúncios usando modelo AIDA**
   - **Atenção:** título com benefício direto ("PDF de Alfabetização Imprimível")
   - **Interesse:** descrição com diferencial ("Pronto para imprimir. Pague uma vez, use o ano todo.")
   - **Desejo:** prova social ("+5.000 professores já usaram")
   - **Ação:** CTA claro ("Baixe agora")

4. **Estrutura de campanhas Meta Ads**
   - **Campanha 1 — Frio:** público de interesse (educação, professores, ensino)
   - **Campanha 2 — Morno:** visitantes do site nos últimos 30 dias
   - **Campanha 3 — Quente:** carrinho abandonado + compradores anteriores (cross-sell)
   - Públicos semelhantes (lookalike) de compradores VIP (classe A da Curva ABC)

5. **Páginas de captura específicas (não a loja virtual genérica)**
   - Uma landing por nicho prioritário
   - Headline alinhada ao anúncio (princípio de "message match")
   - Foco em uma única ação (CTA primário)
   - Implementar com rota dedicada `/lp/:slug` em [App.jsx](../src/App.jsx)

6. **Conversões otimizadas no Meta e Google**
   - No Meta: otimizar para evento `Purchase` (não para clique nem visualização)
   - No Google: definir conversão primária como `purchase` do GA4 importado
   - Nunca otimizar para "Tráfego" se o objetivo é venda

7. **Pinterest (canal subutilizado para esse público)**
   - Criar conta Business
   - Cada produto vira pin com link para a página de produto
   - Pinterest tem CPC mais baixo que Meta para conteúdo visual educacional

### O que não fazer
- ❌ Iniciar com orçamento grande "para acelerar". Comece com R$ 30/dia por campanha, dobre quando ROAS estiver consistente.
- ❌ Pausar campanha no primeiro dia ruim. Aguarde pelo menos 7 dias antes de julgar.
- ❌ Anúncios genéricos demais para públicos amplos. É a receita da Incoerência Estratégica.
- ❌ Otimizar campanha para clique. Sempre otimize para o evento de conversão (compra).
- ❌ Misturar funil frio e quente no mesmo conjunto de anúncios. Sempre separar.
- ❌ Anunciar para públicos `inativos totais` (lookalike de pessoas que não compraram). Pior ROI possível, conforme Ferreira.

### Critério de aceitação
- [ ] 2 campanhas no Google Ads rodando com pelo menos 7 dias de dados
- [ ] 2 campanhas no Meta Ads rodando com pelo menos 7 dias de dados
- [ ] ROAS médio ≥ 3x no primeiro mês
- [ ] Pelo menos 1 página de captura por nicho prioritário no ar
- [ ] Dashboard de mídia paga visível no admin (CTR, CVR, CPL, CPV, ROAS por campanha)

---

## Fase 6 — Otimização contínua e expansão

**Duração:** contínua (a partir da semana 9)

### Objetivos
- Iterar sobre o que funcionou.
- Cortar o que não funcionou.
- Explorar canais e formatos novos.

### Tarefas recorrentes

1. **Reunião semanal de métricas (30min)**
   - Olhar Curva ABC, ROAS, taxa de conversão, taxa de recompra
   - Decidir 1-3 experimentos para a semana

2. **Teste A/B mensal em pontos críticos**
   - Hipótese clara antes de cada teste
   - Pelo menos 7 dias de duração
   - Significância estatística mínima (200+ conversões por variante)

3. **Auditoria mensal de SEO**
   - Posições no Google Search Console
   - Páginas com queda de tráfego
   - Novos termos de oportunidade

4. **Limpeza trimestral de catálogo**
   - Despublicar produtos com 0 vendas em 90 dias (avaliar se vale recriar com novo posicionamento)
   - Investir em produzir mais do que está classe A

5. **Expansão de canais (avaliação trimestral)**
   - Marketplace educacional (Elo7, Loja Integrada)
   - YouTube Shorts / Reels com previews de produto
   - Parcerias com influenciadoras professoras

### O que não fazer
- ❌ Mudar 5 coisas ao mesmo tempo. Sem isolar variáveis, não dá pra aprender.
- ❌ Pivotar a marca a cada trimestre. Consistência ajuda SEO e brand recall.
- ❌ Copiar concorrente sem entender o porquê. O contexto do Ateliê é único.

---

## Cronograma macro consolidado

| Semana | Fase | Foco principal | Marco |
|--------|------|----------------|-------|
| 1 | 0 | GA4 + Meta Pixel + UTM tracking | Funil rastreado |
| 2 | 0 | Funil no admin + Lighthouse CI | Dashboard funcional |
| 3 | 1 | URLs amigáveis + meta tags + schema | SEO técnico aplicado |
| 4 | 1+2 | Sitemap + refactor ProductsPage | Catálogo enxuto |
| 5 | 2+3 | Checkout + trust signals + provedor de email | Conversão melhorada |
| 6 | 3+4 | Sequência pós-venda + Curva ABC | Retenção ativa |
| 7 | 5 | Campanhas Google + Meta + landing pages | Aquisição paga ao vivo |
| 8 | 5 | Otimização inicial de campanhas | ROAS ≥ 3x |
| 9+ | 6 | Iteração contínua | LTV/CAC ≥ 3 |

---

## KPIs mestres (acompanhar sempre)

### Aquisição
- Visitantes únicos / mês
- Origem do tráfego (% orgânico, pago, direto, email, social)
- CAC (custo de aquisição de cliente) — só relevante após Fase 5

### Conversão
- Taxa de conversão geral do site (visitante → compra)
- Taxa de conversão por etapa do funil
- Ticket médio
- Taxa de abandono de carrinho

### Retenção
- Taxa de recompra (% de clientes que compram ≥ 2x)
- LTV médio (12 meses)
- Frequência de compra
- Tempo médio entre compras

### Saúde do negócio
- ROAS por canal
- LTV / CAC ratio (alvo: ≥ 3)
- Taxa de aprovação de pagamento (Mercado Pago)
- NPS (a partir da Fase 3, via email pós-compra)

---

## Stack técnica recomendada (consolidada)

| Função | Ferramenta sugerida | Alternativa |
|---|---|---|
| Analytics | GA4 | Plausible (pago, mais simples) |
| Meta Pixel | Meta Pixel + Conversions API | — |
| Email | Brevo ou Resend | Mailgun, SES |
| Monitoramento de erro | Sentry | LogRocket |
| Performance | Lighthouse CI + Vercel Analytics | Web Vitals API |
| A/B testing | GrowthBook (open source) | VWO, Convert |
| Heatmap (opcional) | Microsoft Clarity (gratuito) | Hotjar |
| Pinterest | API oficial | — |

---

## Próximo passo concreto

Não comece pela Fase 5 (mídia paga) por mais tentador que seja. O retorno da Fase 0 (mensuração) é tão alto que ela paga sozinha o tempo investido nas próximas. Foque na **Fase 0 esta semana**.

Para qualquer decisão de implementação durante a execução deste plano, consulte [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md).
