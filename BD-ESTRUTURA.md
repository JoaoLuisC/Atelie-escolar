# Estrutura do Banco de Dados — Firestore

> Projeto: Ateliê da Escola  
> Banco: Firebase Firestore (NoSQL)  
> Última atualização: Março 2026

---

## Visão Geral das Coleções

| Coleção | Finalidade |
|---|---|
| `products` | Catálogo de produtos digitais da loja |
| `orders` | Pedidos e status de pagamento |
| `categories` | Categorias de produtos |
| `downloadTokens` | Tokens seguros para autorizar downloads |
| `downloadLogs` | Log de auditoria de cada download realizado |
| `userProducts` | Produtos adquiridos por cada usuário (por e-mail) |
| `users` | Perfis de usuários autenticados (por UID) |
| `customers` | Legado — clientes (substituído por `userProducts`) |
| `settings` | Configurações do sistema e do painel admin |
| `pageViews` | Rastreamento de visitas para analytics |

---

## 1. `products`

**Para que serve:** Catálogo de produtos digitais disponíveis na loja.

**ID do documento:** auto-gerado pelo Firestore

**Lido por:** loja (`products.js`), checkout (`checkout.js`), painel admin  
**Escrito por:** scripts (`add-product.js`, `setup-database.js`), painel admin

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | String | Nome/título do produto |
| `description` | String | Descrição exibida na loja |
| `price` | Number | Preço em R$ |
| `image` | String | URL da imagem principal (Google Drive) |
| `images` | Array\<String\> | Galeria de imagens adicionais |
| `imageUrl` | String | Campo alternativo de imagem (legado) |
| `downloadUrl` | String | Link do arquivo no Google Drive para download |
| `fileUrl` | String | Campo alternativo do arquivo (legado) |
| `category` | String | Nome da categoria (ref. coleção `categories`) |
| `tags` | Array\<String\> | Tags para busca e filtragem |
| `active` | Boolean | `true` = visível na loja; `false` = oculto |
| `featured` | Boolean | Produto em destaque na vitrine |
| `badgeLabel` | String | Texto do badge (ex: "BEST SELLER") |
| `badgeClass` | String | Classe CSS do badge |
| `color` | String | Cor associada à categoria |
| `videos` | Array\<String\> | Vídeos demonstrativos do produto |
| `createdAt` | Timestamp/String | Data de criação |

---

## 2. `orders`

**Para que serve:** Registra cada pedido feito na loja, com itens comprados, dados do comprador, status do pagamento e tokens de download.

**ID do documento:** auto-gerado (`orderId`)

**Lido por:** `verify-payment.js`, `webhook.js`, painel admin, página de downloads  
**Escrito por:** `create-payment.js` (cria), `verify-payment.js` / `webhook.js` (atualiza)

| Campo | Tipo | Descrição |
|---|---|---|
| `orderId` | String | ID interno do pedido |
| `items` | Array\<Object\> | Lista de produtos comprados |
| `items[].id` | String | ID do produto |
| `items[].title` | String | Nome do produto no momento da compra |
| `items[].description` | String | Descrição no momento da compra |
| `items[].price` | Number | Preço unitário |
| `items[].quantity` | Number | Quantidade |
| `items[].fileUrl` | String | URL do arquivo para download |
| `customer` | Object | Dados do comprador |
| `customer.email` | String | E-mail do comprador |
| `customer.name` | String | Nome do comprador |
| `customer.cpf` | String | CPF (se informado) |
| `customer.phone` | String | Telefone (se informado) |
| `totalAmount` | Number | Valor total do pedido em R$ |
| `status` | String | Status interno: `pending` / `completed` / `failed` |
| `paymentStatus` | String | Status do pagamento: `pending` / `approved` / `rejected` / `cancelled` |
| `createdAt` | String/Timestamp | Data de criação do pedido |
| `updatedAt` | String/Timestamp | Data da última atualização |
| `completedAt` | String/Timestamp | Data em que o pagamento foi aprovado |
| `preferenceId` | String | ID da preferência gerada no Mercado Pago |
| `paymentId` | String | ID do pagamento no Mercado Pago |
| `mercadoPagoData` | Object | Dados completos da integração com o MP |
| `mercadoPagoData.preferenceId` | String | ID da preferência MP |
| `mercadoPagoData.initPoint` | String | URL do checkout MP (produção) |
| `mercadoPagoData.sandboxInitPoint` | String | URL do checkout MP (sandbox/teste) |
| `mercadoPagoData.paymentInfo` | Object | Informações do pagamento retornadas pelo MP |
| `mercadoPagoData.paymentInfo.id` | String | ID do pagamento |
| `mercadoPagoData.paymentInfo.status` | String | Status do pagamento no MP |
| `mercadoPagoData.paymentInfo.statusDetail` | String | Detalhe do status (ex: "accredited") |
| `mercadoPagoData.paymentInfo.paymentMethod` | String | Método de pagamento (PIX, crédito, etc.) |
| `mercadoPagoData.paymentInfo.transactionAmount` | Number | Valor da transação |
| `mercadoPagoData.paymentInfo.dateApproved` | String | Data de aprovação |
| `downloadTokens` | Array\<Object\> | Tokens de acesso gerados para cada produto |
| `downloadTokens[].productId` | String | ID do produto |
| `downloadTokens[].productName` | String | Nome do produto |
| `downloadTokens[].token` | String | Token único para autorizar o download |
| `buyerEmail` | String | **Legado** — substituído por `customer.email` |
| `amount` | Number | **Legado** — substituído por `totalAmount` |
| `productId` | String | **Legado** — substituído pelo array `items` |

---

## 3. `categories`

**Para que serve:** Gerenciar as categorias de produtos para organização e filtragem na loja.

**ID do documento:** auto-gerado ou slug da categoria

**Lido por:** `products.js` (filtragem), painel admin  
**Escrito por:** painel admin

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | String | Nome da categoria exibido na loja |
| `slug` | String | Identificador amigável para URL |
| `order` | Number | Ordem de exibição na UI |
| `featured` | Boolean | Exibida na barra de chips em destaque |
| `color` | String | Cor (variável CSS ou hex) |
| `badgeLabel` | String | Texto do badge (ex: "POPULAR") |
| `badgeClass` | String | Classe CSS do badge |
| `active` | Boolean | Visível na loja (`true`) ou oculta (`false`) |
| `description` | String | Descrição da categoria |
| `createdAt` | Timestamp | Data de criação |

---

## 4. `downloadTokens`

**Para que serve:** Armazena tokens únicos e seguros que autorizam o download de um produto. Cada token é vinculado a um pedido aprovado.

**ID do documento:** o próprio token (32 bytes hex)

**Lido por:** API `download.js` (valida o token antes de liberar o arquivo)  
**Escrito por:** `create-payment.js`, `verify-payment.js`, `webhook.js`

| Campo | Tipo | Descrição |
|---|---|---|
| `token` | String | Token único (= ID do documento) |
| `orderId` | String | Pedido associado |
| `productId` | String | Produto que o token libera |
| `permanent` | Boolean | `true` = token não expira |
| `createdAt` | Timestamp | Data de criação do token |
| `used` | Boolean | Se o token já foi utilizado |
| `usedAt` | Timestamp | Quando foi usado |
| `expiresIn` | String | Mensagem de expiração (ex: "24h"), se aplicável |

---

## 5. `downloadLogs`

**Para que serve:** Log de auditoria de todos os downloads realizados. Usado para métricas no painel admin (Saída & Desempenho).

**ID do documento:** auto-gerado

**Lido por:** painel admin (aba Saída & Desempenho)  
**Escrito por:** API `download.js` a cada download efetuado

| Campo | Tipo | Descrição |
|---|---|---|
| `orderId` | String | Pedido que originou o download |
| `productId` | String | Produto baixado |
| `productName` | String | Nome do produto no momento do download |
| `token` | String | Token usado para o download |
| `downloadedAt` | Timestamp | Data e hora do download |
| `ip` | String | IP do cliente |

---

## 6. `userProducts`

**Para que serve:** Registra os produtos já adquiridos por cada usuário. Permite bloquear a recompra de um produto já comprado e montar a lista da página "Meus Downloads".

**ID do documento:** e-mail do usuário (ex: `joao@email.com`)

**Lido por:** `downloads.js` (página de downloads do usuário)  
**Escrito por:** `verify-payment.js`, `webhook.js` (quando pagamento é aprovado)

| Campo | Tipo | Descrição |
|---|---|---|
| `email` | String | E-mail do usuário (= ID do documento) |
| `productIds` | Array\<String\> | IDs de todos os produtos comprados |
| `purchases` | Array\<Object\> | Histórico detalhado de compras |
| `purchases[].productId` | String | ID do produto |
| `purchases[].productName` | String | Nome do produto |
| `purchases[].purchasedAt` | Timestamp | Data da compra |
| `purchases[].orderId` | String | ID do pedido associado |
| `updatedAt` | Timestamp | Data da última atualização |

---

## 7. `users`

**Para que serve:** Perfis de usuários autenticados via Firebase Auth. Usado para cruzar dados de compras no painel admin (aba Usuários).

**ID do documento:** UID do Firebase Auth

**Lido por:** painel admin (aba Usuários)  
**Escrito por:** frontend (auth.js) na criação/atualização do perfil

| Campo | Tipo | Descrição |
|---|---|---|
| `uid` | String | UID do Firebase (= ID do documento) |
| `email` | String | E-mail do usuário |
| `displayName` | String | Nome de exibição |
| `photoURL` | String | URL da foto de perfil |
| `role` | String | Papel do usuário: `admin` ou `customer` |
| `createdAt` | Timestamp | Data de criação do perfil |

---

## 8. `customers` _(legado)_

**Para que serve:** Coleção legada de rastreamento de clientes. Foi substituída pela coleção `userProducts`. Mantida para compatibilidade retroativa.

**ID do documento:** e-mail do cliente

| Campo | Tipo | Descrição |
|---|---|---|
| `email` | String | E-mail (= ID do documento) |
| `orders` | Array\<String\> | IDs dos pedidos do cliente |
| `totalPurchases` | Number | Total gasto em R$ |
| `createdAt` | Timestamp | Data de cadastro |
| `lastPurchaseAt` | Timestamp | Data da última compra |

---

## 9. `settings`

**Para que serve:** Configurações do sistema e do painel admin. Possui subdocumentos com finalidades distintas.

**Lido por:** frontend público (`homeSections`) e painel admin  
**Escrito por:** painel admin

### `settings/adminConfig`
Configurações internas do painel administrativo (conteúdo varia conforme uso).

### `settings/homeSections`
Controle do conteúdo exibido na página inicial (banners, seções em destaque, produtos em evidência).

---

## 10. `pageViews`

**Para que serve:** Rastreamento de visitas nas páginas da loja para analytics no painel admin.

**ID do documento:** auto-gerado

**Lido por:** painel admin (dashboard — card de visitas)  
**Escrito por:** servidor / funções serverless a cada requisição de página

| Campo | Tipo | Descrição |
|---|---|---|
| `path` | String | Caminho da URL visitada (ex: `/products.html`) |
| `timestamp` | Timestamp | Data e hora da visita |
| `ip` | String | IP do visitante |
| `userAgent` | String | Informações do navegador |
| `referrer` | String | Origem da visita |

---

## Fluxo de Dados Principal

```
COMPRA:
  1. Usuário adiciona produtos ao carrinho (cart.js)
  2. Preenche checkout → POST /api/create-payment
       └── Valida produtos em `products`
       └── Cria documento em `orders` (status: pending)
       └── Cria preferência no Mercado Pago
       └── Retorna orderId + URL de pagamento
  3. Usuário paga no modal do Mercado Pago
  4. MP dispara webhook → /api/webhook
       └── Atualiza `orders` (paymentStatus: approved)
       └── Gera tokens em `downloadTokens`
       └── Atualiza `userProducts` com os produtos comprados
  5. Usuário clica em download → GET /api/download?token=xxx
       └── Valida token em `downloadTokens`
       └── Registra em `downloadLogs`
       └── Redireciona para o arquivo no Google Drive

ADMIN:
  1. Login com PIN → painel admin.js carrega
  2. Lê: products, categories, orders, users, downloadLogs, pageViews
  3. Pode criar/editar/excluir produtos e categorias
  4. Visualiza pedidos, usuários, faturamento e comparativos
```
