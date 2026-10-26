# 07 — Dashboard administrativo

> O painel admin em `/admin` é composto de 14 abas. Esta página documenta cada uma: para que serve, o que mostra, de onde vêm os dados, ações disponíveis.

---

## Acesso

- URL: `/admin` (`ROUTES.admin` em `src/constants/routes.js`) — sem sessão admin, a rota mostra só o formulário de login; com sessão, o painel. Sair do painel volta ao formulário na mesma URL
- Login com e-mail + senha + (opcional) 2FA TOTP ou PIN de recuperação — a 2ª etapa usa `challengeToken` HMAC de uso único, vinculado ao IP, com TTL de 2 min (expirado, o login reemite um novo)
- Cookie `admin_session` HttpOnly assinado com HMAC-SHA256, TTL 8h, SameSite=Strict
- O login aceita `profiles.role IN ('ADMIN', 'MASTER', 'SELLER')` (resposta idêntica para senha errada e conta de outro papel). Admin/master vão para o painel; professor (`SELLER`) vai para `/professores` e recebe 401/403 nas APIs `/api/admin/*`. O 2º fator só é cobrado de admin/master
- Rate-limit: 5 tentativas / 10 min (`RATE_LIMITS.adminLogin`, contador no Postgres, vale em dev e produção; o sucesso também conta) + balde separado de 5 / 10 min para o 2º fator (fail-closed: contador fora do ar → 503)

Fluxo detalhado: [05-FLUXOS §4](./05-FLUXOS.md).

### Plataforma de professores

Criada no commit `a2c7d40` (26/10/2026), primeira peça da v2
([docs/ecommerce-atelie-da-escola](../ecommerce-atelie-da-escola/README.md)).

| Rota                | Quem         | Página                            | O que mostra                                                                                                                                |
| ------------------- | ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`            | admin/master | `AdminPage` (as 14 abas abaixo)   | O painel da loja                                                                                                                            |
| `/admin/plataforma` | admin/master | `src/pages/PlatformAdminPage.jsx` | Professores e alunos (troca de papel), faturamento total/mês e **produtos sem professor**, com atribuição (`PUT /api/admin/product-seller`) |
| `/professores`      | professor    | `src/pages/TeachersPage.jsx`      | Meus produtos com vendas e receita (só pedidos aprovados), novo material e ativar/desativar                                                 |

O link "Professores e alunos" fica no rodapé do menu lateral do painel. Cada produto tem dono em
`products.seller_id` (nullable enquanto houver catálogo legado sem atribuição). O professor só
enxerga e altera linhas com o próprio `seller_id` — o filtro é feito no handler, com service role.

> Pendências antes de abrir para outra professora (moderação, isolamento do arquivo de download,
> split de pagamento, termos de quem vende): [13-ROADMAP, checklist F](./13-ROADMAP-PENDENCIAS.md).

---

## Estrutura física

```
src/components/admin/
├── tabs/                        # 14 abas
│   ├── DashboardTab.jsx
│   ├── ProductsTab.jsx
│   ├── PerformanceTab.jsx
│   ├── CategoriesTab.jsx
│   ├── OrdersTab.jsx
│   ├── CouponsTab.jsx
│   ├── UsersTab.jsx
│   ├── FinanceTab.jsx
│   ├── ComparisonTab.jsx
│   ├── FunnelTab.jsx
│   ├── AnalysisTab.jsx
│   ├── SegmentsTab.jsx
│   ├── VitrineTab.jsx            # faixas de produtos da home
│   ├── HomeContentEditor.jsx     # textos, imagem e blocos da home (aba Página inicial)
│   ├── ProductDefaultsCard.jsx   # descrição comum a todos os produtos (aba Produtos)
│   └── SecurityTab.jsx
├── ui/                          # Componentes UI internos
│   ├── StatCard.jsx
│   ├── BarList.jsx
│   ├── StatusChip.jsx
│   ├── Card.jsx
│   ├── Button.jsx
│   ├── EmptyState.jsx
│   └── useModalBehavior.js
├── utils/                       # Helpers admin (category-label.js, derive.js, errors.js, tabs.js)
├── AdminLayout.jsx              # Sidebar + header sticky + logout
└── OrderDetailModal.jsx         # Modal de detalhe de pedido (focus trap, Esc fecha)
```

Datas ficam em `src/utils/date.js` e os códigos de erro em `src/constants/error-codes.js` (o antigo `utils/format.js` foi removido).

Container: `src/pages/AdminPage.jsx` orquestra as abas (SPA interna por estado `activeTab`, sem sub-rotas) e gerencia o state global do admin. A sidebar (`AdminLayout.jsx`) agrupa três abas sob "Produtos" (Lista de produtos, Desempenho, Categorias) e duas sob "Financeiro" (Faturamento, Comparativo).

As abas listadas em `TABS_NEEDING_DASHBOARD` (dashboard, faturamento, comparativo, prod-saida, vitrine, produtos, categorias, analise) recarregam `GET /api/admin/dashboard` ao serem ativadas; as demais buscam os próprios dados.

---

## As 14 abas

### 1. Dashboard (`dashboard`)

**Para que serve.** Visão de relance do estado do negócio.

**Mostra.**

- KPIs principais (hero cards): faturamento do mês (com delta vs mês anterior + sparkline de 14 dias), ticket médio do mês, pedidos aprovados (+ pendentes), clientes recorrentes
- Mini stats: receita total, produtos ativos, pedidos pendentes, clientes cadastrados
- KPIs avançados (Fase 4): LTV médio 12m, taxa de recompra, ticket médio 12m, LTV/CAC (mostra "—" enquanto CAC não existir — o endpoint retorna `cac: null`)
- Gráfico de linha da receita dos últimos 7 dias
- Donut de receita por categoria (top 5)
- Curva ABC resumida (top 8 produtos por receita, classes A/B/C)
- Mix de clientes (novos vs recorrentes)
- Pedidos recentes (últimos 8, com botão "Detalhes" que abre `OrderDetailModal`)
- Card-placeholder "Vendas por região" (depende de o checkout pedir a UF; o funil de conversão está na aba Funil)

**Fonte.** `GET /api/admin/dashboard` (agregações client-side em `components/admin/utils/derive.js`) + `GET /api/admin/kpis?window=12`.

**Ações.** Apenas leitura; "Detalhes" abre o modal do pedido.

---

### 2. Lista de produtos (`produtos`, grupo Produtos)

**Para que serve.** CRUD de produtos.

**Mostra.**

- No topo, o cartão **Descrição padrão de todos os produtos** (`ProductDefaultsCard`): título opcional + texto (até 4.000 caracteres, quebras de linha preservadas). Aparece na página de **cada** produto, logo abaixo da descrição própria dele; vazio = não aparece. Setting `productDefaults`, via `GET/PUT /api/admin/settings`, servido ao público no campo `sharedDescription` de `GET /api/product-details`
- Lista completa de produtos com: nome, badge "Destaque" (featured), categoria, preço, status (ativo/inativo)
- Filtros: busca por nome, categoria, ativo/inativo

**Ações.**

- **Novo produto** → abre `ProductWizard` (4 steps: Básico → Mídia → Preço e tipo → Conversão; o step Conversão edita `benefits`, `faq` e `reviews`)
- **Editar** → mesmo wizard pré-preenchido
- **Pausar/Ativar** (soft toggle via `PATCH /api/admin/products`)
- **Excluir** (hard delete com `confirm` — usar com cautela, prefira pausar)
- Upload de mídia (imagens/vídeos/arquivo de download) via `POST /api/admin/upload-url` → PUT direto no Supabase Storage (URL assinada; limites 10MB imagem / 50MB vídeo-download)

**Fonte.** Lista vem do payload de `GET /api/admin/dashboard`; escritas via `POST/PUT/PATCH/DELETE /api/admin/products` (auditadas em `admin_audit_log`).

---

### 3. Desempenho dos produtos (`prod-saida`, grupo Produtos)

**Para que serve.** Ver quais produtos vendem e são baixados de fato.

**Mostra.**

- Tabela por produto, ordenada por unidades vendidas: vendas, receita, downloads e taxa de download (downloads/vendas)

**Fonte.** Derivado client-side (`deriveProductPerformance`) de pedidos aprovados + download logs do payload de `GET /api/admin/dashboard`.

---

### 4. Categorias (`categorias`, grupo Produtos)

**Para que serve.** CRUD de categorias.

**Mostra.**

- Cards com: cor, nome, badge destaque (featured), status (ativa/inativa)

**Ações.**

- **Nova categoria** → `CategoryWizard` (nome, cor, featured, ativa; o slug é gerado automaticamente pelo endpoint a partir do nome — `normalizeSlug` em `handlers/admin/categories.js`; o trigger de slug no banco existe só para `products`)
- **Editar**
- **Excluir** (com `confirm`; produtos vinculados ficam com `category_id = null` — a FK é `on delete set null`)

**Fonte.** `GET/POST/PUT/DELETE /api/admin/categories` (escritas auditadas; 409 em slug duplicado).

---

### 5. Pedidos (`pedidos`)

**Para que serve.** Acompanhar pedidos.

**Mostra.**

- Tabela com: order_code, cliente (email/nome), status de pagamento (chip colorido), data, total
- Filtro por status: aprovado, pendente, recusado, cancelado, falhou

**Ações.**

- **Ver detalhes** → modal `OrderDetailModal.jsx` com cliente, e-mail, status, total, data e itens do pedido

**Fonte.** `GET /api/admin/orders?status=`. A API também expõe `PUT` (atualizar status/payment_status/cliente/total, seta `completed_at` ao aprovar) e `DELETE` (exclusão física) — ambos auditados —, mas a UI atual não tem botões para essas ações.

> ⚠️ A regra I5 (nunca deletar pedidos, apenas soft cancel) vale como prática operacional — pedidos têm valor histórico para análise —, porém o endpoint `DELETE /api/admin/orders` existe e deleta de verdade. Use com muita cautela.

---

### 6. Cupons (`cupons`)

**Para que serve.** CRUD de cupons de desconto validados no checkout (sem SQL).

**Mostra.**

- Cards por cupom: código, desconto (`% OFF` ou valor fixo), status ativo/inativo, validade (`valid_until`), usos (`used_count`/`max_uses`), pedido mínimo (`min_order_amount`)

**Ações.**

- **Novo cupom** / **Editar** → `CouponWizard`
- **Excluir** (com `confirm`)

**Fonte.** `GET/POST/PUT/DELETE /api/admin/coupons` (aba auto-suficiente: busca os próprios dados; escritas auditadas). A validação de uso acontece no checkout via `/api/validate-coupon` + `create-payment`.

---

### 7. Faturamento (`faturamento`, grupo Financeiro)

**Para que serve.** Visão de receita bruta.

**Mostra.**

- Bruto acumulado, quantidade de pedidos aprovados, ticket médio
- Gráfico de barras do faturamento dos últimos 6 meses (apenas pedidos aprovados)

**Fonte.** Derivado client-side (`deriveFaturamentoSeries`) dos pedidos de `GET /api/admin/dashboard` com `payment_status='approved'`.

---

### 8. Comparativo (`comparativo`, grupo Financeiro)

**Para que serve.** Comparação mês atual vs mês anterior.

**Mostra.**

- Card por mês: vendas (qtd), receita, ticket médio
- Badge de variação % (verde subindo, vermelho caindo, cinza estável)

**Fonte.** Derivado client-side (`deriveMonthlyComparison` + `deriveComparisonDelta`) sobre pedidos aprovados.

---

### 9. Vendas (`vendas`) — subabas Estudo de vendas, Funil e Curva ABC

Desde 26/10/2026 Funil e Análise deixaram de ser itens do menu: são subabas de **Vendas**
(`SalesHub`), ao lado do **Estudo de vendas** (`SalesStudyTab`).

**Estudo de vendas.** Botão "Gerar nova análise" (30, 60 ou 90 dias, comparados ao período anterior
de mesma duração). O servidor (`handlers/admin/sales-study.js` + `lib/sales-study.js`) calcula os
agregados — funil (os mesmos cálculos da subaba Funil, `lib/funnel-metrics.js`), receita, pedidos,
ticket, cupons, recompra, Curva ABC, categorias e origem das vendas — e manda **só esses números** ao
Google Gemini (`GEMINI_API_KEY`, modelo `GEMINI_MODEL`, padrão `gemini-2.5-flash`), com o contexto
do negócio e a regra de não inventar números. A resposta (resumo, o que está bom, onde perde venda, o
que fazer, confiança) tem formato fixo e tamanhos limitados. Abaixo de 3 pedidos aprovados **e** 30
sessões no período a IA não é chamada ("dados insuficientes"). A última análise fica em
`settings.salesStudy`: abrir a aba não gasta cota; gerar tem limite de 10/hora e entra no audit log.
Nenhum e-mail ou nome de cliente vai para a IA.

#### Subaba Funil

**Para que serve.** Visualizar o funil de conversão completo.

**Mostra.**

- Etapas (sessões únicas por evento): `view_catalog` → `view_item` → `add_to_cart` → `begin_checkout` → `purchase`, cada uma com contagem absoluta + taxa de conversão vs etapa anterior
- Totais do período: sessões únicas, eventos registrados, compras aprovadas, receita
- Tabela de atribuição por UTM source (pedidos, receita, share; `direct` = sem UTM)
- Seletor de período: 7 / 30 / 90 dias

**Fonte.** `GET /api/admin/funnel?days=` agrega `analytics_events` + `orders`. Sem cache: recalculado a cada abertura (`Cache-Control: no-store`, ADM-01).

---

#### Subaba Curva ABC e coorte

**Para que serve.** Análise estratégica do negócio. Base para decisões de produto e campanha.

**Mostra.**

#### Curva ABC de produtos

- Pareto: produtos ordenados por receita
- Classe A: acumula os primeiros 80% da receita
- Classe B: até 95% acumulado
- Classe C: cauda longa (últimos 5%)
- Por produto: rank, classe, categoria, receita, % do total, % acumulado
- Filtros: período (mês/trimestre/ano) + categoria

#### Curva ABC de clientes

- Mesma classificação A/B/C por receita, sobreposta à relação: **VIP**, **Recorrente**, **Eventual**
- Por cliente: e-mail mascarado (LGPD), qtd de pedidos, ticket médio, receita, % do total
- Filtro: período (mês/trimestre/ano)

#### Coorte mensal de retenção

- Heatmap 12 meses: linhas = mês da 1ª compra, colunas = M+0…M+11
- Células mostram % do coorte que voltou a comprar (verde ≥ 50%)
- Detecta vazamento de retenção e sazonalidade do ano letivo

**Ações.**

- Botões "Como ler" abrem modal explicativo por quadro (como calcula / o que observar / como agir)
- Export CSV de cada quadro (regra I4): curva ABC de produtos, de clientes e coorte

**Fonte.** `GET /api/admin/abc-products?period&categoryId` + `/api/admin/abc-customers?period` + `/api/admin/cohort?months=12`.

**Performance.** Sem cache: os três endpoints são recalculados a cada abertura (`Cache-Control: no-store`, ADM-01).

---

### 11. Segmentos (`segmentos`)

**Para que serve.** Ver a base de e-mail segmentada para campanhas direcionadas.

**Mostra.**

- Totais de `email_subscribers`: inscritos totais, confirmados, aguardando opt-in, cancelados
- Contagem de assinantes por tag:
  - `cliente_ativo` (compra ≤ 90 dias)
  - `cliente_recorrente` (≥ 2 pedidos aprovados)
  - `cliente_vip` (5+ pedidos OU LTV alto)
  - `inativo_30d` (31–89 dias sem comprar)
  - `inativo_90d` (90–179 dias — alvo de reativação)
  - `inativo_180d` (≥ 180 dias — não enviar mais, regra D7)
  - `categoria:<slug>` (uma tag por categoria já comprada)

**Fonte.** `GET /api/admin/segments` aplicando lógica de `lib/customer-segmentation.js`. Retorna relatório agregado (contagens, sem lista bruta de e-mails). Sem cache: recalculado a cada abertura (`Cache-Control: no-store`, ADM-01).

---

### 12. Usuários (`usuarios`)

**Para que serve.** Listar clientes cadastrados e gerenciar papéis.

**Mostra.**

- Lista de `profiles` não privilegiados (admin/master e a conta da dona ficam fora) com: nome, e-mail, papel (badge), qtd de compras e total gasto (agregados de `orders` aprovados por e-mail)
- Busca por nome ou e-mail

**Ações.**

- **Trocar papel** (select Cliente / Vendedor → `PUT /api/admin/users`, gravado como `CUSTOMER`/`SELLER`; admin/master não são editáveis por aqui — 403)
- **Revogar acesso** (modal de confirmação → `DELETE /api/admin/users`; bane a conta no Supabase Auth e depois remove a linha de `profiles` — os pedidos ficam)

**Fonte.** `GET/PUT/DELETE /api/admin/users` (escritas auditadas).

> A exclusão de conta LGPD do próprio cliente (com anonimização de pedidos) é self-service via `/api/me-delete-account` — não passa por esta aba.

---

### 13. Página inicial (`vitrine`)

**Para que serve.** Configurar tudo o que aparece na home. A aba se chamava "Vitrine"; o id interno `vitrine` foi mantido.

**Cartão "Página inicial"** (`HomeContentEditor`, setting `homeContent`):

- **Blocos**: Topo (hero), Faixa de palavras, Catálogo e faixas de produtos, Como funciona, Prova social e redes — cada um pode ser ligado/desligado e reordenado
- **Topo**: título (trecho entre `*asteriscos*` sai colorido), subtítulo, texto e link do botão, **imagem opcional** (upload pelo mesmo fluxo das fotos de produto, até 1 MB, exibida inteira) e texto alternativo
- **Faixa de palavras**, **Catálogo** (texto pequeno, título, botão), **Como funciona** (títulos, 4 passos, destaque), **Prova social** (títulos, 4 números, até 6 depoimentos, links do Instagram/TikTok) e **Google** (título e descrição da página)
- Campo vazio é respeitado (some da home); bloco sem conteúdo não aparece. **Restaurar textos padrão** volta o formulário aos textos originais (só grava ao salvar)
- O servidor limpa o que é gravado (`lib/store-content.js`): whitelist de campos, tetos de tamanho, links só `https://` ou caminho interno. A home pública lê via `GET /api/home-content` (cache de CDN de ~1 min); os textos padrão moram em `src/constants/home-content.js`

**Cartão das faixas de produtos** (a antiga Vitrine) — **Mostra.**

- Lista ordenada das seções da home, de três tipos: **Categoria** (vinculada a uma categoria), **Mais vendidos** e **Novidades** (especiais, no máximo uma de cada)
- Por seção: título exibido, limite de produtos (4–20) e, no tipo categoria, a categoria vinculada

**Ações.**

- **Adicionar seção** (categoria via select, ou especial via botão)
- **Remover seção**
- **Reordenar** via botões subir/descer
- **Trocar título e limite da seção**
- **Salvar vitrine** (persiste tudo de uma vez)

**Fonte.** Setting `homeSections` (JSON na tabela `settings`) lido do payload de `GET /api/admin/dashboard` e salvo via `PUT /api/admin/settings`. A home pública consome via `GET /api/home-sections`.

---

### 14. Segurança (`seguranca`)

**Para que serve.** Configurar o segundo fator do login admin.

**Mostra.**

- Checkbox "Exigir 2FA no login admin" (`twoFactorEnabled`) — só liga com TOTP ou PIN cadastrado
- Campo TOTP secret (Base32), com botão "Gerar" que cria o segredo no navegador para cadastrar no app autenticador (Google Authenticator, 1Password, Authy); o segredo novo só é salvo junto com o código de 6 dígitos que o app gerar a partir dele (`totpVerificationCode`). Com o segredo preenchido, a aba mostra um **QR code** (`otpauth://`, gerado no navegador pela biblioteca `qrcode`, carregada sob demanda) para o app ler pela câmera
- Campo PIN de recuperação (numérico, 6+ dígitos, uso emergencial)
- Caixa **"Aceitar código por e-mail"** (`allowEmailCode`): no login, um código de 6 dígitos vai para o e-mail do admin (vale 10 min). Só liga com app autenticador ou PIN cadastrado como reserva — tela e servidor recusam o e-mail sozinho
- Com o 2FA em vigor, campo "Código atual (TOTP ou PIN)": qualquer mudança exige o fator vigente (`confirmationCode`; sem ele o backend responde 403)
- Card de boas práticas

**Comportamento seguro.**

- O `GET /api/admin/settings?key=adminConfig` **redige os segredos**: devolve apenas as flags `has2FA`/`hasPin`
- Campos deixados em branco no save preservam o segredo já guardado (merge "pegajoso" no backend); digitar um valor novo o substitui
- Após salvar, a aba re-busca a config para refletir as flags sem manter segredos no estado do cliente

**Fonte.** `GET/PUT /api/admin/settings?key=adminConfig` (PUT auditado com redação dos segredos).

> Eventos de segurança (login admin falho, assinatura de webhook inválida, tentativa de enumeração no verify-payment) são gravados na tabela `security_events` (RLS service-only) por `lib/security-logger.js`, com PII apenas como hash `sha256.slice(0,16)` — mas ainda **não há visualização deles no painel**; consulta hoje é por SQL ou pelo webhook de alerta (`SECURITY_ALERT_WEBHOOK_URL`).

---

## UI compartilhada (`src/components/admin/ui/`)

| Componente       | Uso                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| `StatCard.jsx`   | Card com número grande + label + ícone (usado no Faturamento)       |
| `BarList.jsx`    | Lista com gráfico de barras horizontais (ex: faturamento mensal)    |
| `StatusChip.jsx` | Badge colorido para status (`pending`, `approved`, `rejected`, etc) |
| `Card.jsx`       | Container genérico com título, subtítulo e slot de ação             |
| `Button.jsx`     | Botão estilizado (primary, secondary, ghost, danger)                |
| `EmptyState.jsx` | Mensagem quando não há dados ("Nenhum pedido encontrado")           |

---

## Padrões importantes

### Cache

Os relatórios do admin (Análise, Funil, KPIs, Segmentos) **não têm cache**: `CACHE_POLICIES.adminReport` = `private, no-store`, e cada abertura de aba recalcula (ADM-01 — com cache, o relatório continuava visível depois do logout). O cache em memória de processo foi removido por não funcionar em serverless.

### Export CSV

A aba Análise tem botões "CSV" nos três quadros (regra I4), usando `src/utils/csv-export.js`. As demais abas ainda não exportam.

### Loading e empty states

Todo componente que carrega dados deve mostrar:

- Indicador durante loading
- EmptyState se vazio
- Mensagem de erro humana (regra B6)

### 2FA

- Configuração única no setting `adminConfig` (vale para o login admin como um todo; a sessão registra o e-mail individual do admin para o audit log)
- Recomendado em produção (regra I2)
- Gerencia via aba **Segurança**

### Expiração de sessão

- Respostas 401 das APIs admin (`isSessionError`) derrubam `adminAuthenticated` e mostram toast "Sessão admin expirada"
- Em DEV com `VITE_ALLOW_ADMIN_BYPASS === 'true'` o painel abre sem login (banner amarelo avisa; as APIs continuam exigindo sessão — flag inerte em produção)

---

## Auditoria do admin

Toda escrita do painel (products, categories, coupons, orders, users, settings, upload de mídia e limpeza de eventos) é registrada na tabela `admin_audit_log` via `lib/admin-audit.js` (regra I1): `admin_id` = e-mail do admin logado, `action` (create/update/patch/delete), `target_type`/`target_id`, `before`/`after` com campos sensíveis redigidos (nos cinco CRUDs da factory só o `after`, que é o corpo enviado), e IP. A tabela é **append-only** (triggers bloqueiam UPDATE/DELETE) com retenção de 18 meses. Leituras (qual admin acessou qual aba quando) não são logadas.
