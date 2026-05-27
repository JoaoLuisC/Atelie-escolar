# 07 — Dashboard administrativo

> O painel admin em `/admin` é composto de 13 abas. Esta página documenta cada uma: para que serve, o que mostra, de onde vêm os dados, ações disponíveis.

---

## Acesso

- URL: `/painel-acesso-privado-atelie` (obscurecida) ou `/admin` direto se já logado
- Link discreto "· admin ·" no rodapé do `/login` redireciona para a URL admin
- Login com e-mail + senha + (opcional) 2FA TOTP + PIN de recuperação
- Cookie `admin_session` HttpOnly assinado com HMAC-SHA256, TTL 8h, SameSite=Strict
- Apenas usuários com `profiles.role IN ('ADMIN', 'MASTER')` conseguem logar
- Rate-limit: 5 tentativas falhas / 10 min

Fluxo detalhado: [05-FLUXOS §4](./05-FLUXOS.md).

---

## Estrutura física

```
src/components/admin/
├── tabs/                        # 13 abas
│   ├── DashboardTab.jsx
│   ├── ProductsTab.jsx
│   ├── CategoriesTab.jsx
│   ├── OrdersTab.jsx
│   ├── UsersTab.jsx
│   ├── FinanceTab.jsx
│   ├── ComparisonTab.jsx
│   ├── PerformanceTab.jsx
│   ├── VitrineTab.jsx
│   ├── SecurityTab.jsx
│   ├── AnalysisTab.jsx
│   ├── FunnelTab.jsx
│   └── SegmentsTab.jsx
├── ui/                          # Componentes UI internos
│   ├── StatCard.jsx
│   ├── BarList.jsx
│   ├── StatusChip.jsx
│   ├── Card.jsx
│   ├── Button.jsx
│   └── EmptyState.jsx
└── utils/                       # Helpers admin
```

Container: `src/pages/AdminPage.jsx` orquestra as abas e gerencia state global do admin.

---

## As 13 abas

### 1. Dashboard

**Para que serve.** Visão de relance do estado do negócio.

**Mostra.**
- KPIs principais: receita do mês, pedidos, ticket médio (AOV), taxa de recompra
- LTV médio 12m
- LTV/CAC ratio (quando dados de CAC existirem — depende de Fase 5)
- Mini gráfico de vendas dos últimos 30 dias
- Top 5 produtos por receita
- Top 5 categorias por receita
- Alertas (ex: pedidos `pending` há > 24h, queda de conversão)

**Fonte.** `GET /api/admin-dashboard` + `GET /api/admin-kpis` + `GET /api/admin-abc-products`.

**Ações.** Apenas leitura. Cards clicáveis levam para abas específicas (ex: clicar em "Pedidos" leva para `OrdersTab`).

---

### 2. Produtos

**Para que serve.** CRUD de produtos.

**Mostra.**
- Lista completa de produtos com: imagem, nome, categoria, preço, status (ativo/inativo), badge featured
- Filtros: categoria, ativo, featured
- Busca por nome ou slug
- Ordenação: nome, preço, vendas, data de criação

**Ações.**
- **Novo produto** → abre `ProductWizard` (3 steps: Básico → Mídia → Preço)
- **Editar** → mesmo wizard pré-preenchido
- **Ativar/desativar** (soft toggle)
- **Excluir** (hard delete — usar com cautela, prefere desativar)
- **Duplicar** (cria novo com prefixo `[Cópia]`)

**Fonte.** `GET /api/admin-products` (listar) + `POST/PUT/DELETE /api/admin-products` (CRUD).

**Pendência.** Editor de `faq`, `reviews` e `benefits` não está no wizard ainda — hoje só por SQL. Ver [13-ROADMAP §3.4](./13-ROADMAP-PENDENCIAS.md).

---

### 3. Categorias

**Para que serve.** CRUD de categorias.

**Mostra.**
- Lista com: cor, nome, slug, contagem de produtos, badge label, sort order, status

**Ações.**
- **Nova categoria** → `CategoryWizard` (nome, slug auto, cor, badge_label, featured, sort_order)
- **Editar**
- **Excluir** (bloqueia se há produtos vinculados — exige reassignar antes)
- **Reordenar via drag-and-drop** (atualiza `sort_order`)

**Fonte.** `GET/POST/PATCH/DELETE /api/admin-categories`.

---

### 4. Pedidos

**Para que serve.** Acompanhar e gerenciar pedidos.

**Mostra.**
- Tabela com: order_code, cliente (email + nome), valor, status, payment_status, data, meio de pagamento
- Filtros: status, payment_status, período, busca por email/code
- Indicadores de status visual (chip colorido)

**Ações.**
- **Ver detalhes** → modal `OrderDetailModal.jsx` com:
  - Itens do pedido
  - Cliente + email + CPF
  - Histórico de status
  - Tokens de download e logs
  - Atribuição (UTM data)
- **Marcar como cancelado** (soft — não excluir)
- **Re-enviar e-mail de confirmação**
- **Exportar CSV** (regra I4 — sempre disponível)
- **Forçar re-verificação no MP** (caso suspeite de webhook perdido)

**Fonte.** `GET /api/admin-orders` (paginado) + `PATCH /api/admin-orders` (atualizar status).

> ⚠️ **Não há delete físico** de pedidos (regra I5) — apenas soft cancel. Pedidos têm valor histórico para análise.

---

### 5. Usuários

**Para que serve.** Listar clientes e ver histórico.

**Mostra.**
- Lista de clientes (`profiles` com `role='CUSTOMER'`)
- Por cliente: email, display_name, provider (email/google), data de cadastro, qtd de pedidos, total gasto
- Filtros: provider, com pedidos / sem pedidos, período

**Ações.**
- **Ver detalhes** → histórico completo de pedidos + e-mails enviados
- **Excluir conta** (LGPD: anonimiza `orders.email`, deleta `profiles`)
- **Exportar CSV**

**Fonte.** `GET /api/admin-users`.

---

### 6. Financeiro

**Para que serve.** Visão de receita e relatórios financeiros.

**Mostra.**
- Receita por período (dia/semana/mês/trimestre/ano)
- Breakdown por categoria de produto
- Breakdown por meio de pagamento (cartão / Pix / boleto)
- Taxa de aprovação MP
- Valor médio por meio de pagamento
- Gráfico de evolução temporal

**Ações.**
- Selecionar período customizado
- Exportar CSV de receita por período
- Comparar com período anterior (atalho para `ComparisonTab`)

**Fonte.** Cálculo agregado a partir de `orders` (com `payment_status='approved'`).

---

### 7. Comparativo

**Para que serve.** Comparação período-a-período.

**Mostra.**
- Tabela: período A vs período B
- Métricas: receita, pedidos, AOV, novos clientes, taxa de recompra
- Variação % e absoluta
- Indicadores visuais (verde subindo, vermelho caindo)

**Ações.**
- Selecionar 2 períodos (ex: "este mês vs mês anterior", "este trimestre vs anterior", custom)
- Exportar CSV

**Fonte.** Composição de queries sobre `orders`.

---

### 8. Performance

**Para que serve.** Métricas operacionais e de conversão.

**Mostra.**
- Taxa de conversão geral
- Conversão por etapa do funil (idem aba Funil, mas resumida)
- Tempo médio entre `add_to_cart` e `purchase`
- Taxa de carrinho abandonado
- Taxa de recuperação de carrinho abandonado
- Top produtos com `view_item` alto e baixa conversão (oportunidade)
- Top produtos com alta conversão e baixo tráfego (oportunidade de promover)

**Fonte.** `analytics_events` + `abandoned_carts` + `orders`.

---

### 9. Vitrine

**Para que serve.** Configurar o que aparece na home.

**Mostra.**
- Seções da home: Destaques, Novidades, Mais Vendidos, Categoria em foco
- Por seção: produtos atualmente listados + drag-and-drop para reordenar
- Toggle para ativar/desativar cada seção

**Ações.**
- **Adicionar produto a uma seção** (busca + click)
- **Remover produto**
- **Reordenar via drag**
- **Trocar título da seção**

**Fonte.** `settings.vitrine` (JSON com config) + `GET/POST /api/admin-vitrine`.

---

### 10. Segurança

**Para que serve.** Auditoria de eventos críticos.

**Mostra.**
- Lista de `security_events` ordenada por data desc
- Filtros: tipo de evento, severidade, período
- Eventos disponíveis hoje:
  - `webhook_invalid_signature` — assinatura HMAC do MP não bate
  - `admin_login_failed` — senha errada ou role não-admin
  - `verify_payment_email_mismatch` — tentativa de enumeração de `order_code`
- IP, user-agent, properties (sem dados pessoais em claro — só hash sha256.slice(0,16))

**Ações.**
- Filtrar e exportar CSV
- **Configurar 2FA** (TOTP + PIN) do admin atual:
  - Habilitar → gera QR code para Google Authenticator
  - Definir PIN de recuperação (hash bcrypt em `settings.adminConfig`)
  - Testar antes de salvar

**Fonte.** `GET /api/admin-settings` + tabela `security_events` (RLS service-only).

---

### 11. Análise

**Para que serve.** Análise estratégica do negócio. Base para decisões de produto e campanha.

**Mostra.**

#### Curva ABC de produtos
- Pareto: produtos ordenados por receita
- Classe A: 20% dos produtos = ~80% receita
- Classe B: 30% dos produtos = ~15% receita
- Classe C: 50% dos produtos = ~5% receita
- Por produto: receita total, unidades vendidas, ticket médio, % do total

#### Curva ABC de clientes
- VIP: top compradores (top 20% por receita)
- Recorrentes: clientes com ≥ 2 pedidos
- Eventuais: 1 pedido apenas
- Por cliente: email mascarado, qtd de pedidos, total gasto, último pedido

#### Coorte mensal de retenção
- Heatmap: linhas = mês de aquisição, colunas = meses subsequentes
- Células mostram % de clientes do coorte que voltaram a comprar
- Detecta vazamento de retenção

#### KPIs consolidados
- LTV médio (12m)
- Taxa de recompra
- LTV/CAC (quando CAC existir)
- Frequência média de compra
- Tempo médio entre compras

**Ações.**
- Filtros: período + categoria
- Export CSV de cada quadro (regra I4)

**Fonte.** `GET /api/admin-abc-products` + `/api/admin-abc-customers` + `/api/admin-cohort` + `/api/admin-kpis`.

**Performance.** Cache server-side de 1h em todos os endpoints (regra F5).

---

### 12. Funil

**Para que serve.** Visualizar o funil de conversão completo.

**Mostra.**
- Etapas: `page_view` → `view_item` → `add_to_cart` → `begin_checkout` → `purchase`
- Por etapa: contagem absoluta + taxa de conversão
- Filtros: período, categoria, origem (UTM source/medium/campaign)
- Drop-off em cada etapa
- Comparação com período anterior

**Fonte.** `GET /api/admin-funnel` agrega `analytics_events`.

---

### 13. Segmentos

**Para que serve.** Segmentar clientes para campanhas direcionadas.

**Mostra.**
- Segmentos pré-definidos:
  - **VIP** (top 20% por receita)
  - **Recorrentes** (≥ 2 pedidos)
  - **Eventuais** (1 pedido)
  - **Inativos 60-90d**
  - **Inativos 90-180d** (alvo de reativação)
  - **Inativos > 180d** (não enviar mais — regra D7)
  - **Carrinho abandonado não recuperado**
- Por segmento: quantidade, valor médio, último pedido médio
- Sugestões automáticas de campanha por segmento

**Ações.**
- Filtros customizados (RFM)
- Export CSV de lista de e-mails do segmento (para envio em massa)
- Criar segmento customizado (futuro)

**Fonte.** `GET /api/admin-segments` aplicando lógica de `lib/customer-segmentation.js`.

---

## UI compartilhada (`src/components/admin/ui/`)

| Componente | Uso |
|---|---|
| `StatCard.jsx` | Card com número grande + label + delta (↑ verde / ↓ vermelho) |
| `BarList.jsx` | Lista com gráfico de barras horizontais (ex: top produtos) |
| `StatusChip.jsx` | Badge colorido para status (`pending`, `approved`, `rejected`, etc) |
| `Card.jsx` | Container genérico com sombra brand |
| `Button.jsx` | Botão estilizado (primary, secondary, ghost, danger) |
| `EmptyState.jsx` | Mensagem quando não há dados ("Nenhum pedido encontrado") |

---

## Padrões importantes

### Cache
Endpoints da aba Análise têm **cache server-side de 1h** (regra F5). Refresh manual via botão "Atualizar".

### Export CSV
Toda aba com tabela tem botão "Exportar CSV" (regra I4). Usa `utils/csv-export.js`.

### Loading e empty states
Todo componente que carrega dados deve mostrar:
- Skeleton durante loading
- EmptyState se vazio
- Mensagem de erro humana (regra B6)

### 2FA
- Configurado por admin individual (cada conta admin pode habilitar)
- Recomendado em produção (regra I2)
- Gerencia via aba **Segurança**

### Soft delete em pedidos
- Pedidos nunca são deletados (regra I5)
- Apenas marcados como `status='cancelled'`

---

## Métricas do admin (proxy do uso)

Em algum momento valerá ter logs de "qual admin acessou qual aba quando". Isso vai para uma futura tabela `admin_audit_log` (regra I1) — ainda não implementada.
