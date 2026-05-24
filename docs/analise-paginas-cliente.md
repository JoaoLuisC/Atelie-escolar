# Análise das páginas do cliente

> Histórico: este documento descreve o estado original das páginas do cliente antes do refactor descrito em [plano-melhorias-fluxo-cliente.md](./plano-melhorias-fluxo-cliente.md). Os trechos sobre "alta concentração de lógica em `ProductsPage`" e ausência de stepper de status já foram resolvidos — a maioria está documentada como "concluído" no plano de melhorias. Mantido como referência para auditoria.

Escopo desta análise: apenas as páginas do fluxo do cliente. A área administrativa foi ignorada propositalmente.

## 1. Design e Estrutura

O projeto é uma SPA em React com roteamento explícito em `App.jsx` e composição de layout via `Shell`. A arquitetura visual segue um padrão de "site vitrine + funil de conversão": a home apresenta valor e prova social, a página de produtos organiza descoberta e filtro, a página de detalhes aprofunda a decisão, o checkout converte em compra e a página de downloads fecha o ciclo pós-pagamento.

Na prática, a hierarquia funciona assim:

- `main.jsx` monta a aplicação inteira com `BrowserRouter` e três providers globais.
- `App.jsx` define as rotas de navegação.
- `Shell.jsx` fornece a moldura visual comum para quase todas as páginas do cliente: navbar, conteúdo central e footer.
- Cada página (`HomePage`, `ProductsPage`, `ProductDetailsPage`, `CheckoutPage`, `CustomerAuthPage`, `DownloadsPage`, `NotFoundPage`) cuida do conteúdo específico da sua etapa.

Não há um design pattern clássico como MVC puro. O que existe é uma combinação de:

- Composition pattern, com a UI montada por componentes pequenos e reaproveitáveis.
- Provider pattern, para expor estado global de autenticação, carrinho e toasts.
- Route-driven architecture, em que cada etapa do funil é representada por uma rota.
- Separação parcial entre UI e integração, porque as páginas chamam serviços em `src/services` para buscar dados e executar autenticação.

Visualmente, o site aposta em hero sections fortes, elementos animados, cards, trilhas horizontais de vitrine e blocos de prova social. O layout não é minimalista; ele é orientado a marketing e conversão.

## 2. Funcionalidade Principal

A regra de negócio principal é vender produtos digitais educacionais e liberar o acesso após a confirmação do pagamento.

O fluxo de negócio real é este:

1. O usuário descobre produtos na home ou no catálogo.
2. Ele pode ver detalhes, adicionar itens ao carrinho e ir para o checkout.
3. No checkout, informa nome e e-mail, gera um pagamento e é redirecionado para a plataforma externa.
4. A aplicação consulta o status do pedido até o pagamento ser aprovado.
5. Quando aprovado, o carrinho é limpo e os links de download ficam disponíveis.
6. A página de downloads também permite consultar histórico por e-mail e abrir pedidos anteriores.

Em outras palavras, a aplicação resolve um e-commerce de download instantâneo com autenticação de cliente opcional e confirmação assíncrona de pagamento.

## 3. Gerenciamento de Estado e Dados

O estado é dividido em três camadas.

### Estado local de página

Cada página usa `useState`, `useEffect`, `useMemo` e, em alguns casos, `useRef` para controlar comportamento imediato da tela. Exemplos:

- `HomePage` controla status de carregamento da vitrine e a animação dos depoimentos.
- `ProductsPage` controla filtros, ordenação, sidebar e loading/error da lista.
- `CheckoutPage` controla nome, e-mail, status da submissão e polling de pagamento.
- `CustomerAuthPage` controla modo login/cadastro e status do formulário.
- `DownloadsPage` controla o pedido atual, histórico por e-mail, polling e mensagens de status.

### Estado global por Context

Existem três providers centrais:

- `AuthProvider` guarda a sessão do cliente e o estado da autenticação administrativa.
- `CartProvider` mantém o carrinho e o total.
- `ToastProvider` gerencia mensagens temporárias de feedback.

Os hooks `useAuth`, `useCart` e `useToast` apenas expõem esses contexts com uma validação simples de uso correto.

### Origem e destino dos dados

Os dados vêm de três lugares principais:

- `src/services/products.js` busca produtos, vitrine da home e detalhe por ID.
- `src/services/customer-auth.js` conversa diretamente com o Supabase Auth para login, cadastro, Google OAuth e logout.
- Chamadas diretas para a API local/servidor via `getApiBaseUrl()` em checkout e downloads, principalmente para criar pagamento, verificar pagamento, consultar pedidos e baixar arquivos.

Persistência local:

- `CartProvider` lê e grava o carrinho em `localStorage` com a chave `cart`.
- `AuthProvider` também usa `localStorage` para guardar sessão do cliente (`customer_email`, `customer_name`, `customer_uid`, `customer_id_token`, `customer_refresh_token`) e o último pedido (`lastOrderId`).

O fluxo de dados é predominantemente unidirecional: serviço -> estado local/contexto -> UI. Quando o usuário interage, a UI atualiza o contexto, e o contexto propaga o novo valor para as páginas dependentes.

## 4. Workflow do Usuário

### Entrada na aplicação

Quando a aplicação abre, `main.jsx` envolve tudo com `BrowserRouter`, `AuthProvider`, `CartProvider` e `ToastProvider`. O `AuthProvider` faz bootstrap da sessão administrativa e tenta restaurar a sessão do cliente do `localStorage` e de callbacks OAuth.

### Home

Na home, `HomePage` carrega as seções da vitrine com `fetchHomeSections()`. Em paralelo, ele libera a animação dos depoimentos e renderiza o hero, o catálogo em destaque, a explicação "como funciona" e a prova social.

O objetivo da tela é guiar o usuário para o catálogo. Os botões e links principais levam para `Produtos`.

### Catálogo

Em `ProductsPage`, os produtos são buscados com `fetchProducts()`. Depois disso, a página monta categorias, filtros por faixa de preço, ordenação e presets vindos da URL.

O usuário pode:

- filtrar por categoria;
- filtrar por faixa de preço;
- mudar a ordenação;
- abrir detalhes do produto;
- adicionar o produto ao carrinho.

Ao adicionar ao carrinho, `CartProvider.addToCart()` bloqueia duplicidade por ID e devolve uma mensagem que é exibida via toast.

### Detalhes do produto

`ProductDetailsPage` lê o `id` pela rota, busca o produto por esse ID e exibe imagem, descrição, preço e tipo. A ação principal é "Comprar agora": ela coloca o item no carrinho, mostra um toast e redireciona direto para `/checkout`.

### Checkout

`CheckoutPage` começa carregando os dados do carrinho e pré-preenchendo nome/e-mail a partir da sessão do cliente, se existir.

No submit:

1. Valida se há itens no carrinho.
2. Valida nome e e-mail.
3. Monta o payload com itens e dados do cliente.
4. Faz `POST /create-payment`.
5. Abre a URL de pagamento em nova aba.
6. Inicia polling em `verify-payment` a cada 4 segundos.
7. Se o pagamento for aprovado, limpa o carrinho, salva o pedido e navega para `/downloads`.
8. Se rejeitado ou cancelado, mostra feedback e para o polling.

Esse é o ponto mais crítico do funil, porque aqui a aplicação faz a ponte entre a compra interna e a confirmação externa de pagamento.

### Acesso do cliente

`CustomerAuthPage` oferece login e cadastro em uma mesma tela, com alternância de modo. Ela também suporta login com Google via Supabase.

O fluxo é:

- validar campos;
- chamar a função apropriada do provider;
- persistir a sessão;
- redirecionar para o destino informado na query `redirect`, ou para `/checkout` por padrão.

Se o usuário já estiver autenticado, a tela não força novo login; ela mostra a sessão ativa e oferece atalho para o checkout.

### Downloads e pós-compra

`DownloadsPage` consulta o pedido atual usando `order` na URL ou o `lastOrderId` salvo localmente.

Depois:

- verifica o status do pagamento;
- mostra mensagens de aprovação, pendência ou erro;
- faz polling automático quando o pedido está pendente;
- permite buscar histórico por e-mail;
- exibe botões de download apenas quando o pedido está aprovado.

Essa página encerra o ciclo do usuário: ela transforma pagamento aprovado em acesso efetivo ao arquivo.

## 5. Trechos que mereciam refatoração — situação atual

O diagnóstico original apontava `ProductsPage` como o trecho mais carregado, concentrando carregamento, parsing de query string, filtros, ordenação, estado da sidebar e renderização de cards. **Esse refactor foi feito**: hoje toda essa lógica vive em [src/hooks/useProductFilters.js](../src/hooks/useProductFilters.js), e [ProductsPage.jsx](../src/pages/ProductsPage.jsx) ficou enxuto, basicamente compondo `ProductSidebar`, `ProductGrid` e `SortDropdown` ao redor do hook.

`CheckoutPage` e `DownloadsPage` continuam carregando polling, integração com API e mensagens de status, mas ganharam um componente compartilhado de feedback ([StatusStepper.jsx](../src/components/StatusStepper.jsx)) usado em ambos para indicar "Pedido criado → Pagamento em análise → Downloads liberados". O polling em `DownloadsPage` foi extraído para um hook interno (`usePendingOrderPolling`).

Itens em aberto sugeridos pelo plano de melhorias que ainda não foram feitos:

- Drawer lateral de carrinho a partir do `Shell` (hoje a ação leva para `/checkout` direto).
- Captura de e-mail no início do checkout para habilitar fluxo de carrinho abandonado.
- Cupons de desconto.

Em resumo, a base já está bem mais enxuta do que no diagnóstico original; restam principalmente as iniciativas de conversão/UX listadas no plano de melhorias.