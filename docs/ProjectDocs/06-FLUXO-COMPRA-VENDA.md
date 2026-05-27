# 06 — Fluxo de compra e venda

> Jornada completa do cliente, desde descoberta até pós-venda. Mapa do que acontece em cada etapa e o que cada lado (cliente + vendedor) precisa fazer.

---

## Visão geral em 5 etapas

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  1. DESCOBR │ → │  2. CONSIDE │ → │  3. COMPRA  │ → │  4. DOWNLO  │ → │  5. PÓS-VEN │
│  ▪ Home     │   │  ▪ Detalhes │   │  ▪ Checkout │   │  ▪ Acesso   │   │  ▪ Confirm  │
│  ▪ Catálogo │   │  ▪ FAQ      │   │  ▪ Pagto    │   │  ▪ Tokens   │   │  ▪ Review   │
│  ▪ Busca    │   │  ▪ Reviews  │   │  ▪ Aprovado │   │  ▪ Logs     │   │  ▪ Cross-s. │
└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

Diagrama detalhado de cada fluxo em [05-FLUXOS](./05-FLUXOS.md).

---

## Etapa 1 — Descoberta

**O que o cliente faz**
- Chega na home via tráfego orgânico (SEO), direto, social ou (futuramente) anúncio
- Vê hero, vitrine de destaques, novidades e mais vendidos
- Usa busca ou filtro por categoria

**O que o sistema faz**
- Carrega `HomePage.jsx` com seções configuradas em `settings.vitrine` (editável na aba **Vitrine** do admin)
- Dispara `page_view` para GA4/Pixel (gated por consent)
- Persiste UTMs em `localStorage` (TTL 30d) via `utils/attribution.js`
- Em `/produtos` carrega filtros, busca textual e ordenação (`ProductsPage.jsx`)

**O que o vendedor (admin) precisa garantir**
- Categorias ativas e bem categorizadas
- Vitrine atualizada (mínimo mensal, recomendado semanal)
- Banner de consentimento LGPD aceito antes de tracking marketing
- Sitemap submetido no Search Console
- Posições orgânicas monitoradas (auditoria mensal — ver [11-REGRAS-NEGOCIO §G6](./11-REGRAS-NEGOCIO.md))

**Métricas que importam (admin → aba Performance + Funil)**
- Visitantes únicos
- Taxa de bounce
- Origem de tráfego
- Taxa visitante → `view_item`

---

## Etapa 2 — Consideração

**O que o cliente faz**
- Clica num produto, vai para `/produtos/:slug`
- Vê galeria, vídeos, descrição, preço, benefícios, FAQ, reviews
- Compara com produtos relacionados (cross-sell automático)
- Lê depoimentos (TrustBadgeRow + ProductReviews)

**O que o sistema faz**
- `ProductDetailsPage.jsx` busca dados via `GET /api/product-details?slug=...`
- Dispara `view_item` (GA4) + `ViewContent` (Pixel)
- `CrossSellSection.jsx` busca `GET /api/cross-sell?productId=X` (recomendações por categoria + co-purchase)
- `SEO.jsx` injeta `<title>`, `<meta>`, `<script type="application/ld+json">` com schema.org `Product` + `Offer`

**O que o vendedor precisa garantir**
- Cada produto com: galeria boa (3+ imagens), descrição completa, FAQ relevante (3+ perguntas), 3+ depoimentos, benefícios destacados
- Preço competitivo e `original_price` opcional para mostrar desconto
- Slug semântico (`painel-alfabeto-cursivo`, não UUID)
- Schema.org passa no [Rich Results Test](https://search.google.com/test/rich-results)

**Métricas (admin)**
- Taxa `view_item → add_to_cart` por produto
- Tempo médio na página
- Cross-sell click-through rate

---

## Etapa 3 — Compra

### 3.1 Adicionar ao carrinho
- Botão "Adicionar ao carrinho" não navega (regra B3): dispara toast + abre `CartDrawer.jsx`
- `CartProvider.jsx` persiste em `localStorage` via `utils/cart-storage.js`
- Dispara `add_to_cart` (GA4) + `AddToCart` (Pixel)

### 3.2 Checkout
- Cliente clica em "Finalizar compra" → navega para `/checkout`
- `CheckoutPage.jsx` mostra:
  - Resumo dos itens (com possibilidade de remover/alterar)
  - Form de email + nome (single page, regra B4)
  - Campo de cupom (`CouponField.jsx` → `POST /api/validate-coupon`)
  - Login social opcional (Google)
- Dispara `begin_checkout` (GA4) + `InitiateCheckout` (Pixel)

### 3.3 Iniciar pagamento
1. Cliente clica em "Pagar agora"
2. Frontend chama `POST /api/create-payment` com `{ items, customer, coupon }`
3. Backend:
   - Re-valida produtos no banco (preço, disponibilidade)
   - Re-calcula total + aplica cupom server-side (cliente não pode forjar)
   - Cria `orders` + `order_items` com `order_code` de 128 bits
   - Cria preferência no Mercado Pago com `back_urls` + `notification_url`
   - Salva `mercadopago_preference_id`
   - Retorna `initPoint`
4. Frontend abre `initPoint` em nova aba (`window.open`)
5. Frontend salva `pendingOrderId` no state e inicia polling a cada 4s

### 3.4 Pagamento no Mercado Pago
- Cliente escolhe cartão / Pix / boleto
- MP processa
- MP dispara webhook para `/api/webhook` (se URL pública configurada)
- MP redireciona o cliente para `back_urls.success` ou `back_urls.failure`

### 3.5 Confirmação
**Caminho A (webhook funciona):**
- Webhook atualiza `orders.payment_status='approved'` + cria `download_tokens` + `user_products`
- Polling do frontend pega o update na próxima iteração (≤ 4s)

**Caminho B (polling cobre):**
- A cada 4s o frontend chama `GET /api/verify-payment?orderId=X&email=Y`
- Backend consulta MP via `payment.get(payment_id)` se necessário
- Quando status = `approved`, retorna lista de `download_tokens`
- Frontend dispara `purchase` event (GA4) + `Purchase` (Pixel) **somente aqui**, com confirmação real (regra A2)
- Limpa carrinho + redireciona para `/downloads?order=X`

**Métricas chave**
- Taxa `add_to_cart → begin_checkout`
- Taxa `begin_checkout → purchase`
- Taxa de aprovação por meio de pagamento (cartão/Pix/boleto)
- Tempo médio do checkout
- Cupons mais usados

---

## Etapa 4 — Download

**O que o cliente faz**
- Em `/downloads`, vê lista dos arquivos comprados
- Clica em "Baixar" para cada um
- Recebe o arquivo direto no navegador

**O que o sistema faz**
- `DownloadsPage.jsx` chama `GET /api/verify-payment?orderId=X&email=Y` (faz polling se ainda `pending`)
- Renderiza lista de `download_tokens` válidos
- Cada link aponta para `/api/download?token=Y`
- Backend (`api/download.js`):
  - Valida token: existe + não expirou + (idealmente) não usado
  - Gera signed URL do Supabase Storage com TTL curto
  - Faz pipe do arquivo para o browser
  - Insere `download_logs` (IP + UA + timestamp)
  - Marca token como `used=true`
  - Adiciona header `Referrer-Policy: no-referrer` para evitar vazamento

**Pontos importantes**
- Token tem 128 bits de entropia (`crypto.randomBytes(16).toString('hex')`)
- TTL default: 7 dias (configurável)
- Mesmo após `used=true`, o cliente pode re-baixar se ainda dentro do TTL (UX) — o `used` é mais para auditoria que para bloqueio
- O arquivo nunca tem URL pública direta; sempre signed URL com expiração

**O que o vendedor precisa garantir**
- Cada produto com `download_url` apontando para path válido no Supabase Storage
- Bucket "public" criado e arquivos uploadados
- Testar download de cada produto após upload

---

## Etapa 5 — Pós-venda

### 5.1 E-mail de confirmação (imediato)
- `POST /api/send-confirmation-email` chamado em paralelo à confirmação
- Template `email-templates.js → confirmation()`
- Inclui: dados do pedido + link para downloads + link para reset de senha (se for primeira compra)

### 5.2 Sequência automatizada (cron via GitHub Actions)
- **D+0**: confirmação (já enviada em 5.1)
- **D+3**: pesquisa de satisfação / pedido de review
- **D+15**: cross-sell baseado em categoria comprada
- **D+90**: campanha de reativação (se sem compra desde então) com cupom `VOLTEI15`
- **D+180**: parar de enviar (LGPD + reputação de domínio — regra D7)

Cron rodando: `cron-email-jobs.js` chamado de hora em hora, lê `email_subscribers` + `orders` + decide o que enviar.

### 5.3 Cross-sell automático
- Aba **Análise** do admin mostra Curva ABC + co-purchase
- Sequência D+15 usa essas relações para sugerir produtos relacionados
- Cross-sell na página de produto (`CrossSellSection.jsx`) usa o mesmo critério

### 5.4 Suporte
- Cliente acessa `/conta` para ver histórico de pedidos
- E-mail de contato no rodapé
- (Futuro) FAQ unificado + chat opcional

---

## Responsabilidades do vendedor (admin) — rotina

### Diário (5 min)
- Conferir aba **Pedidos** — algum status `rejected`/`pending` há mais de 24h?
- Conferir aba **Dashboard** — KPIs estão dentro do esperado?

### Semanal (30 min)
- Reunião de métricas — Curva ABC, ROAS (quando Fase 5), conversão, recompra
- Definir 1-3 experimentos para semana
- Atualizar vitrine se necessário

### Mensal (2-4 h)
- Auditoria de SEO — posições no Search Console, páginas com queda, novos termos
- Revisão de Curva ABC produtos — produto C virou A? Produto A virou C?
- Revisão de Curva ABC clientes — segmentos VIP, recorrente, eventual
- Teste A/B (quando Fase 6 estiver ativa)

### Trimestral (4-8 h)
- Limpeza de catálogo — despublicar produtos com 0 vendas em 90d (cuidado com produto de entrada)
- Rotação de secrets (ver [08-SEGURANCA §rotação](./08-SEGURANCA.md))
- Backup manual extra (Supabase Pro tem 30d automático)
- Auditoria de logs em `security_events`

### Anual
- Pen-test focado (ver [08-SEGURANCA §pen-test](./08-SEGURANCA.md))
- Revisão das **regras de negócio** ([11-REGRAS-NEGOCIO](./11-REGRAS-NEGOCIO.md)) — algo a atualizar?
- Avaliação de upgrade de planos (Supabase Pro, Resend Pro, etc)

---

## Casos extremos e como lidar

### Cliente pagou mas não chegou arquivo
1. Verificar em **Pedidos** se `payment_status='approved'` e `download_tokens` foram criados
2. Se sim: pedir para acessar `/downloads?order=X` ou enviar link direto
3. Se não: forçar verificação manual via `GET /api/verify-payment?orderId=X&email=Y`
4. Se MP confirma mas DB não: investigar webhook em `security_events` ou logs do Vercel

### Cliente quer reembolso
- MP gerencia reembolso pelo painel
- Após reembolso, marcar pedido como `payment_status='refunded'` no admin (manual hoje, ou esperar webhook)
- Considerar invalidar `download_tokens` se ainda dentro do TTL

### Cliente esqueceu senha e nunca recebeu reset
- Verificar se `SMTP custom` está configurado no Supabase Auth
- Verificar `email_subscribers` ou `auth.users` se o e-mail existe
- Se necessário, criar nova senha via Admin API:
  ```bash
  curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/<uid>" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"password":"SenhaTemporaria123!"}'
  ```

### Cliente reportou cobrança duplicada
1. Conferir em MP se há 2 pagamentos para o mesmo `external_reference` (`order_code`)
2. Idempotência do webhook impede criar 2x `download_tokens`/`user_products`, mas não impede 2 pagamentos
3. Fazer reembolso de 1 dos pagamentos no painel MP

### Carrinho abandonado virou compra com cupom melhor
- A re-validação server-side garante que cupom aplicado é o atual válido
- Se cupom expirou entre abandono e retorno, cliente vai ver erro no checkout — atualizar UX para sugerir alternativa (futuro)

---

## Métricas globais do funil

| Métrica | Onde ver | Meta saudável |
|---|---|---|
| Visitantes únicos | GA4 + admin/Funnel | depende do volume |
| Conversão visitante → compra | admin/Funnel | > 1.5% |
| Conversão `add_to_cart → purchase` | admin/Funnel | > 20% |
| Ticket médio (AOV) | admin/KPIs | aumentar via cross-sell |
| Taxa de recompra (≥ 2 pedidos) | admin/KPIs | > 20% |
| LTV 12 meses | admin/KPIs | aumentar continuamente |
| LTV / CAC | admin/KPIs | ≥ 3 (quando Fase 5 ativa) |
| Taxa de aprovação MP | admin/Pedidos | > 85% |
| Carrinhos recuperados | admin/Segmentos | > 10% dos abandonados |

Definições e glossário em [11-REGRAS-NEGOCIO §glossário](./11-REGRAS-NEGOCIO.md).
