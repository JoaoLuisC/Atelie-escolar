# 06 — Fluxo de compra e venda

> Jornada completa do cliente, desde descoberta até pós-venda. Mapa do que acontece em cada etapa e o que cada lado (cliente + vendedor) precisa fazer.

---

## Visão geral em 5 etapas

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  1. DESCOBR │ → │  2. CONSIDE │ → │  3. COMPRA  │ → │  4. DOWNLO  │ → │  5. PÓS-VEN │
│  ▪ Home     │   │  ▪ Detalhes │   │  ▪ Checkout │   │  ▪ Acesso   │   │  ▪ Confirm  │
│  ▪ Catálogo │   │  ▪ FAQ      │   │  ▪ Pagto    │   │  ▪ Tokens   │   │  ▪ Review   │
│  ▪ Filtros  │   │  ▪ Reviews  │   │  ▪ Aprovado │   │  ▪ Logs     │   │  ▪ Cross-s. │
└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

Diagrama detalhado de cada fluxo em [05-FLUXOS](./05-FLUXOS.md).

---

## Etapa 1 — Descoberta

**O que o cliente faz**

- Chega na home via tráfego orgânico (SEO), direto, social ou (futuramente) anúncio
- Vê hero, vitrine de destaques, novidades e mais vendidos
- Usa filtros por categoria, preset (mais vendidos / novidades) e faixa de preço

**O que o sistema faz**

- Carrega `HomePage.jsx` com seções configuradas no setting `homeSections` (editável na aba **Vitrine** do admin)
- Dispara `page_view` para GA4/Pixel (gated por consent)
- Persiste UTMs em `localStorage` (TTL 30d) via `utils/attribution.js`
- Em `/produtos` carrega filtros (categoria, preset, faixa de preço) e ordenação (`ProductsPage.jsx`)

**O que o vendedor (admin) precisa garantir**

- Categorias ativas e bem categorizadas
- Vitrine atualizada (mínimo mensal, recomendado semanal)
- Banner de consentimento LGPD aceito antes de tracking marketing
- Sitemap submetido no Search Console
- Posições orgânicas monitoradas (auditoria mensal — ver [11-REGRAS-NEGOCIO §E SEO e conteúdo](./11-REGRAS-NEGOCIO.md))

**Métricas que importam (admin → abas Dashboard + Funil)**

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
- Lê depoimentos (ProductReviews)

**O que o sistema faz**

- `ProductDetailsPage.jsx` busca dados via `GET /api/product-details?slug=...`
- Dispara `view_item` (GA4) + `ViewContent` (Pixel)
- `CrossSellSection.jsx` busca `GET /api/cross-sell?productId=X` (recomendações por co-ocorrência de compra, com fallback por categoria)
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

- Botão "Adicionar ao carrinho" não navega (regra B3): dispara toast; o carrinho fica no `CartDrawer.jsx` (drawer lateral aberto pelo header)
- `CartProvider.jsx` persiste em `localStorage` via `utils/cart-storage.js`
- Dispara `add_to_cart` (GA4) + `AddToCart` (Pixel)

### 3.2 Checkout

- Cliente clica em "Finalizar compra" → navega para `/checkout`
- `CheckoutPage.jsx` mostra:
  - Resumo dos itens (com possibilidade de remover)
  - Form de email + nome (single page, regra B4)
  - Campo de cupom (`CouponField.jsx` → `POST /api/validate-coupon`, prévia; a validação que vale é a do create-payment)
  - Login social opcional (Google)
- Ao digitar o e-mail com carrinho preenchido, captura carrinho abandonado (`POST /api/abandoned-cart`, debounce de 1,5s, falha silenciosa)
- Dispara `begin_checkout` (GA4) + `InitiateCheckout` (Pixel)

### 3.3 Iniciar pagamento

1. Cliente clica em "Ir para pagamento"
2. Frontend chama `POST /api/create-payment` com `{ items, customer, attribution, couponCode }`
3. Backend:
   - Re-valida produtos no banco (preço, disponibilidade; máx. 100 itens, quantidade 1–99)
   - Re-calcula total + aplica cupom server-side (cliente não pode forjar)
   - Cria `orders` + `order_items` com `order_code` de 128 bits
   - Incrementa o uso do cupom de forma atômica (RPC `increment_coupon_usage`, respeita `max_uses`)
   - Cria preferência no Mercado Pago com `back_urls` + `notification_url`
   - Salva `preference_id`
   - Retorna `initPoint` (e `sandboxInitPoint`)
4. Frontend abre `initPoint` em popup (`window.open`) e mantém um botão "Abrir pagamento" como fallback (popup bloqueado no iOS/Safari)
5. Frontend salva `pendingOrderId` no state (+ `lastOrderId`/`lastOrderEmail` no `localStorage`) e inicia polling a cada 4s (até 150 tentativas ≈ 10 min)

### 3.4 Pagamento no Mercado Pago

- Cliente escolhe cartão / Pix / boleto (produto digital: sem parcelamento, `installments: 1`)
- MP processa
- MP dispara webhook para `/api/webhook` (se URL pública configurada)
- MP redireciona o cliente para `back_urls.success` (`/downloads?order=X`) ou `back_urls.failure`/`pending` (`/checkout?status=...`)

### 3.5 Confirmação

**Caminho A (webhook funciona):**

- Webhook valida a assinatura (`x-signature`, HMAC com `WEBHOOK_SECRET`), atualiza `orders.payment_status='approved'` (transição atômica `!approved→approved`), cria `download_tokens` (INSERT em lote idempotente) e provisiona a conta Supabase do cliente (primeira compra)
- Polling do frontend pega o update na próxima iteração (≤ 4s)

**Caminho B (polling cobre):**

- A cada 4s o frontend chama `GET /api/verify-payment?orderId=X&email=Y` (o par `order_code`+`email` precisa bater — comparação timing-safe; mismatch → 404 + security event)
- Backend consulta MP via `payment.search({ external_reference })` se necessário
- Quando status = `approved`, retorna lista de `download_tokens`
- Limpa carrinho + redireciona para `/downloads?order=X&email=Y&success=1`
- O `purchase` event (GA4) + `Purchase` (Pixel) dispara na página de downloads via `trackPurchaseOnce` (dedup por orderId), **somente com confirmação real** (regra A2)

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

- `DownloadsPage.jsx` chama `GET /api/verify-payment?orderId=X&email=Y` (faz polling se ainda `pending`: 12 tentativas × 10s)
- Cliente logado também vê o histórico via `GET /api/customer-orders` (e-mail vem só do cookie de sessão — anti-IDOR)
- Renderiza lista de `download_tokens` válidos
- Cada link aponta para `/api/download?token=Y`
- Backend (`handlers/download.js`):
  - Valida token: existe + não usado + não expirou
  - Consome o token com claim atômico (`used=false → true`) ANTES de gerar a URL — requisições concorrentes com o mesmo token são barradas
  - Gera signed URL do Supabase Storage com TTL de 5 min
  - Redireciona (redirect temporário: 302 no Express local, 307 na Vercel) para a signed URL — ou direto para a URL externa (Google Drive etc., legado), sinalizada no header `X-Download-Mode`
  - Insere `download_logs` (IP + UA + timestamp)
  - Adiciona headers `Referrer-Policy: no-referrer` + `Cache-Control: no-store` para evitar vazamento

**Pontos importantes**

- Token tem 256 bits de entropia (`crypto.randomBytes(32).toString('hex')`)
- TTL: 72 horas (fixo no código)
- Token é de **uso único**: após `used=true`, nova tentativa retorna 401 "Token já utilizado"
- Constraint `UNIQUE(order_id, product_id)` garante 1 token por par pedido/produto (idempotência entre webhook e verify-payment)
- Arquivo no Supabase Storage nunca tem URL pública direta — sempre signed URL com expiração; URLs externas (legado) são redirect direto

**O que o vendedor precisa garantir**

- Cada produto com `download_url` apontando para path válido no Supabase Storage (ou URL externa, legado)
- Buckets do Storage criados e arquivos uploadados — o upload do admin usa nomes fixos em `handlers/admin/upload-url.js` (`product_files` privado para arquivos de download; `product_images` público; `product_videos` privado). A env `SUPABASE_STORAGE_BUCKET` existe no `.env.example`, mas não é usada no fluxo de download (o bucket vem do próprio `download_url`)
- Testar download de cada produto após upload

---

## Etapa 5 — Pós-venda

### 5.1 E-mail de confirmação

- Endpoint `POST /api/send-confirmation-email` (best-effort — hoje nenhum fluxo automático o chama; serve para (re)envio)
- Template `email-templates.js → orderConfirmation()`; idempotente via `email_sent_log` (kind `order_confirmation`); destinatário é SEMPRE o e-mail gravado no pedido (o do body é ignorado)
- Inclui: dados do pedido + link para downloads + bloco "conta criada para você" (se for primeira compra)
- Na primeira compra, o webhook/verify-payment provisiona a conta Supabase do cliente e dispara e-mail de definição de senha (`resetPasswordForEmail`)

### 5.2 Sequência automatizada (cron via GitHub Actions)

- **~1h / ~24h**: lembretes de carrinho abandonado (se não recuperado)
- **D+3**: pedido de avaliação / review
- **D+15**: cross-sell (sugestões complementares) baseado em categoria comprada
- **D+45**: novidades da mesma categoria
- **D+90 a D+180**: campanha de reativação (se sem compra desde então) com cupom `VOLTEI15` (janela `REACTIVATION_DAYS_MIN/MAX`)
- **D+180**: parar de enviar (LGPD + reputação de domínio — regra D7)

Cron rodando: workflow `email-cron.yml` (GitHub Actions) chama `POST /api/cron-email-jobs` de hora em hora com header `X-Cron-Secret` (`CRON_SECRET`); o job lê `abandoned_carts` + `orders` + `email_subscribers` e decide o que enviar (idempotente via `email_sent_log`; respeita descadastro).

### 5.3 Cross-sell automático

- Aba **Análise** do admin mostra Curva ABC (produtos e clientes) + coorte de retenção
- Sequência D+15 usa a categoria comprada para sugerir produtos relacionados
- Cross-sell na página de produto (`CrossSellSection.jsx`) usa co-ocorrência de compra com fallback por categoria

### 5.4 Suporte

- Cliente acessa `/conta` (dados da conta) e `/downloads` (histórico de pedidos)
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
- Após reembolso, marcar pedido como `payment_status='refunded'` no admin (manual hoje — o webhook atual não trata status `refunded`)
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
2. Idempotência do webhook (transição atômica + `UNIQUE(order_id, product_id)`) impede criar 2x `download_tokens`, mas não impede 2 pagamentos
3. Fazer reembolso de 1 dos pagamentos no painel MP

### Carrinho abandonado virou compra com cupom melhor

- A re-validação server-side garante que cupom aplicado é o atual válido
- Se cupom expirou entre abandono e retorno, cliente vai ver erro no checkout — atualizar UX para sugerir alternativa (futuro)

---

## Métricas globais do funil

| Métrica                            | Onde ver                                                                                                          | Meta saudável                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Visitantes únicos                  | GA4 + admin/Funil                                                                                                 | depende do volume                   |
| Conversão visitante → compra       | admin/Funil                                                                                                       | > 1.5%                              |
| Conversão `add_to_cart → purchase` | admin/Funil                                                                                                       | > 20%                               |
| Ticket médio (AOV)                 | admin/Dashboard (KPIs)                                                                                            | aumentar via cross-sell             |
| Taxa de recompra (≥ 2 pedidos)     | admin/Dashboard (KPIs)                                                                                            | > 20%                               |
| LTV 12 meses                       | admin/Dashboard (KPIs)                                                                                            | aumentar continuamente              |
| LTV / CAC                          | admin/Dashboard (KPIs)                                                                                            | ≥ 3 (CAC ainda não medido — Fase 5) |
| Taxa de aprovação MP               | admin/Pedidos                                                                                                     | > 85%                               |
| Carrinhos recuperados              | tabela `abandoned_carts` (`recovered_at` — coluna existe, mas hoje nenhum fluxo a grava; medição manual/pendente) | > 10% dos abandonados               |

Definições e glossário em [11-REGRAS-NEGOCIO §glossário](./11-REGRAS-NEGOCIO.md).
