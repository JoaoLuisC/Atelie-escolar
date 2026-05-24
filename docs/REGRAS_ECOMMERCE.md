# Regras de E-commerce — Princípios e Anti-padrões

> Documento de referência para qualquer alteração no projeto. Antes de abrir um PR ou implementar uma feature, valide se ela respeita as regras abaixo. Quando este documento conflitar com uma demanda urgente, **as regras vencem** — atalho em e-commerce vira dívida em receita perdida.

## Como usar este documento

1. **Antes de planejar:** leia a seção relevante à sua área (UX, mídia, mensuração, etc.).
2. **Durante a implementação:** se uma regra te impedir de fazer o que pretendia, **pare e questione a demanda**, não a regra.
3. **Em revisão de código (PR):** validar checklist da seção [Checklist antes do merge](#checklist-antes-do-merge).
4. **Se for adicionar/alterar uma regra:** atualize este documento no mesmo PR, com justificativa baseada em evidência (estudo acadêmico, dados internos, teste A/B).

> Plano de execução de alto nível em [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md). Este documento é o "rule book"; o plano é o "playbook".

---

## Princípios invioláveis (axiomas)

Estes 7 princípios sustentam todas as regras seguintes. Se uma decisão violar um axioma, ela é inválida — mesmo que pareça uma "vitória rápida".

### 1. Segmentação vence personalização
Achar o público certo gera mais receita do que escrever uma mensagem elaborada. O TCC Ferreira (UFSC, 2025) demonstrou que campanhas P0 (genéricas) para públicos VIP geraram RPM **1227% maior** que baseline, enquanto campanhas P2 (com nome do cliente no título) geraram **R$ 0,00** de RPM no contexto analisado.

**Implicação:** invista esforço em mapear público (Curva ABC, segmentação por histórico). Não invista em variáveis dinâmicas de personalização nominal em escala.

### 2. Histórico de compra prediz receita; engajamento prediz engajamento
Cliente que abre email não é cliente que compra. Cliente que comprou antes é o mais provável de comprar de novo.

**Implicação:** campanhas focadas em "aumentar engajamento" não substituem campanhas focadas em conversão. Não confundir métricas.

### 3. Sem mensuração, não há otimização
Cada decisão sem dados é uma aposta. Ferreira mostrou que 14% das campanhas analisadas eram "Anomalias" — RPM artificial por falha de atribuição.

**Implicação:** nenhuma campanha paga ou esforço de retenção começa antes do tracking estar funcionando ponta a ponta.

### 4. Inativos totais drenam orçamento
O pior ROAS do estudo Ferreira foi de campanhas para "Inativos Totais" — RPM R$ 4,94 contra baseline de R$ 16,23. Ou seja, **gastar com quem nunca demonstrou interesse rende pior do que envio em massa**.

**Implicação:** nunca rodar campanha (paga ou email) para listas frias sem critério.

### 5. Cliente recorrente é o ativo mais valioso
Reter custa frações do que adquirir. Programas de recompra têm o maior multiplicador de receita disponível.

**Implicação:** investir tempo desproporcionalmente em retenção (email, recompra, cross-sell) frente a aquisição.

### 6. Atrito é inimigo da conversão
Cada clique extra entre intenção e compra reduz conversão. Cada campo desnecessário no checkout custa receita.

**Implicação:** sempre questionar "esse passo/campo/clique é mesmo necessário?".

### 7. Confiança é pré-requisito
Loja sem trust signals vende muito menos, independente de quão bom seja o produto. Especialmente em produto digital, onde o cliente "compra sem ver".

**Implicação:** depoimentos reais, selos de segurança e clareza de processo não são "decoração", são funcionalidade.

---

## Regras por área

### A. Mensuração e dados

#### A1. Eventos canônicos obrigatórios
Toda página, componente ou endpoint que toque o funil de compra deve disparar o evento canônico correspondente:

| Etapa | Evento GA4 | Evento Meta Pixel | Onde |
|---|---|---|---|
| Ver produto | `view_item` | `ViewContent` | [ProductDetailsPage.jsx](../src/pages/ProductDetailsPage.jsx) |
| Adicionar ao carrinho | `add_to_cart` | `AddToCart` | [CartProvider.jsx](../src/providers/CartProvider.jsx) |
| Iniciar checkout | `begin_checkout` | `InitiateCheckout` | [CheckoutPage.jsx](../src/pages/CheckoutPage.jsx) |
| Compra confirmada | `purchase` | `Purchase` | [DownloadsPage.jsx](../src/pages/DownloadsPage.jsx) (após aprovação real) |

#### A2. Disparo de `purchase` apenas após confirmação real
Nunca disparar `purchase` no redirect do Mercado Pago. Disparar apenas quando o backend confirmar status `approved`.

#### A3. UTMs persistentes
Toda primeira visita com `utm_*` na URL deve gravar em `localStorage` com TTL de 30 dias e ser anexada ao pedido (`orders.attribution_data`).

#### A4. LGPD e consentimento
Trackers de marketing (GA4 com `signals`, Meta Pixel) requerem consentimento prévio do usuário. Implementar banner simples com:
- Aceitar
- Rejeitar
- Personalizar

Eventos só disparam após consentimento. Eventos essenciais (carrinho, checkout) podem rodar como `first-party only` sem consentimento.

#### A5. Sem dados pessoais em eventos
Nunca enviar email, telefone ou CPF como propriedade de evento. Use ID hasheado se precisar correlacionar.

#### A6. Logs de auditoria no backend
Eventos críticos (pagamento, login admin, alteração de produto) ficam em `analytics_events` ou tabelas dedicadas. Não confiar apenas em GA4 para histórico oficial.

---

### B. UX e interface

#### B1. CTA principal sempre visível
Toda página com objetivo de conversão tem um CTA primário acima da dobra. Sem exceções.

#### B2. Um objetivo por página
Página de produto vende aquele produto. Página de captura captura email. Home apresenta a marca. Não misturar objetivos na mesma tela.

#### B3. Carrinho não bloqueia navegação
Adicionar ao carrinho não deve navegar para outra página. Use toast + drawer.

#### B4. Checkout em uma página (single-page checkout)
Evitar múltiplos passos. Email + nome + pagamento na mesma tela.

#### B5. Login social opcional
Permitir checkout como convidado. Login social acelera, mas não pode ser obrigatório.

#### B6. Mensagens de erro humanas
Em vez de "Erro 500: payment_intent_failed", escrever "Não conseguimos confirmar seu pagamento. Tente outro cartão ou Pix.".

#### B7. Estados de loading sempre visíveis
Polling, requisições assíncronas e processamento devem ter `aria-busy`, skeleton ou stepper visível. Não deixar a tela "morta".

#### B8. Tipografia mínima 16px em mobile
Inputs em fontes menores que 16px causam zoom involuntário no iOS. Bloqueia conversão em mobile.

#### B9. Áreas de toque ≥ 44x44px
Botões, links e ícones clicáveis em mobile.

#### B10. Contraste WCAG AA
Texto sobre fundo com razão de contraste mínima 4.5:1 (3:1 para texto grande). Validar em PRs com plugins como `eslint-plugin-jsx-a11y`.

---

### C. Mídia paga

#### C1. Não rodar mídia sem tracking funcionando
Se GA4 ou Meta Pixel não estão validados, não inicie campanha. Período.

#### C2. Sempre otimizar para conversão, nunca para clique
Em Google Ads, conversão primária = `purchase`. Em Meta, otimização = `Purchase`.

Exceção temporária: campanha de remarketing em audiência fria pode otimizar para `ViewContent` nos primeiros 7 dias para acumular dados, depois mudar.

#### C3. Funil frio, morno e quente em campanhas separadas
Nunca misturar. Cada um tem orçamento, anúncio e oferta diferentes.

#### C4. Públicos sempre baseados em Curva ABC
Campanha de venda mira lookalike de clientes classe A. Campanha de cross-sell mira recompradores. Sem critério = Incoerência Estratégica.

#### C5. Página de destino com message match
A headline da landing repete a promessa do anúncio. Anúncio diz "PDF de alfabetização para volta às aulas"? A landing começa com "PDF de alfabetização para volta às aulas".

#### C6. Orçamento começa pequeno, escala com ROAS comprovado
Iniciar com R$ 30/dia por campanha. Dobrar somente após 7 dias com ROAS consistente.

#### C7. Pausar/matar campanhas perdedoras com critério
Critério: 7+ dias rodando + ROAS < 1 + sem tendência de melhora. Antes disso, é cedo.

#### C8. Anúncios seguem AIDA
**Atenção** no título, **Interesse** no subtítulo/imagem, **Desejo** com prova social, **Ação** com CTA específico.

#### C9. Personalização nominal em anúncio: proibida em escala
Não usar `{NOME}` em título de anúncio nem assunto de email em massa. Estudo Ferreira mostrou R$ 0 de RPM nessa estratégia.

#### C10. Públicos inativos totais: proibidos
Nunca subir campanha para "lookalike de quem não comprou" ou "audiência fria de baixo engajamento". É a pior aposta possível.

---

### D. Email marketing

#### D1. Double opt-in obrigatório
Toda inscrição em newsletter exige confirmação por email. Não importa de onde veio.

#### D2. Link de descadastro em todo email
Obrigatório por lei (LGPD/CAN-SPAM). Visível, não escondido.

#### D3. Frequência máxima
Máximo 1 newsletter manual/semana para o mesmo segmento. Sequência automatizada (pós-compra) é separada.

#### D4. Sequência pós-compra obrigatória
Toda compra aprovada inicia sequência mínima:
- D+0: confirmação + acesso (transacional)
- D+3: pesquisa de satisfação / pedido de review
- D+15: cross-sell baseado em categoria comprada

#### D5. Segmentação por categoria, não por individualização
Email vai para "compradores de alfabetização", não para "Maria que comprou alfabetização". Conteúdo do email é específico ao segmento, não à pessoa.

#### D6. SPF, DKIM e DMARC autenticados
Domínio enviador deve estar autenticado. Sem isso, email vai para spam e queima reputação.

#### D7. Não enviar para inativos > 180 dias
Após 180 dias sem engajamento, parar de enviar. Continuar custa reputação de domínio e dinheiro.

#### D8. Cupom de reativação só para 90-180 dias inativos
Cupom para quem está ativo é dar desconto a quem ia comprar de qualquer jeito. Cupom para inativo total não converte.

---

### E. SEO e conteúdo

#### E1. URLs sempre com slug, nunca com UUID
`/produtos/painel-alfabeto-cursivo` é correto. `/produtos/a3f2-b91e-4c7d` é proibido.

#### E2. Cada página tem `<title>` e `<meta description>` únicos
Implementar via `react-helmet-async`. Sem fallback genérico para todas as páginas.

#### E3. Schema.org em páginas de produto
Tipo `Product` + `Offer` com preço, disponibilidade e imagem. Validar em https://search.google.com/test/rich-results.

#### E4. Sitemap.xml mantido e submetido
Atualização automática a cada novo produto. Submetido no Google Search Console.

#### E5. Canonical URLs sempre presentes
Em qualquer página com possibilidade de URL duplicada (filtros, parâmetros), declarar canonical.

#### E6. Imagens com `alt` descritivo
Não "imagem.png". Escrever o que está na imagem ("Painel de alfabeto cursivo colorido para sala de aula do 1º ano").

#### E7. Não bloquear renderização com fontes externas
Auto-host as 2-3 fontes essenciais. `font-display: swap`.

#### E8. Conteúdo gratuito como porta de entrada
Pelo menos 1 produto gratuito por categoria, exigindo email para download. Alimenta lista de email + SEO long-tail.

---

### F. Performance técnica

#### F1. Lighthouse mínimo em produção
- Performance ≥ 90 (mobile) / 95 (desktop)
- Accessibility ≥ 90
- Best Practices ≥ 90
- SEO ≥ 95

CI bloqueia PR que derrube qualquer um.

#### F2. Core Web Vitals dentro do verde
- LCP < 2.5s
- CLS < 0.1
- INP < 200ms

#### F3. Bundle inicial < 200kB gzipped
Rotas pesadas (admin, ProductsPage com filtros) são `lazy()`. Vide [vite.config.js](../vite.config.js).

#### F4. Imagens otimizadas
WebP/AVIF, lazy load fora da dobra, srcset responsivo. CDN se volume crescer.

#### F5. Cache de API
Endpoints públicos (catálogo, home) com cache HTTP de pelo menos 60s. Curva ABC e dashboards: cache de 1h server-side.

#### F6. Sem chamadas síncronas no caminho crítico
Nada de `fetch` bloqueando render da home. Skeleton primeiro, dados depois.

---

### G. Pagamentos e checkout

#### G1. Pagamento sempre verificado no backend
Frontend nunca decide "compra aprovada". Sempre via `verify-payment` ou webhook.

#### G2. Idempotência de webhook
Webhook do Mercado Pago pode ser disparado múltiplas vezes. Processar com `idempotency_key` (id do pagamento) para evitar duplicação.

#### G3. Assinatura de webhook validada
HMAC-SHA256 com `WEBHOOK_SECRET`. Sem validação = rejeitar. Já implementado em [lib/mercadopago-config.js](../lib/mercadopago-config.js); não remover.

#### G4. Polling como fallback, não como principal
Polling em [CheckoutPage.jsx](../src/pages/CheckoutPage.jsx) e [DownloadsPage.jsx](../src/pages/DownloadsPage.jsx) existe para cobrir webhook que não chega. Em produção, webhook é o caminho oficial.

#### G5. Download via token efêmero
Nunca expor URL direta do arquivo. Sempre token com TTL e validação. Tabelas `download_tokens` e `download_logs` no [schema.sql](../supabase/schema.sql).

#### G6. Cupom validado no backend
Frontend pode pré-validar para UX, mas validação real é server-side. Nunca confiar no cliente.

#### G7. Suporte a múltiplos meios de pagamento
Mercado Pago Checkout Pro já entrega Pix, cartão e boleto. Não desabilitar opções sem dado claro de baixa conversão.

---

### H. Segurança e privacidade

#### H1. Service role nunca exposta
Confere em [SECURITY.md](./SECURITY.md). Browser jamais tem acesso a `SUPABASE_SERVICE_ROLE_KEY`.

#### H2. RLS habilitado em todas as tabelas
Sem exceção. Toda tabela nova nasce com RLS ativo.

#### H3. Cookies HttpOnly + SameSite=Strict
Sessões de cliente e admin via cookie assinado HMAC. JS não acessa.

#### H4. Rate limit em endpoints públicos
Helmet + express-rate-limit já configurados. Reforçar para endpoints novos sensíveis (login, recuperação de senha, cupom).

#### H5. Senhas seguindo política
Mínimo 8 chars + maiúscula + minúscula + número. Validação em [CustomerAuthPage.jsx](../src/pages/CustomerAuthPage.jsx) + no backend (defense in depth).

#### H6. Dados pessoais minimizados
Coletar apenas o necessário (nome, email para compra). Endereço só se for produto físico (não é nosso caso).

#### H7. LGPD: direito ao esquecimento
Endpoint para usuário solicitar exclusão de conta + dados associados (anonimizar `orders.email`, deletar `profiles`).

#### H8. Backup automatizado
Supabase Pro tem 30 dias de backup. Free, 7 dias. Manter no mínimo Pro em produção.

---

### I. Painel admin

#### I1. Tudo que admin faz é auditado
Tabela `admin_audit_log` (futuro): admin_id, action, target_type, target_id, before, after, created_at.

#### I2. 2FA opcional, mas recomendado
Já implementado. Conta principal do admin deve ter 2FA ativo em produção.

#### I3. Curva ABC sempre disponível
Aba `Análise` é central. Decisões de produto e mídia se apoiam nela.

#### I4. Export CSV em qualquer relatório
Pedidos, clientes, vendas por período, Curva ABC. Sem isso, vira refém de quem programou.

#### I5. Não permitir delete físico de pedidos
Pedidos têm valor histórico. Apenas `soft delete` ou marcação de cancelado.

---

## Anti-padrões (lista do que NÃO fazer)

### Em produto e UX
- ❌ Pop-up agressivo de newsletter na entrada
- ❌ Forçar criação de conta para comprar
- ❌ Contadores falsos de escassez ("Apenas 2 disponíveis" em produto digital)
- ❌ Carrossel automático em hero (CLS + UX pobre)
- ❌ Mais de 1 CTA primário por tela
- ❌ Esconder preço final até a última etapa
- ❌ Termos jargão ("checkout", "carrinho") sem necessidade em públicos não familiares

### Em mídia paga
- ❌ Otimizar para clique quando o objetivo é venda
- ❌ Misturar funil frio + quente no mesmo conjunto
- ❌ Personalização nominal em título de anúncio
- ❌ Anunciar para inativos totais
- ❌ Dobrar orçamento sem 7 dias de dados
- ❌ Pausar campanha no 1º dia ruim
- ❌ Variações infinitas de criativo sem público definido

### Em email
- ❌ Comprar lista de emails (nunca)
- ❌ Enviar para quem nunca consentiu
- ❌ Esconder link de descadastro
- ❌ Mais de 1 email por semana ao mesmo segmento (exceto automação)
- ❌ Promoção "queima total" toda semana
- ❌ Enviar para inativos > 180 dias

### Em mensuração
- ❌ Disparar `purchase` no redirect, antes da confirmação real
- ❌ Trackear dados pessoais (email, CPF) como propriedade de evento
- ❌ Rodar GA4/Meta Pixel sem consentimento do usuário
- ❌ Confiar só em GA4 para histórico oficial (perde dados com adblock)
- ❌ Não anexar UTM ao pedido

### Em código
- ❌ Expor `SERVICE_ROLE_KEY` no frontend
- ❌ Tabela sem RLS
- ❌ Pagamento aprovado sem validação no backend
- ❌ URL direta de arquivo de download
- ❌ Webhook sem validação de assinatura
- ❌ Bypass de `--no-verify` em commits
- ❌ Esconder erros com `try/catch` vazio
- ❌ Hardcode de secrets

### Em decisões estratégicas
- ❌ Pivotar a marca a cada trimestre
- ❌ Copiar concorrente sem entender o porquê
- ❌ Mudar 5 coisas ao mesmo tempo (impossível aprender com isso)
- ❌ Tomar decisão de produto sem olhar Curva ABC
- ❌ Cortar produto C sem avaliar se é "produto de entrada"

---

## Checklist antes do merge

Para cada PR que toque o fluxo do cliente, fluxo de pagamento ou admin:

### Funcional
- [ ] Feature testada em mobile (não só desktop)
- [ ] Estados de loading, erro e vazio cobertos
- [ ] Mensagens de erro são humanas
- [ ] Não introduziu campos desnecessários no checkout
- [ ] CTAs principais permanecem acima da dobra

### Mensuração
- [ ] Eventos canônicos disparados nos pontos certos
- [ ] Nenhum dado pessoal indo como propriedade de evento
- [ ] UTMs preservadas no fluxo (se aplicável)

### Performance
- [ ] Lighthouse continua ≥ 90 (mobile)
- [ ] Sem aumento de bundle inicial > 10kB sem justificativa
- [ ] Imagens novas otimizadas (WebP/AVIF + lazy load)

### SEO
- [ ] Página nova tem `<title>` e `<meta description>` únicos
- [ ] URLs com slug, não UUID
- [ ] Schema.org adicionado se for página de produto

### Segurança
- [ ] Nada exposto que devia ficar no backend
- [ ] RLS preservada em tabelas alteradas
- [ ] Rate limit aplicado em endpoint público novo
- [ ] Sem secrets hardcoded

### Documentação
- [ ] [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md) atualizado se mudou roadmap
- [ ] Este documento atualizado se criou nova regra
- [ ] [ARCHITECTURE.md](./ARCHITECTURE.md) atualizado se mudou estrutura

---

## Glossário de KPIs

| Sigla | Nome | Fórmula | Meta |
|---|---|---|---|
| CTR | Click-through Rate | cliques / impressões | > 2% em rede de pesquisa |
| CVR | Conversion Rate | conversões / cliques | > 1.5% no site |
| CPL | Custo por Lead | investimento / leads | varia por nicho |
| CPV | Custo por Venda | investimento / vendas | < ticket médio × 0.3 |
| ROAS | Return on Ad Spend | receita / investimento | ≥ 3x mínimo, ideal 5x |
| LTV | Lifetime Value | receita total / cliente | aumentar continuamente |
| CAC | Custo de Aquisição de Cliente | investimento / novos clientes | < LTV / 3 |
| AOV / Ticket Médio | Average Order Value | receita / pedidos | aumentar via cross-sell |
| RPM | Receita por Mil envios | receita / (envios / 1000) | usado em email |
| Recompra | Taxa de Recompra | clientes com ≥ 2 pedidos / total | > 20% saudável |

---

## Quando uma regra precisa mudar

Estas regras não são imutáveis, mas mudá-las exige rigor:

1. **Hipótese clara:** "Acredito que mudar X aumentará Y porque Z."
2. **Teste isolado:** A/B test ou piloto com escopo limitado, mínimo 7 dias.
3. **Significância estatística:** mínimo 200 conversões por variante antes de conclusões.
4. **Documentação no PR:** explicar o experimento, resultado e nova regra.
5. **Atualização deste documento:** no mesmo PR que muda o comportamento.

Sem isso, é só achismo. E e-commerce é caro demais para ser tocado por achismo.

---

## Referências (fundamento das regras)

- **FERREIRA, B. O.** Estratégias de segmentação e personalização no e-mail marketing. TCC, UFSC, 2025.
- **KWONG, J. C.** Marketing digital para incremento de vendas em um e-commerce de produtos personalizados. TCC, UFRN, 2024.
- **MARQUEZ, W. T. et al.** Estratégias de marketing digital para a alavancagem em e-commerce. REAVI, 2018.
- **GILIOLI, R. M.; GHIGGI, T.** E-commerce: reflexões sobre estratégias e desafios. Revista Eletrônica Gestão e Serviços, 2020.
- **KOTLER, P.; KELLER, K. L.** Marketing Management. Pearson, 2016.
- Documentação interna: [ARCHITECTURE.md](./ARCHITECTURE.md), [SECURITY.md](./SECURITY.md), [plano-melhorias-fluxo-cliente.md](./plano-melhorias-fluxo-cliente.md).
