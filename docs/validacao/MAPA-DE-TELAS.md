# Mapa de telas — Ateliê Escolar

- **Data:** 2026-09-28
- **Versão mapeada:** commit `05b0066` (03/09/2026, igual ao `origin/main`) + alterações **não commitadas** do working tree que fazem de `/admin` a única entrada do painel. Sem sessão, o formulário de login admin aparece na própria `/admin`. `/painel-acesso-privado-atelie` e `/admin-login` deixaram de existir, e o seletor "Entrar como: Cliente | Professor" saiu do `/login`.
- **Como foi gerado:** lendo o código (`src/`, `handlers/`, `lib/`, `routes/`, `validation/`, `vercel.json`, `supabase/`), sem executar a aplicação. O deploy público foi sondado só com GET, em 2026-09-28.

---

## 0. Como usar este mapa

**Identificadores**

| Prefixo      | Significado                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `L01`–`L17`  | Telas da loja pública e da casca global                                                                                        |
| `C01`–`C13`  | Conta do cliente, compra e pós-compra, incluindo o que acontece fora do site (Mercado Pago, e-mails, API de download, webhook) |
| `A01`–`A28`  | Login e painel administrativo (`/admin`)                                                                                       |
| `B01`–`B244` | Suspeitas de bug, listadas na seção 6 e ordenadas por severidade. Cada tela aponta para os IDs que lhe dizem respeito.         |
| `F01`–`F65`  | Fluxos ponta a ponta (seção 5)                                                                                                 |

**Convenções**

- `{API}` é `http://localhost:3000/api` em dev (só quando o hostname é exatamente `localhost`) e `/api` no deploy (`src/utils/api.js:1-3`).
- Texto entre aspas é o texto **exato** do código. Vários rótulos usam `text-transform: uppercase` no CSS: `innerText` devolve MAIÚSCULAS e `textContent` devolve o texto citado aqui.
- **Destrutivo = sim** significa que a ação grava, altera, apaga ou envia algo real.
- Toasts somem em 2,4 s. Capture-os com o observador descrito no fluxo F03.

**Antes de validar qualquer coisa**

1. **O banco é o de produção** (B05). O Supabase do `.env.local` é o mesmo do site público, então toda escrita local aparece na loja real. Use o prefixo `[TESTE]` e limpe tudo ao final (F05).
2. **O deploy público está numa versão antiga** (anterior a `244226c`, de 01/09): lá `/admin` redireciona para `/painel-acesso-privado-atelie`. A fonte da verdade deste mapa é o código local. Identifique a versão antes de validar (F02).
3. **Instale o stub de `window.confirm`** antes de clicar em qualquer lixeira ou em "Excluir minha conta" (F03). Sem ele, a caixa nativa trava a extensão.
4. **Não pague nada.** As credenciais do Mercado Pago têm o prefixo `APP_USR-` (B17). Pare na página do Mercado Pago.
5. **Não salve a aba Segurança** do admin: há vários caminhos que trancam o admin fora do painel (B03, B04, B23, B24).
6. **Uma lista do painel que "não atualizou"** pode estar vindo do cache do navegador (B20). A extensão Claude in Chrome não tem DevTools (coluna _Size_, "Disable cache"), então use os helpers dos prompts (`PROMPT-VALIDACAO-CLAUDE-CHROME.md`, ferramentas (c) e (d)): `window.__resumo()` lê `GET {API}/admin/dashboard` com `cache: 'no-store'` (a verdade do servidor); um GET com `ms` < ~10 no `window.__netLog` veio do cache; e `window.__semCache = /admin\/dashboard/` faz o painel ler sem cache, no papel do "Disable cache". Onde este mapa disser "Disable cache", use `__semCache`/`__resumo()`.

---

## 1. Resumo da versão

| Item                               | Situação no código mapeado                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Entrada do painel                  | `/admin` e só ela. Sem sessão ADMIN/MASTER, `ProtectedRoute` renderiza `AdminLoginPage` na própria URL.                |
| Rotas antigas do login admin       | `/painel-acesso-privado-atelie` e `/admin-login` levam à 404. `/admin/usuarios` redireciona para `/admin` com replace. |
| `/login`                           | Só de cliente. Tem as abas "Entrar" e "Cadastrar"; não há seletor de perfil nem link para o painel.                    |
| "Encerrar sessão" (painel)         | Não navega mais para outra URL: o formulário aparece na própria `/admin`.                                              |
| Bypass de DEV                      | `VITE_ALLOW_ADMIN_BYPASS=true` (ausente no `.env.local`). Com ele ligado, `/admin?login` força o formulário.           |
| Deploy `atelie-escolar.vercel.app` | Versão entre `660fe74` e `244226c`. Ver §7.2.                                                                          |

---

## 2. Tabela-resumo de rotas

### 2.1 Rotas do SPA (`src/App.jsx:52-81`)

| Rota                                                                                                          | Tela                                                                                                             | Acesso            | Arquivo                                                                                          |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| `/`                                                                                                           | Home, vitrine (L09)                                                                                              | público           | `src/pages/HomePage.jsx`                                                                         |
| `/produtos` (aceita `?categoria=<nome>`, `?preset=mais-vendidos` e `?preset=novidades`)                       | Catálogo (L10) + filtros mobile (L11)                                                                            | público           | `src/pages/ProductsPage.jsx`                                                                     |
| `/produtos/:slug` (um valor só com dígitos é tratado como id legado)                                          | Página de produto (L12)                                                                                          | público           | `src/pages/ProductDetailsPage.jsx`                                                               |
| `/checkout`                                                                                                   | Checkout (C07)                                                                                                   | misto             | `src/pages/CheckoutPage.jsx`                                                                     |
| `/checkout?status=failure` e `?status=pending`                                                                | Retorno do Mercado Pago (C08). Hoje é igual ao checkout comum.                                                   | misto             | `src/pages/CheckoutPage.jsx`                                                                     |
| `/login` (`?mode=login\|register\|forgot`, `?redirect=`, `?oauth=google`)                                     | Acesso do cliente: Entrar (C01), Cadastrar (C02), Esqueci a senha (C03). Com sessão, vira a área da conta (C04). | público / cliente | `src/pages/CustomerAuthPage.jsx`                                                                 |
| `/conta`                                                                                                      | A mesma página: C04 com sessão, C01 sem sessão                                                                   | cliente / público | `src/pages/CustomerAuthPage.jsx`                                                                 |
| `/conta?delete_token=<token>` (também `/login?delete_token=`)                                                 | Confirmar exclusão da conta (C05)                                                                                | misto             | `src/pages/CustomerAuthPage.jsx`                                                                 |
| `/reset-password` (`?redirect=`, `?code=` ou `#access_token=`)                                                | Redefinir senha (C06)                                                                                            | público           | `src/pages/ResetPasswordPage.jsx`                                                                |
| `/downloads` (`?order=`, `&email=`, `&success=1`)                                                             | Meus Downloads (C10)                                                                                             | misto             | `src/pages/DownloadsPage.jsx`                                                                    |
| `/privacidade` (bloco `#cookies`)                                                                             | Política de Privacidade + preferências de cookies (L13)                                                          | público           | `src/pages/LegalPages.jsx`, `src/components/ConsentPreferences.jsx`                              |
| `/termos`                                                                                                     | Termos de Uso (L14)                                                                                              | público           | `src/pages/LegalPages.jsx`                                                                       |
| `/confirmar-inscricao?token=`                                                                                 | Confirmar inscrição na newsletter (L15)                                                                          | público           | `src/pages/SubscriptionPages.jsx`                                                                |
| `/desinscrever` (`?email=` ou `?token=`)                                                                      | Cancelar inscrição (L16)                                                                                         | público           | `src/pages/SubscriptionPages.jsx`                                                                |
| `/admin` sem sessão admin                                                                                     | Login administrativo (A01)                                                                                       | público           | `src/components/ProtectedRoute.jsx`, `src/pages/AdminLoginPage.jsx`                              |
| `/admin` com sessão ADMIN/MASTER                                                                              | Painel (A03–A28; as abas não têm URL)                                                                            | admin             | `src/pages/AdminPage.jsx`, `src/components/admin/AdminLayout.jsx`, `src/components/admin/tabs/*` |
| `/admin?login`                                                                                                | Força o formulário, mas só com o bypass de DEV e sem sessão (A04)                                                | misto             | `src/components/ProtectedRoute.jsx`                                                              |
| `/admin/usuarios`                                                                                             | Redireciona com replace para `/admin` (abre na aba Dashboard, não em Usuários)                                   | —                 | `src/App.jsx:76`                                                                                 |
| `*`: qualquer outra, inclusive `/admin/<outra>`, `/painel-acesso-privado-atelie`, `/admin-login` e `/avaliar` | Página não encontrada (L17)                                                                                      | público           | `src/pages/NotFoundPage.jsx`                                                                     |

### 2.2 Abas internas do painel (`/admin`, sem URL própria; F5 volta ao Dashboard)

| Item da sidebar (ordem)      | h1 do cabeçalho                | Tela                   | Chamada ao entrar                                                      | Arquivo                                        |
| ---------------------------- | ------------------------------ | ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| Dashboard                    | "Dashboard"                    | A05 (+ modal A06)      | `GET {API}/admin/dashboard`, `GET {API}/admin/kpis?window=12`          | `tabs/DashboardTab.jsx`                        |
| Produtos › Lista de produtos | "Produtos"                     | A07 (+ wizard A08–A12) | `GET {API}/admin/dashboard`                                            | `tabs/ProductsTab.jsx`, `ProductWizard.jsx`    |
| Produtos › Desempenho        | "Desempenho dos produtos"      | A13                    | `GET {API}/admin/dashboard`                                            | `tabs/PerformanceTab.jsx`                      |
| Produtos › Categorias        | "Categorias"                   | A14 (+ modal A15)      | `GET {API}/admin/dashboard`                                            | `tabs/CategoriesTab.jsx`, `CategoryWizard.jsx` |
| Pedidos                      | "Pedidos"                      | A16 (+ modal A06)      | `GET {API}/admin/orders[?status=]`                                     | `tabs/OrdersTab.jsx`                           |
| Cupons                       | "Cupons"                       | A17 (+ modal A18)      | `GET {API}/admin/coupons`                                              | `tabs/CouponsTab.jsx`, `CouponWizard.jsx`      |
| Financeiro › Faturamento     | "Faturamento"                  | A19                    | `GET {API}/admin/dashboard`                                            | `tabs/FinanceTab.jsx`                          |
| Financeiro › Comparativo     | "Comparativo mensal"           | A20                    | `GET {API}/admin/dashboard`                                            | `tabs/ComparisonTab.jsx`                       |
| Funil                        | "Funil de conversão"           | A21                    | `GET {API}/admin/funnel?days=30`                                       | `tabs/FunnelTab.jsx`                           |
| Análise                      | "Análise (Curva ABC + Coorte)" | A22 (+ modal A23)      | `GET {API}/admin/dashboard`, `abc-products`, `abc-customers`, `cohort` | `tabs/AnalysisTab.jsx`                         |
| Segmentos                    | "Segmentos de email"           | A24                    | `GET {API}/admin/segments`                                             | `tabs/SegmentsTab.jsx`                         |
| Usuários                     | "Usuários"                     | A25 (+ modal A26)      | `GET {API}/admin/users`                                                | `tabs/UsersTab.jsx`                            |
| Vitrine                      | "Vitrine"                      | A27                    | `GET {API}/admin/dashboard`                                            | `tabs/VitrineTab.jsx`                          |
| Segurança                    | "Segurança"                    | A28                    | `GET {API}/admin/settings?key=adminConfig`                             | `tabs/SecurityTab.jsx`                         |

### 2.3 Fora do SPA (o agente passa por estes pontos)

| Endereço                                                        | Tela                                         | Acesso             | Arquivo                                                   |
| --------------------------------------------------------------- | -------------------------------------------- | ------------------ | --------------------------------------------------------- |
| `{API}/download?token=<64 hex>` (aba nova)                      | Entrega do arquivo (C11)                     | público            | `handlers/download.js`                                    |
| `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=…` | Checkout Pro, onde a validação para (C09)    | público            | `lib/mercadopago-config.js`                               |
| `POST {API}/webhook`                                            | Webhook do Mercado Pago, sem interface (C13) | público (assinado) | `handlers/webhook.js`                                     |
| Caixa de entrada do comprador                                   | E-mails transacionais (C12)                  | —                  | `lib/email-templates.js`, `handlers/me-delete-account.js` |
| `/robots.txt`, `/sitemap.xml` (`{API}/sitemap.xml` em dev)      | SEO técnico (§7.6)                           | público            | `public/robots.txt`, `handlers/sitemap.xml.js`            |
| `http://localhost:3000/health`                                  | Saúde da API (só local)                      | —                  | `server.js:110-112`                                       |

---

## 3. Loja (visitante e cliente)

### 3.1 Casca global

#### L01 — Cabeçalho global da loja (com os controles de sessão do cliente)

- **Rotas:** todas as que usam `<Shell>`: `/`, `/produtos`, `/produtos/:slug`, `/checkout`, `/downloads`, `/privacidade`, `/termos`, `/confirmar-inscricao`, `/desinscrever` e a 404. **Não** aparece em `/login`, `/conta`, `/reset-password` nem em `/admin`.
- **Acesso:** misto.
- **Como chegar:** abrir `http://localhost:5173/` (dev) ou `https://atelie-escolar.vercel.app/`. O header é sticky (`nav.sticky.top-0.z-30`).
- **O que aparece:** uma barra branca translúcida. À esquerda, um quadrado roxo com a coruja em SVG e o texto "Profa. Marciar Cardoso" (em caixa alta pelo CSS; oculto abaixo de 640 px). No centro, só a partir de 1024 px: "Início", "Como Funciona", "Contato", "Produtos" e, dependendo da sessão, "Meus produtos" (ícone bi-bag-heart) ou "Painel admin" (âmbar, ícone bi-shield-lock). À direita: o botão de carrinho 44×44 (bi-cart3), com um badge roxo quando há itens (o botão some para os papéis admin/master); o link "Entrar"/"Conta" (≥1024 px); o botão rosa "Sair" (logado, ≥1024 px); e o hambúrguer 44×44 (abaixo de 1024 px). Não há campo de busca. Cada página monta o próprio `<Shell>`, então trocar de rota fecha o menu mobile e o drawer.

| Elemento                                                                      | Onde                                                               | O que acontece                                                                                                                                                                                                                       | API                                                                            | Destrutivo? |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------- |
| Logo (coruja) + "Profa. Marciar Cardoso"                                      | esquerda                                                           | Vai para `/` sem recarregar. Abaixo de 640 px, só a coruja aparece.                                                                                                                                                                  | `GET {API}/home-sections` no destino                                           | não         |
| "Início" (NavLink end)                                                        | centro, ≥1024 px                                                   | Vai para `/`. Fica ativo (`bg-brand-50 text-brand-700`) só em `/` exato.                                                                                                                                                             | idem                                                                           | não         |
| "Como Funciona" (`<a href="/#como-funciona">`)                                | centro                                                             | Em `/`, rola até `section#como-funciona` e a URL vira `/#como-funciona`. Em outra rota, **recarrega o documento inteiro** (a âncora pode falhar porque a Home é lazy). Nunca fica ativo.                                             | recarga fora da home                                                           | não         |
| "Contato" (`<a href="/#contato">`)                                            | centro                                                             | Em `/`, rola até `footer#contato`. Fora dela, recarrega o documento.                                                                                                                                                                 | —                                                                              | não         |
| "Produtos" (NavLink)                                                          | centro                                                             | Vai para `/produtos`. Também fica ativo em `/produtos/:slug`. Clicado a partir de `/produtos?categoria=X`, limpa a URL mas **mantém o filtro** (B44).                                                                                | `GET {API}/products`                                                           | não         |
| "Meus produtos"                                                               | centro; só cliente logado SEM papel admin/master                   | Vai para `/downloads`.                                                                                                                                                                                                               | as da C10                                                                      | não         |
| "Painel admin" (âmbar)                                                        | centro; só se a **sessão de cliente** tiver papel `admin`/`master` | Vai para `/admin`. Sem o cookie `admin_session`, mostra só o formulário "Painel administrativo" / "Acesso restrito", sem a casca da loja. Com sessão admin, mostra o painel. Ativo: `bg-amber-100 text-amber-800`.                   | nenhuma na navegação; `POST {API}/admin/login` só ao enviar o formulário       | não         |
| Carrinho (aria-label "Abrir carrinho" ou "Abrir carrinho com N item"/"itens") | direita, todas as larguras; oculto para admin/master               | Abre o drawer (L03): `aria-expanded="true"`, body com overflow hidden, foco no X "Fechar". O badge mostra `cart.length`. Adicionar um produto NÃO abre o drawer.                                                                     | —                                                                              | não         |
| "Entrar" / "Conta" (bi-person-circle)                                         | direita, ≥1024 px                                                  | Vai para `/login`. Mostra "Conta" com sessão de cliente. Fica ativo só em `/login` (em `/conta`, não).                                                                                                                               | —                                                                              | não         |
| "Sair" (rosa)                                                                 | direita, ≥1024 px, logado                                          | Mostra na hora o toast azul "Sessão encerrada."; o logout roda **sem await**. Com resposta HTTP, o header volta a "Entrar". A URL não muda. Se a rede falhar, o estado não é limpo e aparece uma promise rejeitada no console (B26). | `POST {supabase}/auth/v1/logout` (signOut) + `POST {API}/auth/customer/logout` | não         |
| Hambúrguer ("Abrir menu"/"Fechar menu")                                       | direita, abaixo de 1024 px                                         | Alterna o menu mobile (L02). O ícone troca de bi-list para bi-x-lg e `aria-expanded` alterna.                                                                                                                                        | —                                                                              | não         |

| Estado                         | Como provocar                          | O que se vê                                                                                                                                        |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitante                      | Janela anônima ou depois de "Sair"     | Início, Como Funciona, Contato, Produtos, o carrinho e "Entrar". Sem "Sair", "Meus produtos" nem "Painel admin".                                   |
| Boot da sessão                 | F5 logado como cliente                 | "Entrar" por alguns ms e depois "Conta" + "Sair" (o Shell não espera `authReady`). Em paralelo roda `GET {API}/admin/session`.                     |
| Cliente comum                  | Login em `/login` com papel `customer` | "Meus produtos", o carrinho, "Conta" e "Sair".                                                                                                     |
| Cliente com papel admin/master | Login em `/login` com um perfil admin  | "Painel admin" em âmbar. Somem o carrinho e "Meus produtos".                                                                                       |
| Admin logado só por `/admin`   | Entrar em `/admin` e depois abrir `/`  | Header de **visitante**: o Shell só olha a sessão de cliente (B25).                                                                                |
| Carrinho com itens             | "Adicionar" em um card                 | Badge com a contagem; aria-label "Abrir carrinho com 1 item".                                                                                      |
| Responsivo                     | 375, 640–1023 e ≥1024 px               | Abaixo de 640: só a coruja, o carrinho e o hambúrguer. 640–1023: a marca aparece. ≥1024: a navegação central e "Entrar"/"Sair"; o hambúrguer some. |

**Checagens**

- A 1280 px, `[...document.querySelectorAll('nav ul li')].slice(0,4).map(e=>e.innerText.trim())` começa com `['Início','Como Funciona','Contato','Produtos']`, e `[aria-label='Abrir menu']` tem `display:none`.
- A 375 px, o texto "Profa. Marciar Cardoso" e "Entrar" ficam invisíveis, e `document.documentElement.scrollWidth <= innerWidth`.
- Em `/`, "Início" tem `bg-brand-50`; em `/produtos`, quem tem é "Produtos".
- Depois de `window.scrollTo(0,1000)`, `document.querySelector('nav').getBoundingClientRect().top === 0`.
- Depois de adicionar 1 produto: badge "1" e aria-label "Abrir carrinho com 1 item".
- "Sair": `article[data-type='info']` com "Sessão encerrada.", `POST …/auth/customer/logout`, o header volta a "Entrar" e o F5 continua deslogado.
- Cliente com papel admin: "Painel admin" visível e nenhum botão com aria-label começando por "Abrir carrinho".
- "Painel admin" sem `admin_session`: a URL é `/admin`, aparecem "Acesso restrito" e os placeholders "E-mail do admin"/"Senha", e não há nav da loja nem `footer#contato`.
- Em `/`, "Como Funciona" leva a `location.hash === '#como-funciona'`. Em `/produtos`, o mesmo clique gera uma nova navegação do tipo document.

**Suspeitas:** B25, B26, B31, B106, B107.
**Arquivos:** `src/components/Shell.jsx`, `src/providers/AuthProvider.jsx`, `src/services/customer-auth.js`, `src/providers/CartProvider.jsx`, `src/constants/routes.js`, `src/components/ProtectedRoute.jsx`, `handlers/auth/customer/logout.js`.

#### L02 — Menu mobile (hambúrguer)

- **Rotas:** as mesmas do L01, abaixo de 1024 px. **Acesso:** misto.
- **Como chegar:** janela de 375×812 → "Abrir menu".
- **O que aparece:** um painel que se expande dentro do `<nav>`. Não é overlay: empurra o conteúdo e não tem fundo escuro. Itens com min-h 44 px: "Início", "Produtos", "Meus produtos" (cliente que não é admin), "Painel admin" (âmbar, papel admin/master), o rótulo "Navegar" (não clicável), "Como Funciona", "Contato", uma divisória, "Entrar"/"Conta" e o botão rosa "Sair" (logado). Não há item de carrinho.

| Elemento                    | Onde                      | O que acontece                                           | API                               | Destrutivo? |
| --------------------------- | ------------------------- | -------------------------------------------------------- | --------------------------------- | ----------- |
| "Início"                    | 1º                        | Vai para `/` e fecha o menu                              | `GET {API}/home-sections`         | não         |
| "Produtos"                  | 2º                        | Vai para `/produtos` e fecha                             | `GET {API}/products`              | não         |
| "Meus produtos"             | cliente logado, não admin | Vai para `/downloads` e fecha                            | —                                 | não         |
| "Painel admin"              | papel admin/master        | Vai para `/admin` e fecha                                | —                                 | não         |
| "Como Funciona" / "Contato" | abaixo de "Navegar"       | Fecham o menu e rolam (em `/`) ou recarregam o documento | —                                 | não         |
| "Entrar" / "Conta"          | depois da divisória       | Vai para `/login` e fecha                                | —                                 | não         |
| "Sair"                      | último, logado            | O mesmo "Sair" do desktop, e fecha o menu                | `POST {API}/auth/customer/logout` | não         |
| Esc / clique fora           | menu aberto               | **Não fecha**                                            | —                                 | não         |

| Estado                               | Como provocar      | O que se vê                                                           |
| ------------------------------------ | ------------------ | --------------------------------------------------------------------- |
| Fechado                              | Carga inicial      | "Abrir menu" com `aria-expanded="false"`; o painel não está no DOM    |
| Aberto (visitante)                   | Clicar sem sessão  | Exatamente: Início, Produtos, Navegar, Como Funciona, Contato, Entrar |
| Aberto (cliente)                     | Cliente comum      | + "Meus produtos", "Conta" no lugar de "Entrar", e "Sair"             |
| Aberto (cliente admin)               | Papel admin/master | "Painel admin" no lugar de "Meus produtos"                            |
| Alargar para ≥1024 com o menu aberto | Redimensionar      | O painel some; ao voltar a estreitar, reaparece aberto                |

**Checagens:** cada item tem `getBoundingClientRect().height >= 44`. Depois de "Produtos", `pathname === '/produtos'` e o painel sai do DOM. `aria-expanded` alterna a cada clique. Com o menu aberto a 375 px, não há rolagem horizontal.
**Suspeitas:** B108.
**Arquivos:** `src/components/Shell.jsx`.

#### L03 — Drawer do carrinho

- **Rotas:** overlay das rotas com Shell. **Acesso:** misto.
- **Como chegar:** adicione um produto e clique no ícone do carrinho. Para os papéis admin/master o ícone não existe. Responda antes ao banner de cookies, porque ele cobre o rodapé do drawer (B35).
- **O que aparece:** um backdrop escuro com blur (um botão invisível "Fechar carrinho", z-40) e um painel branco à direita (`aside role=dialog aria-modal=true aria-labelledby=cart-drawer-title`, z-50, largura total no mobile e até 448 px no desktop). No cabeçalho: "SEU CARRINHO" e o h2 "Nada por aqui ainda", "N item" ou "N items", mais o X (aria-label "Fechar"). Vazio: um ícone, "Seu carrinho está vazio." e o botão "Ver catálogo". Com itens: cards com imagem de 64 px (ou um quadrado cinza com bi-image), o nome (até 2 linhas), o preço em pt-BR e "Remover". O rodapé só aparece com itens: "Subtotal", "Cupons e descontos são aplicados na próxima etapa.", "Finalizar compra →" e "Esvaziar carrinho". **Não há controle de quantidade** (`quantity` é sempre 1). A persistência fica em `localStorage['cart']`, um array de `{id,name,price,image,categoryId,quantity}`.

| Elemento                                | Onde                         | O que acontece                                                                                                             | API                                                           | Destrutivo? |
| --------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| Backdrop ("Fechar carrinho")            | fora do painel               | Fecha; o foco volta ao botão do carrinho e o body volta a rolar                                                            | —                                                             | não         |
| X ("Fechar")                            | topo; recebe o foco ao abrir | Fecha                                                                                                                      | —                                                             | não         |
| Esc                                     | drawer aberto                | Fecha                                                                                                                      | —                                                             | não         |
| Tab / Shift+Tab                         | drawer aberto                | O foco fica preso no aside; o backdrop fica fora do ciclo                                                                  | —                                                             | não         |
| "Ver catálogo"                          | estado vazio                 | Fecha e vai para `/produtos`                                                                                               | `GET {API}/products`                                          | não         |
| "Remover" (aria-label "Remover <nome>") | cada item                    | Remove na hora, sem confirmação e sem toast. Título, subtotal e badge diminuem.                                            | `POST {API}/track-event` `remove_from_cart` (sendBeacon, 204) | não         |
| "Finalizar compra →"                    | rodapé                       | Fecha e vai para `/checkout`                                                                                               | as da C07                                                     | não         |
| "Esvaziar carrinho"                     | rodapé                       | Zera o carrinho **sem confirmação**, sem toast e sem evento. O drawer fica aberto e vazio, e `localStorage.cart === '[]'`. | —                                                             | não         |

| Estado                                 | Como provocar                                | O que se vê                                                                       |
| -------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Fechado                                | Padrão                                       | Nenhum `aside[aria-labelledby=cart-drawer-title]` no DOM                          |
| Vazio                                  | `localStorage.removeItem('cart')`, F5, abrir | "Nada por aqui ainda", "Seu carrinho está vazio.", "Ver catálogo" e nenhum rodapé |
| 1 item / N itens                       | Adicionar                                    | h2 "1 item" / "2 items" (plural em inglês, B109); o subtotal é a soma             |
| Item sem imagem                        | Produto sem imagem                           | Quadrado cinza com bi-image                                                       |
| Banner de cookies pendente             | Sem decisão LGPD                             | O banner cobre "Finalizar compra"/"Esvaziar carrinho"                             |
| Persistência                           | Adicionar e dar F5                           | Itens e badge mantidos                                                            |
| `cart` corrompido ou storage bloqueado | `localStorage.setItem('cart','{}')` + F5     | A app inteira vira "Algo deu errado" (L08)                                        |

**Checagens:** aberto, `document.body.style.overflow === 'hidden'`. `aria-labelledby === 'cart-drawer-title'`. Ao abrir, `document.activeElement.getAttribute('aria-label') === 'Fechar'`. O subtotal é a soma de `JSON.parse(localStorage.cart).map(i=>i.price)`. O badge, o número de `<li>` e `JSON.parse(localStorage.cart).length` são iguais. Dez Tabs não saem do aside. Esc devolve o foco ao botão do carrinho. "Finalizar compra" leva a `/checkout`. Abrir o drawer não gera requisição. O painel tem a largura toda a 375 px e 448 px a 1280 px.
**Suspeitas:** B27, B28, B29, B35, B109, B110, B111.
**Arquivos:** `src/components/CartDrawer.jsx`, `src/providers/CartProvider.jsx`, `src/utils/cart-storage.js`, `src/utils/analytics.js`, `src/utils/currency.js`.

#### L04 — Rodapé global com newsletter

- **Rotas:** o fim de toda página com Shell (`<footer id="contato">`). **Acesso:** público.
- **Como chegar:** rolar até o fim da página ou clicar em "Contato".
- **O que aparece:** fundo `bg-slate-950`, com 1 coluna no mobile e 4 a partir de 768 px. Colunas 1–2: o logo, "PROFA. MARCIAR CARDOSO", o texto "Materiais gráficos digitais profissionais e editáveis para festas, eventos e decoração escolar. Download instantâneo após a aprovação do pagamento." e os ícones Instagram, Facebook e Pinterest. Coluna 3, "NAVEGAÇÃO": Início, Produtos, Como funciona, Minha conta, Downloads. Coluna 4, "CONTATO": `contato@profamarciarcardoso.com.br` e "(11) 99999-9999". A faixa da newsletter (form aria-label "Inscrever-se na newsletter") tem o label "Receba dicas + materiais novos no email", o input "seu@email.com" (`#newsletter-email-footer`), o botão amarelo "Inscrever" e a nota "Você pode cancelar a qualquer momento — link no rodapé de todos os emails.". Na faixa final: "© 2026 Profa. Marciar Cardoso. Todos os direitos reservados.", "Privacidade" e "Termos".

| Elemento                                    | Onde        | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | API                                                          | Destrutivo?                                                |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Logo do rodapé                              | coluna 1    | Vai para `/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                            | não                                                        |
| Instagram / Facebook / Pinterest            | ícones      | Abrem uma aba nova (`rel="noopener noreferrer"`): `https://instagram.com/profamarciarcardoso`, `https://www.facebook.com` e `https://www.pinterest.com` (os dois últimos são genéricos, B32)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                            | não                                                        |
| Início / Produtos / Minha conta / Downloads | Navegação   | Vão para `/`, `/produtos`, `/login` e `/downloads` (a página nova pode abrir rolada, B31)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                                            | não                                                        |
| "Como funciona"                             | Navegação   | `<a href="/#como-funciona">`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                            | não                                                        |
| `contato@profamarciarcardoso.com.br`        | Contato     | `mailto:`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                                            | não                                                        |
| "(11) 99999-9999"                           | Contato     | Aba nova em `https://wa.me/5511999999999` (número fictício)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                            | não                                                        |
| Campo "seu@email.com"                       | newsletter  | Fica desabilitado durante o envio e depois de um sucesso, até a próxima troca de rota                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                            | não                                                        |
| "Inscrever"                                 | newsletter  | Campo vazio ou sem "@": validação nativa do navegador, sem requisição. Formato que passa no HTML5 mas não na regex (ex.: `teste@dominio`): texto vermelho "Informe um email válido." (role=alert), sem requisição. E-mail válido: "Enviando…" e depois, em verde, "Confirmação enviada — verifique sua caixa de entrada e clique no link." (novo ou pendente) ou "Você já está inscrito. Obrigada!" (já confirmado); o campo é limpo e desabilitado. Erros: "Muitas tentativas. Aguarde 1 minuto." (429, 5/min), "Erro ao processar inscrição.", "Supabase não configurado.", "Muitas requisições. Aguarde um instante e tente novamente." (borda do dev), "Tempo de resposta da API excedido. Tente novamente.", "Failed to fetch", "Não foi possível inscrever agora." | `POST {API}/subscribe {email, source:'footer', attribution}` | **sim** (grava `email_subscribers` e envia um e-mail real) |
| Privacidade / Termos                        | faixa final | `/privacidade` e `/termos`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                            | não                                                        |

| Estado          | Como provocar                    | O que se vê                                           |
| --------------- | -------------------------------- | ----------------------------------------------------- |
| Ocioso          | Carga                            | Campo habilitado, botão "Inscrever"                   |
| Enviando        | Enviar com Slow 3G               | "Enviando…" com campo e botão desabilitados           |
| Sucesso (novo)  | E-mail nunca inscrito            | "Confirmação enviada — …", campo limpo e desabilitado |
| Já inscrito     | E-mail confirmado                | "Você já está inscrito. Obrigada!" (B30)              |
| Validação local | `teste@dominio`                  | "Informe um email válido." sem requisição             |
| Rate limit      | 6 envios em 1 min                | "Muitas tentativas. Aguarde 1 minuto."                |
| API fora        | Parar o dev:api                  | "Failed to fetch"                                     |
| Remontagem      | Trocar de rota depois do sucesso | O formulário volta ao estado inicial                  |

**Checagens:** `footer#contato` existe e contém os h4 "Navegação" e "Contato". Todo `a[target=_blank]` tem `rel='noopener noreferrer'`. A partir de 768 px, `gridTemplateColumns` tem 4 valores. `teste@dominio` não gera POST. Um e-mail válido gera `POST …/subscribe` com `source:'footer'` e resposta 200 `{success:true, message:'Confirmação enviada para seu email. Verifique a caixa de entrada.'}`. O texto "© 2026 Profa. Marciar Cardoso. Todos os direitos reservados." está presente. Depois de clicar em "Privacidade" no fim da página, anote `window.scrollY` (deveria ser 0).
**Suspeitas:** B07, B08, B30, B31, B32, B33, B79, B112.
**Arquivos:** `src/components/Shell.jsx`, `src/components/NewsletterSignup.jsx`, `src/services/newsletter.js`, `handlers/subscribe.js`, `lib/email-sender.js`, `lib/rate-limit.js`.

#### L05 — Banner de cookies / consentimento LGPD

- **Rotas:** overlay fixo em **todas** as rotas, inclusive `/login`, `/admin` e a 404, enquanto não houver uma decisão válida. É montado em `src/main.jsx`, fora das rotas. **Acesso:** público.
- **Como chegar:** janela anônima, ou remover `lgpd_consent`, `lgpd_consent_version` e `lgpd_consent_at` do localStorage e recarregar. O banner também reaparece se `lgpd_consent_version` for diferente de `'2026-05-24'`.
- **O que aparece:** `aside role=dialog aria-live=polite aria-label='Aviso de cookies e privacidade'`, fixo embaixo, z-50, até 768 px de largura, sem fundo escuro. Tem o h2 "Sua privacidade importa", o texto "Usamos cookies essenciais para o funcionamento do site. Cookies de marketing (Google Analytics e Meta) ajudam a medir o que funciona. Você decide. Saiba mais na nossa Política de Privacidade e nos Termos de Uso." e os botões "Apenas essenciais" e "Aceitar todos". Abaixo de 640 px eles ficam empilhados. **Não há link de revogação** no banner, no header nem no rodapé. A revogação fica em `/privacidade#cookies` (L13).

| Elemento                                    | Onde   | O que acontece                                                                                                                                                          | API                   | Destrutivo? |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------- |
| "Política de Privacidade" / "Termos de Uso" | texto  | Navegam para `/privacidade` e `/termos`; o banner continua                                                                                                              | —                     | não         |
| "Apenas essenciais"                         | botões | O banner some e grava `lgpd_consent='denied'`, `lgpd_consent_version='2026-05-24'` e `lgpd_consent_at=<ISO>`. Os eventos essenciais continuam indo para `/track-event`. | —                     | não         |
| "Aceitar todos"                             | botões | O banner some e grava `'granted'`. Só carrega `gtag.js`/`fbevents.js` se `VITE_GA4_ID`/`VITE_META_PIXEL_ID` existirem no build (hoje não existem).                      | terceiros, só com IDs | não         |
| Esc / clique fora                           | —      | Não fecha                                                                                                                                                               | —                     | não         |

| Estado                                         | Como provocar                                                    | O que se vê                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Sem decisão                                    | Janela anônima                                                   | Banner visível em todas as rotas                            |
| Decisão válida                                 | Clicar um botão e dar F5                                         | Banner fora do DOM                                          |
| Versão antiga                                  | `localStorage.setItem('lgpd_consent_version','2020-01-01')` + F5 | O banner reaparece                                          |
| Decisão em outra aba                           | Decidir na aba 2                                                 | O banner da aba 1 some (evento `storage`)                   |
| Decisão no bloco de `/privacidade` (mesma aba) | "Aceitar todos" no bloco                                         | Esperado: o banner some. Atual: **continua** até o F5 (B34) |

**Checagens:** o `aside[aria-label='Aviso de cookies e privacidade']` contém "Sua privacidade importa". Antes da decisão, não há requisição para googletagmanager.com nem para facebook.net. Depois de "Apenas essenciais", `lgpd_consent==='denied'`. O banner aparece também em `/admin` e `/login`. Esc não fecha.
**Suspeitas:** B34, B35, B113, B114, B115, B116.
**Arquivos:** `src/components/ConsentBanner.jsx`, `src/utils/consent.js`, `src/utils/analytics.js`, `src/main.jsx`, `vercel.json`.

#### L06 — Toasts globais

- **Rotas:** todas. **Acesso:** público.
- **Como chegar:** qualquer ação que dispare `pushToast`: "Adicionar" (verde ou âmbar), "Sair" (azul), erros do checkout ou do login (vermelho).
- **O que aparece:** um contêiner `fixed top-4 z-[100] aria-live=polite aria-atomic=true`, centralizado no mobile e à direita a partir de 640 px, com até 448 px. Cada toast é um `<article data-type='success|error|warning|info'>` com ícone, texto e um X (aria-label "Fechar aviso"). Somem em **2,4 s** e se empilham.

| Elemento           | Onde       | O que acontece         | API | Destrutivo? |
| ------------------ | ---------- | ---------------------- | --- | ----------- |
| X ("Fechar aviso") | cada toast | Remove o toast na hora | —   | não         |

| Estado  | Como provocar                                   | O que se vê                                                                                                        |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| success | "Adicionar" num produto novo                    | Toast verde "Produto adicionado ao carrinho." (o ícone deveria ser bi-check-circle-fill, mas **não aparece**, B36) |
| warning | "Adicionar" num produto que já está no carrinho | Toast âmbar "Este produto já está no carrinho." (**sem ícone**, B36)                                               |
| info    | "Sair"                                          | Toast azul "Sessão encerrada." com bi-info-circle-fill                                                             |
| error   | Falha no login ou no checkout                   | Toast vermelho com bi-exclamation-triangle-fill                                                                    |
| Vários  | Três "Adicionar" seguidos                       | Três toasts empilhados                                                                                             |

**Checagens:** depois de "Sair", existe `article[data-type='info']` com "Sessão encerrada.". O contêiner tem z-index 100. "Fechar aviso" remove o toast antes dos 2,4 s. Para o ícone do toast verde, `getComputedStyle(document.querySelector("article[data-type='success'] i"),'::before').content` deveria ser um glifo; hoje vem `'none'`/`'normal'`.
**Suspeitas:** B36, B117.
**Arquivos:** `src/components/ToastViewport.jsx`, `src/providers/ToastProvider.jsx`, `scripts/icons-usados.json`, `public/fonts/bootstrap-icons-subset.css`.

#### L07 — Carregamento de rota ("Carregando…")

- **Rotas:** qualquer rota; é o fallback do `<Suspense>` único. **Acesso:** público.
- **Como chegar:** F5 com "Disable cache" e "Slow 3G", ou navegar para uma página cujo chunk ainda não foi baixado.
- **O que aparece:** antes do bundle principal, a tela fica branca (`index.html` só tem `<div id=root>`). Depois, no centro (min-h 60vh), o ícone bi-arrow-clockwise girando e "Carregando…". Não há header nem rodapé, e não há elementos clicáveis.

| Estado                                 | Como provocar                             | O que se vê                                                                                                                       |
| -------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Primeira carga                         | F5 com Slow 3G                            | Branco → "Carregando…" → página                                                                                                   |
| Chunk não baixado em navegação interna | Slow 3G + "Termos"                        | A URL muda na hora e a página anterior tende a continuar até o chunk chegar (é a transição do React Router 7; sozinha, não é bug) |
| `/admin`                               | Abrir                                     | "Verificando sessão" (ProtectedRoute) e depois o formulário ou o painel                                                           |
| Falha no chunk                         | Bloquear `*LegalPages*` e clicar "Termos" | "Algo deu errado" (L08)                                                                                                           |

**Checagens:** com Slow 3G, existe um momento com "Carregando…" e `.animate-spin`, sem a nav da loja. Uma rota já visitada não mostra o fallback.
**Suspeitas:** B37, B118, B119.
**Arquivos:** `src/App.jsx`, `src/main.jsx`, `index.html`, `vite.config.js`, `vercel.json`.

#### L08 — Tela de erro global ("Algo deu errado")

- **Rotas:** substitui a aplicação inteira na URL em que o erro aconteceu. Há um ErrorBoundary único, por fora do Router, do Auth, do Cart, do Toast e do Helmet. **Acesso:** público.
- **Como chegar:** `localStorage.setItem('cart','{}')` + F5; bloquear o chunk de uma página e navegar até ela; ou deixar o armazenamento bloqueado ao adicionar ao carrinho.
- **O que aparece:** fundo `bg-slate-50` e um cartão com um triângulo rosa, o h1 "Algo deu errado", o texto "Tivemos um problema ao carregar esta página. Já registramos o ocorrido. Tente recarregar." e o botão roxo "Recarregar". Não há header, rodapé, toasts nem banner.

| Elemento     | Onde   | O que acontece                                            | API     | Destrutivo? |
| ------------ | ------ | --------------------------------------------------------- | ------- | ----------- |
| "Recarregar" | cartão | `location.reload()`; se a causa persistir, o cartão volta | recarga | não         |

| Estado                        | Como provocar    | O que se vê                                                                                              |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| Erro capturado                | Qualquer gatilho | O cartão; console com "[ErrorBoundary]"; `POST {API}/track-event {event_name:'client_error', …}` com 204 |
| Voltar/Avançar depois do erro | Botão Voltar     | A URL muda e o cartão **continua** (B38)                                                                 |

**Checagens:** os textos exatos acima. O console mostra "[ErrorBoundary]". A rede mostra `POST …/track-event` 204 com `client_error`. Corrigir o storage (`'[]'`) e clicar "Recarregar" restaura a rota.
**Suspeitas:** B37, B38, B39, B120.
**Arquivos:** `src/components/ErrorBoundary.jsx`, `src/main.jsx`, `handlers/track-event.js`, `lib/analytics-events.js`.

### 3.2 Páginas públicas da loja

#### L09 — Home (vitrine)

- **Rota:** `/`. **Acesso:** público.
- **Como chegar:** a raiz, o logo ou "Início".
- **O que aparece (de cima para baixo):**
  - **Hero** em gradiente lilás, com emojis flutuantes (só a partir de 640 px; sem animação com `prefers-reduced-motion`), o H1 "Painéis e recursos pedagógicos feitos com cuidado e criatividade" e o botão "Ver Produtos →".
  - **Marquee** (aria-hidden) com "BANNERS ✦ PAINÉIS ✦ ATIVIDADES ✦ LEMBRANCINHAS ✦ KITS ✦".
  - **Catálogo:** o rótulo "CATÁLOGO", o H2 "É exatamente isso que você precisa 👇", o botão "Ver catálogo completo →" e uma linha de status. Depois vem uma faixa por seção de `GET /home-sections`: um H3 com o título, o link "Mais produtos →" e um trilho horizontal de cards de 176 px (imagem quadrada ou o placeholder "Produto", nome e preço), com setas "Rolar para esquerda"/"Rolar para direita" a partir de 768 px.
  - **Como funciona** (`section#como-funciona`): "SIMPLES ASSIM", o H2 "Do clique à impressão em minutos", "Sem cadastro obrigatório. Sem espera. Sem complicação.", um `<ol>` com 01 Escolha, 02 Pague, 03 Baixe na hora e 04 Imprima (títulos em `<h5>`) e a caixa "PDF em alta resolução / Arquivos prontos para impressão, com acesso ilimitado e permanente.".
  - **Prova social:** "COMO A ESCOLA USA", o H2 "Mais de 16.000 professoras nos seguem nas redes 📲", números (4,2k seguidores / 48k curtidas / 98% aprovação / 5k+ pedidos), 3 depoimentos (Carla M. · Professora, SP; Ana R. · Diretora, MG; Juliana F. · Coord. Pedagógica, RJ) e os botões "@profamarciarcardoso" (Instagram e TikTok).
  - **Origem dos dados:** as vitrines são reais (banco). Hero, marquee, passos, números e depoimentos são **fixos no código**.

| Elemento                                    | Onde            | O que acontece                                                                                                                                                                             | API                               | Destrutivo? |
| ------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------- |
| "Ver Produtos →"                            | hero            | Vai para `/produtos`                                                                                                                                                                       | `GET {API}/products`              | não         |
| "Ver catálogo completo →"                   | Catálogo        | Vai para `/produtos`                                                                                                                                                                       | idem                              | não         |
| "Mais produtos →"                           | cada H3         | Seção de categoria → `/produtos?categoria=<Nome>`. "Mais vendidos" → `/produtos?preset=mais-vendidos`. "Novidades" → `/produtos?preset=novidades`, que **filtra os últimos 7 dias** (B40). | idem                              | não         |
| Setas "Rolar para esquerda/direita"         | trilho, ≥768 px | Rolam `max(240px, 80%)`                                                                                                                                                                    | —                                 | não         |
| Trilho (swipe / shift+roda)                 | seção           | Rolagem horizontal sem barra                                                                                                                                                               | —                                 | não         |
| Card (nome + preço)                         | trilho          | Vai para `/produtos/<slug>`; no hover sobe 4 px                                                                                                                                            | `GET {API}/product-details?slug=` | não         |
| "@profamarciarcardoso" (Instagram / TikTok) | fim             | Aba nova em `instagram.com/profamarciarcardoso` / `tiktok.com/@profamarciarcardoso`                                                                                                        | —                                 | não         |

| Estado                                                   | Como provocar                | O que se vê                                                                      |
| -------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Carregando                                               | Slow 3G                      | Caixa cinza "Carregando vitrine..."                                              |
| Carregado                                                | API ok                       | Uma faixa por seção, com 4 a 20 cards (padrão 8)                                 |
| Sem configuração, `{sections:[]}` ou só seções inválidas | Configuração vazia           | O padrão: as 3 primeiras categorias ativas + "Mais vendidos" + "Novidades" (B41) |
| Seção sem produtos                                       | Categoria ativa sem produtos | H3 + "Mais produtos →" e o trilho vazio, sem mensagem                            |
| Produto sem imagem                                       | —                            | Quadrado lilás com "Produto"                                                     |
| Erro HTTP                                                | 500/429                      | "Falha ao carregar vitrine: 500" (ou 429)                                        |
| API fora / timeout                                       | Parar a API / API travada    | "Failed to fetch" / "Tempo de resposta da API excedido. Tente novamente."        |
| Movimento reduzido                                       | DevTools › Rendering         | Emojis e marquee parados                                                         |

**Checagens:** `document.title === 'Materiais educativos digitais para professores · Ateliê da Escola'`. `GET …/home-sections` responde 200 com `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=3600` e o corpo `{success:true, sections:[{key,type,title,link,products}]}`. O número de H3 do Catálogo é igual a `sections.length`. Os cards por trilho são `products.length` e têm href `/produtos/<slug>`, com preço no formato "R$ 12,90". A 1280 px, "Rolar para direita" aumenta o `scrollLeft`. `#como-funciona` tem 4 `<li>`. A 375 px não há rolagem horizontal e os números ficam em 2 colunas. Em dev, podem sair 2 GETs (StrictMode).
**Suspeitas:** B40, B41, B42, B43, B127, B128, B129, B130.
**Arquivos:** `src/pages/HomePage.jsx`, `src/components/SocialProofStrip.jsx`, `src/services/products.js`, `handlers/home-sections.js`, `lib/sales-counts.js`.

#### L10 — Catálogo

- **Rota:** `/produtos` (`?categoria=<nome>`, sem diferenciar acento nem maiúscula; `?preset=mais-vendidos`; `?preset=novidades`; **não há** `?q=`). **Acesso:** público.
- **Como chegar:** "Produtos" no header, no menu ou no rodapé; os botões da Home; "Ver produtos" da 404; "Ver catálogo" do drawer; "Voltar ao catálogo" do produto.
- **O que aparece:** o hero com o H1 "Banners para toda ocasião escolar". A partir de 1024 px, duas colunas. A **sidebar** tem "CATEGORIAS" ("Todos" + uma linha por categoria, com contagem) e "FAIXA DE PREÇO" (rádios "Todos", "Até R$ 25", "R$ 25 – R$ 50", "Acima de R$ 50"). À direita: o botão "Filtros" (só abaixo de 1024 px), os chips "Todos" + até 5 categorias, o select "Ordenar produtos" (padrão "Mais recentes"), "N produtos encontrados" e uma grade de 1, 2 ou 3 colunas. Cada card tem a imagem 4:3 clicável (com um selo colorido **fixo por nome de categoria** e a faixa "Ver detalhes →"), a pílula da categoria ("Banner" se não houver), o nome (h3), a descrição cortada em 90 caracteres, os chips fixos "PDF", "Canva" e "Imprimível", o preço e os botões "Adicionar" e "Detalhes". Tudo vem de um único `GET /products`, sem paginação.

| Elemento                                   | Onde              | O que acontece                                                                                                                                            | API                                                 | Destrutivo? |
| ------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------- |
| Chip "Todos"                               | barra             | Mostra tudo e limpa o preset; a URL não muda                                                                                                              | —                                                   | não         |
| Chip de categoria (até 5)                  | barra             | Filtra e limpa o preset; a URL não muda                                                                                                                   | —                                                   | não         |
| "Ordenar produtos"                         | barra             | "Mais vendidos", "Mais recentes" (padrão), "Menor preço", "Maior preço", "Nome A-Z"                                                                       | —                                                   | não         |
| Cabeçalhos "CATEGORIAS" / "FAIXA DE PREÇO" | sidebar           | Recolhem e expandem (sem aria-expanded)                                                                                                                   | —                                                   | não         |
| "Todos" / `<categoria>` (com contagem)     | sidebar           | O mesmo efeito do chip. No mobile, fecha o painel. A contagem ignora preço e preset (B136).                                                               | —                                                   | não         |
| Rádios de preço                            | sidebar           | ≤25; >25 e ≤50; >50. Mantêm a categoria e o preset.                                                                                                       | —                                                   | não         |
| "Filtros"                                  | abaixo de 1024 px | Abre o painel de filtros (L11)                                                                                                                            | —                                                   | não         |
| Imagem do card / "Detalhes"                | card              | Vai para `/produtos/<slug>` (sem voltar ao topo)                                                                                                          | `GET {API}/product-details?slug=`                   | não         |
| "Adicionar"                                | card              | Produto novo: toast verde "Produto adicionado ao carrinho." e badge +1. Repetido: toast âmbar "Este produto já está no carrinho.". O drawer **não** abre. | `POST {API}/track-event add_to_cart` (só na 1ª vez) | não         |

| Estado                                         | Como provocar       | O que se vê                                                                              |
| ---------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| Carregando                                     | Slow 3G             | "Carregando catálogo…" + 6 esqueletos; sidebar "Todos 0"                                 |
| Sucesso                                        | —                   | "N produtos encontrados" ("1 produto encontrado"; "0 produtos encontrados")              |
| Erro de API                                    | API fora            | Caixa rosa "Erro ao carregar produtos. Tente novamente." + a mensagem técnica, sem botão |
| Vazio                                          | Filtro sem produtos | "Nenhum produto encontrado nessa categoria.", sem "Limpar filtros"                       |
| `?preset=mais-vendidos`                        | URL                 | O select em "Mais vendidos"                                                              |
| `?preset=novidades`                            | URL                 | Só os últimos 7 dias, sem indicador (B45)                                                |
| `?categoria=<nome>`                            | URL                 | A categoria destacada; um nome inexistente é ignorado                                    |
| Produto sem categoria ou com categoria inativa | —                   | Pílula "BANNER", fora das contagens                                                      |
| Responsivo                                     | 375 / 1280          | 375: "Filtros" e 1 coluna. 1280: sidebar e 3 colunas.                                    |

**Checagens:** `document.title === 'Catálogo de materiais educativos · Ateliê da Escola'`. `GET …/products` responde 200 com `{success:true, products, total}` e sem `download_url`. Com "Todos" e sem preset, "N produtos encontrados", `total`, o número de cards e o badge "Todos" batem. Cada ordenação e cada faixa de preço é respeitada. Há no máximo 6 chips. Repetir "Adicionar" não altera o badge. `view_catalog` é enviado ao abrir. A 375 px não há rolagem horizontal.
**Suspeitas:** B42, B44, B45, B46, B47, B48, B53, B131, B132, B133, B134, B135, B136, B137.
**Arquivos:** `src/pages/ProductsPage.jsx`, `src/hooks/useProductFilters.js`, `src/components/ProductSidebar.jsx`, `src/components/ProductGrid.jsx`, `src/components/SortDropdown.jsx`, `handlers/products.js`.

#### L11 — Filtros do catálogo no mobile (off-canvas)

- **Rota:** `/produtos` abaixo de 1024 px. **Acesso:** público.
- **Como chegar:** 375×812 → `/produtos` → "Filtros".
- **O que aparece:** um fundo escuro (botão "Fechar filtros", z-30) e um painel branco de 288 px à esquerda (z-40), com o cabeçalho "Filtros", um X ("Fechar") e as seções "CATEGORIAS" e "FAIXA DE PREÇO". Não tem `role=dialog` nem trava de rolagem.

| Elemento                 | Onde           | O que acontece                     | API | Destrutivo? |
| ------------------------ | -------------- | ---------------------------------- | --- | ----------- |
| Fundo ("Fechar filtros") | direita        | Fecha sem mudar os filtros         | —   | não         |
| X ("Fechar")             | cabeçalho      | Fecha                              | —   | não         |
| "Todos" / `<categoria>`  | Categorias     | Aplica, limpa o preset e **fecha** | —   | não         |
| Rádios de preço          | Faixa de preço | Aplica e fecha                     | —   | não         |
| Cabeçalhos das seções    | painel         | Recolhem sem fechar o painel       | —   | não         |
| Esc                      | aberto         | **Não** fecha                      | —   | não         |

| Estado                     | Como provocar | O que se vê                                                          |
| -------------------------- | ------------- | -------------------------------------------------------------------- |
| Fechado                    | Padrão        | O painel fica fora da tela, mas **continua no DOM e focável** (B138) |
| Aberto                     | "Filtros"     | Painel e fundo escuro; a página atrás ainda rola                     |
| Banner de cookies pendente | Sem decisão   | O banner cobre a base do painel                                      |

**Checagens:** escolher uma categoria fecha o painel e filtra a grade. O fundo e o X fecham; Esc não fecha. Com o painel aberto não há rolagem horizontal.
**Suspeitas:** B35, B138.
**Arquivos:** `src/components/ProductSidebar.jsx`, `src/hooks/useProductFilters.js`.

#### L12 — Página de produto

- **Rota:** `/produtos/:slug` (um valor só com dígitos é tratado como id legado). **Acesso:** público.
- **Como chegar:** um card do catálogo, da Home ou do cross-sell, ou a URL direta.
- **O que aparece:**
  - O link "Voltar ao catálogo" e um card em 2 colunas a partir de 768 px.
  - **Galeria:** a mídia principal quadrada (imagem, `<video controls>`, iframe do YouTube "Vídeo do produto" ou o placeholder bi-image) e, se houver mais de uma mídia, miniaturas de 64 px ("Mídia N"; os vídeos com ícone de play).
  - **Detalhes:** a pílula da categoria (ou "Sem categoria"), os selos "Destaque" (featured) e "KIT" (is_kit), o nome em **H2** (não há H1) e a descrição (ou "Sem descrição disponível.").
  - **Preço:** o preço, o preço original riscado quando é maior e o texto fixo "PDF em alta resolução · acesso permanente · download imediato após aprovação". "Tamanho" e "Formato" aparecem se existirem.
  - **Benefícios:** até 6 (do banco) ou, na falta deles, 4 fixos.
  - **Botões:** "Comprar agora" e "Adicionar".
  - **Abaixo:** "QUEM JÁ USOU" / "O que professores estão falando" (até 6 reviews), "PERGUNTAS FREQUENTES" / "Tire suas dúvidas" (acordeão, até 8) e "VOCÊ TAMBÉM PODE GOSTAR" / "Quem comprou este levou também" (até 4, de `/cross-sell`).
  - **Origem dos dados:** reviews, FAQ e benefícios são reais do banco, mas **digitados pelo admin** no wizard.

| Elemento                           | Onde            | O que acontece                                                                         | API                                                              | Destrutivo? |
| ---------------------------------- | --------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------- |
| "Voltar ao catálogo"               | topo            | Vai para `/produtos` (os filtros anteriores se perdem)                                 | `GET {API}/products`                                             | não         |
| Miniatura ("Mídia N" ou play)      | abaixo da mídia | Troca a mídia principal; a ativa ganha borda roxa                                      | —                                                                | não         |
| Player / iframe "Vídeo do produto" | mídia principal | URLs do YouTube viram `/embed/<id>`. Um vídeo enviado pelo wizard **não toca** (B21).  | —                                                                | não         |
| "Comprar agora"                    | detalhes        | Adiciona (toast verde) ou avisa com o toast âmbar e **sempre** navega para `/checkout` | `track-event add_to_cart`                                        | não         |
| "Adicionar"                        | detalhes        | Toast e badge, sem navegar                                                             | `track-event add_to_cart`                                        | não         |
| Pergunta do FAQ (aria-expanded)    | FAQ             | A 1ª já vem aberta; abrir outra fecha a anterior                                       | —                                                                | não         |
| Card de sugestão                   | cross-sell      | Vai para o novo produto sem voltar ao topo                                             | `GET {API}/product-details`, `GET {API}/cross-sell`, `view_item` | não         |

| Estado                            | Como provocar                   | O que se vê                                                                                                                                        |
| --------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carregando                        | Slow 3G                         | "Carregando produto…"; título "Carregando produto · Ateliê da Escola" com noindex                                                                  |
| Carregado                         | Slug válido                     | Título "<nome> · Ateliê da Escola", og:type product e JSON-LD Product; um `view_item`                                                              |
| Troca via SPA                     | Clicar num card do cross-sell   | O título do produto ANTERIOR fica até terminar de carregar                                                                                         |
| Slug inexistente ou inativo       | `/produtos/slug-que-nao-existe` | Caixa rosa "Não foi possível carregar o produto" / "Produto não encontrado na API." (API 404 `NOT_FOUND`); o título continua "Carregando produto…" |
| Id numérico                       | `/produtos/123`                 | "Falha ao carregar produto: 500" (B50)                                                                                                             |
| Rede / rate limit                 | API fora, >120 req/min          | "Failed to fetch" / "Falha ao carregar produto: 429"                                                                                               |
| Sem mídia / 1 mídia               | —                               | O placeholder / sem miniaturas                                                                                                                     |
| Com preço original, destaque, kit | Dados                           | Preço riscado, selos "Destaque" e "KIT"                                                                                                            |
| Sem benefícios / reviews / FAQ    | Dados vazios                    | 4 benefícios padrão; blocos de reviews e FAQ ausentes                                                                                              |
| Cross-sell                        | —                               | "Carregando sugestões…" e depois o bloco, ou nada                                                                                                  |

**Checagens:** `GET …/product-details?slug=` responde 200, sem `download_url` e com `max-age=300`. O título segue o H2. O preço exibido é igual a `product.price`. O número de miniaturas é imagens + vídeos. Sem benefícios no banco, aparecem exatamente 4 `<li>`. No FAQ, o 1º item tem `aria-expanded='true'`. `GET …/cross-sell?productId=<uuid>` responde `{strategy:'co_occurrence'|'same_category', products}` sem o próprio produto. `view_item` é enviado 1 vez. `document.querySelectorAll('h1').length === 0` (registrar). A 375 px, a galeria fica acima dos detalhes.
**Suspeitas:** B21, B49, B50, B51, B139, B140, B141, B142, B143, B144, B145, B146.
**Arquivos:** `src/pages/ProductDetailsPage.jsx`, `src/components/ProductBenefits.jsx`, `src/components/ProductFaq.jsx`, `src/components/ProductReviews.jsx`, `src/components/CrossSellSection.jsx`, `handlers/product-details.js`, `handlers/cross-sell.js`.

#### L13 — Política de Privacidade + "Suas preferências de cookies" (revogação LGPD)

- **Rota:** `/privacidade` (o bloco fica em `/privacidade#cookies`). **Acesso:** público.
- **Como chegar:** "Privacidade" no rodapé ou "Política de Privacidade" no banner, nos Termos ou na barra final. É o **único** ponto da interface para rever ou revogar o consentimento de cookies. **Não fica em `/conta`.**
- **O que aparece:** um artigo de até 768 px com "DOCUMENTOS LEGAIS", o h1 "Política de Privacidade", "Versão vigente: 2026-05-24" e os H2 de "1. Quem somos" a "10. Alterações". Entre as seções 2 e 3 (`LegalPages.jsx:94`) fica o bloco `section#cookies` (aria-label "Preferências de cookies"), com o h3 "Suas preferências de cookies", "Situação atual: <Cookies de marketing ativos \| Apenas cookies essenciais \| Você ainda não escolheu>" (mais " — escolhido em dd/mm/aaaa." quando há data), "Você pode mudar quando quiser, e a mudança vale a partir de agora." e os botões "Apenas essenciais" e "Aceitar todos" (com aria-pressed). A seção 7 cita "Baixar meus dados" e "Excluir minha conta" em `/conta`. Na barra final: "Política de Privacidade", "Termos de Uso" e "Voltar para a home".

| Elemento                                            | Onde         | O que acontece                                                                                                                                               | API                 | Destrutivo? |
| --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ----------- |
| `contato@profamarciarcardoso.com.br` (seções 1 e 7) | texto        | `mailto:`                                                                                                                                                    | —                   | não         |
| "Apenas essenciais" (bloco)                         | `#cookies`   | Grava `denied`. Se o estado anterior era `granted`, **recarrega** a página. Se não era, só atualiza para "Apenas cookies essenciais — escolhido em <data>.". | recarga ao revogar  | não         |
| "Aceitar todos" (bloco)                             | `#cookies`   | Grava `granted` sem recarregar: "Cookies de marketing ativos — escolhido em <data>.". O banner (se estiver visível) **não** some (B34).                      | GA/Pixel só com IDs | não         |
| "Suas preferências de cookies" (`href="#cookies"`)  | seções 4 e 7 | Rola até o bloco, sem recarregar                                                                                                                             | —                   | não         |
| "sua conta"                                         | seção 7      | Vai para `/conta`                                                                                                                                            | —                   | não         |
| Barra final                                         | fim          | `/privacidade`, `/termos` e `/`                                                                                                                              | —                   | não         |

| Estado                     | Como provocar                        | O que se vê                                                                             |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| Sem decisão                | Janela anônima                       | "Situação atual: Você ainda não escolheu." e nenhum aria-pressed true; o banner visível |
| Granted                    | "Aceitar todos"                      | "Cookies de marketing ativos — escolhido em <data>."                                    |
| Revogação                  | Com granted, "Apenas essenciais"     | A página recarrega e mostra "Apenas cookies essenciais"                                 |
| Acesso direto a `#cookies` | Aba nova                             | Deveria rolar até o bloco; como a página é lazy, confira                                |
| Versão mudou               | `lgpd_consent_version='antiga'` + F5 | "Você ainda não escolheu" e o banner de volta                                           |

**Checagens:** o título é "Política de Privacidade · Ateliê da Escola", o canonical termina em `/privacidade` e não há noindex. O texto "Versão vigente: 2026-05-24" aparece. São 10 H2 numerados. `#cookies h3` é "Suas preferências de cookies". Depois de revogar, `performance.getEntriesByType('navigation')[0].type === 'reload'`. Com o banner visível, existem 2 "Aceitar todos": use `#cookies button`.
**Suspeitas:** B34, B147.
**Arquivos:** `src/pages/LegalPages.jsx`, `src/components/ConsentPreferences.jsx`, `src/utils/consent.js`, `src/components/ConsentBanner.jsx`.

#### L14 — Termos de Uso

- **Rota:** `/termos`. **Acesso:** público.
- **Como chegar:** "Termos" no rodapé, "Termos de Uso" no banner ou na barra final da Privacidade.
- **O que aparece:** o layout da Privacidade, sem o bloco de cookies: o h1 "Termos de Uso", "Versão vigente: 2026-05-24" e os H2 de "1. Sobre estes termos" a "10. Contato". Na seção 3, "72 horas" aparece em negrito. Sem API.

| Elemento                  | Onde     | O que acontece      | API | Destrutivo? |
| ------------------------- | -------- | ------------------- | --- | ----------- |
| "Política de Privacidade" | seção 1  | `/privacidade`      | —   | não         |
| "/downloads"              | seção 3  | `/downloads`        | —   | não         |
| "/login"                  | seção 6  | `/login`            | —   | não         |
| `contato@…`               | seção 10 | `mailto:`           | —   | não         |
| Barra final               | fim      | Como na Privacidade | —   | não         |

**Checagens:** o título é "Termos de Uso · Ateliê da Escola" e o canonical termina em `/termos`. São 10 H2. Os links internos não geram uma navegação do tipo document.
**Suspeitas:** nenhuma específica. A seção 3 manda baixar de novo em `/downloads`, o que conflita com B11.
**Arquivos:** `src/pages/LegalPages.jsx`.

#### L15 — Confirmar inscrição na newsletter

- **Rota:** `/confirmar-inscricao?token=<confirmation_token>` (também sem token). **Acesso:** público.
- **Como chegar:** pelo botão do e-mail "Confirme sua inscrição — Ateliê da Escola" (o link usa o `APP_URL`; em dev, troque o host por `http://localhost:5173`) ou pela URL direta.
- **O que aparece:** com Shell, um rótulo ("Aguarde" / "✓ Confirmado" / "Ops…"), o H1 ("Confirmando…" / "Bem-vindo(a) à lista!" / "Não foi possível confirmar"), a mensagem e os botões "Ver produtos" e "Voltar à home".

| Elemento                         | Onde     | O que acontece                                                          | API                                     | Destrutivo? |
| -------------------------------- | -------- | ----------------------------------------------------------------------- | --------------------------------------- | ----------- |
| (automático, com token)          | ao abrir | Consulta a API. No sucesso, grava `confirmed=true` e **anula** o token. | `GET {API}/confirm-subscription?token=` | **sim**     |
| "Ver produtos" / "Voltar à home" | abaixo   | `/produtos` / `/`                                                       | —                                       | não         |

| Estado         | Como provocar                       | O que se vê                                                                                                                   |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sem token      | `/confirmar-inscricao`              | "Ops…" / "Não foi possível confirmar" / "Link inválido. Volte ao seu email e clique no botão de confirmação.", sem requisição |
| Carregando     | Token + Slow 3G                     | "Aguarde" / "Confirmando…" / "Confirmando sua inscrição…"                                                                     |
| Sucesso        | Token válido (<72 h)                | "✓ Confirmado" / "Bem-vindo(a) à lista!" / "Inscrição confirmada! Você vai receber as novidades por email."                   |
| Já confirmado  | Reinscrição de alguém já confirmado | "Você já tinha confirmado antes — está tudo certo!"                                                                           |
| Token inválido | `?token=abc`                        | "Token inválido ou expirado." (404)                                                                                           |
| Expirado       | >72 h                               | "Link de confirmação expirado. Solicite um novo." (410)                                                                       |
| Descadastrado  | Registro com `unsubscribed_at`      | "Inscrição cancelada. Inscreva-se novamente para reativar." (409)                                                             |
| Link reaberto  | F5 depois do sucesso                | "Token inválido ou expirado." (B52)                                                                                           |
| Erro / limite  | 500, 21/min, API fora               | "Erro ao confirmar inscrição.", "Supabase não configurado.", "Muitas tentativas. Aguarde 1 minuto.", "Failed to fetch"        |

**Checagens:** o título é "Confirmar inscrição · Ateliê da Escola" com robots `noindex,nofollow`. Sem token, não há requisição. `?token=abc` gera um GET 404 `{success:false, error:{code:'NOT_FOUND', message:'Token inválido ou expirado.'}}`. Um token válido gera 200 `{success:true, confirmed:true, email}`. Em dev podem sair 2 requisições.
**Suspeitas:** B07, B08, B52, B148.
**Arquivos:** `src/pages/SubscriptionPages.jsx`, `src/services/subscription.js`, `handlers/confirm-subscription.js`.

#### L16 — Cancelar inscrição (descadastro)

- **Rota:** `/desinscrever` (formulário), `/desinscrever?email=<e-mail>` (formulário preenchido) e `/desinscrever?token=<unsubscribe_token>` (automático; o token tem precedência). **Acesso:** público.
- **Como chegar:** "Cancelar inscrição" no rodapé dos e-mails de marketing, "Confirmar cancelamento" do e-mail "Confirme o cancelamento da sua inscrição" ou a URL direta.
- **O que aparece:** com Shell, o rótulo ("Cancelar inscrição" ou "✓ Cancelado"), o H1 ("Cancelar inscrição" ou "Pronto, você foi removido") e a mensagem. Sem token, aparece o formulário com "EMAIL CADASTRADO", o input "seu@email.com" (`#unsub-email`) e o botão vermelho "Confirmar cancelamento", além de "← Voltar à home".

| Elemento                    | Onde       | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                        | API                              | Destrutivo?                           |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------- |
| Campo "Email cadastrado"    | formulário | Vem preenchido com `?email=`; nada é enviado sozinho                                                                                                                                                                                                                                                                                                                                                                                                  | —                                | não                                   |
| "Confirmar cancelamento"    | formulário | `a@b` → "Informe um email válido." sem rede. E-mail válido → "Cancelando…" e depois a mensagem neutra "Se este e-mail estiver na nossa lista, enviamos um link para concluir o cancelamento. Abra o e-mail e clique no link." (200 `{success:true, confirmationRequired:true}`). **Não descadastra na hora**; o título e o formulário continuam. Erros: "Muitas tentativas. Aguarde 1 minuto.", "Erro ao processar cancelamento.", "Failed to fetch". | `POST {API}/unsubscribe {email}` | **sim** (envia e-mail, no máx. 1/dia) |
| (automático, com `?token=`) | ao abrir   | "Cancelando sua inscrição…" e depois "✓ Cancelado" / "Pronto, você foi removido" / "Inscrição cancelada. Você não receberá mais e-mails de marketing." para **qualquer** token (B149)                                                                                                                                                                                                                                                                 | `GET {API}/unsubscribe?token=`   | **sim**                               |
| "← Voltar à home"           | abaixo     | `/`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                | não                                   |

| Estado           | Como provocar           | O que se vê                                           |
| ---------------- | ----------------------- | ----------------------------------------------------- |
| Formulário vazio | `/desinscrever`         | H1 "Cancelar inscrição"                               |
| Pré-preenchido   | `?email=x@y.com`        | O campo preenchido, sem requisição                    |
| Pending          | E-mail válido           | A mensagem neutra em cinza; o formulário continua     |
| Token com erro   | API fora + `?token=abc` | A mensagem de erro, sem formulário e sem retry (B150) |

**Checagens:** o título é "Cancelar inscrição · Ateliê da Escola", com noindex. `?email=` preenche `#unsub-email`. O envio gera 200 com `confirmationRequired:true` e o H1 não muda. `?token=abc` gera 200 `{success:true}` e o H1 "Pronto, você foi removido".
**Suspeitas:** B149, B150.
**Arquivos:** `src/pages/SubscriptionPages.jsx`, `src/services/subscription.js`, `handlers/unsubscribe.js`.

#### L17 — Página não encontrada (404) e rotas removidas

- **Rota:** `*`: qualquer rota não mapeada, incluindo `/painel-acesso-privado-atelie`, `/admin-login`, `/admin/<outra>` e `/avaliar`. A exceção é `/admin/usuarios`, que redireciona para `/admin`. **Acesso:** público.
- **Como chegar:** abrir `/xyz`, `/painel-acesso-privado-atelie` ou `/admin-login`.
- **O que aparece:** com Shell, "404" pequeno em roxo, o h1 "Página não encontrada", "O endereço que você acessou não existe ou foi movido." e os botões "Voltar para a home" e "Ver produtos".

| Elemento             | Onde   | O que acontece | API | Destrutivo? |
| -------------------- | ------ | -------------- | --- | ----------- |
| "Voltar para a home" | centro | `/`            | —   | não         |
| "Ver produtos"       | centro | `/produtos`    | —   | não         |

| Estado                       | Como provocar                                   | O que se vê                                                                                       |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Rota inexistente             | `/xyz`                                          | A 404 com Shell                                                                                   |
| Rotas antigas do login admin | `/painel-acesso-privado-atelie`, `/admin-login` | A 404, sem redirect e sem formulário. **No deploy atual** elas ainda abrem o login antigo (§7.2). |
| `/admin/usuarios`            | Abrir                                           | Não é 404: replace para `/admin`                                                                  |

**Checagens:** o título é "Página não encontrada · Ateliê da Escola", com robots `noindex,nofollow`. O canonical é só a origem. No deploy, o documento responde 200 (soft-404).
**Suspeitas:** B151.
**Arquivos:** `src/pages/NotFoundPage.jsx`, `src/App.jsx`, `src/components/SEO.jsx`, `vercel.json`.

### 3.3 Conta do cliente

> `/login`, `/conta` e `/reset-password` **não têm Shell**: não há header, carrinho nem rodapé. Em `/login` existem **dois** elementos com o texto "Entrar": a aba (`type=button`) e o submit. Clique no submit com `form button[type=submit]`.

#### C01 — Acesso do cliente: modo Entrar

- **Rota:** `/login` (também `/conta` e `/login?mode=login`), sem sessão de cliente e sem `?delete_token`. **Acesso:** público.
- **Como chegar:**
  - pela URL;
  - por "Entrar" no header (≥1024 px) ou no menu mobile;
  - por "Minha conta" no rodapé;
  - por "Entrar" em `/downloads` quando deslogado (leva a `/login?redirect=/downloads`);
  - por "Já tenho conta" no checkout (leva a `/login?mode=login&redirect=/checkout`);
  - por "Voltar para o login" em `/reset-password`.
- **O que aparece:** um card central. No topo, o sobretítulo "Conta" (exibido em caixa alta como CONTA), o h1 "Acesso do cliente", o texto "Entre ou crie sua conta para continuar sua compra." e o link "Voltar para a loja". Logo abaixo, o seletor com os botões "Entrar" e "Cadastrar". **Não existe mais** o bloco "Entrar como: Cliente \| Professor". No modo Entrar:
  - o botão branco "Entrar com Google";
  - o separador "ou";
  - "E-mail" (`#customer-login-email`, placeholder "seu@email.com");
  - "Senha" (`#customer-login-password`, placeholder "Sua senha");
  - a caixa vermelha `#customer-login-error` (role=alert), só quando há erro;
  - "Esqueci minha senha" e o botão roxo "Entrar".

  A aba do navegador mostra "Entrar ou criar conta · Ateliê da Escola", com noindex.

| Elemento                   | Onde                    | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | API                                                                                                                                                                               | Destrutivo? |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| "Voltar para a loja"       | topo                    | `/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                 | não         |
| Aba "Entrar" / "Cadastrar" | seletor                 | Alterna o formulário sem mudar a URL. O erro inline do login continua na tela (B155).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                 | não         |
| "Entrar com Google"        | 1º do formulário        | Vira "Conectando…", desabilita tudo e sai para `<VITE_SUPABASE_URL>/auth/v1/authorize?provider=google&redirect_to=<origem>/login?oauth=google&redirect=<sanitizado>` (PKCE). Sem config: toast "Configuração do Supabase ausente no frontend.". Se o SDK falhar: "Falha ao iniciar login com Google.". **Pare na tela do Google** se não houver uma conta de teste.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Supabase authorize                                                                                                                                                                | não         |
| "E-mail" / "Senha"         | formulário (noValidate) | Sem balão nativo. Com erro, ganham `aria-invalid=true`. Enter envia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                 | não         |
| "Esqueci minha senha"      | abaixo da senha         | Vai para o modo recuperação (C03) e copia o e-mail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                 | não         |
| "Entrar" (submit)          | fim                     | Vazio → caixa vermelha e toast amarelo "Informe e-mail e senha para entrar.", sem requisição. Preenchido → "Entrando…" (e o botão Google também mostra "Conectando…", B153). Sucesso: toast "Login realizado com sucesso." e navegação para o `?redirect` sanitizado (padrão `/checkout`). Erros, na caixa e em toast: 401 "E-mail ou senha incorretos." (inclusive e-mail sem @), 401 "E-mail ainda não confirmado. Verifique sua caixa de entrada.", 429 "Muitas tentativas de login nesta conta. Aguarde 10 minutos e tente novamente." (5 por IP+e-mail em 10 min, contando os sucessos), 429 "Muitas tentativas de login a partir desta conexão. Aguarde um instante." (20 e-mails distintos por IP), 503 "Não foi possível validar esta tentativa agora. Tente de novo em instantes.", 500 "Erro ao autenticar.", 429 de borda do dev "Muitas requisições. Aguarde um instante e tente novamente.", timeout "Tempo de resposta da API excedido. Tente novamente.", "Failed to fetch". | `POST {API}/auth/customer/login` → 200 `{success:true,user:{uid,email,name,role}}` + `Set-Cookie customer_session` (HttpOnly; SameSite=Strict; Max-Age=28800; Secure fora do dev) | não         |
| "Fechar aviso"             | toast                   | Fecha                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                 | não         |

| Estado                              | Como provocar                       | O que se vê                                                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deslogado (padrão)                  | Janela anônima                      | As abas, o Google, "ou", os campos, "Esqueci minha senha" e "Entrar"                                                                                                                                                    |
| Modo pela URL                       | `?mode=register` / `?mode=forgot`   | Abre direto em C02 / C03; o modo acompanha mudanças na query                                                                                                                                                            |
| Enviando                            | Slow 3G                             | "Entrando…" com os campos desabilitados                                                                                                                                                                                 |
| Sessão ainda carregando             | Logado, F5                          | O formulário pisca e depois vira C04                                                                                                                                                                                    |
| Com sessão                          | Logado                              | A área da conta (C04)                                                                                                                                                                                                   |
| Com `?delete_token`                 | Qualquer valor                      | A confirmação de exclusão (C05)                                                                                                                                                                                         |
| Volta do Google (sucesso)           | `?oauth=google&code=…`              | `POST {API}/auth/customer/google/callback {accessToken}`, cookie, limpeza de oauth/code/state e "Você já está conectado". **Não navega** para o redirect (B57). Em dev (StrictMode), o formulário fica até o F5 (B152). |
| Volta do Google (erro ou cancelada) | `?oauth=google&error=access_denied` | Nenhum aviso; `error` continua na URL (B154)                                                                                                                                                                            |
| Admin/master entrando aqui          | Credenciais de admin                | Loga **como cliente** e vai para `/checkout`. O header mostra "Painel admin", sem carrinho. "Painel admin" abre o **formulário** em `/admin` (a sessão admin é outro cookie).                                           |

**Checagens**

- O título é "Entrar ou criar conta · Ateliê da Escola", com noindex.
- **Remoção do seletor:** `document.body.innerText` não contém "Entrar como" nem "Professor", e `document.querySelectorAll('a[href*="admin"], a[href*="painel"]').length === 0`.
- O seletor tem exatamente 2 botões, e a página não tem a casca da loja.
- Envio vazio não faz POST.
- Senha errada → 401 `{success:false,error:{code:'CREDENTIALS_INVALID',message:'E-mail ou senha incorretos.'}}`.
- Login correto → `Set-Cookie customer_session`, e `document.cookie` não contém esse cookie.
- `/login?redirect=/downloads` termina em `/downloads`. `redirect=https://evil.com`, `//evil.com` e `/%5Cevil.com` terminam em `/checkout`.
- A 375 px não há rolagem horizontal.

**Suspeitas:** B55, B57, B152, B153, B154, B155.
**Arquivos:** `src/pages/CustomerAuthPage.jsx`, `src/providers/AuthProvider.jsx`, `src/services/customer-auth.js`, `src/services/supabase-browser.js`, `handlers/auth/customer/login.js`, `lib/customer-auth-handlers.js`, `lib/customer-session.js`, `lib/rate-limit.js`.

#### C02 — Acesso do cliente: modo Cadastrar

- **Rota:** `/login?mode=register` ou a aba "Cadastrar", sem sessão. **Acesso:** público.
- **O que aparece:** o mesmo card, **sem** o Google e sem "Esqueci minha senha". Os campos são:
  - "Nome" (`#customer-register-name`, "Seu nome");
  - "E-mail" (`#customer-register-email`);
  - "Senha" (`#customer-register-password`, minLength 8), com a ajuda "Use ao menos 8 caracteres, com letra maiúscula, minúscula e número.".

  Abaixo ficam a caixa `#customer-register-error` e o botão "Criar conta".

| Elemento              | Onde                    | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | API                                                       | Destrutivo?                                                          |
| --------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Abas                  | seletor                 | Alternam; o que foi digitado em cada formulário fica guardado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                         | não                                                                  |
| Nome / E-mail / Senha | formulário (noValidate) | Texto livre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                         | não                                                                  |
| "Criar conta"         | fim                     | Erros locais (caixa + toast amarelo, sem requisição): "Preencha nome, e-mail e senha para cadastrar.", "A senha precisa ter ao menos 8 caracteres.", "A senha deve ter letra maiúscula, minúscula e número.". Se passar: "Cadastrando…". `verificationRequired` → toast amarelo "Conta criada. Verifique seu e-mail para confirmar o cadastro." e o formulário continua preenchido. Com `user` → toast "Conta criada com sucesso.", cookie e navegação para o redirect. Erros do servidor: "Não foi possível concluir o cadastro. Verifique os dados e tente novamente.", "Senha fraca. …", "E-mail inválido. Verifique e tente novamente.", "Muitas tentativas. Aguarde alguns minutos e tente novamente.", "Não foi possível criar a conta. …", 429 "Muitas tentativas de cadastro. Aguarde 10 minutos e tente novamente.", 503, 500 "Erro ao criar conta.". | `POST {API}/auth/customer/register {name,email,password}` | **sim** (cria um usuário real no Supabase Auth e pode enviar e-mail) |

| Estado                | Como provocar                       | O que se vê                                               |
| --------------------- | ----------------------------------- | --------------------------------------------------------- |
| Validação local       | Senha "abc" / "abcdefgh"            | A caixa + o toast, sem requisição                         |
| Confirmação exigida   | Supabase com "Confirm email" ligado | Só o toast de 2,4 s (B58)                                 |
| Conta criada e logada | "Confirm email" desligado           | O toast verde e `/checkout`                               |
| E-mail já cadastrado  | E-mail existente                    | Nenhum texto revela que o e-mail existe (anti-enumeração) |

**Checagens:** não há Google nem "Esqueci minha senha". O texto de ajuda é exato. "abc" e "abcdefgh" não geram POST. O cadastro válido (use um e-mail descartável) responde 200 com `verificationRequired:true` ou `user`.
**Suspeitas:** B58, B59, B156.
**Arquivos:** `src/pages/CustomerAuthPage.jsx`, `handlers/auth/customer/register.js`, `lib/customer-auth-handlers.js`.

#### C03 — Acesso do cliente: Esqueci minha senha

- **Rota:** `/login?mode=forgot` ou "Esqueci minha senha". **Acesso:** público.
- **O que aparece:** o mesmo cabeçalho, **sem abas** e sem o Google. Tem o campo "E-mail" (`#customer-recovery-email`), o botão "Enviar link de recuperação" e "← Voltar para login". Não há caixa de erro: todo o feedback é por toast.

| Elemento                     | Onde        | O que acontece                                                                                                                                                                                                                                                                                                                                               | API                                                                                                                 | Destrutivo?           |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| "E-mail"                     | único campo | Vem preenchido quando se chega pelo botão                                                                                                                                                                                                                                                                                                                    | —                                                                                                                   | não                   |
| "Enviar link de recuperação" | abaixo      | Vazio → toast amarelo "Informe um e-mail para receber o link de recuperação.". Sem config → "Configuração do Supabase ausente no frontend.". Com e-mail → "Enviando…" e o toast verde "Enviamos um link de recuperação. Verifique sua caixa de entrada." (também para e-mail inexistente). Qualquer erro → "Não foi possível enviar o link de recuperação.". | `POST <VITE_SUPABASE_URL>/auth/v1/recover?redirect_to=<origem>/reset-password?redirect=/checkout` (ou `/downloads`) | **sim** (e-mail real) |
| "← Voltar para login"        | abaixo      | Volta ao modo Entrar                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                   | não                   |

**Checagens:** o `redirect_to` termina em `/reset-password?redirect=%2Fcheckout` (ou `%2Fdownloads`, se o `/login` tinha `?redirect=/downloads`). O link só funciona no **mesmo navegador** que fez o pedido, porque o `code_verifier` PKCE fica no localStorage.
**Suspeitas:** B60, B157.
**Arquivos:** `src/pages/CustomerAuthPage.jsx`, `src/services/supabase-browser.js`.

#### C04 — Área da conta (conectado): exportar dados e pedir exclusão (passo 1)

- **Rota:** `/conta` ou `/login` com sessão de cliente e sem `?delete_token` (o `?mode` é ignorado). **Acesso:** cliente logado.
- **Como chegar:** "Conta" no header ou no menu, "Minha conta" no rodapé, ou `/conta`. **Instale o stub de confirm (F03) antes de "Excluir minha conta".**
- **O que aparece:** o mesmo cabeçalho, sem abas, e três caixas:
  1. **Verde:** h3 "Você já está conectado", "Sessão ativa para **<e-mail>**." e o botão-link "Ir para checkout".
  2. **Cinza:** h3 "Baixar meus dados", "Um arquivo JSON com seus pedidos, itens, inscrição na newsletter e carrinhos salvos (LGPD, art. 18). O download acontece direto no seu navegador." e o botão "Baixar meus dados".
  3. **Rosa:** h3 "Excluir minha conta", "Remove seus dados pessoais (LGPD). Pedidos são mantidos de forma anonimizada para fins fiscais. Ação irreversível." e o botão "Excluir minha conta".

  Não tem "Sair", perfil, troca de senha nem Shell. **A revogação de cookies não fica aqui:** fica em L13.

| Elemento                                                      | Onde        | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | API                                                                                                    | Destrutivo?                    |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| "Voltar para a loja"                                          | topo        | `/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                      | não                            |
| "Ir para checkout"                                            | caixa verde | `/checkout`, mesmo com `?redirect=/downloads` (B159)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                      | não                            |
| "Baixar meus dados"                                           | caixa cinza | "Preparando…". Sucesso: download de `meus-dados-atelie-AAAA-MM-DD.json` e o toast "Download iniciado.". O JSON tem `formato:'1'`, `geradoEm`, `titular{email,nome,contaCriadaEm}`, `pedidos[]` (com `downloads[]` **sem** o valor do token), `newsletter`, `carrinhosAbandonados[]` e `naoIncluido`. Erros: 401 "Faça login para exportar seus dados.", 401 "Não foi possível confirmar sua identidade. Faça login novamente.", 429 "Muitas exportações seguidas. Aguarde alguns minutos." (5 a cada 5 min), 500 "Supabase não configurado." / "Não foi possível exportar seus dados agora. Tente novamente.".                       | `GET {API}/me-export-data` → 200, `Cache-Control: no-store, max-age=0`, `Referrer-Policy: no-referrer` | não (grava `security_event`)   |
| "Excluir minha conta" (existe também um h3 com o mesmo texto) | caixa rosa  | `window.confirm("Tem certeza? Enviaremos um e-mail para confirmar a exclusão definitiva da sua conta.")`. Cancelar: nada acontece. OK: "Enviando…", o toast "Enviamos um e-mail para confirmar a exclusão da sua conta. O link vale 1 hora.", o texto "Verifique seu e-mail para confirmar a exclusão." e o botão desabilitado até recarregar. Em dev, o console mostra "[dev] link de confirmação de exclusão: <APP_URL>/conta?delete_token=…" (troque o host ngrok por `http://localhost:5173`). Erros: 401 "Faça login para excluir sua conta.", 429 "Muitas tentativas. Aguarde 1 minuto.", 500. **Nada é apagado neste passo.** | `POST {API}/me-delete-account {}`                                                                      | **sim** (envia um e-mail real) |

| Estado                    | Como provocar              | O que se vê                                             |
| ------------------------- | -------------------------- | ------------------------------------------------------- |
| Conectado                 | Logar e abrir `/conta`     | As três caixas; `/conta` e `/login` mostram o mesmo     |
| Exportando                | Clicar                     | "Preparando…"                                           |
| Diálogo nativo sem stub   | "Excluir minha conta"      | A caixa do Chrome bloqueia a página: use o stub         |
| Exclusão solicitada       | Confirmar                  | O toast, o texto e o botão desabilitado                 |
| Sessão expirada           | Cookie apagado, sem F5     | Os botões dão 401 em toast; o card continua "conectado" |
| Admin logado como cliente | Login de admin em `/login` | O mesmo card, com exclusão disponível (B158)            |

**Checagens:** a caixa verde tem "Sessão ativa para <e-mail>.". Não há "Sair". O export tem os headers `no-store`/`no-referrer` e não traz `token` dentro de `pedidos[].downloads`. Com o stub em `false`, `__confirmLog` registra o texto e não sai POST. Com o stub em `true` (só em conta descartável), sai 1 POST `{}` → 200. Depois do F5, a conta continua ativa.
**Suspeitas:** B18, B61, B62, B158, B159, B160, B161, B219.
**Arquivos:** `src/pages/CustomerAuthPage.jsx`, `src/services/customer-auth.js`, `handlers/me-export-data.js`, `handlers/me-delete-account.js`, `lib/email-sender.js`.

#### C05 — Confirmar exclusão da conta (passo 2, link do e-mail)

- **Rota:** `/conta?delete_token=<token>` (também `/login?delete_token=`). **Acesso:** misto.
- **Como chegar:** o botão "Excluir minha conta" do e-mail "Confirme a exclusão da sua conta — Ateliê da Escola" (vale 1 h). Em dev, use a URL do console. **Para um teste seguro, use `/conta?delete_token=invalido`.**
- **O que aparece:** o cabeçalho padrão e uma caixa rosa com o h3 "Confirmar exclusão de conta", o texto "Esta ação remove seus dados pessoais de forma **permanente e irreversível**. Seus pedidos são mantidos anonimizados apenas para fins fiscais." e o botão vermelho "Excluir permanentemente". A caixa aparece com **qualquer** token, logado ou não, e **não abre diálogo de confirmação**.

| Elemento                  | Onde       | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | API                                                                                               | Destrutivo?           |
| ------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------- |
| "Excluir permanentemente" | caixa rosa | "Excluindo…". Sucesso: toast "Conta excluída. Sentiremos sua falta.", logout e navegação para `/`. Erros: 400 "Link inválido ou expirado. Solicite a exclusão novamente.", 401 "Faça login na conta que deseja excluir para confirmar a exclusão.", 409 "Confirme seu e-mail antes de excluir a conta. Se o problema persistir, fale com o suporte.", 500 "Não foi possível excluir a conta. Tente novamente." / "Não foi possível concluir a exclusão dos seus dados. Nada foi apagado — tente novamente.", 429. **No sucesso:** adota pedidos órfãos, anonimiza pedidos (`deleted-<hash>@anonimizado.local`), apaga `download_tokens` e `abandoned_carts`, zera `analytics_events.customer_email`, apaga o usuário do Auth (em cascata), descadastra da newsletter e limpa o cookie. | `POST {API}/me-delete-account {token}` (o token vai no corpo) + `POST {API}/auth/customer/logout` | **sim, irreversível** |
| "Voltar para a loja"      | topo       | `/`, sem excluir nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                 | não                   |

| Estado                     | Como provocar            | O que se vê                                                  |
| -------------------------- | ------------------------ | ------------------------------------------------------------ |
| Token inválido (seguro)    | `?delete_token=invalido` | 400 e o toast "Link inválido ou expirado. …"; nada é apagado |
| Deslogado com token válido | Janela anônima           | Toast 401, sem formulário de login (B63)                     |
| Logado como o dono         | Link real                | Exclui e vai para `/`                                        |

**Checagens:** "permanente e irreversível" está em `<strong>`. O token vai no corpo. `?delete_token=invalido` → 400 `{error:{code:'VALIDATION_FAILED',…}}`. `window.confirm` não é chamado.
**Suspeitas:** B63, B162, B163.
**Arquivos:** `src/pages/CustomerAuthPage.jsx`, `src/services/customer-auth.js`, `handlers/me-delete-account.js`.

#### C06 — Redefinir senha

- **Rota:** `/reset-password` (`?redirect=/downloads|/checkout`, `&code=<pkce>` ou `#access_token=…`). **Acesso:** público.
- **Como chegar:** o link do e-mail de recuperação (C03). Nenhum link da interface leva para cá.
- **O que aparece:** sem Shell e sem SEO (a aba herda o título anterior). O card tem "Conta", o h1 "Redefinir senha", "Escolha uma nova senha para continuar acessando sua conta.", o link "Voltar para o login", os campos "Nova senha" (`#new-password`, required, minLength 8, com a ajuda de complexidade) e "Confirmar nova senha" (`#confirm-password`), o botão "Salvar nova senha" e a nota "Após concluir, você será redirecionado para **Checkout**." (ou "**Downloads**").

| Elemento              | Onde                        | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                       | API                                               | Destrutivo?             |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------- |
| "Voltar para o login" | topo                        | `/login`                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                 | não                     |
| Campos                | formulário (SEM noValidate) | Vazio ou com menos de 8 caracteres: balão nativo                                                                                                                                                                                                                                                                                                                                                                     | —                                                 | não                     |
| "Salvar nova senha"   | abaixo                      | Toasts amarelos: "A senha deve ter letra maiúscula, minúscula e número.", "As senhas digitadas não conferem.". Sem config: "Configuração do Supabase ausente no frontend.". Se passar: "Salvando…". Sucesso: toast "Senha redefinida com sucesso." e replace para `/checkout` ou `/downloads`. Falha: a mensagem crua do Supabase em inglês (ex.: "Auth session missing!") ou "Não foi possível atualizar a senha.". | `PUT <VITE_SUPABASE_URL>/auth/v1/user {password}` | **sim** (troca a senha) |

| Estado           | Como provocar                | O que se vê                                                                                                   |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Validando o link | Abrir                        | Campos desabilitados e o botão já mostrando "Salvando…" (B164)                                                |
| Sem token        | Sem parâmetros               | Toast amarelo "Abra o link enviado por e-mail para concluir a redefinição."; o formulário fica editável (B64) |
| Link válido      | Link real no mesmo navegador | Toast "Defina uma nova senha para sua conta." (mas veja B15)                                                  |
| Link inválido    | `?code=abc`                  | Toast vermelho do SDK ou "Não foi possível validar o link de recuperação."                                    |

**Checagens:** a nota diz "Checkout" (ou "Downloads" com `?redirect=/downloads`; `?redirect=/produtos` também mostra "Checkout"). Os campos com 7 caracteres só geram o balão nativo. Ao abrir `?code=abc`, observe se sai um `POST …/auth/customer/google/callback` e se o `?code` some (sintoma de B15).
**Suspeitas:** B15, B60, B64, B125, B164.
**Arquivos:** `src/pages/ResetPasswordPage.jsx`, `src/services/supabase-browser.js`, `src/services/customer-auth.js`, `src/providers/AuthProvider.jsx`.

### 3.4 Compra e pós-compra

#### C07 — Checkout ("Finalizar compra")

- **Rota:** `/checkout`. **Acesso:** misto.
- **Como chegar:**
  - "Finalizar compra" no drawer ou "Comprar agora" no produto;
  - "Ir para checkout" em `/downloads` ou `/conta`;
  - pela URL;
  - depois do login com `redirect=/checkout`;
  - pelo e-mail de carrinho abandonado.
- **O que aparece:** com Shell, em duas colunas.
  - **Resumo:** "Resumo do Pedido", o h3 "Seu Carrinho", o selo "Seguro" e os itens (nome, preço e "Remover"), ou "Seu carrinho está vazio." + "Ver produtos". Depois vêm o acordeão "Tem um cupom?", os totais ("Subtotal" e "Desconto −R$ X" só com desconto; "Total" sempre) e a nota "Após a aprovação, seus arquivos ficam disponíveis automaticamente na área de downloads.".
  - **Pagamento:** "Finalização segura", o h3 "Dados para pagamento" e o stepper "Processando / Confirmando / Liberado" ("Geração e abertura da cobrança." / "Aguardando confirmação do pagamento." / "Acesso imediato aos arquivos.").
  - **Identidade:** logado, "Comprando como <e-mail>". Convidado: "Acelere preenchendo seus dados pela sua conta Google — ou continue como convidado preenchendo nome e e-mail abaixo." + "Continuar com Google" + "Já tenho conta".
  - **Formulário:** "Nome completo" (`#checkout-name`) e "E-mail" (`#checkout-email`), o botão "Ir para pagamento", o link "Abrir pagamento", "Cancelar e tentar de novo", os selos "Compra segura", "Pagamento verificado" e "Download garantido" e a caixa de status.

  Não há h1 nem h2. A aba mostra "Finalizar compra · Ateliê da Escola", com noindex.

| Elemento                                        | Onde           | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | API                                                                                                                                                                             | Destrutivo? |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| "Ver produtos"                                  | carrinho vazio | `/produtos`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                               | não         |
| "Remover" (item)                                | resumo         | Remove o item, recalcula o total e **descarta o cupom**. Não fica desabilitado durante o processamento (B170).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `track-event remove_from_cart`                                                                                                                                                  | não         |
| "Tem um cupom?"                                 | resumo         | Abre o painel do cupom; desabilitado durante o processamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                               | não         |
| Código do cupom (placeholder "DIGITE O CÓDIGO") | painel         | Converte para maiúsculas; Enter aplica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                               | não         |
| "Aplicar"                                       | painel         | "Validando…". Sucesso: bloco verde "Cupom aplicado" com "<CÓDIGO> · −R$ X,XX" e "Remover". Erros: 422 "Cupom não encontrado.", "Este cupom não está mais ativo.", "Este cupom ainda não está disponível.", "Este cupom expirou.", "Este cupom já atingiu o limite de uso.", "Pedido mínimo para este cupom é R$ NN.NN.", "Os itens do carrinho não são elegíveis para este cupom."; 400 "Código de cupom inválido." / "Quantidade de itens inválida."; 429 "Muitas tentativas. Aguarde 1 minuto."; 500 "Erro ao validar cupom."; "Cupom inválido."; "Failed to fetch"; timeout. **Não consome** o uso do cupom.                                                                                                                                                                                                                                                                                                                                                                                   | `POST {API}/validate-coupon {code, items}`                                                                                                                                      | não         |
| "Remover" (cupom)                               | bloco verde    | Remove o cupom; o total volta ao cheio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                               | não         |
| "Continuar com Google"                          | convidado      | "Abrindo Google…" e o OAuth. A volta para em "Você já está conectado" (B57).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Supabase authorize                                                                                                                                                              | não         |
| "Já tenho conta"                                | convidado      | `/login?mode=login&redirect=/checkout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                               | não         |
| "Nome completo"                                 | formulário     | No envio: "Informe o nome completo para continuar." / "Informe pelo menos 3 caracteres no nome."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                               | não         |
| "E-mail"                                        | formulário     | No envio: "Informe um e-mail válido para receber a confirmação." / "Digite um e-mail válido.". **Efeito colateral:** ~1,5 s depois de um e-mail válido (ou ao abrir, se logado), grava o carrinho abandonado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `POST {API}/abandoned-cart` → 204                                                                                                                                               | **sim**     |
| "Ir para pagamento"                             | CTA            | Desabilitado com o carrinho vazio. Com campos inválidos, mostra os erros sem requisição. Se passar: "Processando…", o status "Estamos preparando seu pagamento…" e "Cancelar e tentar de novo". Sucesso: **nova aba** com o Checkout Pro, o toast "Pagamento gerado. Estamos aguardando a confirmação.", o status "Aguardando confirmação do pagamento. Use o botão "Abrir pagamento" caso a cobrança não tenha aberto — vamos te avisar aqui assim que aprovar.", o stepper em "Confirmando", `lastOrderId` (`ORD-<ts>-<32 hex>`) e `lastOrderEmail`, e o polling. Erros: "Produto <uuid> não encontrado", "Produto <nome> não está disponível", "Item inválido: productId é obrigatório.", "Items são obrigatórios", "Quantidade de itens inválida.", "Email do cliente é obrigatório", "Email inválido.", "Nome muito longo.", 429 "Muitas tentativas de pagamento. Aguarde 1 minuto.", 500 "Erro ao criar pagamento", "URL de pagamento não retornada pela API.", timeout, "Failed to fetch". | `POST {API}/create-payment {items, customer, attribution, couponCode}` (cria o pedido pending e **reserva o uso do cupom**) + `POST {API}/verify-payment` a cada 4 s (até 150×) | **sim**     |
| "Abrir pagamento"                               | CTA            | Abre o initPoint numa aba nova (recurso quando o popup é bloqueado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                               | não         |
| "Cancelar e tentar de novo"                     | CTA            | Para o polling, reabilita o formulário e mostra "Você pode revisar seus dados e tentar de novo. Seu carrinho continua salvo.". O pedido continua pending e a preferência continua **pagável** (B73).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                               | não         |

| Estado              | Como provocar                     | O que se vê                                                                                                                                                               |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carrinho vazio      | `localStorage.removeItem('cart')` | "Seu carrinho está vazio.", Total "R$ 0,00" e o botão desabilitado. Um cupom ainda pode ser aplicado (B173).                                                              |
| Convidado com itens | Janela anônima                    | O bloco do Google; o stepper em "Preencha seus dados e avance para o pagamento."                                                                                          |
| Logado              | Cliente + item                    | "Comprando como <e-mail>" e `POST /abandoned-cart` ~1,5 s depois                                                                                                          |
| Aguardando          | Depois de "Ir para pagamento"     | O passo 2 ativo, mas a descrição fica em "Estamos preparando seu pagamento…" (B169)                                                                                       |
| 429 no polling      | Estourar o verify-payment         | "Muita gente confirmando pagamento agora. Continuamos verificando o seu — só um pouco mais devagar. Pode deixar esta tela aberta."                                        |
| Aprovado            | Só em sandbox confirmado          | Toast "Pagamento aprovado.", status "Tudo certo! Pagamento aprovado. Levando você para a área de downloads…" e ida para `/downloads?order=<ORD>&email=<e-mail>&success=1` |
| Recusado            | Só via webhook                    | "Não conseguimos confirmar este pagamento. Você pode tentar de novo com outro método sem perder o carrinho." + toast âmbar "Pagamento não confirmado."                    |
| Timeout             | 150 consultas                     | "Demorou mais do que esperávamos para confirmar. Você pode acompanhar a qualquer momento em Meus Downloads — ninguém perde o pedido." (sem link)                          |
| Popup bloqueado     | —                                 | Nenhuma aba abre; "Abrir pagamento" funciona                                                                                                                              |
| Cupom descartado    | 2 itens + cupom + remover um item | O bloco verde some, mas sobra "Desconto aplicado: R$ X" (B75)                                                                                                             |

**Checagens:** o título tem noindex. Com o carrinho vazio, o submit fica disabled. O stepper tem 3 `<li>`. O total é a soma dos itens. Campos vazios não geram `/create-payment`. "abc" vira "ABC". Um cupom inexistente dá 422 `COUPON_NOT_FOUND`. `/abandoned-cart` só sai ~1,5 s depois de um e-mail válido. Logado, o e-mail vem preenchido. "Já tenho conta" tem o href correto. (Só no teste autorizado, F35) Compare o `total` da resposta de `/create-payment` com o Total da tela. Não há h1 (registrar). A 375 px não há rolagem horizontal.
**Suspeitas:** B09, B10, B29, B57, B69, B70, B71, B72, B73, B74, B75, B76, B143, B169, B170, B171, B172, B173, B174.
**Arquivos:** `src/pages/CheckoutPage.jsx`, `src/components/CouponField.jsx`, `src/components/StatusStepper.jsx`, `src/services/checkout.js`, `src/services/coupons.js`, `handlers/create-payment.js`, `handlers/validate-coupon.js`, `handlers/verify-payment.js`, `handlers/abandoned-cart.js`, `lib/coupons.js`, `validation/payment.schemas.js`.

#### C08 — Retorno do Mercado Pago (`/checkout?status=failure` / `?status=pending`)

- **Rota:** `/checkout?status=failure` e `?status=pending` (as `back_urls`; o sucesso vai para `/downloads?order=<ORD>`). **Acesso:** misto.
- **Como chegar:** voltar ao site pela página do MP depois de uma recusa ou pendência (acontece na aba do MP), ou pela URL.
- **O que aparece:** **exatamente o `/checkout` comum**, sem aviso, com o stepper no passo 1 e sem polling do pedido anterior. Em dev, com o `APP_URL` no ngrok, a aba de retorno pode mostrar um erro do túnel ou o JSON "Frontend legado removido…".
- **Elementos:** os mesmos do C07. "Ir para pagamento" cria um **novo** pedido.

**Checagens:** screenshots de `/checkout`, `?status=failure` e `?status=pending` saem idênticos.
**Suspeitas:** B09, B18.
**Arquivos:** `src/pages/CheckoutPage.jsx`, `lib/mercadopago-config.js`.

#### C09 — Mercado Pago Checkout Pro (externo, nova aba): PONTO DE PARADA

- **Rota:** o initPoint, ex.: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=<id>`. **Acesso:** público.
- **Como chegar:** C07 → "Ir para pagamento" ou "Abrir pagamento".
- **O que aparece:** a página do MP, com itens e preço **do banco** (o desconto é rateado), o e-mail pré-preenchido, pagamento à vista (`installments: 1`) e o descritor "ATELIE_DA_ESCOLA".

| Elemento                        | Onde         | O que acontece                                                                                                                                                     | API     | Destrutivo? |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------- |
| Campos de cartão / Pix / boleto | página do MP | **NÃO PREENCHER.** A credencial efetiva é `APP_USR-` (B17): trate como **cobrança real**.                                                                          | MP      | **sim**     |
| "Pagar"                         | página do MP | Só em sandbox confirmado pelo dono: titular APRO aprova, OTHE recusa, CONT fica pendente. Em runtime de produção, um pagamento com `live_mode=false` nunca aprova. | webhook | **sim**     |
| "Voltar ao site"                | resultado    | Aprovado → `APP_URL/downloads?order=<ORD>`; recusado → `APP_URL/checkout?status=failure`; pendente → `?status=pending`                                             | —       | não         |

**Checagens:** o host é `mercadopago.com.br` (nunca aparece `sandbox.`, B71). O total bate com a resposta de `/create-payment`. É à vista, só 1×. **Tire o screenshot e feche a aba sem pagar.**
**Suspeitas:** B17, B71.
**Arquivos:** `lib/mercadopago-config.js`, `handlers/create-payment.js`, `lib/payment-integrity.js`.

#### C10 — Meus Downloads (pós-compra)

- **Rota:** `/downloads` (`?order=<código>`, `&email=`, `&success=1`). **Acesso:** misto.
- **Como chegar:**
  - "Meus produtos" no header (cliente que não é admin);
  - "Downloads" no rodapé;
  - o redirecionamento do checkout aprovado;
  - a `back_url` de sucesso do MP (sem e-mail);
  - a URL direta.
- **O que aparece:** com Shell.
  - O sobretítulo "Pós-compra", o h1 "Meus Downloads" e "Seu histórico e seus arquivos em um só lugar.".
  - Com `success=1`, o banner verde "Pagamento confirmado." / "Seu pedido foi recebido. Se o status estiver aprovado, os botões de download aparecem abaixo.".
  - O card com "Pedido #<código>" ou "Nenhum pedido selecionado", o status e "Atualizar", mais o stepper "Processando / Confirmando / Liberado".
  - O bloco da conta: logado, "Seus pedidos (<e-mail>)" + "Atualizar"; deslogado, "Para ver o histórico dos seus pedidos e baixar os arquivos, entre na sua conta." + "Entrar".
  - As caixas "Falha ao carregar pedido", de pendente e de não aprovado; o "Histórico de pedidos" ("Abrir pedido") e os "Arquivos disponíveis" ("Baixar").
  - O rodapé com "Voltar para produtos" e "Ir para checkout".

  A aba mostra "Meus downloads · Ateliê da Escola", com noindex.

| Elemento                                    | Onde                   | O que acontece                                                                                                                                                                                                                                                       | API                                                                                        | Destrutivo?               |
| ------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| "Atualizar" (pedido)                        | ao lado de "Pedido #…" | Sem pedido: só reescreve o status. Pedido sem e-mail: "Para consultar este pedido, informe o e-mail usado na compra abaixo." (**não existe campo**, B12). Com pedido e e-mail: "Atualizando…" e a consulta. **Não gera links novos** e não retoma o polling pausado. | `POST {API}/verify-payment {orderId,email}` (pode **aprovar** o pedido se o MP já aprovou) | **sim (condicional)**     |
| "Atualizar" (Seus pedidos)                  | logado                 | "Carregando seus pedidos..." e depois "Encontramos N pedido(s).", "Nenhum pedido encontrado na sua conta.", "Sua sessão expirou. Faça login novamente para ver seus pedidos." ou "Erro ao buscar pedidos do cliente".                                                | `GET {API}/customer-orders` (só o cookie; adota pedidos órfãos)                            | não                       |
| "Entrar"                                    | deslogado              | `/login?redirect=/downloads`                                                                                                                                                                                                                                         | —                                                                                          | não                       |
| "Abrir pedido"                              | histórico              | `/downloads?order=<código>&email=<e-mail>` (o e-mail vai na URL, B67)                                                                                                                                                                                                | `POST {API}/verify-payment`                                                                | não                       |
| "Baixar" (`<a target=_blank>`)              | arquivos               | Abre `{API}/download?token=<64 hex>` numa aba nova (C11). O 1º acesso gera um 302 para o Storage; os seguintes dão 401 "Token já utilizado".                                                                                                                         | `GET {API}/download?token=`                                                                | **sim** (consome o token) |
| "Voltar para produtos" / "Ir para checkout" | rodapé                 | `/produtos` / `/checkout`                                                                                                                                                                                                                                            | —                                                                                          | não                       |

| Estado                         | Como provocar              | O que se vê                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deslogado sem pedido           | Anônimo, sem `lastOrderId` | "Nenhum pedido selecionado", o status "Nenhum pedido selecionado. Entre na sua conta para ver o histórico de pedidos e downloads." e "Entrar"                                                                                                                                                                                                              |
| `?order` sem e-mail, deslogado | `/downloads?order=ORD-x`   | "Pedido #ORD-x" + a frase "informe o e-mail… abaixo", sem campo                                                                                                                                                                                                                                                                                            |
| Carregando                     | Rede lenta                 | "Carregando as informações do seu pedido…" + skeleton                                                                                                                                                                                                                                                                                                      |
| Pedido inexistente             | `?order=XYZ&email=a@b.com` | "Falha ao carregar pedido" + "Pedido não encontrado" (404)                                                                                                                                                                                                                                                                                                 |
| E-mail sem @                   | `?email=abc`               | "email é obrigatório" (400)                                                                                                                                                                                                                                                                                                                                |
| Pendente                       | Pedido pending             | "Estamos confirmando seu pagamento. Vamos liberar os arquivos assim que aprovar — sem necessidade de recarregar." e a caixa âmbar "Pagamento ainda em análise. …". Polling a cada 10 s (12×) e depois "Pausamos a verificação automática. Clique em Atualizar quando quiser tentar de novo.". Se aprovar: toast "Pagamento aprovado. Downloads liberados." |
| Aprovado com arquivos          | approved + tokens          | "Tudo certo. Seus arquivos estão liberados abaixo.", stepper em "Liberado", "Baixar" + a nota "Cada link é de uso único e expira por segurança. Se um download não abrir ou o link já tiver sido usado, clique em Atualizar acima para gerar novos links — ou nos chame por e-mail." (a promessa é falsa, B11). `lastOrderId` é removido.                  |
| Aprovado sem tokens            | —                          | Caixa azul "Tudo certo com o pagamento — estamos preparando os arquivos. Em alguns segundos clique em Atualizar."                                                                                                                                                                                                                                          |
| Recusado                       | rejected/cancelled/failed  | "Não conseguimos confirmar este pagamento. …" + a caixa rosa "Este pedido não foi aprovado. …"                                                                                                                                                                                                                                                             |
| Rate limit                     | Muitas consultas           | "Muitas verificações deste pedido. Vamos tentar de novo em instantes." / "Muitas consultas de pedidos diferentes a partir desta conexão. Aguarde um instante."                                                                                                                                                                                             |
| Logado sem pedido              | —                          | O texto "…Entre na sua conta…" contradiz "Seus pedidos" (B65)                                                                                                                                                                                                                                                                                              |
| Depois de "Sair"               | Com um pedido aberto       | O histórico some, mas o pedido e os botões "Baixar" continuam (B67)                                                                                                                                                                                                                                                                                        |
| `lastOrderId` antigo           | Cobrança não paga          | Todo `/downloads` sem `?order` reabre esse pedido (B66)                                                                                                                                                                                                                                                                                                    |

**Checagens:** o título tem noindex. Deslogado, "Entrar" tem href `/login?redirect=/downloads`. O stepper tem exatamente 1 `aria-current='step'`. `GET /customer-orders` não leva e-mail na URL. "Abrir pedido" gera o POST com `{orderId,email}`. O href de "Baixar" termina em `/download?token=` + 64 hex. No 1º clique: 302 com `X-Download-Mode: signed-storage`, `Referrer-Policy: no-referrer` e `Cache-Control: no-store`. No 2º: 401 `DOWNLOAD_TOKEN_USED`. Pendente: consulta a cada ~10 s e pausa em ~2 min.
**Suspeitas:** B11, B12, B65, B66, B67, B165, B166, B167, B168.
**Arquivos:** `src/pages/DownloadsPage.jsx`, `src/services/downloads.js`, `src/components/StatusStepper.jsx`, `handlers/verify-payment.js`, `handlers/customer-orders.js`, `handlers/download.js`.

#### C11 — Entrega do arquivo (aba nova do "Baixar")

- **Rota:** `{API}/download?token=<token>`. **Acesso:** público.
- **O que aparece:** não é uma tela React. No sucesso, um 302 para `*.supabase.co/storage/v1/object/sign/...` (válido por 300 s). No erro, JSON cru `{"success":false,"error":{"code":…,"message":…}}`, sem link de volta. Não tem elementos clicáveis.

| Estado                     | Como provocar                      | Resposta                                                                                      |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Sucesso                    | Token válido, não usado, <72 h     | 302 + `X-Download-Mode: signed-storage` + `download_logs`                                     |
| Sem token                  | `/api/download`                    | 400 `VALIDATION_FAILED` "Token é obrigatório"                                                 |
| Inválido                   | `?token=abc`                       | 401 `DOWNLOAD_TOKEN_INVALID` "Token inválido"                                                 |
| Já usado                   | 2º acesso                          | 401 `DOWNLOAD_TOKEN_USED` "Token já utilizado"                                                |
| Expirado                   | >72 h                              | 401 `DOWNLOAD_TOKEN_EXPIRED` "Token expirado"                                                 |
| Produto ou arquivo ausente | —                                  | 404 "Produto não encontrado" / "Link de download não encontrado"                              |
| URL fora do Storage        | —                                  | 500 "Arquivo indisponível. Fale com o suporte." (o token não é consumido)                     |
| Falha ao assinar           | —                                  | 502 "Não foi possível preparar o download. Tente novamente." (o token é devolvido)            |
| Rate limit                 | >20 no token / 30 tokens distintos | 429 "Muitas tentativas para este download. Aguarde um instante." / "…a partir desta conexão…" |
| Método errado              | POST                               | 405 com `Allow: GET, OPTIONS`                                                                 |

**Checagens:** toda resposta tem `Referrer-Policy: no-referrer` e `Cache-Control: no-store, max-age=0`. `fetch('/api/download?token=abc')` responde 401 sem consumir nada.
**Suspeitas:** B11, B68.
**Arquivos:** `handlers/download.js`, `lib/storage-signed-url.js`, `lib/rate-limit.js`.

#### C12 — E-mails da compra e da conta (fora do site)

- **Onde:** a caixa de entrada do comprador. Os templates ficam em `lib/email-templates.js` e `handlers/me-delete-account.js`; os de recuperação de senha são do Supabase. **Em dev os envios são reais** (`SMTP_*` definidos, remetente `@resend.dev`, B79).

| E-mail                              | Assunto / CTA                                                                                                        | Destino do CTA                                                       | Situação                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Exclusão de conta                   | "Confirme a exclusão da sua conta — Ateliê da Escola" / "Excluir minha conta"                                        | `APP_URL/conta?delete_token=…` (em dev o host é ngrok: troque)       | Enviado no passo 1 (C04)                       |
| Recuperação de senha                | template do Supabase                                                                                                 | `<origem>/reset-password?redirect=…&code=…`                          | Veja B15                                       |
| Definir senha (1ª compra sem conta) | Supabase `resetPasswordForEmail`                                                                                     | `APP_URL/login?mode=login`                                           | Inutilizável (B16)                             |
| Confirmação de pedido               | "🎉 Pagamento confirmado — seus arquivos estão liberados" / "⬇️ Acessar meus downloads"                              | `APP_URL/downloads?order=<ORD>` (sem e-mail, B12)                    | **Nunca enviado automaticamente** (B13)        |
| Carrinho abandonado                 | "Você esqueceu algo no carrinho 🛒" (1–2 h) e "Seu carrinho ainda está esperando" (~24 h) / "Finalizar minha compra" | `APP_URL/checkout` (o carrinho só existe no navegador original, B78) | Enviado pelo cron também a quem já pagou (B14) |
| D+3                                 | "Como foi sua experiência com o material?" / "⭐ Avaliar em 1 minuto"                                                | `APP_URL/avaliar?order=…`                                            | Leva à 404 (B51)                               |

| Estado       | Como provocar       | Resultado                                                                              |
| ------------ | ------------------- | -------------------------------------------------------------------------------------- |
| SMTP ausente | Sem `SMTP_*`        | `{sent:false, reason:'smtp_not_configured'}`, com status `skipped` em `email_sent_log` |
| Reenvio      | Mesmo kind/entityId | `{sent:false, skipped:true, reason:'already_sent'}`                                    |

**Checagens:** depois de uma compra aprovada, **não** chega "🎉 Pagamento confirmado" e não aparece `/send-confirmation-email` na rede. `APP_URL/avaliar?order=X` mostra "Página não encontrada".
**Suspeitas:** B13, B14, B16, B51, B77, B78, B79.
**Arquivos:** `lib/email-templates.js`, `lib/email-sender.js`, `handlers/send-confirmation-email.js`, `handlers/me-delete-account.js`, `handlers/cron-email-jobs.js`, `handlers/abandoned-cart.js`, `lib/customer-account-provisioning.js`.

#### C13 — Webhook do Mercado Pago e liberação do download (API)

- **Rota:** `POST {API}/webhook` (em dev, `APP_URL/api/webhook` → ngrok → :3000). **Acesso:** público, com assinatura.
- **O que faz:** confirma o pagamento pelo ID; reconcilia valor, moeda e `live_mode`; aprova o pedido de forma idempotente; emite `download_tokens` (72 h); provisiona a conta do comprador; e grava eventos. Recusa ou cancelamento marca o pedido como `failed`. Não tem interface. O polling (`verify-payment`) faz a mesma reconciliação, mas não grava `payment_approved` (B175).

| Estado                                | Como provocar                                                                                 | Resposta                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sem assinatura                        | `fetch(API+'/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})` | 401 `{success:false,error:{code:'UNAUTHORIZED',message:'Invalid signature'}}` + `security_event` |
| Método errado                         | GET                                                                                           | 405 com `Allow: POST, OPTIONS`                                                                   |
| Aprovado e reconciliado               | Notificação real                                                                              | approved/completed, tokens emitidos, conta provisionada, `payment_approved`                      |
| Valor divergente ou teste em produção | —                                                                                             | 200 "Payment did not reconcile with the order; not approved" + `payment_amount_mismatch`         |

**Checagens:** o POST sem assinatura dá 401 e o GET dá 405.
**Suspeitas:** B175.
**Arquivos:** `handlers/webhook.js`, `handlers/verify-payment.js`, `lib/mercadopago-config.js`, `lib/payment-integrity.js`, `lib/customer-account-provisioning.js`.

---

## 4. Painel administrativo (`/admin`)

> Use `http://localhost:5173`, **não** `127.0.0.1`: com outro host, o front passa a chamar `/api` relativo e a API não responde. O logout e todas as escritas admin exigem um `Origin` que seja o `APP_URL` ou `localhost:5173`/`127.0.0.1:5173`. Com o Vite em 5174, dá 403. Dispense o banner de cookies ("Apenas essenciais") antes de começar, porque ele cobre "Encerrar sessão" e o rodapé dos modais (B35). O painel não tem URL por aba, e o F5 volta sempre ao Dashboard.

### 4.1 Entrada e casca

#### A01 — Login administrativo em `/admin` (+ "Verificando sessão" + 2ª etapa 2FA)

- **Rota:** `/admin` (também `/admin?login`), sem sessão ADMIN/MASTER. **Acesso:** público.
- **Como chegar:**
  - abrir `http://localhost:5173/admin` numa janela sem o cookie `admin_session`;
  - clicar em "Encerrar sessão" no painel (a URL continua a mesma);
  - clicar em "Painel admin" no header da loja (só aparece para um cliente com papel admin/master).

  **Não existe mais link para o painel em `/login`.**

- **O que aparece:**
  - **Enquanto verifica a sessão** (`authReady=false`), aparece um cartão com o ícone de escudo, o h3 "Verificando sessão" e "Aguarde enquanto validamos seu acesso ao painel.".
  - **Depois**, a tela cheia com gradiente violeta, **sem a casca da loja e sem nenhum link**. O cartão tem o ícone bi-shield-lock-fill, o sobretítulo "Painel administrativo" (exibido como PAINEL ADMINISTRATIVO), o h1 "Acesso restrito" e o texto "Use o e-mail Supabase do perfil master/admin para acessar o painel.". Seguem o campo "E-mail do admin", o campo "Senha" e o botão violeta "Entrar".
  - **Na 2ª etapa**, aparece o campo "Código TOTP ou PIN" (fonte mono), com "Métodos aceitos: totp / pin.", e o botão vira "Validar código".
  - **Durante o envio**, spinner + "Entrando...". A linha de status fica abaixo do botão.

| Elemento                                             | Onde                     | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | API                                                                                                                                               | Destrutivo? |
| ---------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| "E-mail do admin" (`#admin-login-email`, type=email) | 1º campo                 | "abc" dispara o balão nativo e bloqueia o envio. Vazio **não** é barrado pelo navegador (cai na validação JS). O valor vai com trim; o servidor passa para minúsculas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                 | não         |
| "Senha" (`#admin-login-password`)                    | 2º campo                 | Mascarada. Não há "mostrar senha" nem "Esqueci minha senha".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                 | não         |
| "Código TOTP ou PIN" (`#admin-login-factor`)         | 3º campo, só na 2ª etapa | Remove os espaços ("123 456" vira "123456"). E-mail e senha continuam editáveis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                 | não         |
| "Entrar" / "Validar código" / "Entrando..."          | botão                    | **(a)** Campo vazio: status "Informe e-mail e senha para entrar.", sem toast e sem requisição. **(b)** Código vazio: "Informe o código de verificação para continuar.". **(c)** Enviando: botão desabilitado e status "Validando credenciais..." / "Validando segunda etapa...". **(d)** 401 com senha errada **ou** conta sem papel admin: "Credenciais inválidas." (status + toast vermelho). **(e)** 200 `{success:false, requiresSecondFactor:true, methods, challengeToken}`: aparece o campo de código e o status "Informe o código de verificação para concluir o login.". **(f)** Na 2ª etapa: "Código de verificação inválido.", "Código já utilizado. Aguarde o próximo código do autenticador.", "Desafio de 2FA já utilizado. Faça login novamente."; um desafio expirado (>120 s) é reemitido em silêncio. **(g)** 200 `{success:true, user:{role,email}}` + `Set-Cookie admin_session`: toast verde "Login administrativo realizado." e o painel na **mesma** `/admin` (h1 "Dashboard"); `?login` vira `/admin`. **(h)** 429: "Muitas tentativas. Aguarde 10 minutos e tente novamente." / "Muitas tentativas de verificação. Aguarde 10 minutos e tente novamente.". **(i)** Infraestrutura: "Configuração do Supabase indisponível no servidor.", "2FA ativado sem método configurado no adminConfig.", "Tempo de resposta da API excedido. Tente novamente.", "Failed to fetch". | `POST {API}/admin/login {email,password,factorCode?,challengeToken?}`; no sucesso, `GET {API}/admin/dashboard` e `GET {API}/admin/kpis?window=12` | não         |
| Enter                                                | qualquer campo           | O mesmo que clicar no botão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | idem                                                                                                                                              | não         |
| "Fechar aviso"                                       | toast                    | Fecha                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                 | não         |
| "Apenas essenciais" / "Aceitar todos"                | banner global            | Fecham o banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                 | não         |

| Estado                                 | Como provocar                                           | O que se vê                                                                                                         |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Verificando sessão                     | F5 (Slow 3G)                                            | "Verificando sessão" até `GET {API}/admin/session` e `GET {API}/auth/customer/session` responderem (em paralelo)    |
| 1ª etapa                               | Sem cookie                                              | URL `/admin`, 2 campos e "Entrar", sem links                                                                        |
| Validação local                        | Campos vazios                                           | "Informe e-mail e senha para entrar.", sem rede                                                                     |
| Credenciais inválidas ou cliente comum | Senha errada ou conta customer                          | 401 `{error:{code:'UNAUTHORIZED', message:'Credenciais inválidas.'}}`                                               |
| 2ª etapa                               | 2FA ativo                                               | O campo de código, "Métodos aceitos: …" e "Validar código"                                                          |
| Rate limit                             | 6ª tentativa em 10 min do mesmo IP (**inclui acertos**) | 429 `RATE_LIMITED` + `Retry-After`; bloqueia até a senha certa (B179)                                               |
| API fora ao abrir                      | Parar o dev:api + F5                                    | O formulário aparece como se não houvesse sessão; o envio dá "Failed to fetch" (B56)                                |
| Já autenticado                         | F5 com cookie válido (8 h)                              | "Verificando sessão" e depois o painel                                                                              |
| `/admin?login`                         | Abrir                                                   | Sem sessão, o mesmo formulário. Com sessão, o painel (o `?login` só força o formulário com o bypass de DEV ligado). |

**Checagens**

- Sem sessão, `location.pathname === '/admin'`, o h1 é "Acesso restrito" e o cartão não tem nenhum `<a>`.
- Campos vazios: nenhum POST. "abc": `validity.typeMismatch` e nenhum POST.
- Senha errada: 401 com o corpo exato. Login válido: 200, `Set-Cookie admin_session` (HttpOnly; SameSite=Strict; Max-Age=28800; Path=/; Secure só em produção), toast `article[data-type=success]`, h1 "Dashboard" e URL `/admin`.
- Com 2FA, o 1º POST devolve `requiresSecondFactor` **sem** o cookie.
- Durante "Entrando...", o botão fica disabled.
- F5 logado: `GET /admin/session` → `{success:true, authenticated:true}`.
- A 375 px, sem rolagem horizontal e com inputs de 14 px (B180).

**Suspeitas:** B55, B56, B176, B177, B178, B179, B180.
**Arquivos:** `src/pages/AdminLoginPage.jsx`, `src/components/ProtectedRoute.jsx`, `src/App.jsx`, `src/providers/AuthProvider.jsx`, `src/services/admin-auth.js`, `handlers/admin/login.js`, `handlers/admin/session.js`, `lib/admin-session.js`, `lib/admin-2fa.js`, `lib/rate-limit.js`.

#### A02 — Rotas antigas e auxiliares do login admin

- **Rotas:** `/painel-acesso-privado-atelie`, `/admin-login` e `/admin/usuarios`. **Acesso:** público.
- **O que aparece:** as duas primeiras levam à 404 da loja (L17). `/admin/usuarios` faz `<Navigate replace>` para `/admin` e mostra o login ou o painel **na aba Dashboard**.

**Checagens:** `/painel-acesso-privado-atelie` e `/admin-login` mostram o h1 "Página não encontrada", sem formulário. `/admin/usuarios` leva a `pathname === '/admin'`, e Voltar não retorna a ela. `GET /robots.txt` (local) contém "Disallow: /admin" e **não** contém "painel-acesso-privado-atelie". O deploy atual ainda contém.
**Suspeitas:** nenhuma no código local. Para a divergência com o deploy, veja §7.2.
**Arquivos:** `src/App.jsx`, `src/pages/NotFoundPage.jsx`, `src/constants/routes.js`, `public/robots.txt`.

#### A03 — Casca do painel (sidebar, cabeçalho, menu mobile, carregamento, erro, logout, sessão expirada)

- **Rota:** `/admin` com sessão; a aba ativa é estado interno. **Acesso:** admin.
- **O que aparece:**
  - **Desktop (≥1024 px):** uma sidebar fixa de 288 px com:
    - o logo e "Ateliê da Escola" / "Painel Administrativo" (não clicáveis);
    - o botão "Ver loja" (com ↗);
    - a navegação, **nesta ordem**: Dashboard; o grupo "Produtos ▾" (Lista de produtos, Desempenho, Categorias); Pedidos; Cupons; o grupo "Financeiro ▾" (Faturamento, Comparativo); Funil; Análise; Segmentos; Usuários; Vitrine; Segurança. **Os grupos começam recolhidos.** O item ativo fica em `bg-violet-600`;
    - no rodapé, "Administrador" (fixo), "Sessão admin" e o botão rosa "Encerrar sessão".
  - **Cabeçalho sticky:** o h1 com o nome da aba e, à direita, a data por extenso (ex.: "28 de setembro de 2026"), oculta abaixo de 640 px.
  - **Conteúdo:**
    - na 1ª visita de cada aba, o "Carregando…" do Suspense (chunk lazy);
    - enquanto busca dados, um cartão branco com spinner "Carregando…";
    - em erro, um cartão rosa com a mensagem, **sem** "tentar de novo".
  - **Mobile (<1024 px):** a sidebar fica fora da tela e o hambúrguer "Abrir menu" aparece no cabeçalho.

| Elemento                                    | Onde                 | O que acontece                                                                                                                                                                                                                                                                                                                                    | API                                                                                           | Destrutivo? |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| "Ver loja" (Link)                           | topo da nav          | Vai para `/` **na mesma aba**, apesar do ícone ↗. A sessão admin continua, mas a loja mostra "Painel admin" só se houver sessão de CLIENTE com papel admin.                                                                                                                                                                                       | as da home                                                                                    | não         |
| "Dashboard"                                 | nav                  | h1 "Dashboard" (A05); abaixo de 1024 px, fecha o menu                                                                                                                                                                                                                                                                                             | `GET {API}/admin/dashboard`, `GET {API}/admin/kpis?window=12`                                 | não         |
| "Produtos ▾" / "Financeiro ▾"               | nav                  | Mostram ou escondem os subitens; o chevron gira. Não trocam de aba nem chamam a API.                                                                                                                                                                                                                                                              | —                                                                                             | não         |
| Lista de produtos / Desempenho / Categorias | grupo Produtos       | h1 "Produtos" / "Desempenho dos produtos" / "Categorias"                                                                                                                                                                                                                                                                                          | `GET {API}/admin/dashboard`                                                                   | não         |
| Pedidos                                     | nav                  | h1 "Pedidos"                                                                                                                                                                                                                                                                                                                                      | `GET {API}/admin/orders`                                                                      | não         |
| Cupons                                      | nav                  | h1 "Cupons" (com carregamento próprio)                                                                                                                                                                                                                                                                                                            | `GET {API}/admin/coupons`                                                                     | não         |
| Faturamento / Comparativo                   | grupo Financeiro     | h1 "Faturamento" / "Comparativo mensal"                                                                                                                                                                                                                                                                                                           | `GET {API}/admin/dashboard`                                                                   | não         |
| Funil                                       | nav                  | h1 "Funil de conversão", sem o "Carregando…" central                                                                                                                                                                                                                                                                                              | `GET {API}/admin/funnel?days=30`                                                              | não         |
| Análise                                     | nav                  | h1 "Análise (Curva ABC + Coorte)"; "Carregando…" e depois "Calculando análise…"                                                                                                                                                                                                                                                                   | dashboard + `abc-products?period=month` + `abc-customers?period=quarter` + `cohort?months=12` | não         |
| Segmentos                                   | nav                  | h1 "Segmentos de email"; "Calculando segmentos…"                                                                                                                                                                                                                                                                                                  | `GET {API}/admin/segments`                                                                    | não         |
| Usuários / Vitrine / Segurança              | nav                  | h1 "Usuários" / "Vitrine" / "Segurança"                                                                                                                                                                                                                                                                                                           | `admin/users` / `admin/dashboard` / `admin/settings?key=adminConfig`                          | não         |
| Clicar na aba ativa                         | nav                  | Nada (não recarrega)                                                                                                                                                                                                                                                                                                                              | —                                                                                             | não         |
| "Encerrar sessão"                           | rodapé da sidebar    | Sucesso: 200 `{success:true}` + `Set-Cookie admin_session=; Max-Age=0`, o toast azul "Sessão administrativa encerrada." e o formulário **vazio** na mesma `/admin`, sem navegação. Falha (403 "Origem nao permitida (possivel CSRF)." sem acento, ou rede): toast vermelho e **o painel continua aberto** (B19). Não encerra a sessão de cliente. | `POST {API}/admin/logout`                                                                     | não         |
| "Abrir menu"                                | cabeçalho, <1024 px  | A sidebar desliza e um véu cobre o conteúdo. O botão não tem aria-expanded.                                                                                                                                                                                                                                                                       | —                                                                                             | não         |
| "Fechar menu" (véu)                         | à direita da sidebar | Fecha. Não há X interno nem Esc (B82).                                                                                                                                                                                                                                                                                                            | —                                                                                             | não         |

| Estado             | Como provocar                                                                                                                                                  | O que se vê                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Carregando aba     | Entrar numa aba que usa o dashboard                                                                                                                            | O cartão "Carregando…"; sidebar e h1 continuam utilizáveis                                                                                                                                                                                                               |
| 1ª visita (chunk)  | Primeiro clique na aba                                                                                                                                         | O "Carregando…" do Suspense e o JS da aba na rede                                                                                                                                                                                                                        |
| Troca rápida       | Várias abas seguidas                                                                                                                                           | Respostas atrasadas são descartadas                                                                                                                                                                                                                                      |
| Erro de aba        | API parada + "Pedidos"                                                                                                                                         | Cartão rosa "Failed to fetch" (ou "Erro ao carregar dados do admin dashboard.", "Supabase não configurado.", timeout); clicar na mesma aba não recarrega                                                                                                                 |
| Sessão expirada    | Console: `await fetch('http://localhost:3000/api/admin/logout',{method:'POST',credentials:'include'})` e depois clicar em "Pedidos", "Usuários" ou "Segurança" | O toast âmbar "Sessão admin expirada. Faça login novamente." e o formulário na mesma `/admin`. **Dashboard, Faturamento, Comparativo, Desempenho e Análise podem não expirar** porque o GET vem do cache (B20). Funil, Segmentos e Cupons mostram só a caixa rosa (B80). |
| F5 em qualquer aba | —                                                                                                                                                              | Volta ao Dashboard (B182)                                                                                                                                                                                                                                                |
| StrictMode (dev)   | `npm run dev`                                                                                                                                                  | Requisições duplicadas (esperado)                                                                                                                                                                                                                                        |

**Checagens**

- A ordem da nav, com os grupos expandidos: `['Ver loja','Dashboard','Produtos','Lista de produtos','Desempenho','Categorias','Pedidos','Cupons','Financeiro','Faturamento','Comparativo','Funil','Análise','Segmentos','Usuários','Vitrine','Segurança']`.
- O h1 de cada item confere com a tabela 2.2, e só o item clicado fica em `bg-violet-600`.
- A data é igual a `new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})`.
- "Encerrar sessão": POST 200, o formulário vazio e a URL `/admin`; em seguida `GET /admin/session` responde `{authenticated:false}`.
- A 375 px: sem rolagem horizontal. "Abrir menu" abre e o véu fecha. Expandir Financeiro e clicar em "Faturamento" fecha o menu.
- Entre 1024 e 1280 px, com o banner de cookies pendente, confira se o banner cobre "Encerrar sessão" (B35).

**Suspeitas:** B19, B20, B35, B37, B39, B56, B80, B81, B82, B181, B182, B183, B184, B185.
**Arquivos:** `src/components/admin/AdminLayout.jsx`, `src/pages/AdminPage.jsx`, `src/components/admin/utils/tabs.js`, `src/providers/AuthProvider.jsx`, `src/services/admin-auth.js`, `src/services/admin-panel.js`, `src/constants/error-codes.js`, `handlers/admin/logout.js`, `lib/admin-session.js`, `lib/http.js`.

#### A04 — Banner âmbar do bypass de DEV

- **Rota:** `/admin`, só em `npm run dev` com `VITE_ALLOW_ADMIN_BYPASS=true` e sem sessão. **Acesso:** misto.
- **Como chegar:** **exige um humano.** É preciso acrescentar a variável ao `.env.local` (hoje ela só existe no `.env.example`), reiniciar o Vite e **reverter** ao final. Em build de produção a flag não tem efeito.
- **O que aparece:** acima de qualquer aba, uma caixa âmbar com "Modo de desenvolvimento (bypass) — sem sessão admin real." e o texto "O painel abre sem login, mas as APIs exigem sessão: por isso o Dashboard fica vazio e abas como Segmentos, Cupons e Usuários mostram “sessão expirada”. Faça login para carregar os dados.". "Faça login" é um link.

| Elemento                                 | Onde    | O que acontece                                                                                                           | API                       | Destrutivo? |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------- |
| "Faça login" (`<a href='/admin?login'>`) | banner  | Recarga completa em `/admin?login`, que força o formulário. Depois do login, o replace para `/admin` faz o banner sumir. | `POST {API}/admin/login`  | não         |
| "Encerrar sessão" (sem sessão)           | sidebar | Responde 200 com o toast, mas o painel continua (bypass)                                                                 | `POST {API}/admin/logout` | não         |

| Estado              | Como provocar          | O que se vê                                                                                                                                                                               |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bypass sem sessão   | Flag ligada            | O banner, o Dashboard zerado (o 401 é engolido), KPIs "—", a caixa rosa "Sessão admin inválida ou expirada." em Segmentos, Cupons e Funil. Usuários e Pedidos aparecem **vazios** (B186). |
| Bypass com sessão   | Depois de "Faça login" | Sem banner, com os dados                                                                                                                                                                  |
| Flag ausente (hoje) | Padrão                 | Sem banner; o formulário                                                                                                                                                                  |

**Checagens:** o texto exato do banner e o href `/admin?login`. No deploy, uma janela anônima em `/admin` não mostra o banner.
**Suspeitas:** B186, B187.
**Arquivos:** `src/pages/AdminPage.jsx`, `src/components/ProtectedRoute.jsx`, `.env.example`.

### 4.2 Dashboard e modal de pedido

#### A05 — Dashboard

- **Rota:** `/admin` › Dashboard (aba padrão). **Acesso:** admin.
- **O que aparece (de cima para baixo):**
  1. **4 cards grandes** (1, 2 ou 4 colunas):
     - "Faturamento do mês": R$, o selo de variação ou "estável", "vs mês anterior" e um minigráfico de 14 dias.
     - "Ticket médio": R$, o selo e "N pedidos no mês" ou "sem pedidos no mês".
     - "Pedidos aprovados": o número e "N pendentes".
     - "Clientes recorrentes": o número e "N% dos compradores".
  2. **Mini-cards:** "Receita total", "Produtos ativos", "Pendentes", "Clientes cadastrados".
  3. **KPIs:** "LTV médio (12m)", "Taxa de recompra" e "Ticket médio (12m)" (mostram "—" enquanto carregam ou em erro) e "LTV / CAC" (sempre "Fase 5").
  4. **Gráficos:** "Receita dos últimos 7 dias" / "Pedidos aprovados por dia" (linha + 7 colunas dd/mm) e "Receita por categoria" / "Top 5 categorias" (rosca com o total no centro e legenda com %).
  5. **Curva ABC e Mix:**
     - "Curva ABC": chips "Classe A/B/C" com contagem e "80% / 15% / 5% da receita", até 8 produtos "#rank nome" com R$, % e barra, e "+ N produtos restantes na cauda C.".
     - "Mix de clientes" / "Novos vs recorrentes (compras aprovadas)": barra bicolor, os blocos "Recorrentes" e "Novos" e "N cadastros ainda sem nenhuma compra aprovada.".
  6. **Cards tracejados** "Vendas por região" e "Funil de conversão", com "Instrumentação pendente".
  7. **"Pedidos recentes" / "Últimos 8 pedidos":** tabela PEDIDO / STATUS / TOTAL e o botão "Detalhes".

| Elemento                  | Onde                             | O que acontece                               | API | Destrutivo? |
| ------------------------- | -------------------------------- | -------------------------------------------- | --- | ----------- |
| "Detalhes"                | cada linha de "Pedidos recentes" | Abre o modal do pedido (A06), sem requisição | —   | não         |
| Cards, gráficos, ABC, Mix | corpo                            | Só leitura; não há tooltip                   | —   | não         |

| Estado                      | Como provocar           | O que se vê                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carregando                  | Entrar                  | "Carregando…"; os KPIs começam em "—"                                                                                                                                                                                                                                                                                |
| Sem nenhum pedido           | Base vazia              | R$ 0,00, "estável", a linha de 7 dias reta no zero, "Sem dados de categoria.", "Sem vendas para classificar" / "A curva ABC aparece quando houver pedidos aprovados com produtos identificados.", "Novos 0 / 100% dos compradores" e "Nenhum pedido recente" / "Os pedidos aparecerão aqui assim que forem criados." |
| Mais de 8 produtos vendidos | —                       | "+ N produtos restantes na cauda C."                                                                                                                                                                                                                                                                                 |
| Erro                        | API parada              | Cartão rosa                                                                                                                                                                                                                                                                                                          |
| Dados em cache              | Voltar à aba em até 1 h | Os mesmos números; o GET aparece como "(disk cache)" (B20)                                                                                                                                                                                                                                                           |

**Checagens**

- **Formato das respostas.**
  - `GET /admin/dashboard`: 200 com `success`, `products`, `categories`, `users`, `orders`, `settings`, `summary{totalOrders, approvedOrders, pendingOrders, totalProducts, activeProducts, totalUsers, revenueMonth, revenueTotal}` e `truncated:[]`, com `Cache-Control: private, max-age=3600`.
  - `GET /admin/kpis?window=12`: `kpis{revenueMTD, revenuePrev, monthDeltaPct, revenueWindow, ordersWindow, uniqueCustomers, recurringCustomers, ticketMedio, ltvAvg, repurchaseRate, cac:null, ltvCacRatio:null, ltvCacRatioTarget:3}`.
- **Origem de cada número.**
  - "Faturamento do mês" é `summary.revenueMonth`, calculado no servidor (aprovados com `completedAt||createdAt` desde o dia 1 do mês, no fuso do servidor). O selo compara o mês atual com o mês anterior no navegador (zona estável de ±0,01%). O minigráfico é de 14 dias, agrupados por data UTC.
  - "Ticket médio" é a receita dividida pelos aprovados do mês (no fuso do navegador).
  - "Pedidos aprovados" é `summary.approvedOrders` (todos os tempos). "Pendentes" é o status exatamente `pending`.
  - "Clientes recorrentes" são os perfis não admin com 2 ou mais compras aprovadas pelo mesmo e-mail.
  - "Receita total" é `summary.revenueTotal`.
  - Os KPIs "(12m)" vêm de `/admin/kpis` (janela UTC por `completed_at`).
  - A rosca soma preço × qtde por NOME de categoria (top 5).
  - A Curva ABC mostra a receita por produto em todos os tempos.
- **Coerência entre abas.**
  - "Pedidos aprovados" = Faturamento › "Pedidos aprovados".
  - "Receita total" = Faturamento › "Bruto acumulado".
  - "N pendentes" = o mini-card "Pendentes".
  - "Clientes cadastrados" = Recorrentes + Novos + "sem compra".
  - "Ticket médio" e "N pedidos no mês" = Comparativo › Mês atual.
  - "Faturamento do mês" = Comparativo › Mês atual › Receita = a última barra do Faturamento (fuso, B86).
  - A receita por produto na ABC = o Desempenho.
  - O selo aponta na **mesma direção** do Comparativo, mas com outro formato (B196).
- **Outras checagens.**
  - "LTV / CAC" mostra "Fase 5".
  - "Pedidos recentes" tem até 8 linhas, com todos os status. Os chips são "Aprovado", "Pendente", "Recusado", "Cancelado", "Concluído" e "Falhou"; outros status aparecem crus.
  - A legenda da rosca deveria ter o nome das categorias (hoje não tem, B83).
  - Para ver o cache: `performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/admin/dashboard')).map(e=>e.transferSize)`. `transferSize` 0 indica cache.

**Suspeitas:** B20, B83, B84, B85, B86, B87, B188, B189, B190, B191, B192, B193, B194, B195, B196, B197.
**Arquivos:** `src/components/admin/tabs/DashboardTab.jsx`, `src/components/admin/tabs/dashboard-charts.js`, `src/components/admin/utils/derive.js`, `src/components/admin/ui/StatusChip.jsx`, `src/utils/abc.js`, `handlers/admin/dashboard.js`, `handlers/admin/kpis.js`, `lib/http.js`.

#### A06 — Modal de detalhe do pedido (OrderDetailModal)

- **Rota:** `/admin`, aberto pelo "Detalhes" do Dashboard (A05) ou da aba Pedidos (A16). **Acesso:** admin.
- **O que aparece:**
  - um véu escuro ("Fechar detalhes") e um `<dialog open aria-modal='true' aria-labelledby='order-detail-title'>` de até 512 px de largura e 90 vh de altura;
  - "Pedido", o h2 com o `order_code` (ou o id) e o X "Fechar";
  - um bloco cinza com "Cliente" (nome, e-mail ou "-"), "E-mail", "Status" (chip), "Total" e "Data" (dd/mm/aaaa hh:mm);
  - a seção "Itens": "Nome" + "N × R$ X" (ou "Produto <id>") ou "Sem itens vinculados.".

  **É só leitura**: não altera status, não reenvia e-mail, não cancela.

| Elemento                | Onde          | O que acontece                                                                   | API | Destrutivo? |
| ----------------------- | ------------- | -------------------------------------------------------------------------------- | --- | ----------- |
| X ("Fechar")            | canto         | Recebe o foco ao abrir (é o único focável); fecha e devolve o foco ao "Detalhes" | —   | não         |
| Véu ("Fechar detalhes") | fora da caixa | Fecha                                                                            | —   | não         |
| Esc                     | aberto        | Fecha                                                                            | —   | não         |
| Tab / Shift+Tab         | aberto        | O foco fica preso no X; o body tem overflow hidden                               | —   | não         |

**Checagens:** o código, o status e o total são os da linha. A soma dos itens é igual ao total, salvo com cupom. Esc, o X e o véu fecham. Não há requisição de rede. O banner de cookies, se estiver visível, fica **por cima** do modal: dispense-o antes.
**Suspeitas:** B198, B199.
**Arquivos:** `src/components/admin/OrderDetailModal.jsx`, `src/pages/AdminPage.jsx`, `src/components/admin/ui/StatusChip.jsx`.

### 4.3 Produtos

#### A07 — Lista de produtos

- **Rota:** `/admin` › Produtos › Lista de produtos. **Acesso:** admin.
- **Como chegar:** o grupo "Produtos" começa **fechado**: abra-o e clique em "Lista de produtos". Abaixo de 1024 px, abra antes o menu.
- **O que aparece:**
  - o h1 "Produtos" e um card com o h2 "Produtos", "N de M produto(s)" e o botão "Novo produto";
  - os filtros no navegador: "Buscar por nome...", o select "Todas as categorias" (lista todas, inclusive as inativas e as **fantasmas com nome UUID**) e "Todos" / "Ativos" / "Inativos";
  - a tabela PRODUTO (nome + badge "Destaque"), CATEGORIA (ou "Sem categoria"), PREÇO, STATUS ("Ativo" / "Inativo") e AÇÕES ("Editar", "Pausar"/"Ativar", lixeira aria-label "Excluir"), em ordem de `created_at` desc, sem paginação.

| Elemento                     | Onde    | O que acontece                                                                                                                                                                                                                       | API                                                                     | Destrutivo? |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------- |
| Grupo "Produtos"             | sidebar | Expande                                                                                                                                                                                                                              | —                                                                       | não         |
| "Lista de produtos"          | sidebar | "Carregando…" e depois o card                                                                                                                                                                                                        | `GET {API}/admin/dashboard`                                             | não         |
| "Novo produto"               | card    | Abre "Adicionar Produto" no passo 1 (o chunk é baixado sob demanda, sem indicador)                                                                                                                                                   | —                                                                       | não         |
| "Buscar por nome..."         | filtros | Filtra por substring. Sem resultado: "Nenhum produto encontrado" / "Crie um novo produto ou ajuste os filtros."                                                                                                                      | —                                                                       | não         |
| Select de categoria / status | filtros | Filtra no navegador                                                                                                                                                                                                                  | —                                                                       | não         |
| "Editar"                     | ações   | Abre "Editar Produto" preenchido **a partir da linha do dashboard**: galeria extra, vídeos, preço original, tipo, benefícios, FAQ e depoimentos vêm **vazios** (B02)                                                                 | —                                                                       | não         |
| "Pausar" / "Ativar"          | ações   | Sem confirmação. PATCH, recarga e o toast "Produto pausado." / "Produto ativado.". Na loja, até 5 min de atraso (B42). Erros: "Sessão admin inválida ou expirada." (+ toast âmbar e login), "Origem não permitida (possível CSRF).". | `PATCH {API}/admin/products {id, active}` + `GET {API}/admin/dashboard` | **sim**     |
| "Excluir" (lixeira)          | ações   | `window.confirm('Excluir o produto "<nome>"?')`. Cancelar: nada. OK: DELETE, recarga, o toast "Produto removido." e a linha some. Um produto que está em algum pedido dá 500 "Erro ao processar produtos do admin" (B92).            | `DELETE {API}/admin/products?id=<uuid>` + `GET {API}/admin/dashboard`   | **sim**     |

| Estado               | Como provocar                  | O que se vê                                      |
| -------------------- | ------------------------------ | ------------------------------------------------ |
| Carregando / erro    | Entrar / Offline               | "Carregando…" / cartão rosa, sem retry           |
| Filtro sem resultado | "zzzz"                         | "Nenhum produto encontrado", "0 de M produto(s)" |
| Sessão expirada      | Logout em outra aba + "Pausar" | 401, os toasts e o login na mesma `/admin`       |
| 375 px               | —                              | As colunas da direita ficam cortadas (B87)       |
| Diálogo nativo       | Lixeira sem stub               | A caixa do Chrome trava a extensão (use F03)     |

**Checagens:** h1 "Produtos". Sem filtros, "M de M" é igual ao número de `<tr>`. A rede mostra 1 `GET /admin/dashboard` 200, e os `products` **não** trazem images, videos, originalPrice, productType, faq, reviews nem benefits (a causa de B02). Anote as categorias com nome UUID (B01). Com o stub em false, fica registrado `Excluir o produto "<nome>"?` e não há DELETE. Com o stub em true, num produto [TESTE] sem vendas: DELETE 200 e "Produto removido.". "Pausar" gera o PATCH `{id, active:false}`, "Produto pausado." e o chip "Inativo" (reverta depois). Não há controle para "Destaque" (B215).
**Suspeitas:** B01, B02, B20, B42, B87, B92, B215, B216, B217, B218, B219.
**Arquivos:** `src/components/admin/tabs/ProductsTab.jsx`, `src/pages/AdminPage.jsx`, `src/services/admin-panel.js`, `src/services/admin-products.js`, `handlers/admin/dashboard.js`, `handlers/admin/products.js`, `lib/admin-resource-handler.js`, `validation/admin.schemas.js`.

#### A08 — Moldura dos wizards (ModalWizard): Produto, Categoria e Cupom

- **Rota:** modal sobre Lista de produtos, Categorias ou Cupons. **Acesso:** admin.
- **O que aparece:**
  - um véu com blur (botão invisível "Fechar modal") e um `<dialog open aria-modal='true' aria-labelledby='modal-wizard-title'>` (768 px no produto, 576 px em categoria e cupom; até 90 vh, com rolagem interna);
  - o h2 ("Adicionar Produto" / "Editar Produto", "Adicionar Categoria" / "Editar Categoria", "Novo Cupom" / "Editar Cupom") e o X "Fechar";
  - só no produto, as pílulas "1 Básico", "2 Mídia", "3 Preço & Variações" e "4 Conversão": as concluídas ficam verdes, a atual violeta e as futuras cinza e disabled; abaixo de 640 px, só os números;
  - o rodapé com "Cancelar", "← Voltar", "Avançar →" e o submit "Salvar Produto" / "Salvar Categoria" / "Salvar Cupom" (ícone de check).

| Elemento                 | Onde                                       | O que acontece                                                                                                                                 | API             | Destrutivo? |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| X ("Fechar")             | cabeçalho                                  | Fecha sem salvar. **É ele que recebe o foco ao abrir.**                                                                                        | —               | não         |
| Véu ("Fechar modal")     | fora                                       | Fecha sem salvar                                                                                                                               | —               | não         |
| Esc                      | qualquer lugar                             | Fecha sem salvar                                                                                                                               | —               | não         |
| Tab / Shift+Tab          | dentro                                     | O foco fica preso e o body tem overflow hidden                                                                                                 | —               | não         |
| Pílulas                  | cabeçalho (produto)                        | As anteriores voltam sem validar; as futuras estão disabled                                                                                    | —               | não         |
| "Cancelar"               | rodapé                                     | Fecha sem confirmar (B220)                                                                                                                     | —               | não         |
| "← Voltar"               | rodapé (passo ≥2)                          | Volta mantendo os dados                                                                                                                        | —               | não         |
| "Avançar →"              | rodapé (passos 1–3)                        | Valida o passo. Em erro, mostra um toast vermelho acima do modal.                                                                              | —               | não         |
| "Salvar …"               | rodapé, último passo                       | Valida no front. Se passar, **o modal fecha na hora** (sem await) e a requisição corre em segundo plano; em erro, o formulário se perde (B93). | ver cada wizard | **sim**     |
| Enter num input de texto | passos 1 e 4 do produto, categoria e cupom | O mesmo que "Salvar" (B94, B95). No passo 2 (sem texto) e no passo 3 (só números), Enter não submete.                                          | idem            | **sim**     |

**Checagens:** ao abrir, o `activeElement` é o X. Esc, o X, "Cancelar" e um clique em (5,5) fecham sem requisição e devolvem o foco. As pílulas futuras têm `disabled`. `body.style.overflow` fica `'hidden'` com o modal aberto e `''` depois. Salvar com erro de API (ex.: a categoria "a") fecha o modal **antes** do toast de erro.
**Suspeitas:** B35, B93, B94, B95, B198, B220.
**Arquivos:** `src/components/ModalWizard.jsx`, `src/components/ProductWizard.jsx`, `src/components/CategoryWizard.jsx`, `src/components/CouponWizard.jsx`.

#### A09 — Wizard de produto: passo 1 "Básico"

- **O que aparece:** "Nome do produto *" (`#product-name`, "Ex: Kit Festa Junina Completo"), "Categoria *" (`#product-category`: 1ª opção "Selecione uma categoria…", o valor é o UUID, lista todas as categorias) e "Descrição *" (`#product-description`, 5 linhas).

| Elemento            | Onde          | O que acontece                                                                                                                             | API | Destrutivo? |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --- | ----------- |
| "Nome do produto *" | topo          | Enter **submete o formulário inteiro** (B94)                                                                                               | —   | não         |
| "Categoria *"       | abaixo        | Valor em UUID; na edição vem pré-selecionada                                                                                               | —   | não         |
| "Descrição *"       | largura total | Multilinha                                                                                                                                 | —   | não         |
| "Avançar →"         | rodapé        | Toasts, nesta ordem: "Nome do produto é obrigatório" → "Categoria é obrigatória" → "Descrição é obrigatória" (só espaços conta como vazio) | —   | não         |

**Checagens:** a sequência de toasts acima. " " dá "Nome do produto é obrigatório". Em "Novo produto" com os 3 campos preenchidos, Enter no Nome leva a "Mídia" com o toast "Pelo menos uma imagem é obrigatória". Conte as opções do select e anote as que têm nome UUID.
**Suspeitas:** B01, B94.
**Arquivos:** `src/components/ProductWizard.jsx`, `src/components/product-wizard-form.js`.

#### A10 — Wizard de produto: passo 2 "Mídia" (AssetUploader)

- **O que aparece:** três blocos.
  - **"Imagens do produto \*"**, com a dica "Selecione cada imagem do seu computador. JPG, PNG ou WebP até 500kB — imagens leves deixam a loja rápida." e o botão "Adicionar imagem".
  - **"Vídeos (opcional)"**, com a dica "MP4, WebM ou MOV até 50MB. Sobe pro Storage privado." e o botão "Adicionar vídeo".
  - **"Arquivo para download \*"**, com a dica "PDF, ZIP ou similar até 50MB. Entregue ao cliente via URL assinada após pagamento aprovado.".

  Cada cartão tem uma miniatura de 64 px (alt "Preview de Imagem N"), o nome do arquivo ou "Nenhum arquivo selecionado", a URL ou "Clique em "Escolher arquivo".", a barra de progresso, o texto de erro e os botões "Escolher"/"Trocar" (mostra "NN%" durante o envio), "Limpar" e X "Remover slot".

| Elemento                               | Onde                          | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                     | API                                                                                                                                                         | Destrutivo?       |
| -------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| "Escolher" (imagem)                    | cartão                        | >500 kB: **sem requisição**, erro e o toast "Imagem de NNNkB excede o limite de 500kB. Otimize (ex.: squoosh.app ou tinypng.com) antes de subir.". ≤500 kB: "NN%", depois o toast "Imagem N enviado." e a URL pública `…/storage/v1/object/public/product_images/…`. Extensão inválida: "Extensão de arquivo não suportada para image.". SVG: "Tipo de arquivo não suportado: image/svg+xml" / "Tipo de arquivo não permitido em bucket público.". | `POST {API}/admin/upload-url {kind:'image', filename, mimeType}` → `{uploadUrl, finalUrl, bucket, path, maxSize, confirmRequired:true}` + `PUT <uploadUrl>` | **sim** (Storage) |
| "Trocar"                               | cartão com arquivo            | Novo upload; o objeto antigo fica órfão                                                                                                                                                                                                                                                                                                                                                                                                            | idem                                                                                                                                                        | **sim**           |
| "Limpar"                               | cartão com arquivo            | Esvazia o cartão; nada é removido do Storage                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                           | não               |
| "Remover slot" (X)                     | imagens (≥2 cartões) e vídeos | Remove o cartão; desabilitado durante o upload                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                           | não               |
| "Adicionar imagem" / "Adicionar vídeo" | blocos                        | Acrescentam um cartão vazio                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                           | não               |
| "Escolher" (vídeo)                     | cartão                        | OK: "Vídeo N enviado." com o valor `product_videos/<arquivo>` (caminho relativo, bucket privado; **não toca na loja**, B21). >50 MB: "Arquivo excede 50MB.".                                                                                                                                                                                                                                                                                       | `POST {API}/admin/upload-url {kind:'video'}` + PUT                                                                                                          | **sim**           |
| "Escolher" (download)                  | cartão                        | OK: "Arquivo do produto enviado." com o valor `product_files/<arquivo>`. `.html`, `.svg`, `.js`, `.exe`, `.php`, `.sh`: "Tipo de arquivo não permitido.".                                                                                                                                                                                                                                                                                          | `POST {API}/admin/upload-url {kind:'download'}` + PUT                                                                                                       | **sim**           |
| "Avançar →"                            | rodapé                        | "Pelo menos uma imagem é obrigatória" / "URL de download é obrigatória"                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                           | não               |

| Estado             | Como provocar             | O que se vê                                                                                                                                                        |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cartão vazio       | Produto novo              | "Nenhum arquivo selecionado" + "Escolher"                                                                                                                          |
| Enviando           | Throttling                | "NN%" desabilitado e a barra de progresso                                                                                                                          |
| Erro de upload     | >500 kB, `.html`, offline | Vermelho no cartão + toast ("Erro de rede no upload.", "Upload falhou (HTTP 4xx).", "Sessão admin inválida ou expirada.", "Origem não permitida (possível CSRF).") |
| Edição com galeria | "Editar"                  | Só 1 cartão de imagem e nenhum vídeo (B02)                                                                                                                         |

**Checagens:** uma imagem de ~600 kB não gera POST. Uma de ≤500 kB gera 1 POST + 1 PUT 200 e a miniatura carrega. **Não** sai um segundo POST com `{action:'confirm'}` (B96). O download mostra o caminho `product_files/…`.
**Suspeitas:** B02, B21, B96, B97, B221.
**Arquivos:** `src/components/ProductWizard.jsx`, `src/services/admin-panel.js`, `handlers/admin/upload-url.js`.

#### A11 — Wizard de produto: passo 3 "Preço & Variações"

- **O que aparece:** "Preço (R$) \*" (`#product-price`, step 0.01, "Ex: 39.90"), "Preço original (opcional)" ("Ex: 65.00", com a dica "Exibe o "de R$..." riscado para destacar a economia.") e "Tipo de produto" ("Produto individual" / "Kit", com a dica "Kits podem conter múltiplos produtos. Produtos individuais são vendidos isoladamente."). **Não há campo de variação** (B223).

| Elemento          | Onde     | O que acontece                                                          | API | Destrutivo? |
| ----------------- | -------- | ----------------------------------------------------------------------- | --- | ----------- |
| "Preço (R$) \*"   | esquerda | Vazio, 0 ou negativo bloqueiam o avanço; Enter não faz nada             | —   | não         |
| "Preço original"  | direita  | Opcional; vazio vira 0; a loja só risca o preço se ele for maior        | —   | não         |
| "Tipo de produto" | abaixo   | Grava `product_type`, **não** `is_kit` (o selo "KIT" não aparece, B222) | —   | não         |
| "Avançar →"       | rodapé   | "Preço válido é obrigatório"                                            | —   | não         |

**Checagens:** vazio e "0" dão o toast; "9.90" avança. Na edição, "Preço original" vem vazio (B02). Um produto salvo como "Kit" não mostra o selo.
**Suspeitas:** B02, B222, B223.
**Arquivos:** `src/components/ProductWizard.jsx`, `src/components/product-wizard-form.js`, `src/pages/AdminPage.jsx`.

#### A12 — Wizard de produto: passo 4 "Conversão" e salvar

- **O que aparece:** três seções.
  - **"Benefícios"**, com a dica "Bullets curtos exibidos na página do produto. Ícone Bootstrap opcional (ex.: printer-fill, file-pdf-fill). Se ficar vazio, a loja mostra 4 benefícios padrão.". Cada linha tem "ícone (opcional)", "Ex: PDF em alta resolução" e a lixeira "Remover benefício N"; o botão é "Adicionar benefício".
  - **"Perguntas frequentes (FAQ)"**, com os campos "Pergunta" e "Resposta", a lixeira e o botão "Adicionar pergunta".
  - **"Depoimentos"**, com a dica "Depoimentos reais (não inventar — regra B6). Autor e texto são obrigatórios; o resto é opcional.". Os campos são "Autor \*", "Cargo (ex.: Professora)", "Local (ex.: SP)", o select de nota ("Sem nota", "★★★★★ (5)" … "★ (1)") e "Depoimento \*"; o botão é "Adicionar depoimento".

| Elemento                                      | Onde            | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | API                                                                                                                   | Destrutivo? |
| --------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------- |
| "Adicionar benefício / pergunta / depoimento" | seções          | Acrescentam uma linha. As linhas incompletas são descartadas ao salvar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                     | não         |
| Lixeiras "Remover … N"                        | linhas          | Removem sem confirmação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                     | não         |
| Inputs de texto do passo                      | todas as seções | **Enter salva e fecha** (B95)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | POST/PUT                                                                                                              | **sim**     |
| Nota                                          | depoimento      | 1–5 ou null                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                     | não         |
| "Salvar Produto"                              | rodapé          | Revalida os passos 1–3 (volta ao primeiro com erro). Se passar, o modal fecha na hora e sai o POST (novo) ou o PUT (edição), seguido do GET do dashboard e do toast "Produto criado." / "Produto atualizado.". Erros: "name e price válidos são obrigatórios", "Valor acima do limite.", "Produto não encontrado", "Erro ao processar produtos do admin", 401 (+ login), 403 CSRF. **Efeitos colaterais:** cria uma categoria-fantasma UUID (B01) e, na edição, sobrescreve galeria, vídeos, preço original, tipo, FAQ, depoimentos, benefícios e `featured`, e **reativa** um produto pausado (B02). | `POST {API}/admin/products` → 201 `{success:true,id}` / `PUT {API}/admin/products` → 200; `GET {API}/admin/dashboard` | **sim**     |

**Checagens:** num produto novo [TESTE], o POST 201 leva `categoryId` (UUID), `images`, `videos`, `faq`, `reviews` e `benefits` só com linhas preenchidas, `active:true`, `featured:false` e `originalPrice:null`. Depois, anote se a CATEGORIA aparece como UUID. Editar um produto [TESTE] completo e pausado, sem mudar nada, e salvar gera um PUT com 1 imagem, `videos:[]`, `originalPrice:null`, `faq:[]`, `benefits:[]`, `reviews:[]`, `active:true` e `featured:false`. Com "Disable cache", `/produtos/<slug>` reflete o que foi gravado.
**Suspeitas:** B01, B02, B93, B95, B224.
**Arquivos:** `src/components/ProductWizard.jsx`, `src/components/product-wizard-form.js`, `src/pages/AdminPage.jsx`, `handlers/admin/products.js`, `validation/admin.schemas.js`.

#### A13 — Desempenho dos produtos

- **Rota:** Produtos › Desempenho. h1 "Desempenho dos produtos". **Acesso:** admin.
- **O que aparece:** o card "Desempenho de produtos" / "Ordenado por unidades vendidas", com a tabela PRODUTO, VENDAS, RECEITA, DOWNLOADS e TAXA DE DOWNLOAD (barra + "N%"). Lista **todos** os produtos. Só leitura; não ordena por clique nem pagina.

| Estado            | Como provocar  | O que se vê                                                                    |
| ----------------- | -------------- | ------------------------------------------------------------------------------ |
| Sem produtos      | Catálogo vazio | "Sem dados de desempenho"                                                      |
| Produto sem venda | —              | 0 / R$ 0,00, a taxa em 0% com barra mínima (ou 100% se houver downloads, B201) |
| Erro              | API parada     | Cartão rosa                                                                    |

**Checagens:** Vendas é a soma de `quantity` dos itens aprovados (todos os tempos). Receita é a soma de preço × qtde. Downloads são as linhas de `download_logs`. Taxa é `min(100, round(Downloads / max(Vendas,1) × 100))`. VENDAS vem em ordem decrescente. A receita de cada produto é igual à da ABC do Dashboard. O número de linhas é igual ao total da Lista de produtos.
**Suspeitas:** B87, B201.
**Arquivos:** `src/components/admin/tabs/PerformanceTab.jsx`, `src/components/admin/utils/derive.js`, `handlers/admin/dashboard.js`.

#### A14 — Categorias

- **Rota:** Produtos › Categorias. **Acesso:** admin.
- **O que aparece:** o h1 "Categorias" e um card com o h2 "Categorias", "N categoria(s) cadastrada(s)" e o botão "Nova categoria". Abaixo, uma grade de cartões em ordem alfabética: a cor, o nome, uma estrela se for featured, "#9B5DE5 · Ativa" / "· Inativa", "Editar" e a lixeira aria-label "Excluir".

| Elemento            | Onde    | O que acontece                                                                                                                                                                                                                                                  | API                                                                     | Destrutivo? |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------- |
| "Categorias"        | sidebar | "Carregando…" e depois a grade                                                                                                                                                                                                                                  | `GET {API}/admin/dashboard`                                             | não         |
| "Nova categoria"    | card    | Abre "Adicionar Categoria" (cor #9B5DE5, "Categoria ativa" marcada)                                                                                                                                                                                             | —                                                                       | não         |
| "Editar"            | cartão  | "Editar Categoria" preenchido                                                                                                                                                                                                                                   | —                                                                       | não         |
| "Excluir" (lixeira) | cartão  | `window.confirm('Excluir a categoria "<nome>"?')`. OK: DELETE e o toast "Categoria removida.". Os produtos dela passam a "Sem categoria" e a seção dela na Vitrine some da home **sem aviso** (B225). Erros: 401, 500 "Erro ao processar categorias do admin.". | `DELETE {API}/admin/categories?id=<uuid>` + `GET {API}/admin/dashboard` | **sim**     |

| Estado                 | Como provocar    | O que se vê                                                                     |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------- |
| Vazio                  | Sem categorias   | "Nenhuma categoria" / "Crie sua primeira categoria para organizar os produtos." |
| Erro / sessão expirada | Offline / logout | Cartão rosa / login                                                             |

**Checagens:** o subtítulo é igual ao número de cartões, em ordem alfabética. Anote os cartões com nome UUID e não os exclua se não forem de teste. O stub em false não gera DELETE. Com o stub em true numa categoria [TESTE]: DELETE 200 e "Categoria removida.". O produto vinculado passa a "Sem categoria".
**Suspeitas:** B20, B98, B216, B217, B225.
**Arquivos:** `src/components/admin/tabs/CategoriesTab.jsx`, `src/pages/AdminPage.jsx`, `handlers/admin/categories.js`.

#### A15 — Modal "Adicionar Categoria" / "Editar Categoria"

- **O que aparece:**
  - "Nome da categoria \*" (`#cat-name`, "Ex: Festa Junina");
  - "Cor de destaque" (`input type=color` + uma pastilha com o hex em maiúsculas);
  - o cartão-checkbox "★ Evidenciar na página de produtos" ("Categorias evidenciadas aparecem em destaque no topo da lista de produtos.");
  - o cartão-checkbox "Categoria ativa" ("Desative para ocultar a categoria da loja, mantendo os dados.");
  - "Cancelar" e "Salvar Categoria".

| Elemento               | Onde   | O que acontece                                                                                                                                                                                                                                                                                                                                                                               | API                                                                            | Destrutivo? |
| ---------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- |
| "Nome da categoria \*" | topo   | Enter salva                                                                                                                                                                                                                                                                                                                                                                                  | POST/PUT                                                                       | **sim**     |
| "Cor de destaque"      | abaixo | Atualiza a pastilha. Se a extensão não conseguir operar o seletor nativo, defina o `value` por script e dispare `input`/`change`.                                                                                                                                                                                                                                                            | —                                                                              | não         |
| "★ Evidenciar…"        | cartão | Estrela no cartão; **sem efeito na loja** (B98)                                                                                                                                                                                                                                                                                                                                              | —                                                                              | não         |
| "Categoria ativa"      | cartão | Desmarcada: "· Inativa"; a categoria sai dos filtros e da home                                                                                                                                                                                                                                                                                                                               | —                                                                              | não         |
| "Salvar Categoria"     | rodapé | Nome vazio: o toast "Nome da categoria é obrigatório" com o modal **aberto**, sem requisição. Senão, fecha e depois mostra "Categoria criada." / "Categoria atualizada." ou o erro: "Nome deve ter entre 2 e 60 caracteres.", "Nome inválido: não cole IDs no campo nome.", "Categoria já existe." (409, só no POST), "Categoria não encontrada.", "Erro ao processar categorias do admin.". | `POST {API}/admin/categories` → 201 / `PUT` → 200; `GET {API}/admin/dashboard` | **sim**     |

**Checagens:** vazio não gera requisição. "a" fecha o modal e gera um 400. Um UUID dá 400 com a mensagem de IDs. Um nome existente dá 409. "[TESTE] QA Cat" dá 201 e "Categoria criada." (o cartão pode não aparecer por causa do cache, B20).
**Suspeitas:** B93, B226, B227.
**Arquivos:** `src/components/CategoryWizard.jsx`, `handlers/admin/categories.js`, `validation/admin.schemas.js`.

### 4.4 Pedidos e cupons

#### A16 — Pedidos

- **Rota:** `/admin` › Pedidos. **Acesso:** admin.
- **O que aparece:** o h1 "Pedidos" e um card com o h2 "Pedidos", "N pedido(s) no filtro atual" e o select de status ("Todos os status", "Aprovado", "Pendente", "Recusado", "Cancelado", "Falhou"). A tabela tem PEDIDO / CLIENTE (código + e-mail, nome ou "Cliente não identificado"), STATUS (chip + "dd/mm/aaaa, hh:mm"), TOTAL e "Detalhes". **Só leitura:** não há busca, CSV, alteração de status nem reenvio.

| Elemento         | Onde    | O que acontece                                                                                                           | API                                                                            | Destrutivo? |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------- |
| "Pedidos"        | sidebar | "Carregando…" e depois a tabela                                                                                          | `GET {API}/admin/orders`                                                       | não         |
| Select de status | card    | Busca no servidor; o card **inteiro** (inclusive o select) vira "Carregando…" (B232). O filtro sobrevive à troca de aba. | `GET {API}/admin/orders?status=approved\|pending\|rejected\|cancelled\|failed` | não         |
| "Detalhes"       | linha   | Abre A06                                                                                                                 | —                                                                              | não         |

| Estado          | Como provocar                         | O que se vê                                                          |
| --------------- | ------------------------------------- | -------------------------------------------------------------------- |
| Vazio           | Filtro "Falhou"                       | "Nenhum pedido" / "Nenhum pedido corresponde ao filtro selecionado." |
| Erro            | Offline + trocar o filtro             | Cartão rosa "Erro ao buscar pedidos do admin."; o select some junto  |
| Sessão expirada | Logout em outra aba + trocar o filtro | Os toasts e o login                                                  |

**Checagens:** o subtítulo é igual ao número de linhas. "Aprovado" gera `?status=approved` e só mostra chips "Aprovado". As datas e os totais vêm formatados. Confirme a **ausência** de busca, CSV e ações.
**Suspeitas:** B81, B87, B194, B199, B232, B233.
**Arquivos:** `src/components/admin/tabs/OrdersTab.jsx`, `src/components/admin/ui/StatusChip.jsx`, `handlers/admin/orders.js`.

#### A17 — Cupons

- **Rota:** `/admin` › Cupons. **Acesso:** admin.
- **O que aparece:** o h1 "Cupons" e o carregamento próprio "Carregando cupons…". O card tem o h2 "Cupons de desconto", "N cupom(ns) cadastrado(s) · validados no checkout" e "Novo cupom". Cada cartão mostra o código em mono, "Ativo"/"Inativo", "10% OFF" ou "R$ 10,00 OFF", "Sem expiração" / "Vale até dd/mm/aaaa" / "Expirou em dd/mm/aaaa", "N uso(s)" ou "N/M usos", "Mín. R$ x,xx", "Editar" e a lixeira "Excluir <CÓDIGO>". Ativar e desativar só pelo "Editar".

| Elemento           | Onde    | O que acontece                                                                                                                                                                                                                        | API                                                             | Destrutivo? |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------- |
| "Cupons"           | sidebar | "Carregando cupons…" e depois a grade                                                                                                                                                                                                 | `GET {API}/admin/coupons`                                       | não         |
| "Novo cupom"       | card    | "Novo Cupom" (Percentual, ativo)                                                                                                                                                                                                      | —                                                               | não         |
| "Editar"           | cartão  | "Editar Cupom" (a data aparece **1 dia antes**, B99)                                                                                                                                                                                  | —                                                               | não         |
| "Excluir <CÓDIGO>" | cartão  | `window.confirm('Excluir o cupom "<CÓDIGO>"?')`. OK: DELETE, recarga e "Cupom removido.". Erros: "Sessão admin inválida ou expirada." (**sem** voltar ao login, B80), "Erro ao processar cupons do admin.", "Erro ao remover cupom.". | `DELETE {API}/admin/coupons?id=<n>` + `GET {API}/admin/coupons` | **sim**     |

| Estado          | Como provocar       | O que se vê                                                                             |
| --------------- | ------------------- | --------------------------------------------------------------------------------------- |
| Erro            | Offline             | Só a caixa rosa, sem "Novo cupom" (B228)                                                |
| Sessão expirada | Logout em outra aba | A caixa rosa; o painel continua                                                         |
| Vazio           | Sem cupons          | "Nenhum cupom" / "Crie cupons de desconto validados no checkout — sem precisar de SQL." |
| Expirado        | Validade passada    | "Expirou em …"; o chip pode continuar "Ativo"                                           |

**Checagens:** o número de cartões bate com o subtítulo. Os formatos "% OFF" e "R$ x,xx OFF" aparecem. Um cupom [TESTE] com validade 31/12/2026 mostra "Vale até 30/12/2026" num navegador em BRT (B99). O stub em false não gera DELETE.
**Suspeitas:** B80, B99, B228, B229.
**Arquivos:** `src/components/admin/tabs/CouponsTab.jsx`, `handlers/admin/coupons.js`, `lib/coupons.js`.

#### A18 — Modal "Novo Cupom" / "Editar Cupom"

- **O que aparece:**
  - "Código \*" (`#coupon-code`, mono, até 64 caracteres, "Ex: VOLTEI15", com a dica "Letras, números, ponto, hífen e underscore. Sem espaços.");
  - "Tipo de desconto" ("Percentual (%)" / "Valor fixo (R$)") e "Desconto (%) \*" (step 1, máx. 100) ou "Desconto (R$) \*";
  - "Pedido mínimo (R$)" ("Opcional") e "Limite de usos" ("Vazio = ilimitado");
  - "Válido até" (date, "Vazio = sem data de expiração.");
  - o cartão-checkbox "Cupom ativo" ("Desative para suspender o cupom sem apagá-lo. Inativos não validam no checkout.");
  - "Cancelar" e "Salvar Cupom".

| Elemento                           | Onde     | O que acontece                                                                                                                                                                                                                                                                                                                                                                          | API                                                                       | Destrutivo? |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------- |
| "Código \*"                        | topo     | Converte para maiúsculas e tira os espaços ("qa teste 10" → "QATESTE10"). Enter salva.                                                                                                                                                                                                                                                                                                  | —                                                                         | não         |
| "Tipo de desconto"                 | 2ª linha | Troca o rótulo, o step e o máximo                                                                                                                                                                                                                                                                                                                                                       | —                                                                         | não         |
| "Desconto"                         | 2ª linha | >100, decimal no % ou negativo: balão nativo, sem requisição. 0 ou vazio: toast "Valor do desconto deve ser maior que zero."                                                                                                                                                                                                                                                            | —                                                                         | não         |
| "Pedido mínimo" / "Limite de usos" | 3ª linha | Vazio = sem mínimo / ilimitado. **Limite 0 é aceito** (B230).                                                                                                                                                                                                                                                                                                                           | —                                                                         | não         |
| "Válido até"                       | 4ª linha | Vai como `YYYY-MM-DD` ou null; uma data passada é aceita                                                                                                                                                                                                                                                                                                                                | —                                                                         | não         |
| "Cupom ativo"                      | cartão   | Inativo: no checkout, "Este cupom não está mais ativo."                                                                                                                                                                                                                                                                                                                                 | —                                                                         | não         |
| "Salvar Cupom"                     | rodapé   | Front (modal aberto): "Código deve ter ao menos 3 caracteres.", "Valor do desconto deve ser maior que zero.". Se passar: fecha e depois "Cupom criado." / "Cupom atualizado." ou o erro: "Código só pode ter letras, números, ponto, hífen e underscore.", "Já existe um cupom com esse código." (409), "Data de validade inválida.", "Cupom não encontrado.", "Erro ao salvar cupom.". | `POST {API}/admin/coupons` → 201 / `PUT` → 200; `GET {API}/admin/coupons` | **sim**     |

**Checagens:** "qa teste 10" vira "QATESTE10". "AB" dá o toast sem requisição. 150% não gera requisição (`:invalid`). "PROMO@10" fecha o modal e gera um 400. Um código duplicado dá 409. O código **não aceita colchetes**: use `TESTE-QA-01`.
**Suspeitas:** B93, B99, B230, B231.
**Arquivos:** `src/components/CouponWizard.jsx`, `handlers/admin/coupons.js`, `validation/admin.schemas.js`.

### 4.5 Financeiro e análises

#### A19 — Faturamento

- **Rota:** Financeiro › Faturamento. **Acesso:** admin.
- **O que aparece:** três StatCards: "Bruto acumulado", "Pedidos aprovados" e "Ticket médio" (de todos os tempos). Abaixo, o card "Faturamento dos últimos 6 meses" / "Apenas pedidos aprovados", com 6 linhas (mês abreviado, R$ e uma barra verde). Só leitura.

| Estado     | Como provocar | O que se vê                                                                                      |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------ |
| Sem vendas | Base vazia    | R$ 0,00 / 0 / R$ 0,00 e 6 linhas com barra mínima ("Sem vendas no período." nunca aparece, B200) |
| Erro       | API parada    | Cartão rosa                                                                                      |

**Checagens:** "Bruto acumulado" é igual a Dashboard › "Receita total". "Pedidos aprovados" é igual ao do Dashboard. Ticket médio = Bruto ÷ Pedidos. As 6 linhas terminam no mês atual; a última é igual a Comparativo › Mês atual › Receita, e a penúltima ao mês anterior.
**Suspeitas:** B200.
**Arquivos:** `src/components/admin/tabs/FinanceTab.jsx`, `src/components/admin/ui/BarList.jsx`, `src/components/admin/utils/derive.js`.

#### A20 — Comparativo mensal

- **Rota:** Financeiro › Comparativo. h1 "Comparativo mensal". **Acesso:** admin.
- **O que aparece:** o card "Comparativo mensal" / "Mês atual vs. mês anterior", com um selo ("↗ +X,X%", "↘ -X,X%" ou "— Estável") e dois blocos, "Mês anterior" e "Mês atual" (ex.: "Agosto De 2026"), cada um com "Vendas", "Receita" e "Ticket médio".

| Estado                    | Como provocar   | O que se vê |
| ------------------------- | --------------- | ----------- |
| Sem vendas nos dois meses | Base vazia      | "— Estável" |
| Mês anterior zerado       | 1ª venda do mês | "+100,0%"   |

**Checagens:** o cálculo usa o mês do NAVEGADOR, por `completedAt||createdAt`. O selo é (atual − anterior) ÷ anterior, com vírgula e 1 casa. "Mês atual › Receita" é igual ao "Faturamento do mês" do Dashboard.
**Suspeitas:** B86, B196.
**Arquivos:** `src/components/admin/tabs/ComparisonTab.jsx`, `src/components/admin/utils/derive.js`.

#### A21 — Funil de conversão

- **Rota:** `/admin` › Funil. **Acesso:** admin.
- **O que aparece:**
  - "Funil de conversão" / "Sessões únicas por etapa nos últimos N dias" e o seletor "7 dias \| 30 dias \| 90 dias" (padrão 30);
  - 4 blocos: "Sessões únicas", "Eventos registrados", "Compras aprovadas" e "Receita no período";
  - o card "Funil canônico" com 5 barras ("Visitas ao catálogo", "Visualizou produto", "Adicionou ao carrinho", "Iniciou checkout", "Compra aprovada"), cada uma com a contagem e "conv. X%";
  - o card "Atribuição por UTM source", com a tabela ORIGEM / PEDIDOS / RECEITA / SHARE.

| Elemento                         | Onde  | O que acontece                                              | API                                     | Destrutivo? |
| -------------------------------- | ----- | ----------------------------------------------------------- | --------------------------------------- | ----------- |
| "7 dias" / "30 dias" / "90 dias" | barra | Mudam o subtítulo; mostram "Carregando funil…" e recarregam | `GET {API}/admin/funnel?days=7\|30\|90` | não         |

| Estado         | Como provocar             | O que se vê                                                                                                                |
| -------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sem eventos    | —                         | "Sem eventos no período" / "Os trackers começarão a alimentar este funil assim que clientes navegarem com a Fase 0 ativa." |
| Sem atribuição | —                         | "Sem pedidos atribuídos" / "Compras aprovadas com UTM aparecerão aqui."                                                    |
| Erro           | Bloquear `*admin/funnel*` | Caixa rosa **acima** dos KPIs, que mantêm os números anteriores (B211)                                                     |

**Checagens:** o período altera `days=`. "Sessões únicas" são os `session_id` distintos. "Compras aprovadas" e "Receita" consideram os pedidos aprovados **criados** no período. "conv." é a etapa ÷ a anterior. A soma da tabela de UTM é igual a "Compras aprovadas" e à "Receita". Há `Cache-Control: private, max-age=3600`.
**Suspeitas:** B80, B90, B91, B210, B211, B212.
**Arquivos:** `src/components/admin/tabs/FunnelTab.jsx`, `handlers/admin/funnel.js`.

#### A22 — Análise (Curva ABC de produtos e clientes + coorte)

- **Rota:** `/admin` › Análise. **Acesso:** admin.
- **O que aparece:**
  - **Topo:** "Curva ABC + Coorte" / "Decisões de produto, estoque e campanha baseadas em receita real." e 3 selects.
  - **"Curva ABC — Produtos"** ("Princípio de Pareto: A acumula 80% da receita; B vai até 95%; C é cauda longa."), com "Como ler", "CSV", os chips A/B/C, o top 12 e "Receita total no período: R$ X".
  - **"Curva ABC — Clientes"**, com "Como ler", "CSV", os chips "VIP" / "Recorrente" / "Eventual", o top 12 (nome ou e-mail mascarado + "N pedido(s) · ticket R$ X") e a nota "E-mails são mascarados na visualização — export CSV usa a mesma máscara.".
  - **"Retenção por coorte (últimos 12 meses)"**, com "Como ler", "CSV", um heatmap (Coorte, Tam., M+0…M+11) e "N clientes únicos no período.".
  - **Rodapé:** "Dados em cache por 1h (regra F5). Adicione ?nocache=1 à URL para forçar recálculo." (B202).

| Elemento                                                 | Onde                   | O que acontece                                                                                                                                         | API                                                                              | Destrutivo? |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------- |
| Select "Produtos: último mês / trimestre / ano"          | topo                   | Refaz as **três** chamadas, sem indicador                                                                                                              | `GET {API}/admin/abc-products?period=month\|quarter\|year` (+ clientes + coorte) | não         |
| Select "Filtro de categoria"                             | topo                   | Acrescenta `&categoryId=<id>`                                                                                                                          | idem                                                                             | não         |
| Select "Clientes: último mês / trimestre (padrão) / ano" | topo                   | Refaz as três                                                                                                                                          | `GET {API}/admin/abc-customers?period=`                                          | não         |
| "Como ler" (×3)                                          | cabeçalho de cada card | Abre A23                                                                                                                                               | —                                                                                | não         |
| "CSV" (produtos)                                         | card                   | Baixa `curva-abc-produtos-<period>.csv` com o cabeçalho `Rank,Classe,Produto,Categoria,Quantidade,Receita,% Share,% Acumulado`; desabilitado sem itens | —                                                                                | não         |
| "CSV" (clientes)                                         | card                   | `curva-abc-clientes-<period>.csv`: `Rank,Classe,Relação,Email (mascarado),Pedidos,Receita,Ticket médio,% Share`                                        | —                                                                                | não         |
| "CSV" (coorte)                                           | card                   | `cohort-mensal.csv`: `Coorte,Tamanho,M+0,…`                                                                                                            | —                                                                                | não         |
| Célula do heatmap (hover)                                | coorte                 | Tooltip "<ativos>/<tamanho> ativos em AAAA-MM"                                                                                                         | —                                                                                | não         |

| Estado          | Como provocar             | O que se vê                                                                                                                                                                            |
| --------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carregando      | Entrar                    | "Carregando…" e depois "Calculando análise…"                                                                                                                                           |
| Troca de filtro | Qualquer select           | Sem indicador; 3 GETs                                                                                                                                                                  |
| Erro            | Bloquear `*admin/cohort*` | A aba inteira vira uma caixa rosa, **sem os filtros** (B203)                                                                                                                           |
| Sem dados       | Período vazio             | "Sem dados no período" / "Quando houver pedidos aprovados, o Pareto aparece aqui."; "Sem coortes" / "Coorte aparece com pelo menos 1 mês de pedidos aprovados."; os CSVs desabilitados |

**Checagens:** as 3 respostas vêm com `success:true`. A soma dos chips é igual ao número de itens. O #1 é sempre "A". Toda linha do heatmap tem M+0 = 100%. O filtro de categoria aparece na URL. Os nomes e cabeçalhos dos CSVs conferem. `?nocache=1` na URL da página **não** muda as requisições.
**Suspeitas:** B88, B202, B203, B204, B205, B206, B207.
**Arquivos:** `src/components/admin/tabs/AnalysisTab.jsx`, `src/components/admin/tabs/analysis-content.js`, `src/utils/csv-export.js`, `handlers/admin/abc-products.js`, `handlers/admin/abc-customers.js`, `handlers/admin/cohort.js`.

#### A23 — Modal "Como ler este gráfico" (Análise)

- **O que aparece:** um fundo escuro ("Fechar explicação") e um `<dialog open>` **sem aria-modal**, com o sobretítulo "Como ler este gráfico", o h2 ("Curva ABC — Produtos", "Curva ABC — Clientes" ou "Retenção por coorte mensal"), o X "Fechar", uma introdução e os blocos "Como o cálculo funciona", "O que observar" e "Como agir com base na análise", mais o botão "Entendi". Os blocos têm, respectivamente, 5/4/5 itens em Produtos, 4/4/5 em Clientes e 5/5/4 em Coorte.

| Elemento              | Onde   | O que acontece                                                     | API | Destrutivo? |
| --------------------- | ------ | ------------------------------------------------------------------ | --- | ----------- |
| Fundo / X / "Entendi" | —      | Fecham; o foco vai para o body                                     | —   | não         |
| Esc / Tab             | aberto | Esc **não** fecha; o Tab sai do modal; a página de trás rola (B89) | —   | não         |

**Checagens:** cada "Como ler" abre com o título certo. Conte os `<li>`. Esc não fecha (registre). `body.style.overflow` continua `''`.
**Suspeitas:** B89, B208, B209.
**Arquivos:** `src/components/admin/tabs/AnalysisTab.jsx`, `src/components/admin/tabs/analysis-content.js`.

#### A24 — Segmentos de email

- **Rota:** `/admin` › Segmentos. **Acesso:** admin.
- **O que aparece:** 4 blocos ("Inscritos totais", "Confirmados", "Aguardando opt-in", "Cancelaram") e o card "Tags por número de assinantes". As tags são "Cliente ativo", "Recorrente", "VIP", "Inativo 30d", "Inativo 90d (reativar)", "Inativo 180d+" ("NÃO enviar marketing (regra D7)") e "Comprou: <slug>". No rodapé: "Gerado em dd/mm/aaaa, hh:mm:ss. Cache de 30 min. Adicione ?nocache=1 à URL para forçar recálculo.". Só leitura.

| Estado     | Como provocar                    | O que se vê                                                                                                           |
| ---------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Carregando | Entrar                           | "Calculando segmentos…"                                                                                               |
| Erro       | Bloquear ou com a sessão vencida | Caixa rosa ("Erro ao gerar segmentação." / "Sessão admin inválida ou expirada." / "Failed to fetch")                  |
| Sem tags   | Sem confirmados                  | "Sem assinantes classificados ainda" / "Tags ficam disponíveis quando há pedidos aprovados ou inscritos confirmados." |

**Checagens:** "Inscritos totais" = Confirmados + Aguardando + Cancelaram. As tags vêm em ordem decrescente. A resposta não traz e-mails. O `Cache-Control` é `private, max-age=3600` (o texto diz 30 min, B202).
**Suspeitas:** B80, B202, B213, B214.
**Arquivos:** `src/components/admin/tabs/SegmentsTab.jsx`, `handlers/admin/segments.js`, `lib/customer-segmentation.js`.

### 4.6 Usuários, Vitrine e Segurança

#### A25 — Usuários

- **Rota:** `/admin` › Usuários. **Acesso:** admin.
- **O que aparece:** o h1 "Usuários" e um card com "N de M usuário(s)" e a busca "Buscar por nome ou e-mail". A tabela tem USUÁRIO (nome ou "Sem nome" + e-mail), PAPEL (badge CUSTOMER / SUPPORT / ADMIN + o select "Admin" / "Suporte" / "Cliente"), COMPRAS, TOTAL GASTO e AÇÕES (lixeira "Revogar acesso"). Perfis admin/master e o e-mail fixo `admin@profamarciarcardoso.com` **não** aparecem.

| Elemento                   | Onde         | O que acontece                                                                                                                                                                                                                                                                       | API                                | Destrutivo? |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------- |
| "Usuários"                 | sidebar      | "Carregando…" e depois a tabela                                                                                                                                                                                                                                                      | `GET {API}/admin/users`            | não         |
| Busca                      | card         | Filtra no navegador; sem resultado, "Nenhum usuário encontrado"                                                                                                                                                                                                                      | —                                  | não         |
| Select de papel            | coluna Papel | Grava **na hora**, sem confirmar (B235), com a linha desabilitada durante a requisição. "Admin" ou "Suporte": 400 "Role inválida. Não é permitido atribuir admin/master por este endpoint." e o select volta (B22). "Cliente" (a partir de SUPPORT): "Papel do usuário atualizado.". | `PUT {API}/admin/users {id, role}` | **sim**     |
| "Revogar acesso" (lixeira) | Ações        | Abre A26                                                                                                                                                                                                                                                                             | —                                  | não         |

| Estado            | Como provocar | O que se vê                                       |
| ----------------- | ------------- | ------------------------------------------------- |
| Busca vazia       | "zzzz"        | "Nenhum usuário encontrado", "0 de M usuário(s)"  |
| Erro              | Offline       | Cartão rosa "Erro ao carregar usuários do admin." |
| Bypass sem sessão | DEV           | A lista vazia (B186)                              |

**Checagens:** nenhum admin/master aparece listado. A busca não faz requisição. "Suporte" num cliente [TESTE] dá 400 e o select volta. COMPRAS e TOTAL GASTO batem com os pedidos aprovados do e-mail.
**Suspeitas:** B22, B87, B186, B234, B235.
**Arquivos:** `src/components/admin/tabs/UsersTab.jsx`, `handlers/admin/users.js`, `validation/admin.schemas.js`.

#### A26 — Modal "Revogar acesso?"

- **O que aparece:** um véu (botão "Cancelar") e um `<dialog open>` **sem aria-modal**, com o h3 "Revogar acesso?", o texto "Isto removerá **<nome ou e-mail>** da tabela de perfis." e os botões "Cancelar" e "Revogar acesso" (vermelho). **Não confirme com usuários reais.**

| Elemento                  | Onde   | O que acontece                                                                                                                                                                                                                                                                                                        | API                                  | Destrutivo? |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------- |
| "Cancelar" (rodapé e véu) | modal  | Fecham sem requisição                                                                                                                                                                                                                                                                                                 | —                                    | não         |
| "Revogar acesso"          | rodapé | DELETE; o modal só fecha quando a resposta chega. Sucesso: "Acesso revogado." e a linha some. Erros: 403 "Não é permitido excluir usuário admin por este endpoint.", 404 "Usuário não encontrado.", 500. O botão não fica desabilitado (B216). **Só apaga o perfil: o login do cliente continua funcionando** (B100). | `DELETE {API}/admin/users?id=<uuid>` | **sim**     |
| Esc / Tab                 | aberto | Esc não fecha. O foco não entra no modal, e o Tab pode chegar ao select "Papel" de trás, que grava na hora: **não altere nada** (B101).                                                                                                                                                                               | —                                    | não         |

**Checagens:** o `dialog[open]` tem o texto e o nome, sem aria-modal. "Cancelar" e o clique fora não geram DELETE. Só com um usuário [TESTE]: DELETE 200, e depois ele ainda consegue logar em `/login`. `window.confirm` não é chamado.
**Suspeitas:** B100, B101, B216, B217.
**Arquivos:** `src/components/admin/tabs/UsersTab.jsx`, `handlers/admin/users.js`, `lib/customer-account-provisioning.js`.

#### A27 — Vitrine (seções da home)

- **Rota:** `/admin` › Vitrine; o efeito aparece em `/`. **Acesso:** admin.
- **O que aparece:**
  - o card "Vitrine da home" / "Defina quais seções aparecem na página inicial, em que ordem e com quantos produtos." e o botão "Salvar vitrine";
  - a linha de adição: o select "Selecionar categoria…" (categorias ainda sem seção, **inclusive as inativas**) e os botões "Categoria", "Mais vendidos" e "Novidades";
  - a lista de cards, cada um com:
    - o badge e "Ordem N";
    - a manchete ("Categoria: <nome>", "Especial · Mais vendidos", "Especial · Novidades");
    - os botões "Subir", "Descer" e "Remover";
    - os campos "Título exibido", "Produtos exibidos (4–20)" e, nas seções de categoria, "Categoria vinculada".

| Elemento                              | Onde              | O que acontece                                                                                                   | API                                                                         | Destrutivo?                     |
| ------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| "Vitrine"                             | sidebar           | Carrega do dashboard. Sem configuração: 3 categorias ativas + Mais vendidos + Novidades, com limite 8.           | `GET {API}/admin/dashboard`                                                 | não                             |
| "Selecionar categoria…" + "Categoria" | 1ª linha          | "Categoria" fica desabilitado sem seleção. Adiciona uma seção (localmente) e a categoria sai do select.          | —                                                                           | não                             |
| "Mais vendidos" / "Novidades"         | 1ª linha          | Adicionam a seção especial; se ela já existe, nada acontece e não há aviso (B237)                                | —                                                                           | não                             |
| "Subir" / "Descer"                    | card              | Reordenam e renumeram                                                                                            | —                                                                           | não                             |
| "Remover"                             | card              | Remove sem confirmar. Sem nenhum card: "Vitrine vazia" / "Adicione seções para compor a home."                   | —                                                                           | não                             |
| "Título exibido"                      | card              | Vazio vira "Mais vendidos", "Novidades" ou o literal "Categoria" (B236)                                          | —                                                                           | não                             |
| "Produtos exibidos (4–20)"            | card              | Limitado a 4–20 ao salvar (vazio vira 8)                                                                         | —                                                                           | não                             |
| "Categoria vinculada"                 | card de categoria | Lista **todas** (inclusive as já usadas, B43); não atualiza o título (B238)                                      | —                                                                           | não                             |
| "Salvar vitrine"                      | card              | "Salvando..." e o toast "Vitrine salva com sucesso." ou o erro. A home pode levar até 5 min para refletir (B42). | `PUT {API}/admin/settings {key:'homeSections', value:{sections:[…]}}` → 200 | **sim** (altera a home pública) |

| Estado           | Como provocar              | O que se vê                                                                                               |
| ---------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Vitrine vazia    | Remover todos e salvar     | Grava `{sections:[]}`, mas o painel e a home voltam ao padrão (B41)                                       |
| Não salvo        | Mudar algo e trocar de aba | Descartado sem aviso                                                                                      |
| Depois de salvar | Sair e voltar              | Pode reaparecer a configuração **anterior** por causa do cache (B20). **Não salve de novo nesse estado.** |

**Checagens:** **antes** de mexer, guarde o resultado de `GET {API}/admin/settings?key=homeSections`. "Ordem 1..N" é sequencial. Dois cliques em "Mais vendidos" deixam um só card. O PUT sai com as seções na ordem da tela; um limite de 2 vira 4 e um de 25 vira 20. Confira a home com "Disable cache" e **restaure** a configuração original.
**Suspeitas:** B20, B41, B42, B43, B102, B236, B237, B238, B239.
**Arquivos:** `src/components/admin/tabs/VitrineTab.jsx`, `src/components/admin/utils/derive.js`, `handlers/admin/settings.js`, `handlers/home-sections.js`.

#### A28 — Segurança (2FA do login admin)

- **Rota:** `/admin` › Segurança. **Acesso:** admin. **PERIGO: salvar aqui pode trancar o admin fora do painel.** Em ambiente real, faça só a leitura e os testes que dão 400.
- **O que aparece:**
  - o card "Segundo fator", com o cartão-checkbox "Exigir 2FA no login admin" ("Quando ativado, o login do admin exigirá código TOTP (ou o PIN de recuperação).");
  - "TOTP secret (Base32)" (password, com o olho "Mostrar"/"Ocultar"). Sem segredo: o placeholder "Ex: JBSWY3DPEHPK3PXP" e a dica sobre o app autenticador. Com segredo: "•••••••• — configurado" e "Já configurado. Digite um novo segredo para substituir, ou deixe em branco para manter o atual.";
  - "PIN de recuperação" ("Ex: 487239" / "•••••• — configurado", com a dica "PIN numérico (6+ dígitos)…");
  - o botão "Salvar configurações" ("Salvando...");
  - o card "Boas práticas", com 4 dicas.

  Não há QR code, gerador de segredo, toggle de `allowPinFallback` nem campo de código de confirmação.

| Elemento                             | Onde    | O que acontece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | API                                                   | Destrutivo?                   |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- |
| "Segurança"                          | sidebar | Lê a config **redigida** (sem `totpSecret`/`fallbackPin`; com `has2FA`/`hasPin`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `GET {API}/admin/settings?key=adminConfig`            | não                           |
| "Exigir 2FA no login admin"          | card    | O estado inicial é `twoFactorEnabled !== false`, ou seja, **vem marcado** quando não há configuração (B03). Só persiste ao salvar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                     | não                           |
| "TOTP secret" / "PIN de recuperação" | card    | Vazio preserva o valor atual; um valor novo é validado só no servidor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                     | não                           |
| "Mostrar" / "Ocultar"                | olho    | Alterna password/text e o aria-label                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                     | não                           |
| "Salvar configurações"               | rodapé  | Envia **sem** `confirmationCode`. Validação (400, nada é gravado): "Campo "totpSecret" inválido: o TOTP secret deve estar em Base32 (letras A-Z e dígitos 2-7).", "…deve ter ao menos 16 caracteres.", "Campo "fallbackPin" inválido: o PIN de fallback deve ter ao menos 6 caracteres.", "…no máximo 64 caracteres.", "…é fraco demais (evite dígitos repetidos ou sequências óbvias).". Com 2FA vigente e mudança num campo de segurança: 403 "Alterações no segundo fator exigem o código TOTP (ou PIN) atual em "confirmationCode"." (B24); a partir da 6ª vez em 10 min, 429 "Muitas tentativas de confirmação. Aguarde 10 minutos e tente novamente.". Sucesso: GET e o toast "Configurações de segurança salvas.". | `PUT {API}/admin/settings {key:'adminConfig', value}` | **sim, pode trancar o admin** |

| Estado                 | Como provocar                | O que se vê                                                                                 |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Sem `adminConfig`      | `value:null`                 | Placeholders "Ex: …" e o checkbox **marcado**                                               |
| 2FA configurado        | `has2FA`/`hasPin` true       | "— configurado"                                                                             |
| Reautenticação exigida | 2FA vigente + mudança        | 403, sem campo para o código                                                                |
| Depois do trancamento  | Salvar 2FA sem método e sair | O login, depois da senha certa, dá 500 "2FA ativado sem método configurado no adminConfig." |

**Checagens (seguras):** o GET não traz `totpSecret`/`fallbackPin`, e os placeholders batem com `has2FA`/`hasPin`. O olho alterna. "abc" no TOTP + Salvar dá 400 "…ao menos 16 caracteres."; "abc1" dá a mensagem de Base32. "111111" no PIN dá "…fraco demais…"; "12345" dá "…ao menos 6 caracteres.". Recarregue a aba e confira que nada mudou. Em `GET /admin/dashboard` › `settings.adminConfig`, registre só a **presença** das chaves (B85). **Nunca** clique em Salvar com os campos vazios ou com valores válidos fora de um ambiente descartável.
**Suspeitas:** B03, B04, B23, B24, B85, B103, B104, B240.
**Arquivos:** `src/components/admin/tabs/SecurityTab.jsx`, `src/pages/AdminPage.jsx`, `handlers/admin/settings.js`, `lib/admin-2fa.js`, `lib/env-secret.js`, `handlers/admin/login.js`.

---

## 5. Fluxos ponta a ponta

> Cada fluxo lista as pré-condições, os passos, o resultado esperado e os riscos. **"Achado esperado"** marca o comportamento atual, que é um bug (o ID remete à seção 6). Execute F01–F05 antes dos demais.

### 5.1 Preparação

#### F01 — Subir o ambiente local e fazer o smoke técnico

- **Pré-condições:** o dono já rodou `npm install` (o `node_modules` **não existe** hoje) e `npm run dev:all`. Este fluxo não faz nenhuma escrita.
- **Passos:**
  1. Abra `http://localhost:3000/health` e confira `{"ok":true,"service":"api","port":3000}`.
  2. Abra `http://localhost:5173` (nunca `127.0.0.1`) e clique em "Apenas essenciais".
  3. Na aba Network, confira `GET http://localhost:3000/api/admin/session` e `/api/auth/customer/session` com 200 (2× cada, por causa do StrictMode) e `/api/home-sections` com 200.
  4. Abra `/produtos` e `/produtos/banner-quadrilha`: `/api/products`, `/api/product-details` e `/api/cross-sell` respondem 200.
  5. Abra `http://localhost:3000/sitemap.xml` (as `<loc>` usam o domínio ngrok) e `http://localhost:5173/robots.txt` (sem a linha do painel).
  6. Abra `http://localhost:5173/admin`: aparece "Verificando sessão" e depois "Painel administrativo" / "Acesso restrito", e a URL continua `/admin`.
- **Resultado esperado:** tudo 200, com a URL `/admin` preservada.
- **Riscos:** cada F5 gasta cerca de 4 requisições do limite de borda de dev (250 a cada 15 min).

#### F02 — Identificar a versão do deploy e do local antes de validar

- **Pré-condições:** uma janela anônima.
- **Passos:**
  1. Na barra de endereço, abra `https://atelie-escolar.vercel.app/api/auth/customer/logout`. Um 404 `NOT_FOUND` indica o deploy antigo (a situação de hoje); um 405 `METHOD_NOT_ALLOWED` indica o código atual.
  2. Abra `https://atelie-escolar.vercel.app/admin` e anote a URL final: `/painel-acesso-privado-atelie` é o deploy antigo, e `/admin` é o código atual.
  3. Abra `/painel-acesso-privado-atelie`: se aparecer o login, é o antigo; se aparecer "Página não encontrada", é o atual.
  4. Em `/login`, procure "Entrar como". Se aparecer, o deploy foi atualizado para `05b0066` sem as mudanças locais. Sonda equivalente, que os prompts usam: 405 no passo 1 **e** `/robots.txt` ainda com `Disallow: /painel-acesso-privado-atelie` = `05b0066` sem as mudanças locais; 405 sem essa linha = código atual.
  5. Repita os passos 1 a 3 em `http://localhost:5173` e `http://localhost:3000/api/auth/customer/logout`. O esperado é 405, a URL continuar em `/admin` e 404.
- **Resultado esperado:** hoje, o deploy é antigo e o local tem o login em `/admin`. Marque cada achado como "deploy" ou "local".
- **Riscos:** nenhum (só GET). Não use `/api/me-export-data` como sonda: ele consome o limite.

#### F03 — Stub de `window.confirm` e observador de toasts

- **Pré-condições:** página carregada. **Repita a cada recarga completa.**
- **Passos:**
  1. No console: `window.__confirmLog=[]; window.__confirmAnswer=false; window.confirm=function(m){window.__confirmLog.push(String(m));return window.__confirmAnswer;}; 'stub ok'`
  2. Toasts: `window.__toastLog=[]; new MutationObserver(function(){document.querySelectorAll('[aria-live=polite] article p').forEach(function(p){var t=p.textContent;if(window.__toastLog.indexOf(t)===-1)window.__toastLog.push(t);});}).observe(document.body,{childList:true,subtree:true}); 'obs ok'`
  3. Confira que `String(window.confirm).indexOf('__confirmLog')>=0`.
  4. Use `window.__confirmAnswer=true` para simular OK e `false` para Cancelar. Depois de cada clique, leia `JSON.stringify(window.__confirmLog)` e `JSON.stringify(window.__toastLog)`.
- **Resultado esperado:** a caixa nativa não abre e o texto exato fica registrado.
- **Riscos:** se o JS rodar num "mundo isolado" da extensão, o stub não pega; nesse caso, use o F04. Não injete um `<script>` inline no deploy, porque a CSP bloqueia.

#### F04 — Recuperação quando um diálogo nativo abriu sem stub

- **Passos:**
  1. Se a ferramenta trata diálogos, escolha "Cancelar".
  2. Se não trata, tente Esc (equivale a Cancelar).
  3. Se nada responder, peça a um humano que clique "Cancelar".
  4. Instale o stub (F03) antes de repetir.
- **Resultado esperado:** a página volta ao normal sem executar a exclusão.
- **Riscos:** marcar "Impedir que esta página crie outras caixas de diálogo" faz todo `confirm` devolver falso até recarregar.

#### F05 — Ciclo de dados de teste (criar e limpar)

- **Pré-condições:** conta admin e stub instalado. **O banco é o de produção (B05).**
- **Passos:**
  1. Anote as contagens atuais: 11 produtos em `/api/products`; 26 `<loc>` no sitemap (12 categorias); 4 seções na vitrine ("Mais vendidos", "sejam bem vindos ao natal", "Festa Junina", "Novidades"); e os cupons existentes.
  2. Crie "[TESTE] Categoria QA" e "[TESTE] Produto QA" (preço baixo, imagem de até 500 kB, PDF pequeno, **inativo** quando não precisar aparecer). Crie também o cupom `TESTE-QA-01`, com validade curta e `max_uses` 1 (o código não aceita colchetes).
  3. Rode os testes que dependem desses dados.
  4. Exclua o cupom, os produtos e as categorias de teste, **inclusive as categorias-fantasma com nome UUID** criadas pelo wizard (B01). Espere pelo menos 5 min (cache) e confira se as contagens voltaram ao que foi anotado no passo 1.
- **Resultado esperado:** nada com "[TESTE]" continua visível no site público.
- **Riscos:** tudo fica público enquanto existir. O `admin_audit_log` é append-only, e arquivos podem ficar órfãos no Storage.

### 5.2 Loja

#### F06 — Primeira visita, banner LGPD, revogação e dessincronia banner × bloco

- **Pré-condições:** janela anônima e Network aberto.
- **Passos:**
  1. Abra `/`: o banner "Sua privacidade importa" aparece e não há requisição para googletagmanager.com nem facebook.net.
  2. Clique em "Apenas essenciais". Confira `lgpd_consent='denied'`, `lgpd_consent_version='2026-05-24'` e `lgpd_consent_at`. Dê F5: o banner não volta.
  3. No rodapé, clique em "Privacidade". O bloco mostra "Situação atual: Apenas cookies essenciais — escolhido em <data>.".
  4. Clique em `#cookies button` "Aceitar todos": o bloco passa a "Cookies de marketing ativos", sem recarregar.
  5. Clique em "Apenas essenciais" no bloco: a página **recarrega** e mostra "Apenas cookies essenciais".
  6. Abra outra janela anônima, vá direto a `/privacidade` e clique em "Aceitar todos" no bloco. Observe o banner inferior.
- **Resultado esperado:** a escolha persiste e a revogação recarrega a página.
- **Achado esperado:** no passo 6, o banner continua visível (B34).
- **Riscos:** só localStorage.

#### F07 — Navegação pelo header e pelo rodapé (1280×800)

- **Pré-condições:** visitante, com o banner respondido.
- **Passos:**
  1. Em `/`, clique em "Como Funciona" (a URL vira `/#como-funciona`) e em "Contato".
  2. Clique em "Produtos" (fica ativo) e depois no logo.
  3. No rodapé, clique em "Minha conta" (leva a `/login`, sem header) e volte. Clique também em "Downloads", "Privacidade", "Termos" e "Início", anotando `window.scrollY` depois de cada navegação.
  4. Em `/produtos`, clique em "Como Funciona".
- **Resultado esperado:** cada link leva à rota certa.
- **Achado esperado:** as páginas abrem fora do topo (B31), e "Como Funciona" recarrega o documento fora da home (B106).

#### F08 — Navegação mobile (375×812)

- **Passos:**
  1. Em `/`, só a coruja, o carrinho e "Abrir menu" aparecem.
  2. Abra o menu. Os itens são "Início", "Produtos", "Navegar", "Como Funciona", "Contato" e "Entrar".
  3. Pressione Esc: o menu continua aberto (B108). Clique em "Produtos": o menu fecha e a página vai para `/produtos`.
  4. Reabra o menu e clique em "Entrar": a página vai para `/login`.
  5. Em cada página, confira `scrollWidth <= innerWidth`.
- **Resultado esperado:** os alvos têm pelo menos 44 px e não há overflow horizontal.

#### F09 — Header por papel (visitante, cliente, cliente com papel admin, admin só por `/admin`)

- **Pré-condições:** uma conta de cliente comum e uma conta com papel admin/master.
- **Passos:**
  1. Como visitante, em `/`: aparecem "Entrar" e o carrinho.
  2. Faça login como cliente comum em `/login`: o header mostra "Meus produtos", "Conta", "Sair" e o carrinho.
  3. Clique em "Sair": aparece o toast "Sessão encerrada." e o header volta a "Entrar".
  4. Faça login em `/login` com a conta admin. A página vai para `/checkout`, e o header mostra "Painel admin" em âmbar, sem o carrinho e sem "Meus produtos".
  5. Clique em "Painel admin": `/admin` mostra "Acesso restrito", porque a sessão admin é separada.
  6. Abra `/painel-acesso-privado-atelie` e `/admin-login`: as duas dão 404.
  7. Numa janela anônima, faça login **só** por `/admin` e abra `/`.
- **Resultado esperado:** o passo 7 mostra o header de visitante (B25).
- **Riscos:** o login conta no rate limit. Não use o bypass de DEV. **Não clique em "Excluir minha conta" com o admin** (B158).

#### F10 — Vitrine → produto → carrinho → checkout

- **Pré-condições:** um produto ativo em alguma vitrine, o carrinho vazio e o banner respondido.
- **Passos:**
  1. Em `/`, espere sumir "Carregando vitrine..." e, a 1280 px, clique em "Rolar para direita".
  2. Clique num card e depois em "Adicionar" (toast verde, badge 1).
  3. Abra o carrinho: aparece "1 item", o foco está no X e o subtotal é igual ao preço.
  4. Clique em "Finalizar compra →".
- **Resultado esperado:** a página vai para `/checkout` com o item.
- **Riscos:** grava `analytics_events`. Não avance para o pagamento.

#### F11 — Catálogo: filtrar, ordenar e abrir produto

- **Pré-condições:** pelo menos 6 produtos em 2 categorias, com preços nas três faixas.
- **Passos:**
  1. Em `/produtos`, "N produtos encontrados" é igual ao badge "Todos" e ao número de cards.
  2. Clique numa categoria na sidebar: as pílulas dos cards e o chip mudam para ela.
  3. Escolha "Até R$ 25": todos os preços ficam em R$ 25,00 ou menos (ou aparece o estado vazio).
  4. Volte o preço para "Todos" e ordene por "Menor preço" (ordem crescente) e depois por "Nome A-Z".
  5. Clique no chip "Todos" e depois em "Detalhes" no 1º card.
- **Resultado esperado:** o título da página é "<nome> · Ateliê da Escola", e a URL de `/produtos` não muda com os filtros.

#### F12 — Deep links da Home e filtro que persiste

- **Passos:**
  1. Na Home, clique em "Mais produtos →" de uma categoria: a URL vira `/produtos?categoria=<Nome>`.
  2. Clique em "Produtos" no header: a URL fica limpa, mas a grade continua filtrada (B44).
  3. Abra `/produtos?preset=mais-vendidos`: o select mostra "Mais vendidos".
  4. Abra `/produtos?preset=novidades`: aparecem menos produtos, sem indicador (B45).
  5. Abra `/produtos?categoria=CategoriaQueNaoExiste`: aparecem todos os produtos.
  6. Abra `/produtos?categoria=festa-junina`, no formato do sitemap: o filtro não é aplicado (B53).

#### F13 — Gerenciar o drawer do carrinho

- **Pré-condições:** `localStorage.removeItem('cart')` + F5, com o banner respondido.
- **Passos:**
  1. "Adicionar" no produto A: toast verde e badge 1. Repita: toast âmbar "Este produto já está no carrinho." e o badge continua 1.
  2. "Adicionar" no produto B: badge 2. No drawer, aparecem "2 items" (B109) e o subtotal A+B.
  3. Aperte Tab 10 vezes: o foco não sai do drawer.
  4. Clique em "Remover" no A: aparecem "1 item" e o badge 1.
  5. Aperte Esc: o drawer fecha e o foco volta ao botão do carrinho.
  6. Dê F5: o B continua no carrinho.
  7. Clique em "Esvaziar carrinho": aparece "Nada por aqui ainda", sem confirmação. Clique em "Ver catálogo".
- **Resultado esperado:** badge, lista, subtotal e `localStorage.cart` sempre consistentes. `add_to_cart` e `remove_from_cart` respondem 204.
- **Achado esperado:** os toasts verde e âmbar não têm ícone (B36).

#### F14 — "Comprar agora"

- **Passos:**
  1. Em `/produtos/<slug>`, clique em "Comprar agora": aparece o toast verde e a página vai para `/checkout`.
  2. Volte e clique em "Comprar agora" de novo.
- **Resultado esperado:** o toast âmbar aparece e o checkout abre sem duplicar o item (B142).

#### F15 — Carrinho entre abas

- **Passos:**
  1. Adicione o produto X e dê F5.
  2. Abra uma 2ª aba em `/produtos`.
  3. Na aba 1, adicione Y. Na aba 2, sem recarregar, adicione Z.
  4. Recarregue a aba 1.
- **Resultado esperado:** X, Y e Z.
- **Achado esperado:** só X e Z (B111).

#### F16 — Cross-sell e rolagem

- **Passos:**
  1. Em `/produtos/<P>`, anote o campo `strategy` de `GET /cross-sell`.
  2. Role até "Quem comprou este levou também" e clique no 1º card. Meça `window.scrollY` depois da carga.
  3. Durante a carga, anote `document.title`.
- **Achado esperado:** `scrollY > 0` (B31); durante a carga, o título é o do produto anterior (B139); com `same_category`, o título do bloco é impreciso (B140).

#### F17 — Produto inexistente, inativo e id numérico

- **Passos:**
  1. `/produtos/slug-que-nao-existe`: aparecem "Não foi possível carregar o produto" / "Produto não encontrado na API." (404).
  2. `/produtos/<inativo>` (use hard reload): o mesmo resultado.
  3. `/produtos/123`: aparece "Falha ao carregar produto: 500" (B50).
- **Riscos:** desativar um produto real afeta a loja.

#### F18 — Filtros no mobile (375×812)

- **Passos:**
  1. Em `/produtos`, clique em "Filtros", escolha uma categoria e confirme que o painel fecha e a grade filtra.
  2. Reabra o painel e escolha "Acima de R$ 50": o painel fecha e todos os preços ficam acima de R$ 50.
  3. Feche pelo X e depois pelo fundo escuro. Esc não fecha.
  4. Com o painel fechado, navegue com Tab: o foco passa por botões invisíveis (B138).

#### F19 — Robustez do armazenamento, falha de chunk e ErrorBoundary

- **Passos:**
  1. No console: `localStorage.setItem('cart','{}')`, depois F5. Aparece "Algo deu errado", com `TypeError 'cart.reduce is not a function'` e o `client_error` 204 (B27).
  2. Clique em Voltar: a URL muda, mas o cartão continua (B38).
  3. `localStorage.setItem('cart','[]')` e "Recarregar": a página volta ao normal.
  4. `Storage.prototype.setItem=()=>{throw new DOMException('cota','QuotaExceededError')}` e "Adicionar": aparece "Algo deu errado" (B28). F5 restaura.
  5. Com a página `/` carregada, bloqueie `*LegalPages*` (ou fique Offline) e clique em "Termos": aparecem "Algo deu errado" e "Failed to fetch dynamically imported module" no console (B37). Restaure a rede e clique em "Recarregar".
- **Riscos:** só afetam o navegador local.

#### F20 — Vitrine e catálogo com a API fora

- **Pré-condições:** rodar `dev:web` e `dev:api` separados, para poder parar só a API.
- **Passos:**
  1. Com Slow 3G, capture "Carregando vitrine..." e "Carregando catálogo…" com os 6 esqueletos.
  2. Pare a API. Em `/`, aparece "Failed to fetch" no lugar das faixas. Em `/produtos`, a caixa rosa "Erro ao carregar produtos. Tente novamente." + "Failed to fetch". Em `/produtos/<slug>`, "Não foi possível carregar o produto".
- **Resultado esperado:** o erro fica contido em cada bloco, sem cair no ErrorBoundary.

#### F21 — Eventos de funil da loja

- **Pré-condições:** Network filtrado por "track-event".
- **Passos:** Abrir `/produtos` gera `view_catalog` (2× em dev). Abrir um produto gera `view_item` (1×). "Adicionar" gera `add_to_cart`. Remover no drawer gera `remove_from_cart`. Abrir o drawer e esvaziar o carrinho **não** geram POST (B110).
- **Resultado esperado:** 204 em cada evento (tipo ping).
- **Riscos:** grava `analytics_events`. O limite é de 120/min.

#### F22 — Newsletter com double opt-in

- **Pré-condições:** SMTP configurado e uma caixa de teste. **Com o remetente `@resend.dev`, o e-mail só chega à caixa do dono da conta Resend (B79).**
- **Passos:**
  1. No rodapé, envie "teste@dominio": aparece "Informe um email válido." e não há requisição.
  2. Envie um e-mail válido: aparecem "Enviando…" e "Confirmação enviada — …" (200).
  3. Abra o link do e-mail, trocando o host por `http://localhost:5173` em dev: aparece "Bem-vindo(a) à lista!".
  4. Dê F5: aparece "Token inválido ou expirado." (B52).
  5. Troque de rota e inscreva de novo o mesmo e-mail: aparece "Você já está inscrito. Obrigada!" (B30).
- **Riscos:** grava `email_subscribers` e envia e-mail real. **Banco de produção.**

#### F23 — Reinscrição após descadastro

- **Pré-condições:** um assinante de teste confirmado, com o `unsubscribe_token` conhecido, e acesso de leitura a `email_subscribers`/`email_sent_log`.
- **Passos:**
  1. `/desinscrever?token=<token>` mostra "Pronto, você foi removido".
  2. Inscreva o mesmo e-mail no rodapé: o banco fica com `unsubscribed_at=null` e `confirmed=true`, sem abrir o e-mail (B07).
  3. Inscreva de novo: aparece "Você já está inscrito. Obrigada!".
  4. Confira que o `email_sent_log` não registra um novo `opt_in_confirmation` (B08).
- **Riscos:** altera dados e envia e-mails.

#### F24 — Descadastro pelo formulário e pelo token

- **Passos:**
  1. Em `/desinscrever`, envie "a@b": aparece "Informe um email válido.".
  2. Envie um e-mail válido: aparece a mensagem neutra, e o título continua "Cancelar inscrição".
  3. No e-mail "Confirme o cancelamento da sua inscrição", clique no link (trocando o host em dev): aparece "Pronto, você foi removido".
  4. `/desinscrever?token=inventado123` também mostra "Pronto, você foi removido" (B149).
- **Riscos:** envia e-mails (no máximo 1 por dia). O limite é de 20/min.

#### F25 — Confirmar inscrição sem token e com token inválido

- **Passos:**
  1. `/confirmar-inscricao` mostra "Ops…" / "Não foi possível confirmar" / "Link inválido…", sem requisição.
  2. `?token=abc` gera um GET 404 e "Token inválido ou expirado.".
  3. Clique em "Ver produtos" e em "Voltar à home".

#### F26 — 404 e rotas removidas

- **Pré-condições:** dev local. No deploy, só depois do push.
- **Passos:**
  1. `/xyz` mostra "404" / "Página não encontrada", com noindex.
  2. `/painel-acesso-privado-atelie` e `/admin-login` mostram a mesma 404.
  3. `/admin/usuarios` troca a URL para `/admin`.
  4. `/avaliar?order=teste` mostra a 404.
  5. Clique em "Voltar para a home" e em "Ver produtos".

#### F27 — SEO por rota

- **Passos:**
  1. Em cada uma das rotas `/`, `/produtos`, `/produtos/banner-quadrilha`, `/produtos/nao-existe`, `/checkout`, `/login`, `/conta`, `/reset-password`, `/downloads`, `/privacidade`, `/termos`, `/confirmar-inscricao`, `/desinscrever`, `/admin`, `/admin/usuarios`, `/admin/xyz`, `/painel-acesso-privado-atelie` e `/rota-inexistente`, rode `JSON.stringify({t:document.title,d:document.querySelectorAll('meta[name=description]').length,c:document.querySelector('link[rel=canonical]')?.href,r:document.querySelector('meta[name=robots]')?.content,ld:document.querySelectorAll('script[type="application/ld+json"]').length})`.
  2. Registre os erros de console e as respostas 4xx/5xx.
  3. Compare `/robots.txt` com `/sitemap.xml`.
- **Resultado esperado:** conforme §7.6.
- **Achado esperado:** `d=2` em todas as rotas (B121), `/login` no sitemap (B123) e a URL de categoria por slug sem filtrar (B53).

### 5.3 Conta do cliente e compra

#### F28 — Cadastro por e-mail e senha

- **Pré-condições:** deslogado e com um e-mail descartável.
- **Passos:**
  1. Abra `/login?mode=register`.
  2. Clique em "Criar conta" com tudo vazio: aparece "Preencha nome, e-mail e senha para cadastrar." e não há POST.
  3. Use a senha "abcdefgh": aparece "A senha deve ter letra maiúscula, minúscula e número.".
  4. Preencha com a senha "Teste1234" e clique em "Criar conta".
- **Resultado esperado:** sem confirmação de e-mail, "Conta criada com sucesso." e ida para `/checkout`. Com confirmação, o toast amarelo "Conta criada. Verifique seu e-mail…" e o formulário continua.
- **Riscos:** cria um usuário real. O limite é de 5 a cada 10 min.

#### F29 — Login com `?redirect` e logout pelo header

- **Passos:**
  1. Deslogado, em `/downloads`, clique em "Entrar" (`/login?redirect=/downloads`).
  2. Preencha e clique em `form button[type=submit]`.
  3. A página termina em `/downloads`, com "Seus pedidos (<e-mail>)".
  4. Em `/login`, aparecem "Você já está conectado", "Baixar meus dados" e "Excluir minha conta", e não há "Entrar como"/"Professor".
  5. Em `/`, a 1024 px ou mais, clique em "Sair" e depois dê F5.
- **Resultado esperado:** o cookie HttpOnly é criado, o redirect é respeitado, o logout responde 200 e, depois do F5, o header mostra "Entrar".
- **Riscos:** no máximo 4 logins seguidos na mesma conta.

#### F30 — Credenciais inválidas e open redirect

- **Passos:**
  1. Tente um e-mail inexistente (ex.: `naoexiste+<n>@example.com`): 401 "E-mail ou senha incorretos.".
  2. Em `/login?redirect=//evil.com`, faça login com a conta de teste: a página termina em `/checkout`.
  3. Repita com `/%5Cevil.com`.
- **Riscos:** use e-mails diferentes nos testes de erro, para não bloquear a conta real.

#### F31 — Login com Google (até a tela do Google)

- **Passos:**
  1. Em `/login`, clique em "Entrar com Google": aparece "Conectando…" e a página segue para `<supabase>/auth/v1/authorize?provider=google` com `redirect_to=<origem>/login?oauth=google&redirect=%2Fcheckout`.
  2. **Pare** em accounts.google.com, a menos que haja uma conta de teste autorizada.
  3. Se autorizado, conclua o login e observe `POST …/google/callback` 200. Em dev, o formulário pode continuar até o F5 (B152), e a página não navega para o redirect (B57).
- **Riscos:** usa uma conta Google real e cria um usuário.

#### F32 — Esqueci minha senha → `/reset-password`

- **Pré-condições:** uma conta de teste com caixa de e-mail acessível, usando o **mesmo navegador** do início ao fim.
- **Passos:**
  1. Em `/login`, digite o e-mail e clique em "Esqueci minha senha".
  2. Clique em "Enviar link de recuperação": aparece o toast verde e o `redirect_to` termina em `/reset-password?redirect=%2Fcheckout`.
  3. Abra o link do e-mail no mesmo navegador.
  4. Observe se sai um `POST /api/auth/customer/google/callback`, se o `?code` some e se aparece um toast de erro.
  5. Digite "Abcdefg1" nos dois campos e clique em "Salvar nova senha".
- **Resultado esperado:** o toast "Senha redefinida com sucesso." e a ida para `/checkout`.
- **Achado esperado:** o provável é aparecer "Auth session missing!" (B15).
- **Riscos:** envia e-mail real e pode trocar a senha.

#### F33 — Exportar meus dados (LGPD art. 18, V)

- **Passos:**
  1. Logado, em `/conta`, clique em "Baixar meus dados".
  2. Confira "Preparando…", "Download iniciado." e o arquivo `meus-dados-atelie-AAAA-MM-DD.json`.
  3. Confira os headers `no-store` e `no-referrer`.
  4. Confira as chaves do JSON e a ausência do token.
- **Riscos:** grava um `security_event`. O limite é de 5 a cada 5 min.

#### F34 — Exclusão de conta em 2 passos

- **Pré-condições:** **só com uma conta descartável** e com o stub (F03) instalado.
- **Passos:**
  1. Faça o teste seguro: `/conta?delete_token=invalido` → "Excluir permanentemente" → 400 "Link inválido ou expirado. …".
  2. Logado com a conta descartável, deixe o stub em `false` e clique em "Excluir minha conta": o texto fica registrado e não há POST.
  3. Com o stub em `true`, clique de novo: `POST {}` 200, o toast "…O link vale 1 hora." e o botão desabilitado.
  4. Pegue o link no e-mail ou no console de dev ("[dev] link de confirmação de exclusão: …") e troque o host por `http://localhost:5173`.
  5. Abra o link no mesmo navegador logado e clique em "Excluir permanentemente".
  6. Tente logar de novo com a mesma senha.
- **Resultado esperado:** "Conta excluída. Sentiremos sua falta.", ida para `/` com "Entrar" no header, e o novo login falha com "E-mail ou senha incorretos.".
- **Riscos:** **irreversível**. Apaga o usuário, anonimiza os pedidos e envia e-mail.

#### F35 — Checkout como convidado até o Mercado Pago (PONTO DE PARADA)

- **Pré-condições:** um produto ativo no carrinho e um e-mail de teste. Não use cupom de usos limitados.
- **Passos:**
  1. Abra `/checkout` com 1 item e confira o resumo, o Total e o stepper no passo 1.
  2. Clique em "Ir para pagamento" com os campos vazios: aparecem os erros, sem `/create-payment`.
  3. Preencha "Teste Validacao" e o e-mail de teste e espere 2 s: `POST /abandoned-cart` 204.
  4. Clique em "Ir para pagamento" **uma vez**: `POST /create-payment` 200 (com `orderId` e `initPoint`), o toast azul, "Aguardando confirmação…", "Abrir pagamento", o `lastOrderId` e o polling a cada ~4 s. **Compare o `total` da resposta com o Total da tela (B69).**
  5. Na aba do Mercado Pago, tire um screenshot do host e do total e **feche sem preencher**.
  6. Clique em "Cancelar e tentar de novo".
- **Resultado esperado:** o pedido fica pending e nada é cobrado.
- **Riscos:** cria um pedido pending e uma preferência no MP (**banco de produção**), grava `abandoned_carts` e deixa o `lastOrderId` salvo (B66).

#### F36 — Cupom no checkout

- **Pré-condições:** 2 itens no carrinho e um cupom de teste ativo, sem `max_uses` e sem mínimo.
- **Passos:**
  1. Em "Tem um cupom?", digite "naoexiste" (vira "NAOEXISTE") e aperte Enter: 422 `COUPON_NOT_FOUND` "Cupom não encontrado.".
  2. Aplique o cupom válido: aparece o bloco "Cupom aplicado", com Subtotal, Desconto e Total.
  3. Clique em "Remover" no bloco: o total volta ao valor cheio.
  4. Aplique de novo e depois clique em "Remover" num **item**: sobra "Desconto aplicado: R$ X" (B75).
- **Riscos:** `validate-coupon` não consome uso. O limite é de 20/min.

#### F37 — Retorno do Mercado Pago sem pagar

- **Passos:** abra `/checkout`, `/checkout?status=failure` e `/checkout?status=pending` com um item no carrinho e compare os screenshots.
- **Resultado esperado:** um aviso de falha ou de pendência.
- **Achado esperado:** as três telas são idênticas (B09).

#### F38 — Downloads: sem pedido, pedido inexistente e histórico

- **Passos:**
  1. `localStorage.removeItem('lastOrderId'); localStorage.removeItem('lastOrderEmail')`. Deslogado, em `/downloads`, aparecem "Nenhum pedido selecionado" e "Entrar".
  2. `/downloads?order=XYZ&email=a@b.com` mostra "Falha ao carregar pedido" + "Pedido não encontrado".
  3. `/downloads?order=XYZ` deslogado mostra a frase sobre informar o e-mail, sem campo (B12).
  4. Logado, `/downloads` mostra "Seus pedidos (<e-mail>)" e `GET /customer-orders`.
  5. "Abrir pedido" gera a URL com `&email=` e o `POST /verify-payment`.
- **Riscos:** um `verify-payment` de pedido pendente consulta o MP e pode aprovar o pedido.

#### F39 — Download de uso único

- **Pré-condições:** um pedido **aprovado de teste** com tokens ainda não usados.
- **Passos:**
  1. Clique em "Baixar" uma vez: 302 para o Storage.
  2. Clique em "Atualizar" e depois em "Baixar" de novo no mesmo item.
- **Resultado esperado:** um link novo depois de "Atualizar".
- **Achado esperado:** 401 "Token já utilizado" (B11).
- **Riscos:** consome o token de forma irreversível.

#### F40 — Compra aprovada ponta a ponta (SÓ se o dono confirmar sandbox)

- **Pré-condições:** o dono confirma credenciais de teste no servidor em uso e usa os cartões de teste de `docs/ProjectDocs/03-SETUP.md` §7 (titular APRO, OTHE ou CONT). **Sem essa confirmação, não execute.**
- **Passos:**
  1. Faça o F35 até a aba do MP.
  2. Pague com o titular APRO.
  3. Volte à aba do checkout.
  4. Confira "Pagamento aprovado.", a ida para `/downloads?order=…&email=…&success=1` e os botões "Baixar".
  5. Confira que "🎉 Pagamento confirmado" **não** chega (B13).
- **Riscos:** com uma credencial de produção, a cobrança é real.

#### F41 — Webhook: checagem negativa segura

- **Passos:**
  1. No console: `fetch((location.hostname==='localhost'?'http://localhost:3000/api':'/api')+'/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)`.
  2. Repita com GET.
- **Resultado esperado:** 401 "Invalid signature" e 405.
- **Riscos:** grava um `security_event` (inofensivo).

### 5.4 Painel administrativo

#### F42 — Login admin simples, F5 e logout na própria `/admin`

- **Pré-condições:** uma conta admin sem 2FA, janela sem cookie, o banner dispensado e o observador de toasts ligado (F03).
- **Passos:**
  1. Abra `/admin`: aparece "Verificando sessão" e depois "Acesso restrito", com a URL em `/admin`.
  2. Clique em "Entrar" com os campos vazios: aparece "Informe e-mail e senha para entrar." e não há POST.
  3. Preencha e aperte Enter: 200 com `Set-Cookie admin_session`, o toast "Login administrativo realizado." e o h1 "Dashboard".
  4. Dê F5: aparece "Verificando sessão" e depois o painel, com `{authenticated:true}`.
  5. Clique em "Encerrar sessão": POST 200, o toast "Sessão administrativa encerrada." e o formulário **vazio** na mesma `/admin`.
  6. Dê F5: continua no formulário, com `{authenticated:false}`.
- **Riscos:** cada login consome 1 das 5 tentativas a cada 10 min (B179).

#### F43 — Login com 2FA (TOTP ou PIN)

- **Pré-condições:** 2FA ativo, configurado por um humano, com o autenticador ou o PIN à mão. **Em localhost, o TOTP pode não funcionar (B23): use o PIN.**
- **Passos:**
  1. Envie e-mail e senha: 200 com `requiresSecondFactor` e **sem** cookie.
  2. Clique em "Validar código" vazio: aparece "Informe o código de verificação para continuar.".
  3. Envie um código errado: 401 "Código de verificação inválido.".
  4. Envie o código correto, com espaços: 200 e o painel.
- **Riscos:** o limite de 2FA é de 5 a cada 10 min e é fail-closed. Esperar mais de 120 s reemite o desafio em silêncio (B176).

#### F44 — Cliente comum tentando entrar no painel

- **Passos:**
  1. Em `/admin`, envie o e-mail e a senha **corretos** de um cliente: 401 "Credenciais inválidas.", a mesma resposta de uma senha errada.
  2. Confira que `/login` não tem "Entrar como".
- **Riscos:** consome tentativas do IP.

#### F45 — Rate limit do login admin (no fim da sessão de testes)

- **Passos:** envie 5 senhas erradas e depois a 6ª (pode ser a correta).
- **Resultado esperado:** 429 `RATE_LIMITED` + `Retry-After` e "Muitas tentativas. Aguarde 10 minutos e tente novamente.".
- **Riscos:** tranca o admin por 10 min. Se a migration do rate limit não existir, o limite é fail-open e o 429 não aparece.

#### F46 — Sessão expirada durante o uso

- **Pré-condições:** logado, com o painel aberto em duas abas.
- **Passos:**
  1. Na aba A, clique em "Encerrar sessão", ou rode no console `await fetch('http://localhost:3000/api/admin/logout',{method:'POST',credentials:'include'})`.
  2. Na aba B, clique em "Pedidos": 401 `ADMIN_SESSION_INVALID`, só o toast âmbar ("Sessão admin expirada. Faça login novamente.") e o formulário na mesma `/admin` (o carregamento da aba chama `onAuthExpired` e `setTabError`, sem toast de erro: `src/pages/AdminPage.jsx:196-205`). Numa ação, como "Pausar" num produto [TESTE], saem o âmbar e o vermelho (`handleAdminError`, `src/pages/AdminPage.jsx:152-158`).
  3. Logue de novo, derrube a sessão e clique em "Segmentos" ou "Cupons", ou troque o período do "Funil".
- **Resultado esperado:** o login aparece em todas as abas.
- **Achado esperado:** no passo 3 aparece só a caixa rosa e o painel continua (B80). Dashboard e Faturamento podem não detectar a expiração por causa do cache (B20).

#### F47 — Conferência cruzada de números entre abas

- **Pré-condições:** pedidos aprovados no mês atual e no anterior, em pelo menos 2 categorias, e pelo menos 1 pedido pendente.
- **Passos:**
  1. No Dashboard, anote os 4 cards, os mini-cards, o Mix e a receita por produto na ABC.
  2. No Faturamento, anote o Bruto, os Pedidos, o Ticket e as 6 barras.
  3. No Comparativo, anote os dois meses e o selo.
  4. No Desempenho, anote a receita por produto.
  5. Compare conforme as regras de A05/A19/A20/A13.
- **Resultado esperado:**
  - "Receita total" é igual ao "Bruto acumulado".
  - "Pedidos aprovados" é igual nas duas abas.
  - "Faturamento do mês" é igual a Comparativo › Mês atual › Receita e à última barra do Faturamento.
  - "Clientes cadastrados" = Recorrentes + Novos + sem compra.
  - A receita por produto é igual na ABC e no Desempenho.
- **Riscos:** só leitura. Divergências perto da virada do mês ou depois das 21 h podem ser de fuso (B86).

#### F48 — Cache do dashboard: lista velha depois de salvar

- **Pré-condições:** logado, com "Disable cache" **desligado** e o stub instalado.
- **Passos:**
  1. Em Categorias, anote a contagem.
  2. Clique em "Nova categoria", use o nome "[TESTE] Cache QA" e clique em "Salvar Categoria".
  3. Confira o toast "Categoria criada.", o POST 200 e o `GET /admin/dashboard` seguinte com _Size_ "(memory cache)" ou "(disk cache)".
  4. Veja se a linha aparece na tabela.
  5. Em "Lista de produtos" › "Novo produto", veja se a categoria aparece no select.
  6. Ligue "Disable cache", troque de aba e volte: a categoria aparece.
  7. Exclua a categoria e confira a contagem.
- **Resultado esperado:** a lista atualiza logo depois de salvar.
- **Achado esperado:** ela só atualiza com "Disable cache" (B20).
- **Riscos:** cria e exclui uma categoria no banco de produção. **Não salve a Vitrine depois de vê-la desatualizada.**

#### F49 — Casca do painel no mobile (375–390 px)

- **Passos:**
  1. Confirme que a sidebar está oculta e que "Abrir menu" existe.
  2. Abra o menu e aperte Esc: nada acontece (B82).
  3. Clique no véu: o menu fecha.
  4. Reabra, expanda "Financeiro" e clique em "Faturamento": o menu fecha e o h1 muda.
  5. Confira que não há rolagem horizontal e que as tabelas do Dashboard e do Desempenho não ficam cortadas (B87).

#### F50 — Bypass de DEV e `/admin?login` (opcional, exige um humano)

- **Passos:**
  1. Um humano liga `VITE_ALLOW_ADMIN_BYPASS=true` e reinicia o Vite.
  2. Em `/admin`, o painel abre com o banner âmbar, o Dashboard zerado, a caixa rosa em Segmentos e Usuários vazio.
  3. Clique em "Faça login": a página recarrega em `/admin?login` e mostra o formulário.
  4. Faça login: a URL vira `/admin`, o banner some e os dados carregam.
  5. Um humano remove a variável e reinicia o Vite.
- **Riscos:** não deixe a flag ligada.

#### F51 — Análise: filtros, "Como ler" e CSV

- **Passos:**
  1. Abra "Análise": 3 GETs 200.
  2. Troque para "Produtos: último trimestre": `period=quarter`.
  3. Escolha uma categoria: `categoryId=` na URL.
  4. Troque para "Clientes: último ano": `period=year`.
  5. Abra cada "Como ler" e feche pelo fundo, pelo X e por "Entendi". Esc não fecha.
  6. Baixe os 3 CSVs e confira os nomes e os cabeçalhos.
  7. Leia o tooltip do heatmap.
  8. Bloqueie `*admin/cohort*` e troque um filtro para ver a caixa rosa.
- **Riscos:** só leitura. O card de clientes mostra nomes completos (B88); não compartilhe os CSVs.

#### F52 — Funil: troca de período

- **Passos:**
  1. Abra "Funil" (`days=30`).
  2. Clique em "7 dias" e em "90 dias" e confira o subtítulo, o `days=` e "Carregando funil…".
  3. Confira as regras de "conv." e a soma da tabela de UTM.
  4. Bloqueie `*admin/funnel*` e troque de período.
- **Resultado esperado:** conforme A21.
- **Achado esperado:** os números antigos continuam sob o novo subtítulo (B211).

#### F53 — Criar um produto de teste pelo wizard

- **Pré-condições:** uma categoria real ou "[TESTE] QA Cat", uma imagem de até 500 kB, uma de ~600 kB e um PDF pequeno.
- **Passos:**
  1. Clique em "Novo produto" e depois em "Avançar →" com tudo vazio: aparece "Nome do produto é obrigatório".
  2. Preencha o nome "[TESTE] Produto QA", a categoria e a descrição.
  3. Em Mídia, a imagem de 600 kB é recusada sem POST; a de até 500 kB gera POST + PUT e "Imagem 1 enviado.". Envie o PDF.
  4. Em Preço, deixe vazio para ver "Preço válido é obrigatório" e depois use 9.90, preço original 19.90 e o tipo "Kit".
  5. Em Conversão, adicione 1 benefício, 1 FAQ e 1 depoimento e clique em "Salvar Produto" (sem Enter).
  6. Confira que o modal fecha na hora, o POST responde 201 e aparece "Produto criado.".
  7. Leia a coluna CATEGORIA e abra a aba Categorias.
- **Resultado esperado:** o produto é criado na categoria escolhida.
- **Achado esperado:** a categoria aparece como UUID e surge um cartão com nome UUID (B01). A página do produto não tem "KIT" (B222).
- **Riscos:** grava no banco e no Storage (produção), cria uma categoria-fantasma, e o produto fica **ativo e público** até ser pausado ou excluído.

#### F54 — Editar o produto de teste e medir a perda de dados

- **Pré-condições:** o produto [TESTE] com 2 imagens, preço original, FAQ e benefícios, e pausado.
- **Passos:**
  1. Clique em "Editar": aparece 1 cartão de imagem, o preço original vazio, o tipo "Produto individual" e a Conversão vazia.
  2. Vá até "Conversão" e clique em "Salvar Produto" sem mudar nada.
  3. Inspecione o PUT e depois a linha na lista e `/produtos/<slug>` com "Disable cache".
- **Resultado esperado:** os dados preservados.
- **Achado esperado:** o PUT leva 1 imagem, `videos:[]`, `originalPrice:null`, `faq/benefits/reviews:[]`, `active:true` e `featured:false`; o chip volta a "Ativo" e a loja perde a galeria, o preço riscado e o FAQ (B02). Surge também uma nova categoria-fantasma (B01).
- **Riscos:** destrutivo. Faça só em produto de teste.

#### F55 — Pausar, ativar e excluir produto

- **Passos:**
  1. Clique em "Pausar": PATCH `{id, active:false}`, "Produto pausado." e o chip "Inativo".
  2. Em `/produtos`, dê F5 normal e depois com "Disable cache" (B42).
  3. Clique em "Ativar".
  4. Com o stub em `false`, clique na lixeira: o texto `Excluir o produto "[TESTE] Produto QA"?` fica registrado e não há DELETE.
  5. Com o stub em `true`, clique na lixeira do produto de teste: DELETE 200 e "Produto removido.".
- **Riscos:** a exclusão é irreversível. Um produto com vendas dá 500 (B92).

#### F56 — Categorias: criar, validar, editar e excluir

- **Passos:**
  1. Clique em "Salvar Categoria" com o nome vazio: toast e o modal continua aberto.
  2. Nome "a": o modal fecha e aparece 400 "Nome deve ter entre 2 e 60 caracteres.".
  3. Nome igual a um UUID: 400 "Nome inválido: não cole IDs no campo nome.".
  4. Nome de uma categoria existente: 409 "Categoria já existe.".
  5. "[TESTE] QA Cat", com ★ marcada: 201 e "Categoria criada.".
  6. Edite e desmarque "Categoria ativa": "· Inativa".
  7. Renomeie para o nome de outra categoria: 500 (B226).
  8. Lixeira com o stub em `false` e depois em `true`: DELETE 200 e "Categoria removida.".
  9. Exclua as categorias-fantasma criadas em F53/F54, **conferindo antes que são as recém-criadas**.
- **Riscos:** excluir uma categoria em uso deixa os produtos "Sem categoria" e remove a seção dela da Vitrine.

#### F57 — Cupons: criar, validade, desativar e excluir

- **Passos:**
  1. Código "ab": aparece "Código deve ter ao menos 3 caracteres.".
  2. Código "qa teste 10" (vira "QATESTE10") com percentual 150: balão nativo, sem requisição.
  3. 10%, limite 1 e validade 31/12/2026: 201 e o cartão mostra "Vale até 30/12/2026" (B99).
  4. "Editar" mostra 30/12. Salvar sem mudar nada leva a "Vale até 29/12/2026".
  5. Desmarque "Cupom ativo": o chip vira "Inativo".
  6. Código "PROMO@10": 400.
  7. Lixeira com o stub em `false` e depois em `true`: DELETE 200 e "Cupom removido.".
- **Riscos:** enquanto existir, um cupom ativo vale no checkout real.

#### F58 — Pedidos: filtro e detalhe

- **Passos:**
  1. Abra "Pedidos".
  2. Escolha o filtro "Aprovado": o card vira "Carregando…", sai `?status=approved` e só aparecem chips "Aprovado".
  3. Clique em "Detalhes" e feche por Esc, pelo X e pelo véu.
  4. Volte o filtro para "Todos os status", troque de aba e volte: o filtro persiste.
- **Resultado esperado:** não há busca, CSV nem ações.

#### F59 — Usuários: busca, papel e revogação

- **Pré-condições:** um cliente de TESTE cadastrado com e-mail descartável.
- **Passos:**
  1. Busque pelo e-mail.
  2. Troque o papel para "Suporte": 400 com a mensagem de papel e o select volta (B22).
  3. Clique na lixeira: abre "Revogar acesso?". Esc não fecha. "Cancelar" fecha sem requisição.
  4. Reabra e clique em "Revogar acesso" **uma vez**: DELETE 200, "Acesso revogado." e a linha some.
  5. Em outra janela, faça login com esse cliente em `/login`.
- **Resultado esperado:** o acesso fica revogado.
- **Achado esperado:** o login continua funcionando (B100).
- **Riscos:** nunca faça isso com usuários reais.

#### F60 — Vitrine: editar, salvar, conferir na home e restaurar

- **Pré-condições:** o JSON original de `homeSections` guardado.
- **Passos:**
  1. Anote os cards.
  2. Clique em "Mais vendidos" com a seção já presente: nada acontece.
  3. Clique em "Descer" no 1º card, troque um título para "[TESTE] Titulo" e ponha o limite 25.
  4. Clique em "Salvar vitrine": "Salvando..." e depois o PUT 200 e "Vitrine salva com sucesso.".
  5. Rode `window.__semCache = /admin\/dashboard/` (ou confira `GET {API}/admin/settings?key=homeSections` com `cache: 'no-store'`), troque de aba e volte: o limite aparece como 20.
  6. Confira a home sem cache: `GET {API}/home-sections?_=<hora>` com `cache: 'no-store'` e, na página, recarga forçada (Ctrl+Shift+R).
  7. Restaure a configuração original e salve.
- **Riscos:** a home pública fica alterada até a restauração.

#### F61 — Segurança: verificação segura (sem gravar)

- **Passos:**
  1. Confira que o GET não traz `totpSecret`/`fallbackPin`.
  2. Anote o estado do checkbox e os placeholders.
  3. Teste o olho de cada campo.
  4. TOTP "abc" + Salvar: 400 "…ao menos 16 caracteres.". Limpe o campo.
  5. PIN "111111" + Salvar: 400 "…fraco demais…". Limpe o campo.
  6. Recarregue a aba e confira que nada mudou.
- **Caminhos de trancamento (SÓ em ambiente descartável):**
  - salvar com os campos vazios sem `adminConfig` faz o login dar 500 (B03);
  - um TOTP que não está no app, sem PIN, faz todo código ser inválido (B04);
  - um TOTP salvo com outra `ADMIN_2FA_ENC_KEY` faz todo código ser inválido (B23);
  - com o 2FA ativo, qualquer mudança dá 403 (B24).
- **Riscos:** salvar com valores válidos pode trancar o admin. A recuperação só é possível por SQL.

### 5.5 Transversais

#### F62 — Alias × domínio do `APP_URL` (anti-CSRF)

- **Pré-condições:** uma conta admin. Gasta 2 logins.
- **Passos:**
  1. Faça login em `https://atelie-escolar.vercel.app`.
  2. Clique em "Nova categoria", use o nome "[TESTE] CSRF alias" e clique em "Salvar Categoria": 403 e o toast "Origem não permitida (possível CSRF).".
  3. Clique em "Encerrar sessão": aparece o toast "Origem nao permitida (possivel CSRF).". No deploy antigo a página navega para `/login` (o cookie continua); no código atual o painel continua aberto.
  4. Em `https://atelie-escolar-joao-luis-c.vercel.app`, faça login e repita o passo 2: 200.
  5. Exclua a categoria e limpe os cookies do alias.
- **Resultado esperado:** escrita e logout só funcionam no domínio do `APP_URL` (B19).
- **Riscos:** cria e exclui uma categoria em produção.

#### F63 — Cabeçalhos e CSP no deploy

- **Passos:**
  1. No documento `/`, confira `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e `Content-Security-Policy`.
  2. Percorra `/`, `/produtos`, `/produtos/palavras-magicas`, `/checkout`, `/login`, `/downloads`, `/privacidade` e `/admin` procurando "Refused to …" no console.
  3. Abra um produto com vídeo, se houver.
  4. Depois de logar, confira os cookies com `Secure`, `HttpOnly` e `SameSite=Strict`.
- **Resultado esperado:** os headers estão presentes e não há bloqueios nas telas sem vídeo.
- **Achado esperado:** o vídeo é bloqueado (B49).

#### F64 — Responsividade em várias larguras

- **Passos:**
  1. A 375×812, em `/`, `/produtos`, `/produtos/<slug>`, `/checkout`, `/login`, `/downloads` e `/admin`, confira `scrollWidth <= innerWidth` e abra e feche o hambúrguer, o carrinho e os filtros.
  2. Repita a checagem de largura a 768×1024 e a 1280×800.
  3. A 1100×800, no `/admin` logado, "Encerrar sessão" deve estar visível e clicável.
  4. Limpe o localStorage para o banner voltar e repita o passo 3: `elementFromPoint` no centro de "Encerrar sessão" devolve o banner (B35).
  5. No fim de `/`, clique em "Privacidade" e leia `window.scrollY` (B31).

#### F65 — Varredura padrão da matriz de overlays

- **Pré-condições:** o banner dispensado. Use 1280×800 para os modais centrais e 390×844 para as gavetas.
- **Passos:** para cada overlay (carrinho, wizard, detalhe do pedido, "Como ler", "Revogar acesso?" (só com "Cancelar"), menu do admin, filtros e hambúrguer):
  1. Anote o `scrollY` e o `body.style.overflow`.
  2. Abra o overlay.
  3. Leia o `document.activeElement`.
  4. Aperte Tab e Shift+Tab N+2 vezes.
  5. Leia de novo o `overflow` e role a roda do mouse sobre o véu.
  6. Aperte Esc. Se não fechar, clique no véu em (5,5) ou (350,400).
  7. Veja para onde o foco voltou.
- **Resultado esperado:** coincide com a matriz do §7.9.
- **Riscos:** no "Revogar acesso?", o Tab pode chegar a selects que gravam o papel na hora. Não altere nenhum.

---

## 6. Suspeitas encontradas no código

> A lista está ordenada por severidade (crítica → alta → média → baixa). Entre colchetes estão as telas afetadas e a referência da base de 13/08 (`Sxx`); "novo" indica algo que não existia na base. Quando áreas diferentes davam severidades diferentes à mesma suspeita, ficou a **maior**. Isso aconteceu em S30, S54, S72, S77, S88 e na dessincronia banner × preferências. A evidência está no formato `arquivo:linha`, conferida no código de `05b0066` + working tree.

### 6.1 Crítica

| ID  | Severidade | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Evidência                                                                                                                                                                                                              | Como ver no navegador                                                                                                                                                                        |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B01 | crítica    | **Categoria-fantasma com nome UUID.** O wizard envia `categoryId` como UUID, mas `resolveCategoryId` só reconhece ids numéricos (`/^\d+$/`). Por isso trata o UUID como slug, não encontra nada e INSERE uma categoria com `name = slug = UUID`. Todo POST ou PUT do wizard cria ou reusa uma fantasma, e cada nova edição cria outra. [A09, A12; S01]                                                                                                                           | `handlers/admin/products.js:30-68` (regex :36, insert :57-65), `:198`, `:225-228`; `src/pages/AdminPage.jsx:326`; `supabase/schema.sql:35`                                                                             | Com um produto [TESTE] criado numa categoria real: a coluna CATEGORIA mostra um UUID e a aba Categorias ganha um cartão com esse nome. No POST, `categoryId=<uuid>`.                         |
| B02 | crítica    | **Editar e salvar um produto APAGA dados.** O wizard é alimentado pela linha do `/api/admin/dashboard`, que não traz images, videos, original_price, product_type, faq, reviews nem benefits. O payload regrava a galeria com 1 imagem, `videos=[]`, `original_price=0`, tipo `individual`, `faq/reviews/benefits=[]`, `featured=false` e `active=true` (o que **reativa** um produto pausado). O `fetchAdminProducts`, que traz tudo, existe e não é usado. [A07, A10–A12; S02] | `handlers/admin/dashboard.js:144-153,219-233`; `src/pages/AdminPage.jsx:301-304,316-333`; `src/components/ProductWizard.jsx:66-86,167-174`; `handlers/admin/products.js:70-141`; `src/services/admin-products.js:4-20` | Num produto [TESTE] com galeria, preço riscado e FAQ, e pausado: "Editar" mostra 1 cartão de imagem e a Conversão vazia; salvar sem mexer volta o chip para "Ativo" e a loja perde os dados. |
| B03 | crítica    | **Trancamento 1: 2FA ligado sem método.** Sem `adminConfig`, o checkbox já vem marcado. "Salvar configurações" com os campos vazios grava `{twoFactorEnabled:true}` sem TOTP nem PIN e sem passar pelo gate. No próximo login, depois da senha correta, a API dá 500 "2FA ativado sem método configurado no adminConfig.", e só SQL resolve. Dá para desfazer enquanto a sessão atual (8 h) durar. [A28; S03]                                                                    | `src/components/admin/tabs/SecurityTab.jsx:61,64-77`; `handlers/admin/settings.js:238-282,495-498`; `lib/admin-2fa.js:283-300`; `handlers/admin/login.js:236-243,450-453`                                              | Só em ambiente descartável: com `has2FA:false` e `hasPin:false`, o checkbox vem marcado; salvar dá sucesso e, depois de "Encerrar sessão", o login mostra o erro 500.                        |
| B04 | crítica    | **Trancamento 2: segredo sem prova de posse.** O servidor aceita qualquer Base32 com 16 ou mais caracteres, inclusive o placeholder público `JBSWY3DPEHPK3PXP`, sem pedir um código gerado por ele, e não há QR code. Um segredo digitado errado, ou um PIN errado ou esquecido (o PIN é hasheado), tranca o admin fora. [A28; S04]                                                                                                                                              | `src/components/admin/tabs/SecurityTab.jsx:105,109,122`; `handlers/admin/settings.js:174-213,495-498`; `handlers/admin/login.js:270-291`                                                                               | Não reproduza fora de ambiente descartável. O sintoma é que, na 2ª etapa, qualquer código dá "Código de verificação inválido.".                                                              |
| B05 | crítica    | **O Supabase é o mesmo no local e em produção** (ref `npgtngcdskwcsmgymkql`). Tudo o que for criado, editado ou excluído no localhost (produtos, categorias, cupons, pedidos, contas, vitrine, 2FA) aparece ou some no site público. Os contadores de rate limit também ficam nesse Postgres. [§7.1; S05]                                                                                                                                                                        | `.env.local` (só o ref foi lido); `GET https://atelie-escolar.vercel.app/api/products` com imagens em `npgtngcdskwcsmgymkql.supabase.co`                                                                               | Crie "[TESTE] Categoria QA" no localhost e abra `https://atelie-escolar.vercel.app/sitemap.xml` depois de até 5 min: ela aparece. Faça a limpeza em seguida.                                 |
| B06 | crítica    | **O deploy de produção é anterior à correção AUTH-01 (`244226c`).** Login, cadastro e callback do Google do cliente rodam SEM rate limit, o logout de cliente roda sem anti-CSRF e os segredos de 2FA ficam sem a cifra de `5949cc7`. Está corrigido no código, mas não foi publicado. [§7.2; novo]                                                                                                                                                                              | GET no deploy: `/api/auth/customer/login`, `/register`, `/google/callback` e `/logout` → 404 "Rota não encontrada" (era `router.post`); `routes/auth.routes.js:26-31,51-56`; `docs/reviews/REVIEW-AUTH-2026-09-01.md`  | Abra `https://atelie-escolar.vercel.app/api/auth/customer/login` na barra: JSON 404 `NOT_FOUND`. Com o código atual seria 405. **Não tente força bruta.**                                    |

### 6.2 Alta

| ID  | Severidade | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidência                                                                                                                                                                                              | Como ver no navegador                                                                                                                                                                                                                |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B07 | alta       | **Reinscrição depois do descadastro reativa na hora, sem double opt-in.** Para um registro com `confirmed=true` e `unsubscribed_at` preenchido, `/subscribe` zera o `unsubscribed_at` e mantém `confirmed`. Qualquer pessoa pode recolocar o e-mail de outra pessoa na lista. [L04, L15; S13]                                                                                                                                                                                                                                                                                                       | `handlers/subscribe.js:85-90,101-111`; `handlers/confirm-subscription.js:74-80`                                                                                                                        | F23: descadastrar pelo token, inscrever o mesmo e-mail e inscrever de novo, sem abrir e-mail: aparece "Você já está inscrito. Obrigada!".                                                                                            |
| B08 | alta       | **O reenvio do e-mail de opt-in fica bloqueado.** A idempotência usa (e-mail, `opt_in_confirmation`, id) e pula quando já existe um envio `sent`. Uma nova inscrição mais de 1 h depois gera um token novo (o que invalida o 1º link), mas o e-mail novo não sai. [L04, L15; S14]                                                                                                                                                                                                                                                                                                                   | `handlers/subscribe.js:95-98,127-133`; `lib/email-sender.js:138-154,210-213`                                                                                                                           | Inscreva X, espere mais de 1 h e inscreva de novo: a tela diz "Confirmação enviada…", nada chega e o link antigo dá "Token inválido ou expirado.".                                                                                   |
| B09 | alta       | **O retorno do Mercado Pago (`/checkout?status=failure` e `pending`) é ignorado.** A página não lê a query string. O cliente vê o checkout comum, sem aviso, e pode criar um 2º pedido. [C07, C08; S15]                                                                                                                                                                                                                                                                                                                                                                                             | `src/pages/CheckoutPage.jsx:1-2,61-66`; `lib/mercadopago-config.js:54-58`                                                                                                                              | Com itens no carrinho, `/checkout?status=failure` fica idêntico a `/checkout`.                                                                                                                                                       |
| B10 | alta       | **Um cupom esgotado é tratado como sucesso.** A RPC `increment_coupon_usage` devolve NULL quando `max_uses` já foi atingido, mas `claimCouponUsage` testa `Number.isFinite(Number(value))`, e `Number(null)` é 0. Numa corrida pelo último uso, os dois checkouts ganham o desconto. [C07; S16]                                                                                                                                                                                                                                                                                                     | `handlers/create-payment.js:45-61` (:56), `251-285`; `supabase/migrations/20260701000001_phase5_payment_hardening.sql:37-48`                                                                           | Com um cupom de `max_uses=1` e duas abas clicando "Ir para pagamento" quase juntas: as duas respostas trazem `couponApplied` e `discount>0`.                                                                                         |
| B11 | alta       | **Os links de download são de uso único e não há regeneração.** A nota manda clicar em "Atualizar" para gerar links novos, mas `verify-payment` e o webhook só criam tokens quando não existe NENHUM. Os tokens usados voltam na lista sem indicação, e cada arquivo baixa uma vez só. [C10, C11, L14; S17]                                                                                                                                                                                                                                                                                         | `src/pages/DownloadsPage.jsx:467-496`; `handlers/verify-payment.js:195-200,294-298`; `handlers/webhook.js` (loadExistingTokens/createDownloadTokens); `handlers/download.js:55-61`                     | Num pedido aprovado: "Baixar", "Atualizar" e "Baixar" de novo. A 2ª aba mostra "Token já utilizado", com o mesmo token na URL.                                                                                                       |
| B12 | alta       | **`/downloads` pede para informar o e-mail "abaixo", mas não existe campo.** Os links sem `&email` (a `back_url` do MP e o e-mail de confirmação), abertos sem login, não carregam o pedido. [C10, C12; S18]                                                                                                                                                                                                                                                                                                                                                                                        | `src/pages/DownloadsPage.jsx:110-139`; `lib/mercadopago-config.js:55`; `lib/email-templates.js:88`                                                                                                     | Numa janela anônima, `/downloads?order=<código real>`: aparece a frase e só o botão "Entrar".                                                                                                                                        |
| B13 | alta       | **O e-mail de confirmação de pedido nunca é enviado automaticamente.** Nenhum código chama `/api/send-confirmation-email`, e o webhook só provisiona a conta e grava o evento. [C12, F40; S19]                                                                                                                                                                                                                                                                                                                                                                                                      | `handlers/webhook.js:138-205`; `lib/rate-limit.js:254-266`; `routes/api-compat.routes.js`                                                                                                              | Depois de uma compra de teste aprovada, o e-mail não chega e não aparece `/send-confirmation-email` na rede.                                                                                                                         |
| B14 | alta       | **O carrinho abandonado nunca é marcado como recuperado** (nada grava `recovered_at`). Quem pagou recebe os lembretes de 1–2 h e de 24 h, e o portão de consentimento libera o envio justamente porque há um pedido aprovado. [C12; S20]                                                                                                                                                                                                                                                                                                                                                            | `handlers/abandoned-cart.js:103-130`; `handlers/cron-email-jobs.js:367-420,432-460`                                                                                                                    | Depois de uma compra de teste e da execução do cron: os lembretes chegam, e `abandoned_carts.recovered_at` continua nulo.                                                                                                            |
| B15 | alta       | **O reset de senha provavelmente está quebrado.** (1) O cliente Supabase, com `detectSessionInUrl:true`, já troca o `?code`, e a página chama `exchangeCodeForSession` de novo. (2) O AuthProvider trata qualquer `?code` ou `#access_token` como retorno do Google, inclusive em `/reset-password`: faz o POST do callback, limpa a URL e dá `signOut`, destruindo a sessão de recuperação. Salvar então dá "Auth session missing!". [C06; S21]                                                                                                                                                    | `src/services/customer-auth.js:98-110,122-138`; `src/providers/AuthProvider.jsx:61-86`; `src/services/supabase-browser.js:58-68`; `src/pages/ResetPasswordPage.jsx:14-20,82,137`                       | F32: aparece `POST …/auth/customer/google/callback`, o `?code` some e, ao salvar, "Auth session missing!".                                                                                                                           |
| B16 | alta       | **A conta criada numa compra de convidado recebe o e-mail de "definir senha" apontando para `APP_URL/login?mode=login`,** em fluxo implícito (`#access_token`), que o cliente PKCE não aceita. O hash é limpo e não há campo de nova senha, então o cliente nunca define a senha. [C12; S22]                                                                                                                                                                                                                                                                                                        | `lib/customer-account-provisioning.js:22-32,126-136`; `src/services/customer-auth.js:98-110,144-152`                                                                                                   | Abra o link: cai em `/login?mode=login` com o formulário "Entrar" e sem campo de nova senha.                                                                                                                                         |
| B17 | alta       | **As credenciais do Mercado Pago no `.env.local` começam com `APP_USR-`** (produção ou vendedor de teste; o prefixo não permite distinguir), e o `.env.local` tem prioridade sobre o `.env`, que tem `TEST-`. O Checkout Pro aberto no local pode cobrar de verdade e recusar os cartões de teste. [C09; S24]                                                                                                                                                                                                                                                                                       | `server.js:9-29`; `.env.local` (só o prefixo); `lib/mercadopago-config.js:12-27`; `docs/ProjectDocs/03-SETUP.md` §2.2                                                                                  | A aba abre em `www.mercadopago.com.br/checkout`. **Não conclua o pagamento.**                                                                                                                                                        |
| B18 | alta       | **O `APP_URL` local aponta para um túnel ngrok.** As back_urls, o `notification_url`, os links dos e-mails (inclusive o de exclusão de conta e o `devConfirmUrl`), o sitemap local e a allowlist anti-CSRF usam esse host. Os retornos e os links caem em "Frontend legado removido…" (404 JSON) ou num erro do túnel. [C04, C08, C12; S25, S157]                                                                                                                                                                                                                                                   | `lib/mercadopago-config.js:37,52-56`; `lib/email-sender.js:99`; `handlers/me-delete-account.js:138-160`; `lib/http.js:251-261`; `server.js:114-118`                                                    | Peça a exclusão de uma conta descartável: o console mostra `https://<sub>.ngrok-free.dev/conta?delete_token=…`. Troque o host por `http://localhost:5173` e o link funciona.                                                         |
| B19 | alta       | **O anti-CSRF só aceita o `APP_URL`** (`atelie-escolar-joao-luis-c.vercel.app`, mais localhost:5173 em dev). Pelo alias `atelie-escolar.vercel.app`, TODA escrita admin e o logout admin respondem 403. Quando o logout falha, o painel continua aberto e o cookie vale por mais 8 h (o AuthProvider só zera a sessão depois de um sucesso). O Vite numa porta diferente de 5173 tem o mesmo efeito. [A03, F62; S26/S27]                                                                                                                                                                            | `lib/http.js:251-262`; `lib/admin-session.js:167-189,210-221`; `handlers/admin/logout.js:9-16`; `src/providers/AuthProvider.jsx:103-106`; `src/pages/AdminPage.jsx:287-294`                            | No alias, "Salvar Categoria" mostra o toast "Origem não permitida (possível CSRF)." (403), e "Encerrar sessão" mostra "Origem nao permitida (possivel CSRF)." com o painel ainda aberto. No `-joao-luis-c`, as mesmas ações dão 200. |
| B20 | alta       | **`GET /api/admin/dashboard` responde com `Cache-Control: private, max-age=3600`**, e o front usa o `fetch` padrão, sem cache-buster. Depois de cada escrita (produto, categoria, vitrine) e a cada troca de aba, o navegador devolve o JSON guardado. Resultado: listas velhas, a categoria nova ausente do select do wizard, a Vitrine exibindo a configuração anterior (e o risco de regravá-la) e a expiração de sessão não detectada. O mesmo vale para `kpis`, `abc-*`, `cohort`, `funnel` e `segments`. "Disable cache" esconde o problema. [A03, A05, A07, A14, A27; novo, desde `08e1535`] | `handlers/admin/dashboard.js:337-339`; `lib/http.js:294-311` (:299); `src/services/admin-panel.js:4-26`; `src/utils/api.js:120-157`; `src/pages/AdminPage.jsx:162-180,277-284,343,354,401,417,452-463` | F48: "Nova categoria" + salvar dá o toast "Categoria criada.", o GET vem de "(memory cache)" e a tabela não mostra a categoria. Com "Disable cache", ela aparece.                                                                    |
| B21 | alta       | **O vídeo enviado pelo wizard não toca.** O bucket `product_videos` é privado, o valor salvo é o caminho relativo `product_videos/<arquivo>`, e a página usa `<video src>` com esse caminho, que vira `/produtos/product_videos/…` e recebe o index.html. [A10, L12; S10]                                                                                                                                                                                                                                                                                                                           | `handlers/admin/upload-url.js:50-55,285-289`; `handlers/product-details.js:94`; `src/pages/ProductDetailsPage.jsx:117-120,200`                                                                         | Num produto [TESTE] com um MP4: o player fica vazio e a rede mostra `GET /produtos/product_videos/…` 200 `text/html`.                                                                                                                |
| B22 | alta       | **Usuários: o select oferece "Admin" e "Suporte", mas a API só aceita customer/cliente/seller/vendedor.** Essas duas opções sempre dão 400, com uma mensagem que fala em admin/master mesmo no caso de "Suporte". Na prática, o único papel atribuível pela UI é "Cliente". [A25; S12]                                                                                                                                                                                                                                                                                                              | `src/components/admin/tabs/UsersTab.jsx:8-12`; `validation/admin.schemas.js:219-232`                                                                                                                   | Num cliente de teste, "Suporte" dá PUT 400, o toast "Role inválida. …" e o select volta.                                                                                                                                             |
| B23 | alta       | **Trancamento 3: `ADMIN_2FA_ENC_KEY` diferente entre os ambientes.** Ela falta no `.env.local`, e o dev cifra com a chave fixa `dev-admin-2fa-encryption-key-change-me`. Com o banco compartilhado: (a) se o TOTP estiver ativo em produção, o localhost não consegue decifrar o segredo e recusa um código correto (só o PIN funciona); (b) salvar a Segurança a partir do localhost grava o segredo com a chave de dev, e o TOTP deixa de funcionar em produção. [A28, A01; novo]                                                                                                                 | `lib/admin-2fa.js:65-71,104-121,132-155,254-278`; `lib/env-secret.js:40-51`; `handlers/admin/settings.js:192,520`; `scripts/check-env.js:143`                                                          | Com o TOTP ligado, faça login em `localhost:5173/admin` com um código válido: "Código de verificação inválido.". O mesmo código funciona no deploy. **Nunca salve a Segurança a partir do localhost.**                               |
| B24 | alta       | **Com o 2FA vigente, a aba Segurança nunca envia `confirmationCode`.** Qualquer mudança de campo de segurança dá 403, e não há onde digitar o código: não dá para desligar nem rotacionar o 2FA pela UI. Com `requireSecondFactor:true` e sem `twoFactorEnabled`, até salvar sem mexer em nada dá 403. [A28; S09]                                                                                                                                                                                                                                                                                   | `src/components/admin/tabs/SecurityTab.jsx:61,64-77`; `handlers/admin/settings.js:83-95,415-423,495-547`                                                                                               | Só em ambiente descartável com o 2FA ativo: desmarque e salve. Aparece o toast 403 com a mensagem de `confirmationCode`.                                                                                                             |

### 6.3 Média

| ID   | Severidade | Descrição                                                                                                                                                                                                                                                                                                                                                                           | Evidência                                                                                                                                                                                                    | Como ver no navegador                                                                                                                   |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| B25  | média      | O "Painel admin" e a ocultação do carrinho dependem só do papel da **sessão de cliente**, mas o login admin grava apenas `admin_session`. Um admin que entrou por `/admin` vê a loja como visitante, e quem entrou em `/login` com papel admin precisa de um 2º login. "Sair" na loja não encerra `admin_session`. [L01, F09; S29]                                                  | `src/components/Shell.jsx:40-49,103-125`; `src/providers/AuthProvider.jsx:16-18,29-41`; `src/components/ProtectedRoute.jsx:12,36`                                                                            | Entre só por `/admin` e abra `/`: o header mostra "Entrar" e o carrinho.                                                                |
| B26  | média      | O logout do cliente não tem `await` nem `catch`. O toast "Sessão encerrada." aparece antes da resposta. Se a rede falhar, o estado e o cookie continuam, e o console mostra "Uncaught (in promise)". No código atual o endpoint confere a Origin: pelo alias, o POST volta 403 com o mesmo toast falso, e o F5 mostra o cliente logado de novo. [L01, L02; S30]                     | `src/components/Shell.jsx:51-55`; `src/providers/AuthProvider.jsx:124-129`; `src/services/customer-auth.js:224-235`; `handlers/auth/customer/logout.js:10-16`                                                | Bloqueie `*auth/customer/logout*` e clique em "Sair": o toast aparece, o header continua em "Conta" e há um erro de promise no console. |
| B27  | média      | Um `localStorage.cart` com JSON válido que não seja array (`'{}'`, `'null'`) derruba a app: `readCart` não valida o formato e o provider chama `cart.reduce`. [L03, L08; S39]                                                                                                                                                                                                       | `src/utils/cart-storage.js:3-10`; `src/providers/CartProvider.jsx:9,70-73`                                                                                                                                   | `localStorage.setItem('cart','{}')` + F5 → "Algo deu errado" e `TypeError 'cart.reduce is not a function'`.                             |
| B28  | média      | Com o armazenamento bloqueado ou a cota cheia, a loja quebra: `writeCart` chama `setItem` sem try/catch dentro de um efeito. [L03; S38]                                                                                                                                                                                                                                             | `src/utils/cart-storage.js:12-14`; `src/providers/CartProvider.jsx:14-17`                                                                                                                                    | `Storage.prototype.setItem=()=>{throw new DOMException('cota','QuotaExceededError')}` e "Adicionar" → "Algo deu errado".                |
| B29  | média      | Preço e nome ficam congelados no localStorage no momento do "Adicionar". O drawer, o checkout e a prévia do cupom usam esse valor, mas a cobrança usa o preço atual do banco. Um produto desativado continua no carrinho até o `create-payment` recusar. [L03, C07; S72]                                                                                                            | `src/providers/CartProvider.jsx:26-39`; `src/components/CartDrawer.jsx:190-193,211-215`; `src/services/coupons.js:21-28`; `handlers/create-payment.js:204-244`                                               | Adicione um produto, altere o preço no admin e volte: aparece o preço antigo, mas o `/create-payment` usa o novo.                       |
| B30  | média      | A newsletter permite descobrir quem é inscrito. O backend devolve `alreadyConfirmed` e a UI diz "Você já está inscrito. Obrigada!", contrariando o comentário do componente. [L04; S34]                                                                                                                                                                                             | `src/components/NewsletterSignup.jsx:14-15,44-49`; `handlers/subscribe.js:85-90`                                                                                                                             | Um e-mail confirmado recebe a mensagem de já inscrito; um e-mail novo recebe "Confirmação enviada…".                                    |
| B31  | média      | Não há scroll-to-top na troca de rota (nenhum `ScrollRestoration` nem `scrollTo` em `src/`). Os links do rodapé e os cards do fim do catálogo ou do cross-sell abrem a página nova já rolada. [L01, L04, L12; S35]                                                                                                                                                                  | `src/App.jsx:52-80`; `src/main.jsx:21`                                                                                                                                                                       | Role até o rodapé e clique em "Privacidade": `window.scrollY > 0`.                                                                      |
| B32  | média      | Links de placeholder: Facebook e Pinterest levam às páginas iniciais genéricas, e o WhatsApp usa o número fictício 5511999999999. [L04; S36]                                                                                                                                                                                                                                        | `src/components/Shell.jsx:314,323,386,392`                                                                                                                                                                   | Inspecione os hrefs do rodapé.                                                                                                          |
| B33  | média      | O domínio `profamarciarcardoso.com.br`, que não resolveu (NXDOMAIN) em 2026-09-28, é usado no e-mail de contato e no canal LGPD, na linha `Sitemap:` do robots, no JSON-LD da home e no fallback do canonical. [L04, L09; S37]                                                                                                                                                      | `src/components/Shell.jsx:377,381`; `src/pages/LegalPages.jsx:69,178,283`; `public/robots.txt:11`; `src/pages/HomePage.jsx:20-34`; `src/components/SEO.jsx:25`                                               | Abra `https://profamarciarcardoso.com.br` e veja se resolve.                                                                            |
| B34  | média      | O banner de cookies e o bloco "Suas preferências de cookies" não se sincronizam na MESMA aba: os dois só escutam o evento `storage` (que não dispara na própria aba) e ignoram o `lgpd-consent-change`. Decidir num deles deixa o outro desatualizado até o F5. [L05, L13; novo]                                                                                                    | `src/components/ConsentBanner.jsx:12-21`; `src/components/ConsentPreferences.jsx:39-50`; `src/utils/consent.js:59-71`                                                                                        | Janela anônima → `/privacidade` → "Aceitar todos" no bloco: o banner continua na tela.                                                  |
| B35  | média      | Enquanto está pendente, o banner de cookies (fixo, z-50, renderizado depois do `<App/>`) fica por cima dos outros overlays: cobre o rodapé do drawer, o rodapé dos wizards, a base dos filtros mobile e o "Encerrar sessão" do admin (entre 1024 e 1343 px e na gaveta mobile). A armadilha de foco do drawer impede alcançar o banner pelo teclado. [L03, L05, L11, A03, A08; S31] | `src/main.jsx:25-26`; `src/components/ConsentBanner.jsx:38-43`; `src/components/CartDrawer.jsx:123-131`; `src/components/ModalWizard.jsx:96,162-204`; `src/components/admin/AdminLayout.jsx:170-174,228-237` | Sem decisão de cookies, abra o drawer com itens ou o `/admin` a 1100×800: o banner cobre "Finalizar compra" / "Encerrar sessão".        |
| B36  | média      | Os ícones `check-circle-fill` (toast de sucesso e benefício customizado) e `exclamation-circle-fill` (toast de aviso) não estão no subset da fonte bootstrap-icons: os toasts verde e âmbar aparecem sem ícone. [L06, L12; novo]                                                                                                                                                    | `src/components/ToastViewport.jsx:10-15,34`; `src/components/ProductBenefits.jsx:29`; `scripts/icons-usados.json` e `public/fonts/bootstrap-icons-subset.css` (0 ocorrências)                                | Clique em "Adicionar": o toast verde sai sem ícone, enquanto o toast azul de "Sair" tem ícone.                                          |
| B37  | média      | Arquivos inexistentes, inclusive `/assets/*.js` de um deploy anterior, voltam como index.html com 200. Os `lazy()` não têm retry nem listener de `vite:preloadError`: quem está com a aba aberta durante um deploy vê "Algo deu errado" ao navegar para uma página nova. [L07, L08, A03; S100]                                                                                      | `vercel.json:35-45`; `src/App.jsx:6-41`; `src/pages/AdminPage.jsx:58-83`; `src/main.jsx:19`                                                                                                                  | `/assets/nao-existe.js` no deploy dá 200 com HTML. Bloqueie `*LegalPages*` e clique em "Termos".                                        |
| B38  | média      | O ErrorBoundary nunca reseta `hasError` e fica fora do Router: depois de qualquer erro, Voltar e Avançar não recuperam a página. [L08; S102]                                                                                                                                                                                                                                        | `src/components/ErrorBoundary.jsx:51-59,76-77`; `src/main.jsx:19-21`                                                                                                                                         | Provoque o erro, corrija o storage e clique em Voltar: o cartão continua.                                                               |
| B39  | média      | Há um ErrorBoundary único para a app inteira: uma exceção em qualquer componente (uma aba do admin, o CartProvider) derruba o site todo. [L08, A03; S103]                                                                                                                                                                                                                           | `src/main.jsx:19`                                                                                                                                                                                            | Qualquer gatilho substitui a página inteira pelo cartão.                                                                                |
| B40  | média      | A faixa "Novidades" da home lista os N produtos mais recentes de qualquer data, mas "Mais produtos →" leva a `?preset=novidades`, que filtra só os últimos 7 dias e pode dar zero resultados. [L09; S40]                                                                                                                                                                            | `handlers/home-sections.js:200-205`; `src/hooks/useProductFilters.js:13-21`                                                                                                                                  | Com produtos antigos, a faixa tem cards, mas o link mostra menos produtos ou nenhum.                                                    |
| B41  | média      | Não dá para ter uma vitrine vazia: `{sections:[]}`, ou seções só com categorias inativas, são tratadas como "sem configuração" e a home mostra as 5 seções padrão. [L09, A27; S41]                                                                                                                                                                                                  | `handlers/home-sections.js:63-113`; `src/components/admin/utils/derive.js:299-333`                                                                                                                           | Remova todas as seções, salve e volte à aba (ou abra a home): as seções padrão reaparecem.                                              |
| B42  | média      | O cache público de 5 min, mais `stale-while-revalidate` de 1 h, em `/home-sections`, `/products`, `/product-details` e `/cross-sell`, também vale em dev. As mudanças do admin (pausar, preço, vitrine) demoram a aparecer, e o painel não avisa. [L09, L10, A07, A27; S48]                                                                                                         | `handlers/home-sections.js:215-219`; `handlers/products.js:89-92`; `handlers/product-details.js:79-82`; `handlers/cross-sell.js:204-207`; `lib/http.js:297`                                                  | Mude um preço e dê F5: aparece o valor antigo, com a resposta vinda de "(disk cache)".                                                  |
| B43  | média      | A mesma categoria pode ocupar duas seções (o select "Categoria vinculada" lista também as já usadas). Na home, a key React e o ref de rolagem ficam compartilhados, e as setas de uma faixa movem a outra. [L09, A27; S88]                                                                                                                                                          | `src/components/admin/tabs/VitrineTab.jsx:237-241`; `handlers/home-sections.js:207-208`; `src/pages/HomePage.jsx:316,331,339,379`                                                                            | Repita uma categoria na vitrine: o console avisa "Encountered two children with the same key".                                          |
| B44  | média      | Clicar em "Produtos" estando em `/produtos?categoria=X` (ou `?preset=`) limpa a URL, mas mantém o filtro aplicado. [L01, L10, F12; S47]                                                                                                                                                                                                                                             | `src/hooks/useProductFilters.js:81-103`; `src/components/Shell.jsx:99-101,345-347`                                                                                                                           | Home → "Mais produtos →" → "Produtos": a URL fica `/produtos`, mas a grade continua filtrada.                                           |
| B45  | média      | `?preset=novidades` filtra os últimos 7 dias sem nenhum indicador. O chip "Todos" continua ativo e a mensagem de vazio culpa "a categoria". [L10; S46]                                                                                                                                                                                                                              | `src/hooks/useProductFilters.js:13-21,107-113`; `src/components/ProductGrid.jsx:155-163`                                                                                                                     | A contagem fica menor que o total, com "Todos" ativo.                                                                                   |
| B46  | média      | Os selos dos cards ("MAIS VENDIDO", "DESTAQUE", "LANÇAMENTO", "PROMO LIMITADA", "EXCLUSIVO") são fixos por nome de categoria, sem relação com os dados. As chaves estão sem acento e não casam com os nomes acentuados. [L10; S44]                                                                                                                                                  | `src/components/ProductGrid.jsx:5-11,18,38-44`                                                                                                                                                               | Todo card de "Festa Junina" mostra "MAIS VENDIDO".                                                                                      |
| B47  | média      | Os chips "PDF", "Canva" e "Imprimível" são fixos em todos os cards (afirmam que todo material é editável no Canva). [L10; S45]                                                                                                                                                                                                                                                      | `src/components/ProductGrid.jsx:59-69`                                                                                                                                                                       | Todos os cards mostram os mesmos três chips.                                                                                            |
| B48  | média      | A CSP de produção limita `img-src` a `'self'`, `data:`, `blob:`, `*.supabase.co` e analytics. Imagens de outros domínios quebram no deploy. [L10; S42]                                                                                                                                                                                                                              | `vercel.json:18-19`                                                                                                                                                                                          | No deploy, o console mostra "Refused to load the image …", se houver uma URL externa no banco.                                          |
| B49  | média      | A CSP de produção não tem `media-src` (vale o `default-src 'self'`), e o `frame-src` só permite `'self'` e o Mercado Pago. Vídeos do Storage e embeds do YouTube são bloqueados no deploy, mas funcionam no localhost (que não tem CSP). [L12, F63; S11]                                                                                                                            | `vercel.json:19`; `src/pages/ProductDetailsPage.jsx:52-60,191-201`                                                                                                                                           | No deploy, abra um produto com vídeo: o console mostra "Refused to frame https://www.youtube.com/ …" ou "Refused to load media".        |
| B50  | média      | `/produtos/<número>` é tratado como id legado, mas `products.id` é uuid: o erro de cast vira 500 e a tela mostra "Falha ao carregar produto: 500" em vez de "não encontrado". [L12; S49]                                                                                                                                                                                            | `src/services/products.js:27-46`; `handlers/product-details.js:17-25,53-60,112-118`; `supabase/schema.sql:48`                                                                                                | Abra `/produtos/123`: caixa rosa e GET 500.                                                                                             |
| B51  | média      | Os depoimentos não vêm de compradores: são digitados pelo admin no wizard. O e-mail do D+3 aponta para `/avaliar?order=…`, uma rota que não existe (404). [L12, C12; S50]                                                                                                                                                                                                           | `src/components/ProductReviews.jsx:3-7`; `src/components/ProductWizard.jsx:41,86,173`; `lib/email-templates.js:197`; `src/App.jsx:56-77`                                                                     | Abra `/avaliar?order=teste`: "Página não encontrada".                                                                                   |
| B52  | média      | A confirmação da inscrição anula o `confirmation_token`: reabrir o link (F5, Voltar ou um 2º clique) mostra "Token inválido ou expirado." para quem já confirmou. O comentário do código diz que a operação é idempotente. [L15, F22; S43]                                                                                                                                          | `handlers/confirm-subscription.js:14-20,65-71,107-116`                                                                                                                                                       | Confirme e dê F5: aparece "Não foi possível confirmar".                                                                                 |
| B53  | média      | As URLs de categoria do sitemap usam o slug (`?categoria=festa-junina`), mas o catálogo compara com o NOME normalizado. Categorias com espaço ou acento não filtram. [L10, §7.6; S111]                                                                                                                                                                                              | `handlers/sitemap.xml.js:85`; `src/hooks/useProductFilters.js:4-11,81-92`                                                                                                                                    | `/produtos?categoria=festa-junina` mostra tudo, enquanto `?categoria=Festa%20Junina` filtra.                                            |
| B54  | média      | A linha `Sitemap:` do robots aponta para `profamarciarcardoso.com.br` (NXDOMAIN), e as `<loc>` do sitemap usam o domínio do `APP_URL` (`-joao-luis-c.vercel.app`), que responde com `X-Robots-Tag: noindex`. [§7.6; novo]                                                                                                                                                           | `public/robots.txt:12`; `handlers/sitemap.xml.js:12-18`                                                                                                                                                      | Abra `/robots.txt` e `/sitemap.xml` no deploy e confira os domínios.                                                                    |
| B55  | média      | O bootstrap de sessão faz `Promise.all` com as duas sessões. Se uma delas falhar (rede, timeout, 429 do limitador de borda), o `catch` zera as duas: um admin com cookie válido vê o formulário e um cliente logado aparece deslogado. [C01, A01, §7.3; S54]                                                                                                                        | `src/providers/AuthProvider.jsx:26-52`; `src/services/customer-auth.js:153-164`; `src/services/admin-auth.js:35-45`                                                                                          | Bloqueie `*auth/customer/session*` e dê F5 em `/admin` com uma sessão válida: aparece "Acesso restrito".                                |
| B56  | média      | Com a API fora do ar, não dá para distinguir do estado "não logado": o ProtectedRoute não tem estado de erro, e o erro só aparece ao enviar o formulário, como "Failed to fetch" (a mensagem crua, em inglês). O mesmo texto aparece no cartão de erro das abas. [A01, A03; S104/S106]                                                                                              | `src/providers/AuthProvider.jsx:43-47`; `src/components/ProtectedRoute.jsx:22-38`; `src/utils/api.js:136-145`; `src/pages/AdminPage.jsx:204`                                                                 | Pare a API, dê F5 em `/admin` e envie o formulário: "Failed to fetch".                                                                  |
| B57  | média      | Depois do login com o Google, o `?redirect` é ignorado: a página fica em "Você já está conectado", que só oferece "Ir para checkout". [C01, C07; S52]                                                                                                                                                                                                                               | `src/pages/CustomerAuthPage.jsx:575-588`; `src/services/customer-auth.js:81-86`; `src/services/supabase-browser.js:94-98`                                                                                    | `/downloads` → "Entrar" → Google: termina em `/login?redirect=%2Fdownloads`.                                                            |
| B58  | média      | O aviso "Conta criada. Verifique seu e-mail…" só aparece num toast de 2,4 s, e o formulário fica preenchido. [C02; S55]                                                                                                                                                                                                                                                             | `src/pages/CustomerAuthPage.jsx:103-106`; `src/providers/ToastProvider.jsx:15`                                                                                                                               | Com "Confirm email" ligado, depois de ~3 s não sobra nenhuma indicação na tela.                                                         |
| B59  | média      | O signup é feito pelo backend, sem `emailRedirectTo` e sem PKCE. O link de confirmação volta com o token no hash (fluxo implícito), que o cliente PKCE não aceita: o usuário chega deslogado e sem mensagem (provável). [C02; S56]                                                                                                                                                  | `lib/customer-auth-handlers.js:225-232`; `src/services/supabase-browser.js:58-68`; `src/services/customer-auth.js:98-110,144-152`                                                                            | Abra o link de confirmação: o `#access_token` some e o header continua em "Entrar".                                                     |
| B60  | média      | O reset por PKCE guarda o `code_verifier` no localStorage de quem pediu. Abrir o link em outro navegador falha, sem explicação. [C03, C06; S57]                                                                                                                                                                                                                                     | `src/services/supabase-browser.js:58-68`; `src/pages/ResetPasswordPage.jsx:14-20`                                                                                                                            | Peça num navegador e abra o link numa janela anônima: aparece um toast em inglês do SDK.                                                |
| B61  | média      | `/conta` não tem logout, link para "Meus produtos", dados de perfil nem troca de senha, e não usa o Shell. [C04; S58]                                                                                                                                                                                                                                                               | `src/pages/CustomerAuthPage.jsx:540-556,575-629`                                                                                                                                                             | Logado em `/conta`, só existem 4 controles.                                                                                             |
| B62  | média      | O pedido de exclusão de conta responde com sucesso mesmo quando o e-mail não sai: o retorno de `sendEmail` (`smtp_not_configured`, `smtp_error`, `already_sent` em 10 min) é ignorado. [C04; S59]                                                                                                                                                                                   | `handlers/me-delete-account.js:142-161`; `lib/email-sender.js:206-221,256-260`                                                                                                                               | Peça duas vezes em menos de 10 min: o toast verde aparece nas duas, mas o 2º e-mail não chega.                                          |
| B63  | média      | O link de confirmação da exclusão, aberto sem login: o backend exige login (401), mas a página esconde o formulário e não oferece um caminho para entrar. [C05; S60]                                                                                                                                                                                                                | `src/pages/CustomerAuthPage.jsx:558-574`; `handlers/me-delete-account.js:501-508`                                                                                                                            | Numa janela anônima, abra `/conta?delete_token=<válido>` e clique: toast 401, sem campos de login.                                      |
| B64  | média      | Sem um token válido, o formulário de `/reset-password` continua editável, o aviso só aparece num toast de 2,4 s e salvar mostra a mensagem crua do Supabase em inglês. [C06; S61]                                                                                                                                                                                                   | `src/pages/ResetPasswordPage.jsx:87-92,144-146`                                                                                                                                                              | Abra `/reset-password` sem parâmetros e salve "Abcdefg1": "Auth session missing!".                                                      |
| B65  | média      | Um cliente logado, sem pedido selecionado, vê "Nenhum pedido selecionado. Entre na sua conta…". [C10; S62]                                                                                                                                                                                                                                                                          | `src/pages/DownloadsPage.jsx:124-131,343-360`                                                                                                                                                                | Logado, abra `/downloads` sem `lastOrderId`.                                                                                            |
| B66  | média      | `lastOrderId` e `lastOrderEmail` só saem do localStorage quando o pedido é aprovado. Um checkout abandonado ou recusado fica preso: todo `/downloads` sem `?order` reabre esse pedido e faz polling. [C07, C10; S63]                                                                                                                                                                | `src/pages/DownloadsPage.jsx:111-119,165-167`; `src/pages/CheckoutPage.jsx:326-327,357-364`                                                                                                                  | Clique em "Ir para pagamento", depois em "Cancelar e tentar de novo", e abra `/downloads`: aparece um pedido pendente com polling.      |
| B67  | média      | O e-mail do comprador vai na query de `/downloads` (em "Abrir pedido" e no redirect do checkout). `order` + `email` na URL funcionam como credencial, e o pedido e os botões "Baixar" continuam na tela depois de "Sair". [C10; S64]                                                                                                                                                | `src/pages/DownloadsPage.jsx:269-275`; `src/pages/CheckoutPage.jsx:238-240`; `handlers/verify-payment.js:392-416`                                                                                            | Clique em "Abrir pedido": a URL mostra `&email=`. Clique em "Sair": o pedido continua na tela.                                          |
| B68  | média      | Os erros de `/api/download` aparecem como JSON cru numa aba nova, sem página amigável nem link de volta. [C11; S66]                                                                                                                                                                                                                                                                 | `handlers/download.js:27-69,76-119,132-162`                                                                                                                                                                  | Clique duas vezes em "Baixar": a 2ª aba mostra `{"success":false,"error":{"code":"DOWNLOAD_TOKEN_USED",…}}`.                            |
| B69  | média      | O front ignora o que o servidor cobrou. O `create-payment` pode recusar o cupom em silêncio e devolve `couponApplied/discount/total`, mas o `checkout.js` só repassa `orderId` e `paymentUrl`: o cliente vê o desconto na tela e paga o valor cheio no Mercado Pago. [C07; S71]                                                                                                     | `src/services/checkout.js:22-42`; `handlers/create-payment.js:251-287,368-379`; `src/pages/CheckoutPage.jsx:324`                                                                                             | Compare a resposta de `/create-payment` com o Total da tela e com o valor no Mercado Pago.                                              |
| B70  | média      | O pedido, os itens e a reserva do cupom são gravados ANTES da preferência do Mercado Pago. Se o MP falhar, ou o front estourar o timeout de 15 s, sobra um pedido pending órfão, e o uso do cupom não volta. [C07; S73]                                                                                                                                                             | `handlers/create-payment.js:273,302-337`; `src/utils/api.js:70,125`                                                                                                                                          | Com um token de MP inválido em dev, cada tentativa gera um novo pedido pending.                                                         |
| B71  | média      | O front usa o `initPoint` (produção) em vez do `sandboxInitPoint` e não mostra nenhum sinal de sandbox. [C07, C09; S74]                                                                                                                                                                                                                                                             | `src/services/checkout.js:33`                                                                                                                                                                                | A aba aberta é sempre `www.mercadopago.com.br`.                                                                                         |
| B72  | média      | O polling para na PRIMEIRA recusa (vinda do webhook), mas o Checkout Pro permite tentar outro cartão na mesma preferência. Se o cliente paga em seguida, o checkout não acompanha e ainda convida a gerar outro pedido. [C07; S67]                                                                                                                                                  | `src/pages/CheckoutPage.jsx:244-255`; `handlers/webhook.js` (ramo rejected)                                                                                                                                  | Só em sandbox com webhook: pague com OTHE e depois com APRO.                                                                            |
| B73  | média      | "Cancelar e tentar de novo" não invalida a preferência anterior: a aba antiga do Mercado Pago continua pagável, e uma nova tentativa cria outro pedido. [C07; S68]                                                                                                                                                                                                                  | `src/pages/CheckoutPage.jsx:326-327,357-364`                                                                                                                                                                 | Gere, cancele e gere de novo: aparecem 2 pedidos pending no admin.                                                                      |
| B74  | média      | A tela só chega a "recusado" pelo webhook: o `verify-payment` só procura pagamentos APROVADOS. Sem webhook, uma recusa fica em "Aguardando" até o timeout. [C07; S69]                                                                                                                                                                                                               | `handlers/verify-payment.js:55-76,211-220`                                                                                                                                                                   | Sem webhook, todos os `verify-payment` devolvem `pending`.                                                                              |
| B75  | média      | Mudar o carrinho descarta o cupom no checkout, mas o `CouponField` continua mostrando "Desconto aplicado: R$ X" com o código antigo, enquanto o total já está sem desconto. [C07, F36; S70]                                                                                                                                                                                         | `src/pages/CheckoutPage.jsx:135-145`; `src/components/CouponField.jsx:19-21,71,132-137`                                                                                                                      | Com 2 itens e um cupom aplicado, remova um item.                                                                                        |
| B76  | média      | Um cliente logado pode trocar o e-mail do formulário, e o pedido é gravado sem `customer_id`. Ele só entra no histórico se o e-mail for igual ao confirmado da conta, embora a tela diga "Comprando como <e-mail da sessão>". [C07; novo]                                                                                                                                           | `src/pages/CheckoutPage.jsx:497-500,568-583`; `handlers/create-payment.js:302-316`; `handlers/customer-orders.js:74-81,114-132`                                                                              | Logado, troque o e-mail e gere a cobrança: o pedido não aparece em "Seus pedidos".                                                      |
| B77  | média      | `/api/send-confirmation-email` é anônimo e não confere `payment_status`: quem conhece um `order_code` dispara "Pagamento confirmado" para um pedido pendente e queima a idempotência de um envio legítimo futuro. [C12; S75]                                                                                                                                                        | `handlers/send-confirmation-email.js:24-92`                                                                                                                                                                  | Não execute (envia um e-mail real); confira pelo código.                                                                                |
| B78  | média      | O e-mail de carrinho abandonado promete o "checkout com tudo já preenchido", mas o carrinho vive no localStorage do navegador original. [C12; S174]                                                                                                                                                                                                                                 | `lib/email-templates.js:322-326`; `src/utils/cart-storage.js:1-14`                                                                                                                                           | Abra `/checkout` em outro navegador: "Seu carrinho está vazio.".                                                                        |
| B79  | média      | O SMTP local envia como `@resend.dev` (sandbox do Resend), que só entrega para o e-mail do dono da conta Resend. Os e-mails de teste para outros endereços não chegam, e a tela não avisa. [L04, C12; novo]                                                                                                                                                                         | `SMTP_FROM` do `.env.local` (só o domínio); `docs/ProjectDocs/03-SETUP.md` §10                                                                                                                               | Assine a newsletter com outro e-mail: a tela confirma, mas nada chega.                                                                  |
| B80  | média      | Funil, Segmentos, Cupons, a 2ª etapa da Análise e os KPIs do Dashboard tratam os erros localmente e não chamam `onAuthExpired`. Com a sessão vencida, mostram a caixa rosa "Sessão admin inválida ou expirada." e o painel continua aberto. [A03, A17, A21, A24; S107]                                                                                                              | `src/components/admin/tabs/FunnelTab.jsx:125-127`; `SegmentsTab.jsx:52-54`; `AnalysisTab.jsx:272-274`; `DashboardTab.jsx:536-538`; `CouponsTab.jsx:49-51,91-93,107-109,120-126`                              | Derrube a sessão e clique em "Segmentos" ou "Cupons": aparece a caixa rosa, sem toast âmbar nem formulário.                             |
| B81  | média      | O cartão de erro das abas não tem "tentar de novo", e clicar na aba ativa não recarrega. Na aba Pedidos, o erro some junto com o select. [A03, A16; S105]                                                                                                                                                                                                                           | `src/pages/AdminPage.jsx:125,162-214,482-489`                                                                                                                                                                | Com Offline, clique em "Usuários" e volte à rede: o cartão rosa continua.                                                               |
| B82  | média      | O menu lateral mobile do admin não fecha com Esc, não tem X interno, não prende nem posiciona o foco, não trava a rolagem e o hambúrguer não tem `aria-expanded`. Quando fechado, os botões continuam focáveis fora da tela. [A03; S108]                                                                                                                                            | `src/components/admin/AdminLayout.jsx:161-175,243-251`                                                                                                                                                       | A 390 px, Esc não fecha. Com o menu fechado, o Tab foca "Ver loja" com `x` negativo.                                                    |
| B83  | média      | A legenda da rosca "Receita por categoria" não mostra o nome da categoria: `deriveCategoryRevenue` gera `{category}`, mas o componente lê `segment.label`, e usa esse `label` como key. O teste passa porque a fixture já usa `label`. [A05; S85]                                                                                                                                   | `src/components/admin/utils/derive.js:121-130`; `src/components/admin/tabs/DashboardTab.jsx:303-326`; `__tests__/DashboardTab.test.jsx:45-47`                                                                | A legenda tem só a bolinha, a % e o R$, e o console avisa sobre key duplicada.                                                          |
| B84  | média      | Com 100% da receita numa só categoria, o anel da rosca não é desenhado: o arco de 0° a 360° tem início igual ao fim. [A05; S86]                                                                                                                                                                                                                                                     | `src/components/admin/tabs/dashboard-charts.js:113-119,137-158`                                                                                                                                              | Com vendas de uma única categoria, aparece o centro "Total R$ …", sem anel.                                                             |
| B85  | média      | `/api/admin/dashboard` devolve TODAS as linhas de `settings` sem redação, inclusive `adminConfig.totpSecret` (cifrado) e `fallbackPin` (hash scrypt). Isso anula a redação de `/admin/settings`, e o hash de um PIN de 6 dígitos pode ser quebrado offline. [A05, A28; S08]                                                                                                         | `handlers/admin/dashboard.js:200-206,307-312`; `handlers/admin/settings.js:225-226,309-326`                                                                                                                  | Em Network › `admin/dashboard` › `settings.adminConfig`, registre só a PRESENÇA das chaves.                                             |
| B86  | média      | Fuso horário: o gráfico de 7 dias e o minigráfico agrupam por data UTC, mas rotulam com a data local (vendas depois das 21 h BRT caem no dia seguinte). "Faturamento do mês" usa o mês do servidor, enquanto o selo, o Ticket e o Comparativo usam o mês do navegador, e os KPIs usam o mês UTC. [A05, A20, F47; S188]                                                              | `src/components/admin/utils/derive.js:29-49,77-103,239-256`; `handlers/admin/dashboard.js:108-114`; `handlers/admin/kpis.js:54-83`                                                                           | Aprove um pedido depois das 21 h: ele não aparece "hoje" no gráfico.                                                                    |
| B87  | média      | As tabelas ficam em contêineres `overflow-hidden` dentro de um `main` com `overflow-x-hidden`: a ~375 px, as colunas da direita (Total, Detalhes, Ações, Taxa) ficam cortadas e inalcançáveis. [A05, A07, A13, A16, A25; S77]                                                                                                                                                       | `src/components/admin/tabs/DashboardTab.jsx:686-687`; `ProductsTab.jsx:83`; `PerformanceTab.jsx:12`; `OrdersTab.jsx:44`; `UsersTab.jsx:73`; `AdminLayout.jsx:257`                                            | A 375 px, `scrollWidth > clientWidth` no contêiner da tabela.                                                                           |
| B88  | média      | O card de clientes da Análise mostra o NOME COMPLETO (`customer_name`), apesar da nota "E-mails são mascarados na visualização". [A22; S218]                                                                                                                                                                                                                                        | `handlers/admin/abc-customers.js:104-113`; `src/components/admin/tabs/AnalysisTab.jsx:149,508-510`                                                                                                           | Aparece "#1 Maria da Silva" no card.                                                                                                    |
| B89  | média      | O modal "Como ler este gráfico" não fecha com Esc, não prende nem devolve o foco, não trava a rolagem e não tem `aria-modal`. [A23; S109/S226]                                                                                                                                                                                                                                      | `src/components/admin/tabs/AnalysisTab.jsx:28-77`                                                                                                                                                            | Esc não fecha, e o Tab vai para o "CSV" atrás do modal.                                                                                 |
| B90  | média      | "Compra aprovada" no Funil conta PEDIDOS aprovados criados no período, não sessões: a conversão a partir de "Iniciou checkout" pode passar de 100%. [A21; S93]                                                                                                                                                                                                                      | `handlers/admin/funnel.js:55-63,195-197`                                                                                                                                                                     | "conv. 150%".                                                                                                                           |
| B91  | média      | `view_catalog` só é disparado em `/produtos`: quem entra pela home gera `view_item` sem `view_catalog`. [A21; S94]                                                                                                                                                                                                                                                                  | `src/pages/ProductsPage.jsx:21`; `handlers/admin/funnel.js:18-24`                                                                                                                                            | "Visualizou produto" fica maior que "Visitas ao catálogo".                                                                              |
| B92  | média      | Excluir um produto que já foi vendido devolve um 500 genérico ("Erro ao processar produtos do admin"), sem explicar a FK nem sugerir "Pausar". [A07; S76]                                                                                                                                                                                                                           | `supabase/schema.sql:105`; `handlers/admin/products.js:252-258,262`; `lib/admin-resource-handler.js:112-118`                                                                                                 | Com o stub em true, exclua um produto [TESTE] que tenha pedido: 500 e a linha continua.                                                 |
| B93  | média      | Os três wizards chamam `onSubmit` sem `await` e fecham na hora: se a API recusar, o formulário se perde (só sobra um toast de 2,4 s) e não há estado "salvando". O fechamento que vem depois também pode fechar um modal reaberto nesse intervalo. [A08, A12, A15, A18; S78]                                                                                                        | `src/components/ProductWizard.jsx:176-177`; `CategoryWizard.jsx:74-75`; `CouponWizard.jsx:80-90`; `src/pages/AdminPage.jsx:343-344,401-402`; `CouponsTab.jsx:89-90`                                          | "Nova categoria" com o nome "a": o modal fecha e depois aparece o toast de erro.                                                        |
| B94  | média      | Submissão implícita: Enter no Nome (passo 1 do produto) valida tudo e, na edição com dados válidos, salva direto, disparando B01 e B02. [A08, A09; S79]                                                                                                                                                                                                                             | `src/components/ModalWizard.jsx:159,183-202`; `src/components/ProductWizard.jsx:150-178,203-211`                                                                                                             | Em "Editar" de um produto de teste, Enter no Nome: o modal fecha com "Produto atualizado.".                                             |
| B95  | média      | Enter em qualquer input de texto do passo "Conversão" aciona "Salvar Produto". [A08, A12; S80]                                                                                                                                                                                                                                                                                      | `src/components/ModalWizard.jsx:195-202`; `src/components/ProductWizard.jsx:429-445,476-483,526-555`                                                                                                         | Digite um benefício e aperte Enter: aparece "Produto criado.".                                                                          |
| B96  | média      | A 3ª camada de segurança do upload (`POST {action:'confirm'}`, que confere o tamanho e o tipo reais) nunca é chamada, embora a API responda `confirmRequired:true`. [A10; S82]                                                                                                                                                                                                      | `src/services/admin-panel.js:179-218`; `handlers/admin/upload-url.js:396-420`                                                                                                                                | Cada upload gera só 1 POST e 1 PUT.                                                                                                     |
| B97  | média      | Uploads simultâneos se sobrescrevem: o callback usa o array da renderização em que o upload começou (closure velha), e as keys por índice deslocam o erro e o progresso. [A10; S81]                                                                                                                                                                                                 | `src/components/ProductWizard.jsx:102-128,253-263,650-656`                                                                                                                                                   | Com Throttling, dois uploads seguidos: só um cartão fica preenchido.                                                                    |
| B98  | média      | "★ Evidenciar na página de produtos" e "Cor de destaque" das categorias não têm efeito na loja (o `/api/products` só lê `id` e `name`). [A14, A15; S44 admin]                                                                                                                                                                                                                       | `handlers/products.js:49-54`; `src/hooks/useProductFilters.js:105`; `src/components/CategoryWizard.jsx:113-161`                                                                                              | Marque ★ e troque a cor: `/produtos` não muda.                                                                                          |
| B99  | média      | A validade do cupom fica 1 dia atrasada e recua a cada edição: `'YYYY-MM-DD'` vira meia-noite UTC, a lista exibe no fuso local e o input converte de novo. O checkout expira às 21 h do dia anterior. [A17, A18, F57; S83]                                                                                                                                                          | `src/components/CouponWizard.jsx:23-29,87`; `validation/admin.schemas.js:128-137`; `src/components/admin/tabs/CouponsTab.jsx:21-27`; `lib/coupons.js:96`                                                     | Salve 31/12/2026: aparece "Vale até 30/12/2026". Salvar de novo leva a 29/12.                                                           |
| B100 | média      | "Revogar acesso" só apaga `public.profiles`: o usuário continua no `auth.users` e ainda consegue logar. Sem o perfil, o provisionamento numa compra futura com o mesmo e-mail falha e não envia o e-mail de definir senha. [A26, F59; S84]                                                                                                                                          | `handlers/admin/users.js:144`; `lib/customer-account-provisioning.js:64-90`                                                                                                                                  | Revogue um cliente [TESTE] e faça login com ele em `/login`: entra.                                                                     |
| B101 | média      | O modal "Revogar acesso?" não fecha com Esc, não prende o foco, não trava a rolagem e não tem `aria-modal`. O Tab alcança os selects "Papel" de trás, que gravam na hora. [A26; S110]                                                                                                                                                                                               | `src/components/admin/tabs/UsersTab.jsx:103-114,140-167`                                                                                                                                                     | Abra o modal e aperte Tab: o foco vai para um select atrás. **Não altere.**                                                             |
| B102 | média      | O select de adicionar da Vitrine inclui categorias inativas, mas a home só usa as ativas: a seção salva some sem aviso. [A27; S89]                                                                                                                                                                                                                                                  | `src/components/admin/tabs/VitrineTab.jsx:29-36`; `handlers/home-sections.js:73-78,141-146`                                                                                                                  | Adicione uma categoria [TESTE] inativa e salve: ela não aparece na home.                                                                |
| B103 | média      | O checkbox de 2FA reflete só `twoFactorEnabled`, mas o login exige 2FA se `requireSecondFactor`, `require2FA` OU `twoFactorEnabled` estiver ligado. Desmarcar pode não desligar o 2FA. [A28; S90]                                                                                                                                                                                   | `src/components/admin/tabs/SecurityTab.jsx:61,66-70`; `lib/admin-2fa.js:283-287`                                                                                                                             | Com `requireSecondFactor:true`, o checkbox aparece desmarcado e o login ainda pede o código.                                            |
| B104 | média      | A aba Segurança não tem QR code, gerador de segredo, toggle de `allowPinFallback` nem campo de confirmação. A dica do PIN diz "numérico (6+ dígitos)", mas o backend aceita qualquer caractere (de 6 a 64) e recusa PINs fracos sem anunciar a regra. [A28; S91/S216]                                                                                                               | `src/components/admin/tabs/SecurityTab.jsx:81-131`; `handlers/admin/settings.js:92,195-213`                                                                                                                  | "111111" só é recusado depois de salvar.                                                                                                |
| B105 | média      | Em dev, o limitador de borda de 250 requisições a cada 15 min cobre TODO o `/api`, e uma sessão normal de validação consegue atingi-lo (o StrictMode duplica as chamadas, e o polling do checkout faz 1 chamada a cada 4 s por até 10 min). Quando estoura, o bootstrap zera as sessões e tudo parece quebrado. [§7.4; S28]                                                         | `server.js:87-106`; `src/main.jsx:18`; `src/pages/CheckoutPage.jsx:20-21,168-261`; `src/providers/AuthProvider.jsx:29,43-47`                                                                                 | Depois de ~250 chamadas, `/admin/session` responde 429 `RATE_LIMITED` e o `/admin` volta ao formulário.                                 |

### 6.4 Baixa

| ID   | Severidade | Descrição                                                                                                                                                                                                                                                                                        | Evidência                                                                                                                                                 | Como ver no navegador                                                                 |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| B106 | baixa      | "Como Funciona" e "Contato" (no header, no menu e no rodapé) são `<a href>` comuns: fora da home, recarregam a SPA inteira, e a âncora pode falhar porque a Home é lazy. [L01, L02, L04; S116]                                                                                                   | `src/components/Shell.jsx:89,94,242,251,350`; `src/App.jsx:6`                                                                                             | Em `/produtos`, "Como Funciona" gera uma navegação nova do tipo document.             |
| B107 | baixa      | Um cliente com papel admin/master não tem o ícone do carrinho, mas "Adicionar" e "Comprar agora" continuam gravando no carrinho, sem como abrir o drawer. [L01; novo]                                                                                                                            | `src/components/Shell.jsx:129-149`; `src/components/ProductGrid.jsx:78-84`; `src/pages/ProductDetailsPage.jsx:124-135`                                    | Logado com papel admin, "Adicionar" mostra o toast, e `localStorage.cart` tem o item. |
| B108 | baixa      | O menu hambúrguer da loja não fecha com Esc nem com um clique fora, não tem `aria-controls` e continua aberto por baixo do drawer. [L02; S117]                                                                                                                                                   | `src/components/Shell.jsx:174-182,186-282`                                                                                                                | A 375 px, Esc não fecha.                                                              |
| B109 | baixa      | O título do drawer usa o plural em inglês: "2 items". [L03; S118]                                                                                                                                                                                                                                | `src/components/CartDrawer.jsx:138-142`                                                                                                                   | Adicione 2 produtos e abra o drawer.                                                  |
| B110 | baixa      | "Esvaziar carrinho" é irreversível e não tem confirmação, toast nem evento. O evento canônico `view_cart` nunca é disparado. [L03, F21; S150]                                                                                                                                                    | `src/components/CartDrawer.jsx:227-233`; `src/providers/CartProvider.jsx:66-68`; `src/utils/analytics.js`                                                 | Filtre a Network por track-event: abrir o drawer e esvaziar não geram POST.           |
| B111 | baixa      | O carrinho não sincroniza entre abas (não há listener de `storage`). [L03, F15; S149]                                                                                                                                                                                                            | `src/providers/CartProvider.jsx:9-17`                                                                                                                     | F15.                                                                                  |
| B112 | baixa      | O contraste do texto pequeno do rodapé (`text-slate-500` sobre `slate-950`) fica abaixo de 4,5:1. [L04; S240]                                                                                                                                                                                    | `src/components/Shell.jsx:335,371,403-404`                                                                                                                | DevTools › contraste do "© 2026…".                                                    |
| B113 | baixa      | O banner de cookies não reserva espaço no fim da página: no mobile, cobre "Privacidade", "Termos" e a newsletter. [L05; S121]                                                                                                                                                                    | `src/components/ConsentBanner.jsx:38-43`                                                                                                                  | A 375 px, sem decisão, role até o fim.                                                |
| B114 | baixa      | O banner tem `role=dialog` sem `aria-modal` nem gestão de foco (é o último na ordem de Tab), e a página não tem "Pular para o conteúdo". [L05; S242]                                                                                                                                             | `src/components/ConsentBanner.jsx:38-43`                                                                                                                  | Com Tab, o foco só chega ao banner depois do rodapé.                                  |
| B115 | baixa      | Latente: o `connect-src` da CSP não permite `region1.google-analytics.com` nem `*.analytics.google.com` (só aparece com `VITE_GA4_ID`). [L05; S33]                                                                                                                                               | `vercel.json:18-19`; `lib/security-headers.js:12-18`                                                                                                      | Com o GA4 configurado, o console mostra "Refused to connect …".                       |
| B116 | baixa      | O Vercel Web Analytics é montado sem depender do consentimento e não é citado na Política de Privacidade. [L05; novo]                                                                                                                                                                            | `src/main.jsx:5,27`; `src/pages/LegalPages.jsx:128-142`                                                                                                   | No deploy, `/_vercel/insights/script.js` carrega antes da decisão.                    |
| B117 | baixa      | Os toasts somem em 2,4 s, pouco tempo para ler. [L06; S241]                                                                                                                                                                                                                                      | `src/providers/ToastProvider.jsx:14-24`                                                                                                                   | Cronometre um toast.                                                                  |
| B118 | baixa      | Na navegação interna, não há indicador de progresso enquanto o chunk baixa. [L07; S258]                                                                                                                                                                                                          | `src/App.jsx:54-79`                                                                                                                                       | Com Slow 3G, clique em "Termos": a página antiga fica parada.                         |
| B119 | baixa      | O HTML não tem placeholder: a tela fica branca até o bundle chegar. [L07; S259]                                                                                                                                                                                                                  | `index.html`                                                                                                                                              | Screenshot no 1º segundo com Slow 3G.                                                 |
| B120 | baixa      | A frase "Já registramos o ocorrido" pode ser falsa: `/track-event` responde 204 mesmo sem gravar. [L08; S260]                                                                                                                                                                                    | `handlers/track-event.js:28-53`; `src/components/ErrorBoundary.jsx:83-86`                                                                                 | O 204 não prova a gravação.                                                           |
| B121 | baixa      | A meta description aparece duplicada em todas as páginas (index.html + Helmet). [§7.6; S126]                                                                                                                                                                                                     | `index.html:7-10`; `src/components/SEO.jsx:66`                                                                                                            | `document.querySelectorAll('meta[name=description]').length` → 2.                     |
| B122 | baixa      | O JSON-LD da home declara um SearchAction para `?q=`, que o catálogo ignora, com URLs fixas num domínio que não resolve. [L09; S125]                                                                                                                                                             | `src/pages/HomePage.jsx:15-38`; `src/hooks/useProductFilters.js:81-103`                                                                                   | `/produtos?q=banner` mostra tudo.                                                     |
| B123 | baixa      | O sitemap inclui `/login`, que está bloqueado no robots e tem noindex. [§7.6; S238]                                                                                                                                                                                                              | `handlers/sitemap.xml.js:9`; `public/robots.txt:7`                                                                                                        | Compare o sitemap com o robots.                                                       |
| B124 | baixa      | A `og:image` padrão é `/favicon.svg` (SVG não serve de preview). [§7.6; S237]                                                                                                                                                                                                                    | `src/components/SEO.jsx:9`                                                                                                                                | `meta[property='og:image']`.                                                          |
| B125 | baixa      | `/reset-password` e `/admin` não definem título nem noindex; a aba herda o título anterior. [C06, A01; S239/S177]                                                                                                                                                                                | `src/pages/ResetPasswordPage.jsx`, `AdminLoginPage.jsx`, `AdminPage.jsx` (sem `<SEO>`); `index.html:6`                                                    | Da home para `/admin`, o título continua o da home.                                   |
| B126 | baixa      | A marca é inconsistente: "Profa. Marciar Cardoso" no logo (possível erro de digitação; confirmar com o dono) e "Ateliê da Escola" nos títulos. [L01; S148]                                                                                                                                       | `src/components/Shell.jsx:78,296,404`; `src/components/SEO.jsx:4`                                                                                         | Compare a aba com o logo.                                                             |
| B127 | baixa      | A vitrine mostra mensagens técnicas ("Falha ao carregar vitrine: 500", "Failed to fetch") e não oferece retry. A mensagem amigável da API é descartada. [L09; S122]                                                                                                                              | `src/services/products.js:13-21`; `src/pages/HomePage.jsx:192-196,307-311`                                                                                | Pare a API e abra `/`.                                                                |
| B128 | baixa      | Uma seção da vitrine sem produtos mostra o H3 e o link com o trilho vazio, sem mensagem. As setas aparecem mesmo sem overflow. [L09; S123]                                                                                                                                                       | `src/pages/HomePage.jsx:315-386`                                                                                                                          | Crie uma seção de categoria sem produtos.                                             |
| B129 | baixa      | A prova social é fixa e se contradiz: "Mais de 16.000 professoras…" acima de "4,2k seguidores". [L09; S124]                                                                                                                                                                                      | `src/pages/HomePage.jsx:84-106,465-469`; `src/components/SocialProofStrip.jsx:3-8`                                                                        | Leia a seção.                                                                         |
| B130 | baixa      | Em "Como funciona", há `<h5>` logo depois de um `<h2>` (salto de nível). [L09; S127]                                                                                                                                                                                                             | `src/pages/HomePage.jsx:398,425`                                                                                                                          | Inspecione `#como-funciona`.                                                          |
| B131 | baixa      | Os filtros e a ordenação do catálogo ficam só no estado do React: o F5 perde a escolha e um link copiado não a reproduz. [L10; S134]                                                                                                                                                             | `src/hooks/useProductFilters.js:33-44,130-139`                                                                                                            | Filtre e dê F5.                                                                       |
| B132 | baixa      | O estado vazio sempre diz "Nenhum produto encontrado nessa categoria.", mesmo quando a causa é o preço, e não há "Limpar filtros". [L10; S135]                                                                                                                                                   | `src/components/ProductGrid.jsx:155-163`                                                                                                                  | "Todos" + uma faixa de preço vazia.                                                   |
| B133 | baixa      | O erro do catálogo diz "Tente novamente", mas não tem botão, e mostra a mensagem técnica. [L10; S136]                                                                                                                                                                                            | `src/components/ProductGrid.jsx:145-153`                                                                                                                  | Pare a API.                                                                           |
| B134 | baixa      | Um produto sem categoria aparece como "Banner" no card e como "Sem categoria" na página dele. [L10, L12; S137]                                                                                                                                                                                   | `src/components/ProductGrid.jsx:52`; `src/pages/ProductDetailsPage.jsx:243`                                                                               | Use um produto com categoria inativa.                                                 |
| B135 | baixa      | O card não mostra o preço original riscado. [L10; S138]                                                                                                                                                                                                                                          | `src/components/ProductGrid.jsx:71-75`                                                                                                                    | Use um produto com `original_price`.                                                  |
| B136 | baixa      | Os badges de contagem da sidebar ignoram a faixa de preço e o preset. [L10; S139]                                                                                                                                                                                                                | `src/hooks/useProductFilters.js:157-160`                                                                                                                  | "Até R$ 25" + categoria: os números não batem.                                        |
| B137 | baixa      | A documentação diz que "Adicionar ao carrinho" abre o drawer, o que não acontece. [L10; S256]                                                                                                                                                                                                    | `docs/ProjectDocs/12-DEPLOY-OPERACAO.md:229`; `docs/ProjectDocs/06-FLUXO-COMPRA-VENDA.md:89`                                                              | "Adicionar" não abre o `aside[role=dialog]`.                                          |
| B138 | baixa      | Os filtros mobile não fecham com Esc, não prendem o foco, não travam a rolagem e não têm `role=dialog` nem `aria-expanded`. Quando fechados, continuam focáveis fora da tela. [L11; S140]                                                                                                        | `src/components/ProductSidebar.jsx:10-24,48-62`                                                                                                           | A 390 px, com o painel fechado, o Tab passa por botões invisíveis.                    |
| B139 | baixa      | Com um produto inexistente, o título fica "Carregando produto · Ateliê da Escola". Na troca via SPA, o título e o SEO do produto ANTERIOR continuam durante o carregamento e também se o novo produto falhar. [L12, F16; S141]                                                                   | `src/pages/ProductDetailsPage.jsx:73-111,142-153,169-174`                                                                                                 | `/produtos/xyz-inexistente` → `document.title`.                                       |
| B140 | baixa      | O título "Quem comprou este levou também" é fixo, mesmo com a estratégia `same_category`. [L12; S142]                                                                                                                                                                                            | `src/components/CrossSellSection.jsx:64-71`; `handlers/cross-sell.js:209-213`                                                                             | Sem pedidos, `strategy:'same_category'`.                                              |
| B141 | baixa      | Os 4 benefícios padrão repetem "PDF em alta resolução" e divergem ("após pagamento" × "após aprovação"). [L12; S143]                                                                                                                                                                             | `src/components/ProductBenefits.jsx:3-8`; `src/pages/ProductDetailsPage.jsx:275-277`                                                                      | Qualquer produto sem benefícios.                                                      |
| B142 | baixa      | "Comprar agora" com o item já no carrinho mostra um toast âmbar de alerta e navega mesmo assim. [L12, F14; S144]                                                                                                                                                                                 | `src/pages/ProductDetailsPage.jsx:124-129`                                                                                                                | "Adicionar" e depois "Comprar agora".                                                 |
| B143 | baixa      | As páginas de produto e de checkout não têm H1. [L12, C07; S145/S172]                                                                                                                                                                                                                            | `src/pages/ProductDetailsPage.jsx:257-259`; `src/pages/CheckoutPage.jsx:397,482`                                                                          | `document.querySelectorAll('h1').length === 0`.                                       |
| B144 | baixa      | As miniaturas têm nomes acessíveis pobres ("Mídia N"), e a de vídeo não tem nome. [L12; S146]                                                                                                                                                                                                    | `src/pages/ProductDetailsPage.jsx:209-231`                                                                                                                | Na árvore de acessibilidade.                                                          |
| B145 | baixa      | Os kits não listam o conteúdo: `kitItems`, `panelSizes` e `tags` vêm da API, mas não são exibidos. [L12; S147]                                                                                                                                                                                   | `handlers/product-details.js:102-106`; `src/pages/ProductDetailsPage.jsx:240-315`                                                                         | Use um produto `is_kit` com itens.                                                    |
| B146 | baixa      | O JSON-LD Product usa só `images`: um produto que só tem `image_url` sai com `image: []`. [L12; novo]                                                                                                                                                                                            | `src/pages/ProductDetailsPage.jsx:24,146`                                                                                                                 | `JSON.parse(…ld+json…).image` → `[]`.                                                 |
| B147 | baixa      | A política diz "Eventos de analytics: 24 meses", mas a limpeza apaga os eventos com mais de 180 dias. [L13; S129]                                                                                                                                                                                | `src/pages/LegalPages.jsx:152`; `handlers/admin/cleanup-events.js:10,66`                                                                                  | Leia a seção "6. Retenção".                                                           |
| B148 | baixa      | A confirmação de inscrição roda sem cancelamento: em dev (StrictMode) roda 2 vezes, e a 2ª resposta (404) pode sobrepor o sucesso. [L15; S130]                                                                                                                                                   | `src/main.jsx:18`; `src/pages/SubscriptionPages.jsx:51-69`                                                                                                | Em localhost, saem 2 GETs e o último 404 mostra a falha.                              |
| B149 | baixa      | Qualquer token em `/desinscrever` mostra "Pronto, você foi removido" (é uma anti-enumeração intencional), e o agente não consegue distinguir o sucesso real. [L16, F24; S131]                                                                                                                    | `handlers/unsubscribe.js:124-129`                                                                                                                         | `?token=inventado123`.                                                                |
| B150 | baixa      | Se o descadastro por token falhar, o formulário continua escondido e não há retry. [L16; S132]                                                                                                                                                                                                   | `src/pages/SubscriptionPages.jsx:126-129,158,175`                                                                                                         | Pare a API e abra `?token=abc`.                                                       |
| B151 | baixa      | Soft-404: a Vercel responde 200 para qualquer rota, e o canonical da 404 é só a origem. [L17; S128]                                                                                                                                                                                              | `vercel.json:38-45`; `src/pages/NotFoundPage.jsx:9`                                                                                                       | Em `/xyz`, o documento vem com 200.                                                   |
| B152 | baixa      | Em dev (StrictMode), o resultado do callback do Google é descartado: o cookie é criado, mas a UI continua deslogada até o F5. [C01, F31; S53]                                                                                                                                                    | `src/providers/AuthProvider.jsx:61-86` (:73)                                                                                                              | Em localhost, `POST …/google/callback` 200 e o formulário continua.                   |
| B153 | baixa      | O botão "Entrar com Google" mostra "Conectando…" durante o login por e-mail, porque as duas ações compartilham a flag `loading`. [C01; S151]                                                                                                                                                     | `src/pages/CustomerAuthPage.jsx:39,55,325,334`                                                                                                            | Com Slow 3G, faça login por e-mail.                                                   |
| B154 | baixa      | Um OAuth com erro, cancelado ou com falha no callback não dá nenhum feedback, e `error`/`error_description` ficam na URL. [C01; S152]                                                                                                                                                            | `src/services/customer-auth.js:98-108,127-130,144-152`                                                                                                    | `/login?oauth=google&error=access_denied`.                                            |
| B155 | baixa      | O erro inline do login continua depois de trocar Cadastrar → Entrar, e a página não espera o `authReady` (o formulário pisca). [C01; S153]                                                                                                                                                       | `src/pages/CustomerAuthPage.jsx:43-47,176-181,390-398,575`                                                                                                | Provoque o erro e troque de aba.                                                      |
| B156 | baixa      | Qualquer 422 do signup vira a mensagem genérica antes de testar `weak_password`: "Senha fraca…" quase nunca aparece. [C02; S154]                                                                                                                                                                 | `lib/customer-auth-handlers.js:115-126`                                                                                                                   | Com uma política de senha mais rígida no Supabase.                                    |
| B157 | baixa      | A recuperação de senha só dá feedback por toast, e todo erro, inclusive o rate limit, vira a mensagem genérica. [C03; S155]                                                                                                                                                                      | `src/pages/CustomerAuthPage.jsx:155-160`                                                                                                                  | Envie duas vezes seguidas.                                                            |
| B158 | baixa      | Não há proteção por papel: uma conta admin/master logada como cliente pode exportar os dados e excluir o próprio usuário, perdendo o acesso ao painel. [C04, F09; S156]                                                                                                                          | `handlers/me-delete-account.js:492-525`; `src/pages/CustomerAuthPage.jsx:609-628`                                                                         | Logado em `/login` com o admin, a caixa de exclusão aparece. **Não confirme.**        |
| B159 | baixa      | Com uma sessão ativa, o `?redirect` do `/login` é ignorado: a única saída é "Ir para checkout". [C04; S158]                                                                                                                                                                                      | `src/pages/CustomerAuthPage.jsx:582-587`                                                                                                                  | Logado, abra `/login?redirect=/downloads`.                                            |
| B160 | baixa      | O h3 e o botão têm o mesmo texto, "Excluir minha conta", o que deixa ambígua a busca por texto. [C04; S254]                                                                                                                                                                                      | `src/pages/CustomerAuthPage.jsx:610,621`                                                                                                                  | A busca por texto retorna 2 elementos.                                                |
| B161 | baixa      | O título "Entrar ou criar conta · Ateliê da Escola" continua na área da conta logada e na confirmação de exclusão (o SEO é fixo). [C04; novo]                                                                                                                                                    | `src/pages/CustomerAuthPage.jsx:542`                                                                                                                      | Logado em `/conta`, leia `document.title`.                                            |
| B162 | baixa      | O passo 2 da exclusão ("Excluir permanentemente"), que é irreversível, não tem nenhuma confirmação. [C05; S253]                                                                                                                                                                                  | `src/pages/CustomerAuthPage.jsx:239-255`                                                                                                                  | Um clique já dispara o POST.                                                          |
| B163 | baixa      | O toast de sucesso da exclusão tem texto fixo, e o logout seguinte é redundante (o backend já limpou o cookie), com os erros engolidos. [C05; S159]                                                                                                                                              | `src/pages/CustomerAuthPage.jsx:242-249`; `handlers/me-delete-account.js:453-459`                                                                         | Aparece um `POST /auth/customer/logout` extra.                                        |
| B164 | baixa      | Enquanto `/reset-password` valida o link, o botão já mostra "Salvando…". [C06; S160]                                                                                                                                                                                                             | `src/pages/ResetPasswordPage.jsx:54,221`                                                                                                                  | Recarregue com throttling.                                                            |
| B165 | baixa      | Com o consentimento de marketing, cada carga completa de um pedido aprovado dispara `purchase` de novo (a deduplicação fica em memória). [C10; S65]                                                                                                                                              | `src/pages/DownloadsPage.jsx:165-178`; `src/utils/analytics.js:230-238`                                                                                   | Aceite os cookies e dê F5 no pedido aprovado.                                         |
| B166 | baixa      | O status do histórico aparece em inglês ("Status: approved"), e um pedido recusado deixa o stepper em "Processando". [C10; S161/S162]                                                                                                                                                            | `src/pages/DownloadsPage.jsx:277-282,431-434`                                                                                                             | Logado, com pedidos.                                                                  |
| B167 | baixa      | O banner "Pagamento confirmado." depende só de `success=1` e aparece junto da caixa de pendente. Depois da pausa, "Atualizar" não retoma o polling. [C10; S163]                                                                                                                                  | `src/pages/DownloadsPage.jsx:24-28,120,303-309,321`                                                                                                       | `?order=<pendente>&email=…&success=1`.                                                |
| B168 | baixa      | A mesma tela tem três nomes: "Meus produtos", "Meus Downloads" e "Downloads". [C10; S164]                                                                                                                                                                                                        | `src/components/Shell.jsx:106,215,364`; `src/pages/DownloadsPage.jsx:296`                                                                                 | Clique em "Meus produtos".                                                            |
| B169 | baixa      | A descrição do stepper do checkout fica em "Estamos preparando seu pagamento…" durante todo o polling, e o 429 volta o stepper ao passo 1. [C07; S165]                                                                                                                                           | `src/pages/CheckoutPage.jsx:269-290`                                                                                                                      | Depois de "Ir para pagamento".                                                        |
| B170 | baixa      | O "Remover" dos itens não fica desabilitado durante o processamento, e usá-lo descarta o cupom de um pedido já gerado. [C07; S166]                                                                                                                                                               | `src/pages/CheckoutPage.jsx:427-433`                                                                                                                      | No estado "Aguardando".                                                               |
| B171 | baixa      | Com a API fora, o cupom e o pagamento mostram a mensagem crua "Failed to fetch". [C07; S167]                                                                                                                                                                                                     | `src/components/CouponField.jsx:78-80`; `src/pages/CheckoutPage.jsx:340-346`                                                                              | Pare a API e clique em "Aplicar".                                                     |
| B172 | baixa      | A regex de e-mail do front é mais frouxa que a do servidor: `teste@dominio..com` passa, é gravado no carrinho abandonado e depois dá 400. Um nome com só espaços também passa. [C07; S168/S169]                                                                                                  | `src/pages/CheckoutPage.jsx:102,293,549-552,576-582`; `validation/common.schemas.js:21,60-66`                                                             | `teste@dominio..com` → toast "Email inválido.".                                       |
| B173 | baixa      | Um cupom é aceito com o carrinho vazio ("· −R$ 0,00"), e a mensagem de pedido mínimo usa ponto decimal ("R$ 50.00"). [C07; S170/S171]                                                                                                                                                            | `handlers/validate-coupon.js:46-80`; `lib/coupons.js:110`                                                                                                 | Carrinho vazio + cupom.                                                               |
| B174 | baixa      | A mensagem de timeout do checkout cita "Meus Downloads", mas não tem link. [C07; S172]                                                                                                                                                                                                           | `src/pages/CheckoutPage.jsx:189-191`                                                                                                                      | No estado de timeout.                                                                 |
| B175 | baixa      | A aprovação pelo polling, sem webhook, não grava `payment_approved`: o funil perde vendas. [C13; S173]                                                                                                                                                                                           | `handlers/verify-payment.js:285-313`; `handlers/webhook.js:180-202`                                                                                       | Aprove sem webhook e confira `analytics_events`.                                      |
| B176 | baixa      | Um desafio 2FA expirado (120 s) é reemitido com 200 e nenhuma mensagem, e essa tentativa conta no limite de SENHA. [A01, F43; S175]                                                                                                                                                              | `handlers/admin/login.js:30,251-259,377-388`; `src/pages/AdminLoginPage.jsx:48-54`                                                                        | Espere mais de 2 min na 2ª etapa.                                                     |
| B177 | baixa      | Os métodos de 2FA aparecem com o identificador cru: "Métodos aceitos: totp / pin.". [A01; S176]                                                                                                                                                                                                  | `src/pages/AdminLoginPage.jsx:151-153`                                                                                                                    | Na 2ª etapa do login.                                                                 |
| B178 | baixa      | O login admin não tem link de volta para a loja nem "Esqueci minha senha". [A01; S177]                                                                                                                                                                                                           | `src/pages/AdminLoginPage.jsx:69-176`                                                                                                                     | Abra `/admin` deslogado.                                                              |
| B179 | baixa      | O rate limit do login admin conta também os logins CORRETOS (5 a cada 10 min por IP, em janela fixa). [A01, F42, F45; S114]                                                                                                                                                                      | `lib/rate-limit.js:53-64`; `handlers/admin/login.js:366-392`                                                                                              | Depois de 5 logins válidos, o 6º dá 429.                                              |
| B180 | baixa      | Os inputs do login admin têm 14 px: o iOS dá zoom ao focar. [A01; S243]                                                                                                                                                                                                                          | `src/pages/AdminLoginPage.jsx:104,125`                                                                                                                    | `fontSize === '14px'`.                                                                |
| B181 | baixa      | O rodapé da sidebar mostra "Administrador" fixo, em vez do e-mail do admin logado. [A03; S179]                                                                                                                                                                                                   | `src/pages/AdminPage.jsx:594`; `src/components/admin/AdminLayout.jsx:224`                                                                                 | Leia o rodapé da sidebar.                                                             |
| B182 | baixa      | A aba ativa não vai para a URL nem para o histórico: o F5 volta ao Dashboard e "Voltar" sai do painel. [A03; S181]                                                                                                                                                                               | `src/pages/AdminPage.jsx:125`; `src/components/admin/AdminLayout.jsx:155-158`                                                                             | Em "Comparativo", dê F5.                                                              |
| B183 | baixa      | Cada troca entre as abas que usam o dashboard pede o payload inteiro de novo, com "Carregando…" (hoje isso é mascarado pelo cache, B20). [A03; S180]                                                                                                                                             | `src/pages/AdminPage.jsx:162-172`                                                                                                                         | Conte os `GET /admin/dashboard`.                                                      |
| B184 | baixa      | O botão "Abrir menu" do admin tem ~36×36 px, menos que os 44 px da loja. [A03; S244]                                                                                                                                                                                                             | `src/components/admin/AdminLayout.jsx:244-251`                                                                                                            | Leia o `getBoundingClientRect()`.                                                     |
| B185 | baixa      | Numa ação de escrita com a sessão expirada, saem dois toasts (âmbar e vermelho) com a mensagem de sessão. [A03; novo]                                                                                                                                                                            | `src/pages/AdminPage.jsx:152-160`                                                                                                                         | Derrube a sessão e clique em "Pausar".                                                |
| B186 | baixa      | O banner do bypass de DEV diz que Usuários mostra "sessão expirada", mas o `catch` do bypass engole o 401 e a aba aparece vazia. [A04, A25; novo]                                                                                                                                                | `src/pages/AdminPage.jsx:197-202,604-606`                                                                                                                 | Com o bypass ligado e sem sessão, abra "Usuários".                                    |
| B187 | baixa      | No bypass sem sessão, a sidebar mostra "Administrador / Sessão admin" e "Encerrar sessão". [A04; S264]                                                                                                                                                                                           | `src/pages/AdminPage.jsx:590-596`                                                                                                                         | Com o bypass ligado.                                                                  |
| B188 | baixa      | O campo `truncated` do `/admin/dashboard` não é exibido em lugar nenhum da tela. [A05; novo]                                                                                                                                                                                                     | `handlers/admin/dashboard.js:341-347`                                                                                                                     | Veja o Preview no Network.                                                            |
| B189 | baixa      | Os cards tracejados "Vendas por região" e "Funil de conversão" dizem "Instrumentação pendente", mas o funil existe na aba "Funil" (o texto ficou desatualizado). [A05; S183 + novo]                                                                                                              | `src/components/admin/tabs/DashboardTab.jsx:474-497,660-675`                                                                                              | No fim do Dashboard.                                                                  |
| B190 | baixa      | "LTV / CAC" mostra sempre "Fase 5" (o `cac` é null fixo). [A05; S184]                                                                                                                                                                                                                            | `src/components/admin/tabs/DashboardTab.jsx:629-634`; `handlers/admin/kpis.js:127-128`                                                                    | No 4º mini-card.                                                                      |
| B191 | baixa      | Há três definições de "Ticket médio": a do mês, a de 12–13 meses e a de todos os tempos. [A05, A19; S185/S186]                                                                                                                                                                                   | `src/components/admin/utils/derive.js:161-182`; `handlers/admin/kpis.js:80-83,109-110`; `src/components/admin/tabs/FinanceTab.jsx:8-9`                    | Compare os três valores.                                                              |
| B192 | baixa      | Sem compradores, o Mix mostra "Novos 0" com "100% dos compradores". [A05; S182]                                                                                                                                                                                                                  | `src/components/admin/tabs/DashboardTab.jsx:345-348,373`                                                                                                  | Numa base vazia.                                                                      |
| B193 | baixa      | O gráfico de 7 dias nunca mostra o estado vazio (vira uma linha reta no zero). [A05; S187]                                                                                                                                                                                                       | `src/components/admin/utils/derive.js:90-102`                                                                                                             | Numa semana sem vendas.                                                               |
| B194 | baixa      | O StatusChip só traduz 6 status: `in_process`, `refunded`, `charged_back`, `in_mediation` e `authorized` aparecem crus e não existem no filtro de Pedidos. [A05, A16; S190]                                                                                                                      | `src/components/admin/ui/StatusChip.jsx:3-17`; `src/components/admin/tabs/OrdersTab.jsx:9-16`                                                             | Um pedido em análise mostra o chip "in_process".                                      |
| B195 | baixa      | "+ N produtos restantes na cauda C." é impreciso: os produtos depois do 8º podem ser da classe B. [A05; S87]                                                                                                                                                                                     | `src/components/admin/tabs/DashboardTab.jsx:461-465`                                                                                                      | Com mais de 8 produtos vendidos.                                                      |
| B196 | baixa      | O percentual tem formatos diferentes: o Dashboard usa ponto e arredonda para inteiro a partir de 10 ("+4.5%"), e o Comparativo usa vírgula ("+12,5%"). Há também "estável" × "Estável" e "Agosto De 2026" (capitalize do CSS). [A05, A20; S193]                                                  | `src/components/admin/tabs/dashboard-charts.js:37-42`; `ComparisonTab.jsx:6-29,52`                                                                        | Compare os selos.                                                                     |
| B197 | baixa      | O Dashboard pode aparecer zerado por um instante, e o DashboardTab remonta a cada visita, repetindo `/admin/kpis`. [A05; S262]                                                                                                                                                                   | `src/pages/AdminPage.jsx:126,134,162-214`; `DashboardTab.jsx:529-542`                                                                                     | Com Slow 3G, capture logo depois do login.                                            |
| B198 | baixa      | O `onClose` é passado como arrow inline e é dependência do efeito de foco: um re-render com o modal aberto re-foca o X. [A06, A08; S197]                                                                                                                                                         | `src/pages/AdminPage.jsx:306-309,647-649`; `src/components/ModalWizard.jsx:26-82`; `OrderDetailModal.jsx:13-70`                                           | Salve e reabra o wizard enquanto digita.                                              |
| B199 | baixa      | Pedidos e o modal de detalhe são só leitura: `updateAdminOrder`/`deleteAdminOrder` existem sem uso, e o checklist de operação diz "Atualizar pedido via modal funciona". [A06, A16; S207/S257]                                                                                                   | `src/services/admin-panel.js:102-114`; `handlers/admin/orders.js:83-128`; `docs/ProjectDocs/12-DEPLOY-OPERACAO.md:264`                                    | Procure ações no modal.                                                               |
| B200 | baixa      | No Faturamento, meses com R$ 0,00 aparecem com barra visível, e "Sem vendas no período." nunca aparece. [A19; S192]                                                                                                                                                                              | `src/components/admin/utils/derive.js:154-158`; `src/components/admin/ui/BarList.jsx:9-11,33`                                                             | Um mês sem vendas.                                                                    |
| B201 | baixa      | A "Taxa de download" conta eventos, não compradores, é limitada a 100% e mostra uma barra de 6% quando é 0%. [A13; S194]                                                                                                                                                                         | `src/components/admin/tabs/PerformanceTab.jsx:25-28,44-45`                                                                                                | Um produto baixado várias vezes.                                                      |
| B202 | baixa      | O texto "Adicione ?nocache=1 à URL" (Análise e Segmentos) não funciona: o parâmetro não é repassado à API. Segmentos diz "Cache de 30 min", mas o header é de 1 h. [A22, A24; S220 + novo]                                                                                                       | `src/components/admin/tabs/AnalysisTab.jsx:546-549`; `SegmentsTab.jsx:150-159`; `src/services/admin-panel.js:141-161,260-276`; `lib/http.js:299`          | Abra `/admin?nocache=1`: as requisições não mudam.                                    |
| B203 | baixa      | Um erro em qualquer um dos 3 endpoints da Análise substitui a aba inteira, inclusive os filtros, e trocar um filtro não mostra indicador de carregamento. [A22; S222]                                                                                                                            | `src/components/admin/tabs/AnalysisTab.jsx:256-282,354-368`                                                                                               | Bloqueie `*admin/cohort*`.                                                            |
| B204 | baixa      | O id e a key do cliente são o e-mail mascarado: e-mails com o mesmo prefixo e o mesmo domínio colidem. [A22; S219]                                                                                                                                                                               | `handlers/admin/abc-customers.js:66-71,136-138`                                                                                                           | O console avisa sobre key duplicada.                                                  |
| B205 | baixa      | A coorte busca desde o mês atual − 13 e pode ter até 14 linhas num card de "12 meses". [A22; S223]                                                                                                                                                                                               | `handlers/admin/cohort.js:72-75,99-127`                                                                                                                   | Conte as linhas.                                                                      |
| B206 | baixa      | O CSV usa vírgula como separador E como decimal: no Excel pt-BR, abre numa coluna só. [A22; S225]                                                                                                                                                                                                | `src/utils/csv-export.js:24-36`                                                                                                                           | Abra o CSV num editor.                                                                |
| B207 | baixa      | O período "all" existe no backend de clientes, mas não na UI. Pedidos aprovados sem `completed_at` ficam fora de toda a Análise. [A22; novo]                                                                                                                                                     | `handlers/admin/abc-customers.js:40-45`; `handlers/admin/abc-products.js:51-61`                                                                           | Compare com o Faturamento.                                                            |
| B208 | baixa      | O texto da coorte cita "M+12", mas a tabela vai só até M+11. [A23; S221]                                                                                                                                                                                                                         | `src/components/admin/tabs/analysis-content.js:111`                                                                                                       | Compare o modal com a tabela.                                                         |
| B209 | baixa      | O modal de clientes diz que a relação usa "quantidade de pedidos e ticket médio", mas o código usa só o número de pedidos ou a classe A. [A23; S224]                                                                                                                                             | `src/components/admin/tabs/analysis-content.js:87`; `handlers/admin/abc-customers.js:55-59`                                                               | Um cliente com ticket alto aparece como "Eventual".                                   |
| B210 | baixa      | A 1ª etapa do Funil mostra sempre "conv. 100%". [A21; S227]                                                                                                                                                                                                                                      | `handlers/admin/funnel.js:92-93`                                                                                                                          | "Visitas ao catálogo".                                                                |
| B211 | baixa      | No erro do Funil, a caixa rosa aparece junto com os números do período anterior, sob o subtítulo novo. [A21, F52; S230]                                                                                                                                                                          | `src/components/admin/tabs/FunnelTab.jsx:117-139,148,168-207`                                                                                             | Bloqueie e troque para 7 dias.                                                        |
| B212 | baixa      | O Funil tem cache de 1 h e não tem botão de atualizar, e o estado vazio usa o jargão "Fase 0". [A21; S229]                                                                                                                                                                                       | `handlers/admin/funnel.js:217`; `src/components/admin/tabs/FunnelTab.jsx:219-223`                                                                         | Gere eventos e reabra a aba.                                                          |
| B213 | baixa      | A tag de categoria mostra o slug cru ("Comprou: festa-junina"). [A24; S233]                                                                                                                                                                                                                      | `src/components/admin/tabs/SegmentsTab.jsx:29-36`                                                                                                         | Nos cartões violeta.                                                                  |
| B214 | baixa      | As tags só consideram inscritos confirmados, e o relatório faz uma consulta por inscrito em `Promise.all` (pode estourar os 15 s). [A24; S234/S235]                                                                                                                                              | `lib/customer-segmentation.js:128-150`                                                                                                                    | Numa base sem confirmados.                                                            |
| B215 | baixa      | Não existe controle de "Destaque" (featured) na UI, e salvar pelo wizard zera o valor. [A07; S195]                                                                                                                                                                                               | `src/components/admin/tabs/ProductsTab.jsx:99-103,122-137`; `src/pages/AdminPage.jsx:329`                                                                 | Procure o controle.                                                                   |
| B216 | baixa      | Lixeiras e "Revogar acesso" não ficam desabilitados: um duplo clique gera 2 confirms e 2 DELETE (em Usuários, o 2º dá 404 e os toasts se contradizem). [A07, A14, A26; S250/S209]                                                                                                                | `src/components/admin/tabs/ProductsTab.jsx:130-136`; `CategoriesTab.jsx:51-57`; `UsersTab.jsx:50-54,161-163`                                              | Com o stub em true, duplo clique num item [TESTE].                                    |
| B217 | baixa      | Há nomes acessíveis duplicados: todas as lixeiras se chamam "Excluir", o modal tem dois "Cancelar" e há N+1 "Revogar acesso". [A07, A14, A26; S210]                                                                                                                                              | `src/components/admin/tabs/ProductsTab.jsx:134`; `UsersTab.jsx:126,144,158-163`                                                                           | `[aria-label="Excluir"]` retorna mais de 1 elemento.                                  |
| B218 | baixa      | Se o `refreshDashboard` falhar depois de um DELETE/PATCH bem-sucedido, aparecem dois toasts opostos e a tabela fica velha. [A07; S249]                                                                                                                                                           | `src/pages/AdminPage.jsx:277-284,350-375`                                                                                                                 | Bloqueie o dashboard logo depois do clique.                                           |
| B219 | baixa      | Produto, categoria, cupom e conta usam o `window.confirm` nativo (bloqueante, sem dizer que é irreversível), enquanto Usuários usa um modal React. [A07, A14, A17, C04; S255]                                                                                                                    | `src/pages/AdminPage.jsx:364,411`; `CouponsTab.jsx:99`; `CustomerAuthPage.jsx:218`                                                                        | Sem o stub, aparece a caixa nativa.                                                   |
| B220 | baixa      | Fechar o wizard por Esc, véu, X ou "Cancelar" descarta o formulário sem confirmar, e os arquivos já enviados ficam órfãos. [A08; S196]                                                                                                                                                           | `src/components/ModalWizard.jsx:49-54,97-124,163-169`                                                                                                     | Preencha e aperte Esc.                                                                |
| B221 | baixa      | Nos textos do uploader, a dica diz "Escolher arquivo", mas o botão é "Escolher", e os toasts erram a concordância: "Imagem 1 enviado.". [A10; S198]                                                                                                                                              | `src/components/ProductWizard.jsx:656,704,727`                                                                                                            | Faça um upload.                                                                       |
| B222 | baixa      | "Kit" grava só `product_type`, e o selo "KIT" depende de `is_kit`. [A11; S199]                                                                                                                                                                                                                   | `src/pages/AdminPage.jsx:316-333`; `src/pages/ProductDetailsPage.jsx:250-252`                                                                             | Um produto [TESTE] salvo como Kit fica sem selo.                                      |
| B223 | baixa      | O passo "Preço & Variações" não tem nenhum campo de variação. [A11; S200]                                                                                                                                                                                                                        | `src/components/ProductWizard.jsx:185,320-372`                                                                                                            | Compare o nome com os campos.                                                         |
| B224 | baixa      | A dica dos benefícios promete os 4 padrão "se ficar vazio", mas a edição regrava a lista vazia sem aviso. [A12; S201]                                                                                                                                                                            | `src/components/ProductWizard.jsx:424`; `src/pages/AdminPage.jsx:332`                                                                                     | Compare antes e depois de editar.                                                     |
| B225 | baixa      | O confirm de excluir categoria não avisa que os produtos ficam "Sem categoria" nem que a seção da Vitrine some. [A14; S251]                                                                                                                                                                      | `src/pages/AdminPage.jsx:409-414`; `supabase/schema.sql:49`                                                                                               | Exclua uma categoria usada na vitrine.                                                |
| B226 | baixa      | Renomear uma categoria para um nome cujo slug já existe dá 500 genérico no PUT (o 409 só é checado no POST). [A15, F56; S202]                                                                                                                                                                    | `handlers/admin/categories.js:67-74,80-110,124`                                                                                                           | Renomeie para o nome de outra categoria.                                              |
| B227 | baixa      | O front só valida "não vazio" no nome da categoria: o intervalo de 2 a 60 caracteres e o anti-UUID só são checados no backend, depois de o modal fechar. [A15; S203]                                                                                                                             | `src/components/CategoryWizard.jsx:59-65`                                                                                                                 | Use o nome "a".                                                                       |
| B228 | baixa      | Na aba Cupons, o erro de carga mostra só a caixa rosa, sem "Novo cupom" e sem retry. [A17; S205]                                                                                                                                                                                                 | `src/components/admin/tabs/CouponsTab.jsx:120-126`                                                                                                        | Offline.                                                                              |
| B229 | baixa      | Se o reload falhar depois de um DELETE de cupom bem-sucedido, só aparece o toast de erro. [A17; S252]                                                                                                                                                                                            | `src/components/admin/tabs/CouponsTab.jsx:103-109`                                                                                                        | Bloqueie o GET depois de confirmar.                                                   |
| B230 | baixa      | "Limite de usos" aceita 0: o cupom já nasce esgotado ("0/0 usos"). [A18; S204]                                                                                                                                                                                                                   | `src/components/CouponWizard.jsx:185-195`; `handlers/admin/coupons.js:70`                                                                                 | Crie um cupom [TESTE] com limite 0.                                                   |
| B231 | baixa      | A validação JS "Desconto percentual não pode passar de 100%." é inalcançável (o `max=100` nativo bloqueia antes), e os caracteres do código só são validados no backend. [A18; S206]                                                                                                             | `src/components/CouponWizard.jsx:75-78,157`                                                                                                               | 150% → só o balão nativo.                                                             |
| B232 | baixa      | Trocar o filtro de Pedidos troca o card inteiro, inclusive o select, por "Carregando…": o select perde o foco e, em erro, some. [A16; S261]                                                                                                                                                      | `src/pages/AdminPage.jsx:162-214,482-497`                                                                                                                 | Troque o select.                                                                      |
| B233 | baixa      | `GET /api/admin/orders` não tem `limit` explícito nem aviso de truncamento. [A16; novo]                                                                                                                                                                                                          | `handlers/admin/orders.js:32-45`                                                                                                                          | Só por inspeção.                                                                      |
| B234 | baixa      | Um papel desconhecido (ex.: "seller") mostra o badge "SELLER" com o select em "Admin". [A25; S208]                                                                                                                                                                                               | `src/components/admin/tabs/UsersTab.jsx:14-22,98-114`                                                                                                     | Só se existir um perfil "seller".                                                     |
| B235 | baixa      | A troca de papel grava na hora, sem confirmação. [A25; S211]                                                                                                                                                                                                                                     | `src/components/admin/tabs/UsersTab.jsx:103-114`                                                                                                          | Troque o select num usuário de teste.                                                 |
| B236 | baixa      | Um título vazio numa seção de categoria da Vitrine é salvo como o literal "Categoria". [A27; S212]                                                                                                                                                                                               | `src/components/admin/utils/derive.js:341,350-354`                                                                                                        | Apague o título e salve.                                                              |
| B237 | baixa      | "Mais vendidos" e "Novidades" não ficam desabilitados nem avisam quando a seção já existe. [A27; S213]                                                                                                                                                                                           | `src/components/admin/tabs/VitrineTab.jsx:75-76,120-129`                                                                                                  | Clique com a seção já presente.                                                       |
| B238 | baixa      | Trocar a "Categoria vinculada" não atualiza o "Título exibido". [A27; S214]                                                                                                                                                                                                                      | `src/components/admin/tabs/VitrineTab.jsx:232-234`                                                                                                        | Troque a categoria de um card.                                                        |
| B239 | baixa      | Seções legadas com `enabled:false` aparecem como normais e são descartadas no próximo save, e as seções de categorias excluídas somem sem aviso. [A27; S215]                                                                                                                                     | `src/components/admin/utils/derive.js:277,284,294,338`                                                                                                    | Só com dados legados.                                                                 |
| B240 | baixa      | A documentação do painel não menciona o gate de reautenticação nem o risco de trancamento. [A28; S217]                                                                                                                                                                                           | `docs/ProjectDocs/07-DASHBOARD-ADMIN.md`                                                                                                                  | É só na documentação.                                                                 |
| B241 | baixa      | Abrir o front por `127.0.0.1` ou pelo IP da rede quebra a API em dev, porque o Vite não tem proxy. [§7.1; S99]                                                                                                                                                                                   | `src/utils/api.js:1-3`; `vite.config.js:7-10`                                                                                                             | Em `http://127.0.0.1:5173/produtos`, o catálogo não carrega.                          |
| B242 | baixa      | O `03-SETUP.md` diz que o `.npmrc` tem `legacy-peer-deps=true`, mas o arquivo atual usa `overrides`. [§7.1; novo]                                                                                                                                                                                | `docs/ProjectDocs/03-SETUP.md:24`; `.npmrc:1-25`; `package.json:54-59`                                                                                    | Não aparece no navegador.                                                             |
| B243 | baixa      | Em dev, `apiRequest` emite o warning "[api] resposta sem JSON valido" para respostas 204 (`abandoned-cart`), que parece erro sem ser. [§7.3; S246]                                                                                                                                               | `src/utils/api.js:27-37`; `handlers/abandoned-cart.js:147`                                                                                                | Digite um e-mail no checkout local.                                                   |
| B244 | baixa      | Endpoints sem tela: `GET /api/admin/products` e `GET /api/admin/categories` (os fetchers nunca são importados), `PUT/DELETE /api/admin/orders`, `GET /api/auth/customer/google/start`, `POST /api/send-confirmation-email` e `POST /api/admin/cleanup-events`. Veja §7.12. [§7.12; §6.1 da base] | `src/services/admin-products.js:4`; `src/services/admin-panel.js:27,102-114`; `src/services/customer-auth.js:75-91`; `routes/api-compat.routes.js:72-133` | Não aparecem no Network em nenhuma navegação.                                         |

---

## 7. Transversal

### 7.1 Ambiente local (Vite :5173 + API Express :3000)

- **Pré-requisito que falta hoje:** não existe `node_modules` na raiz. O dono precisa rodar `npm install`. O `.npmrc` atual **não** usa `legacy-peer-deps`; o conflito do react-helmet-async é resolvido por `overrides` (`package.json:54-59`). Depois, `npm run dev:all` (concurrently `-k`, com `[WEB] vite` e `[API] node server.js`). O Node exigido é o 20 ou superior; a máquina tem v22.16.0 e npm 10.9.2.
- **Portas fixas:** 5173 (`vite.config.js:7-10`, `strictPort: true`, **sem proxy e sem CSP**) e 3000 (`server.js:70`). Se a porta 5173 estiver ocupada, o Vite encerra e, por causa do `-k`, a API cai junto.
- **Sempre use `http://localhost:5173`.** O front só chama `http://localhost:3000/api` quando o hostname é exatamente `localhost`; com qualquer outro host, usa `/api` relativo, e o Vite devolve HTML (B241).
- **Arquivos de ambiente:** o `server.js:9-29` carrega em cascata, sem sobrescrever (vence o primeiro que define a variável): `.env.development.local` → `.env.local` → `.env.development` → `.env`.
  - O `.env.local` define (só os nomes): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_STORAGE_BUCKET`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `APP_URL`, `WEBHOOK_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `ADMIN_SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` e `APP_ENV=development`.
  - **Não** define `CUSTOMER_SESSION_SECRET`, `ADMIN_2FA_ENC_KEY`, `CRON_SECRET`, `CORS_ORIGINS`, `RATE_LIMIT_MAX`, `VITE_ALLOW_ADMIN_BYPASS`, `VITE_GA4_ID` nem `VITE_META_PIXEL_ID`. Por isso: os segredos caem no fallback de dev, o CORS aceita qualquer `http://localhost:<porta>`, não há bypass, não há GA4/Pixel e o TOTP não decifra (B23).
- **O Supabase local é o de produção** (ref `npgtngcdskwcsmgymkql`, B05). O `APP_URL` local aponta para um túnel `*.ngrok-free.dev` (B18). O `SMTP_FROM` usa `@resend.dev` (B79). O Mercado Pago está com `APP_USR-` (B17).

| URL técnica                                            | Resposta esperada                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `http://localhost:3000/health`                         | 200 `{"ok":true,"service":"api","port":3000}` (só existe no local)                                                                                                                                                                                           |
| `http://localhost:3000/`                               | 404 `{"error":"Frontend legado removido. Use o app React em http://localhost:5173."}`                                                                                                                                                                        |
| `http://localhost:3000/api/rota-inexistente`           | 404 `{"success":false,"error":{"code":"NOT_FOUND","message":"Rota não encontrada: /api/rota-inexistente"}}`                                                                                                                                                  |
| `http://localhost:3000/api/admin/session`              | 200 `{"success":true,"authenticated":false}`                                                                                                                                                                                                                 |
| `http://localhost:3000/api/admin-session` (com hífen)  | 404 no Express; só a Vercel reescreve `/api/admin-*` para `admin/*`                                                                                                                                                                                          |
| `http://localhost:3000/api/auth/customer/session`      | 200 `{"success":true,"authenticated":false,"user":null}`                                                                                                                                                                                                     |
| `http://localhost:3000/api/auth/customer/logout` (GET) | 405 `METHOD_NOT_ALLOWED` "Método não permitido." (serve de marcador de versão e não consome o limite)                                                                                                                                                        |
| `http://localhost:3000/sitemap.xml`                    | 200 XML, com as `<loc>` no domínio ngrok, `max-age=3600`                                                                                                                                                                                                     |
| `http://localhost:5173/sitemap.xml`                    | A 404 do SPA (o Vite não entrega o sitemap)                                                                                                                                                                                                                  |
| `http://localhost:5173/robots.txt`                     | `Allow: /`, `Disallow` de `/admin`, `/reset-password`, `/downloads`, `/checkout`, `/login`, `/api/`, `/confirmar-inscricao` e `/desinscrever`, e a linha `Sitemap: https://profamarciarcardoso.com.br/sitemap.xml`. **Sem** `/painel-acesso-privado-atelie`. |

| Estado do ambiente           | Sintoma                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dependências não instaladas  | "concurrently" ou "vite" não são reconhecidos; o agente depende do dono para resolver                                   |
| Só o front no ar             | `ERR_CONNECTION_REFUSED` para a :3000, o cliente deslogado, `/admin` com o formulário e o envio dando "Failed to fetch" |
| Limitador de borda estourado | Todo `/api` responde 429 `RATE_LIMITED` "Muitas requisições. Aguarde um instante e tente novamente." (B105)             |
| API lenta ou Supabase fora   | Depois de 15 s, "Tempo de resposta da API excedido. Tente novamente."; os limites fail-closed respondem 503             |

### 7.2 Versão do deploy público

**Veredito em 2026-09-28:** `https://atelie-escolar.vercel.app` **não** tem o login em `/admin`.

- O bundle é `/assets/index-DbUnVR43.js`, com o chunk `AdminLoginPage-CFLR6IDn.js` e as rotas `/painel-acesso-privado-atelie`, `/admin-login` (Navigate) e `/admin/usuarios`.
- O `/login` do deploy não tem "Entrar como" nem "Baixar meus dados", e o `/privacidade` não tem "Suas preferências de cookies".
- O logout do painel navega para `/login`.
- `GET /api/me-export-data` → 404; `GET /api/auth/customer/login` e `/logout` → 404; `/api/products?__path=notfound` devolve a lista.
- **Conclusão:** é um commit entre `660fe74` (26/08, que já tem a função única) e `244226c` (01/09). É anterior ao `origin/main` `05b0066` e ao working tree.
- O domínio `atelie-escolar-joao-luis-c.vercel.app` (o do `APP_URL`) serve o mesmo bundle, com `X-Robots-Tag: noindex`.

| Marcador                        | Deploy atual (antigo)                            | Código local (working tree)                                      |
| ------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `GET /api/auth/customer/logout` | 404 `NOT_FOUND`                                  | 405 `METHOD_NOT_ALLOWED`                                         |
| `/admin` sem sessão             | Redireciona para `/painel-acesso-privado-atelie` | Continua em `/admin` com "Acesso restrito"                       |
| `/painel-acesso-privado-atelie` | Formulário de login                              | 404                                                              |
| `/admin-login`                  | Redireciona para `/painel-acesso-privado-atelie` | 404                                                              |
| "Encerrar sessão"               | Toast e navegação para `/login`                  | Toast e formulário na mesma `/admin`                             |
| `/conta` logado                 | Sem "Baixar meus dados"                          | Com "Baixar meus dados"                                          |
| `/privacidade`                  | Sem o bloco de cookies                           | Com "Suas preferências de cookies"                               |
| `/robots.txt`                   | Contém `Disallow: /painel-acesso-privado-atelie` | Não contém                                                       |
| `/login`                        | Sem "Entrar como"                                | Sem "Entrar como". Se aparecer, o deploy está em `05b0066` puro. |

**Outros comportamentos do deploy:**

- O sitemap responde 200 com 26 `<loc>` (3 estáticas, 12 categorias (4 com UUID) e 11 produtos), todas em `-joao-luis-c`.
- `/api/products` responde 200 com 11 produtos, `X-Vercel-Cache` e `RateLimit-Limit: 120`.
- `/og-default.png`, `/assets/nao-existe.js`, `/health` e `/pagina-que-nao-existe` voltam 200 `text/html` (B37, B151).
- **As escritas admin e o logout só funcionam no domínio do `APP_URL`** (B19).
- O deploy não tem rate limit no login de cliente (B06).

### 7.3 Console e rede: linha de base

- **Em toda carga:** `GET {API}/admin/session` e `GET {API}/auth/customer/session` em paralelo (`AuthProvider.jsx:29`). Em dev saem 2× cada (StrictMode); no deploy, 1×. No retorno do OAuth há também `POST {API}/auth/customer/google/callback`.
- **Estáticos:** `fonts.googleapis.com` / `fonts.gstatic.com` (Poppins, Raleway, Roboto) e `/fonts/bootstrap-icons-subset.css` + `.woff2` (mesma origem, nos dois ambientes). No deploy, também `/_vercel/insights/script.js`.
- **Eventos de funil:** `navigator.sendBeacon` (tipo "ping") para `POST {API}/track-event` → 204. O ErrorBoundary envia `client_error`. GA4 e Pixel só carregam com `granted` **e** com os IDs no build (hoje ausentes).
- **Checkout:** `POST {API}/abandoned-cart` 204 cerca de 1,5 s depois de um e-mail válido. Em dev, isso gera o warning "[api] resposta sem JSON valido" (B243).
- **Checagens:**
  - no deploy, nenhum erro vermelho no console nas telas principais;
  - nenhum 5xx; 4xx só quando provocado;
  - nenhuma requisição do deploy para `localhost:3000`;
  - em dev, conte as chamadas de sessão por F5 (2+2) para não confundir o StrictMode com um loop.
- **Suspeitas:** B55 (o `Promise.all` zera as duas sessões) e B243.

### 7.4 Rate limit

A política real é aplicada por `enforceRateLimit` em cada handler, com um contador atômico no Postgres (RPC `rate_limit_hit`) em janela fixa. **Os sucessos também contam.** Ela vale igual em dev e em produção, e reiniciar a API **não** zera os contadores, porque eles ficam no banco compartilhado. No bloqueio, a resposta é 429 `{success:false,error:{code:'RATE_LIMITED',message},retryAfterSeconds}` + `Retry-After`. Os limites **fail-closed** (login e cadastro de cliente, 2º fator admin) respondem 503 "Não foi possível validar esta tentativa agora. Tente de novo em instantes." quando o contador está indisponível; os demais são fail-open.

| Balde                                                                                 | Limite                                                  | Mensagem                                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| admin-login                                                                           | 5 / 10 min por IP                                       | "Muitas tentativas. Aguarde 10 minutos e tente novamente."                                                              |
| admin-login-2fa                                                                       | 5 / 10 min por IP+e-mail                                | "Muitas tentativas de verificação. Aguarde 10 minutos e tente novamente."                                               |
| admin-settings-2fa                                                                    | 5 / 10 min                                              | "Muitas tentativas de confirmação. Aguarde 10 minutos e tente novamente."                                               |
| customer-login                                                                        | 5 / 10 min por IP+e-mail + 20 e-mails distintos por IP  | "Muitas tentativas de login nesta conta. …" / "Muitas tentativas de login a partir desta conexão. Aguarde um instante." |
| customer-register                                                                     | 5 / 10 min                                              | "Muitas tentativas de cadastro. Aguarde 10 minutos e tente novamente."                                                  |
| google start / callback                                                               | 20 / 10 min                                             | —                                                                                                                       |
| validate-coupon / create-payment                                                      | 20 / min                                                | "Muitas tentativas. Aguarde 1 minuto." / "Muitas tentativas de pagamento. Aguarde 1 minuto."                            |
| abandoned-cart                                                                        | 30 / min                                                | —                                                                                                                       |
| verify-payment                                                                        | 600 / 10 min por pedido + 40 pedidos distintos por IP   | "Muitas verificações deste pedido. …" / "Muitas consultas de pedidos diferentes a partir desta conexão. …"              |
| subscribe / unsubscribe / confirm-subscription                                        | 5 / min · 20 / min · 20 / min                           | "Muitas tentativas. Aguarde 1 minuto."                                                                                  |
| me-delete-account / me-export-data                                                    | 5 / min · 5 / 5 min (contado **antes** da autenticação) | "Muitas tentativas. Aguarde 1 minuto." / "Muitas exportações seguidas. Aguarde alguns minutos."                         |
| track-event                                                                           | 120 / min                                               | —                                                                                                                       |
| send-confirmation-email                                                               | 5 / 10 min                                              | —                                                                                                                       |
| catalog (products, product-details, home-sections e cross-sell compartilham o limite) | 120 / min por IP                                        | "Muitas requisições. Aguarde um instante."                                                                              |
| download                                                                              | 20 / 10 min por token + 30 tokens distintos por IP      | "Muitas tentativas para este download. …"                                                                               |
| **Só em dev:** borda do Express em todo `/api`                                        | 250 / 15 min (`RATE_LIMIT_MAX`)                         | "Muitas requisições. Aguarde um instante e tente novamente." (B105)                                                     |

**Orçamento para a validação:** no máximo 3–4 logins admin a cada 10 min por IP (deixe o F45 para o fim). Não use `me-export-data` como sonda. Diante de um 429, identifique o balde pela mensagem e pelo `Retry-After` antes de concluir que é bug. Abandone o checkout pendente logo, porque o polling consome o limite de borda. **O deploy atual não tem o limite no login de cliente** (B06).

### 7.5 Cache e CDN

| Política (`lib/http.js:294-311`) | Cabeçalho                                                        | Onde                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog`                        | `public, max-age=300, s-maxage=300, stale-while-revalidate=3600` | `/products`, `/product-details`, `/home-sections`, `/cross-sell` (no deploy, com `X-Vercel-Cache` HIT/MISS)                           |
| `adminReport`                    | `private, max-age=3600`                                          | `/admin/dashboard`, `/admin/kpis`, `/admin/funnel`, `/admin/segments`, `/admin/abc-products`, `/admin/abc-customers`, `/admin/cohort` |
| `sensitive`                      | `no-store`                                                       | `/download`, `/me-export-data`                                                                                                        |
| sitemap                          | `public, max-age=3600, s-maxage=3600`                            | `/sitemap.xml`                                                                                                                        |

- O front usa o `fetch` padrão, sem `cache: 'no-store'` e sem cache-buster (`src/utils/api.js:125-157`). Consequências:
  1. a loja pode mostrar o catálogo e a vitrine antigos por até 5 min, e a borda pode servir uma versão velha durante o SWR (B42);
  2. as abas do painel que usam `/admin/dashboard` recebem a resposta guardada por até 1 h depois de cada escrita (B20).
- **Teste as duas condições**, com "Disable cache" ligado e desligado. Com ele ligado, B20 fica escondido.
- Na loja, espere pelo menos 5 min, ou use uma janela anônima nova, antes de concluir que "o produto não apareceu".
- O texto `?nocache=1` das abas Análise e Segmentos não funciona (B202).

### 7.6 SEO técnico por rota

O componente `SEO.jsx` gera o título "`<título> · Ateliê da Escola`", uma meta description, o canonical `origin + pathname` (com fallback em `VITE_PUBLIC_BASE_URL` ou `https://profamarciarcardoso.com.br`), o robots `noindex,nofollow` quando pedido, as tags OG/Twitter e o JSON-LD opcional. A `og:image` padrão é `/favicon.svg`. O `index.html` também tem uma meta description estática, o que dá 2 no total (B121).

| Rota                                    | `document.title`                                                    | Robots             | Observação                                                           |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| `/`                                     | "Materiais educativos digitais para professores · Ateliê da Escola" | indexável          | JSON-LD `[Organization, WebSite]` com SearchAction (B122)            |
| `/produtos`                             | "Catálogo de materiais educativos · Ateliê da Escola"               | indexável          | canonical termina em `/produtos`                                     |
| `/produtos/<slug>`                      | "<nome> · Ateliê da Escola"                                         | indexável          | `og:type=product`; JSON-LD Product com `offers.price` "12.90" (B146) |
| produto carregando ou com erro          | "Carregando produto · Ateliê da Escola"                             | `noindex,nofollow` | fica assim também no erro (B139)                                     |
| `/checkout`                             | "Finalizar compra · Ateliê da Escola"                               | noindex            | —                                                                    |
| `/login`, `/conta`                      | "Entrar ou criar conta · Ateliê da Escola"                          | noindex            | canonical sempre `/login` (B161)                                     |
| `/downloads`                            | "Meus downloads · Ateliê da Escola"                                 | noindex            | —                                                                    |
| `/privacidade`, `/termos`               | "Política de Privacidade · …", "Termos de Uso · …"                  | indexável          | —                                                                    |
| `/confirmar-inscricao`, `/desinscrever` | "Confirmar inscrição · …", "Cancelar inscrição · …"                 | noindex            | —                                                                    |
| 404                                     | "Página não encontrada · Ateliê da Escola"                          | noindex            | canonical = só a origem (B151)                                       |
| `/admin`, `/reset-password`             | "Ateliê da Escola" no acesso direto, ou o título herdado            | sem robots         | B125                                                                 |

**robots × sitemap:** a linha `Sitemap:` aponta para um domínio que não resolve, e as `<loc>` apontam para um domínio `noindex` (B54). O sitemap inclui `/login` (B123). As URLs de categoria usam o slug e não filtram (B53).

### 7.7 Cabeçalhos de segurança e CSP

- **Documento HTML no deploy** (`vercel.json:10-21`, conferido por curl): `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` e a CSP.
- **A CSP:**
  - começa com `default-src 'self'`, tem `frame-ancestors 'none'` e `upgrade-insecure-requests`;
  - `img-src`: `'self'`, `data:`, `blob:`, `*.supabase.co` e os hosts de analytics;
  - `connect-src`: `'self'`, `www.google-analytics.com`, `stats.g.doubleclick.net`, `www.facebook.com`, `api.mercadopago.com` e `*.supabase.co`;
  - `frame-src`: `'self'` e o Mercado Pago;
  - **não tem `media-src`**.
- **As respostas `/api/*`** recebem a CSP do helmet (`lib/security-headers.js:41-91`).
- **O Vite em dev não envia CSP**: os bugs de CSP (B48, B49, B115) só aparecem no deploy.
- **Cookies no deploy:** `admin_session` e `customer_session` com `HttpOnly`, `SameSite=Strict`, `Max-Age=28800` e `Secure`.
- **Checagens:** os 6 headers no documento; nenhum "Refused to …" nas telas principais (inclusive no PUT do upload para `*.supabase.co`, que é permitido); os ícones `bi-*` desenhados; o site não pode ser embutido em iframe de outro domínio.

### 7.8 Responsividade e navegação

- **Loja:** abaixo de `lg` (1024 px), aparecem o hambúrguer ("Abrir menu"/"Fechar menu", 44×44, com `aria-expanded`) e o carrinho (44×44), e somem "Entrar"/"Conta" e "Sair". Abaixo de 640 px, só a coruja aparece.
- **Admin:** abaixo de `lg`, a sidebar vira uma gaveta aberta por "Abrir menu" (~36 px, B184). A partir de `lg`, ela fica sticky.
- **Toasts** no topo: centralizados no mobile e à direita a partir de 640 px. O **banner de cookies** fica fixo embaixo, com até 768 px.
- **Larguras a testar:** 375×812, 390×844, 768×1024, 1100×800, 1280×800 e 1440×900. Em cada rota, `document.documentElement.scrollWidth <= window.innerWidth`.
- **Suspeitas:** B31 (sem scroll-to-top), B35 (o banner cobre os controles), B87 (tabelas do admin cortadas a 375 px).

### 7.9 Modais, overlays, toasts e fallbacks (matriz)

| Overlay                                      | Abre por            | Fecha por                                                             | Esc     | Foco inicial / preso / devolvido | Trava a rolagem | aria-modal                |
| -------------------------------------------- | ------------------- | --------------------------------------------------------------------- | ------- | -------------------------------- | --------------- | ------------------------- |
| Drawer do carrinho (L03)                     | ícone do carrinho   | véu "Fechar carrinho", X "Fechar", "Finalizar compra", "Ver catálogo" | sim     | X / sim / sim                    | sim             | sim                       |
| ModalWizard: Produto, Categoria, Cupom (A08) | "Novo …" / "Editar" | véu "Fechar modal", X "Fechar", "Cancelar"                            | sim     | X (não o 1º campo) / sim / sim   | sim             | sim                       |
| OrderDetailModal (A06)                       | "Detalhes"          | véu "Fechar detalhes", X "Fechar"                                     | sim     | X / sim / sim                    | sim             | sim                       |
| "Como ler este gráfico" (A23)                | "Como ler"          | véu "Fechar explicação", X "Fechar", "Entendi"                        | **não** | não / não / não                  | não             | não (B89)                 |
| "Revogar acesso?" (A26)                      | lixeira de Usuários | véu "Cancelar", botão "Cancelar"                                      | **não** | não / não / não                  | não             | não (B101)                |
| Menu lateral do admin (A03)                  | "Abrir menu"        | véu "Fechar menu", escolher uma aba                                   | **não** | não / não / não                  | não             | — (B82)                   |
| Filtros mobile (L11)                         | "Filtros"           | véu "Fechar filtros", X "Fechar", escolher um filtro                  | **não** | não / não / não                  | não             | — (B138)                  |
| Menu hambúrguer da loja (L02)                | "Abrir menu"        | "Fechar menu", navegar                                                | **não** | —                                | —               | — (B108)                  |
| Banner de cookies (L05)                      | sem decisão         | "Apenas essenciais" / "Aceitar todos"                                 | **não** | —                                | —               | não (B114)                |
| Toasts (L06)                                 | ações               | "Fechar aviso" ou 2,4 s                                               | —       | —                                | —               | `aria-live=polite`, z-100 |

**Fallbacks de carregamento e erro:**

- "Carregando…" na troca de rota lazy (`App.jsx:43-50`).
- "Verificando sessão" / "Aguarde enquanto validamos seu acesso ao painel." enquanto `authReady=false`.
- No painel: o "Carregando…" do chunk da aba (TabFallback), o bloco "Carregando…" dos dados e o cartão rosa de erro.
- Os wizards usam `Suspense fallback={null}`: no 1º clique em "Novo produto" nada aparece até o chunk chegar.
- Um erro de render leva a "Algo deu errado" + "Recarregar" (L08).

### 7.10 Diálogos nativos, downloads, nova aba e recargas

- **4 `window.confirm`** (instale o stub do F03 antes):
  - `Excluir o produto "<nome>"?` (`AdminPage.jsx:364`)
  - `Excluir a categoria "<nome>"?` (`AdminPage.jsx:411`)
  - `Excluir o cupom "<CÓDIGO>"?` (`CouponsTab.jsx:99`)
  - "Tem certeza? Enviaremos um e-mail para confirmar a exclusão definitiva da sua conta." (`CustomerAuthPage.jsx:218`)

  Cancelar ou Esc encerra o handler antes de qualquer requisição. **Não há** `alert()`, `prompt()` nem `beforeunload`.

- **Downloads programáticos:** `meus-dados-atelie-AAAA-MM-DD.json` (C04) e os CSVs da Análise (A22). O Chrome pode perguntar onde salvar.
- **Nova aba:** o `window.open` do Checkout Pro depois do `await createPayment` (o popup pode ser bloqueado; use o link "Abrir pagamento"), "Baixar" (`target=_blank`) e os links externos do rodapé e da Home.
- **Recargas:** a revogação de cookies (`granted` → "Apenas essenciais"), o botão "Recarregar" do ErrorBoundary, "Como Funciona"/"Contato" fora da home e o link "Faça login" do bypass.

### 7.11 Rotas × endpoints

| Tela                      | Chamadas esperadas                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global (toda rota)        | `GET /admin/session`, `GET /auth/customer/session`, `POST /track-event`, `POST /auth/customer/logout` ("Sair"), `POST /auth/customer/google/callback` (retorno do OAuth)                                                                                                                                                                                                                                                                                   |
| `/`                       | `GET /home-sections`; `POST /subscribe` (rodapé)                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/produtos`               | `GET /products`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/produtos/:slug`         | `GET /product-details?slug=` (ou `id`), `GET /cross-sell?productId=`                                                                                                                                                                                                                                                                                                                                                                                       |
| `/checkout`               | `POST /validate-coupon`, `POST /abandoned-cart`, `POST /create-payment`, `POST /verify-payment` (4 s); Supabase OAuth                                                                                                                                                                                                                                                                                                                                      |
| `/login`, `/conta`        | `POST /auth/customer/login`, `POST /auth/customer/register`, `GET /me-export-data`, `POST /me-delete-account`; Supabase `recover` e `authorize`                                                                                                                                                                                                                                                                                                            |
| `/reset-password`         | Supabase direto (`PUT /auth/v1/user`)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/downloads`              | `POST /verify-payment` (10 s, 12×), `GET /customer-orders`, link para `/download?token=`                                                                                                                                                                                                                                                                                                                                                                   |
| `/privacidade`, `/termos` | nenhuma (a revogação é só no localStorage)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/confirmar-inscricao`    | `GET /confirm-subscription?token=`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/desinscrever`           | `GET /unsubscribe?token=` ou `POST /unsubscribe`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/admin` sem sessão       | `POST /admin/login`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/admin` com sessão       | `GET /admin/dashboard`, `GET /admin/kpis?window=12`, `POST/PUT/PATCH/DELETE /admin/products`, `POST/PUT/DELETE /admin/categories`, `GET/POST/PUT/DELETE /admin/coupons`, `GET /admin/orders?status=`, `GET/PUT/DELETE /admin/users`, `GET/PUT /admin/settings?key=`, `GET /admin/funnel`, `GET /admin/segments`, `GET /admin/abc-products`, `/admin/abc-customers`, `/admin/cohort`, `POST /admin/upload-url` + `PUT` para o Storage, `POST /admin/logout` |

O front atual nunca chama o formato com hífen (`/api/admin-<x>`). No Express local esse formato dá 404; a Vercel ainda o reescreve (`vercel.json:23-26`).

### 7.12 Endpoints sem tela

| Endpoint                              | Situação                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/admin/products`             | `fetchAdminProducts` nunca é importado; é justamente a leitura completa que resolveria B02 |
| `GET /api/admin/categories`           | `fetchAdminCategories` nunca é importado                                                   |
| `PUT` e `DELETE /api/admin/orders`    | `updateAdminOrder`/`deleteAdminOrder` sem uso; a aba Pedidos é só leitura                  |
| `GET /api/auth/customer/google/start` | O front usa `supabase.auth.signInWithOAuth`                                                |
| `POST /api/send-confirmation-email`   | Legado e anônimo (B77); nenhum fluxo chama                                                 |
| `POST /api/admin/cleanup-events`      | Só por curl. O GET dá 405. **Não faça POST** (apaga eventos).                              |
| `/api/cron-email-jobs`                | GitHub Actions; sem `X-Cron-Secret`, dá 401. Nunca chame com o header (envia e-mails).     |
| `POST /api/webhook`                   | Mercado Pago (C13)                                                                         |
| `/api/sitemap.xml`, `/api/notfound`   | Técnicos                                                                                   |

### 7.13 Pendências conhecidas, visíveis no navegador

Levantadas em `docs/ProjectDocs/13-ROADMAP-PENDENCIAS.md`, `docs/reviews/CORRECOES-2026-09-01.md`/`-02.md` e `docs/reviews/REVIEW-AUTH-2026-09-01.md`. (`HANDOFF.md`, `docs/SETUP.md` e `docs/NextFeatures/PENDENCIAS.md` foram consolidados em `docs/ProjectDocs`, no commit `f018a86`.) **Registre como "pendência documentada", não como regressão:**

1. Os cartões tracejados "Vendas por região" e "Funil de conversão" no Dashboard (B189).
2. A `og:image` padrão em SVG (B124).
3. GA4 e Pixel não configurados: não há requisição a terceiros nem com "Aceitar todos".
4. O Resend em sandbox (B79).
5. O domínio canônico `profamarciarcardoso.com.br` não resolve (B33, B54).
6. As sessões admin e de cliente não são revogáveis: o cookie HMAC vale 8 h mesmo depois do logout, se tiver sido copiado.
7. O servidor aceita senha de cliente com 8+ caracteres, mas o front exige maiúscula, minúscula e dígito.

### 7.14 Dados de teste necessários

- **Contas:**
  - ADMIN/MASTER: confirmar com o dono o e-mail, a senha e o 2FA. Pelo `HANDOFF.md` histórico o e-mail seria `adminmarcia@gmail.com`, mas isso não está documentado no repo atual. **Não registre senhas.** Se o TOTP estiver ativo, no localhost só o PIN funciona (B23).
  - Opcionalmente, um segundo admin descartável.
  - Um cliente comum confirmado, com senha no padrão do front.
  - Um cliente **descartável** para a exclusão LGPD e o export.
  - Um cliente de teste para o papel e a revogação.
  - Os 7 clientes seed `@example.com` (ana.lima, carla.souza, mariana.r, beatriz, joana, lucas.p, patricia) podem existir, mas não recebem e-mail e **não devem ser excluídos**.
- **Catálogo:**
  - pelo menos 8 produtos ativos em pelo menos 6 categorias, com preços nas três faixas (incluindo 25,00 e 50,00) e com datas recentes (menos de 7 dias) e antigas;
  - um produto com várias imagens + vídeo (YouTube e MP4 do wizard);
  - produtos com `original_price` maior que o preço, `featured`, `is_kit` com `kit_items`, e outro com FAQ, benefits e reviews (com nota);
  - um sem imagem, um sem categoria ou com categoria inativa e um desativado com slug conhecido;
  - uma categoria ativa sem produtos e uma categoria com nome acentuado ou composto;
  - pelo menos 1 produto com `download_url` no Storage.
- **Linha de base pública (2026-09-28):**
  - 11 produtos: palavras-magicas, teste, convite-formatura-abc, kit-volta-as-aulas, dia-das-maes-premium, banner-quadrilha, kit-festa-junina-completo, varal-alfabeto-colorido, caderno-atividades-1o-ano, pascoa-pedagogica, painel-formatura-infantil.
  - 12 categorias no sitemap (4 com UUID, "teste" e "Sem nome (renomeie)").
  - 4 seções na vitrine ("Mais vendidos", "sejam bem vindos ao natal" vazia com link `?categoria=teste`, "Festa Junina", "Novidades").
- **Pedidos:**
  - aprovados com 2+ produtos (para o cross-sell `co_occurrence`), no mês atual e no anterior, em pelo menos 2 categorias;
  - pelo menos 1 pendente e 1 com status fora do mapa;
  - um aprovado de teste com `download_tokens` não usados (F39);
  - um sem `order_items` e um sem nome;
  - um cliente com 2+ compras e cadastros sem compra;
  - opcionalmente, toda a receita numa única categoria (B84) e um pedido aprovado depois das 21 h (B86).
- **Cupons:**
  - um ativo sem `max_uses` e sem mínimo, um com mínimo acima do carrinho, um expirado ou inativo, e um código inexistente;
  - não use cupons reais de uso limitado (o `create-payment` reserva um uso);
  - o código não aceita colchetes: `TESTE-QA-01`.
- **Newsletter:** assinantes de teste confirmado (com o `unsubscribe_token` conhecido), pendente e descadastrado, com acesso de leitura a `email_subscribers`/`email_sent_log`.
- **Analytics:** eventos em `analytics_events` (navegar pela loja), linhas em `download_logs` e pedidos com `attribution_data.utm_source`.
- **Arquivos locais:** 2 imagens de até 500 kB, 1 de ~600 kB, 1 SVG, um PDF e um ZIP pequenos, um `.html` e um MP4 pequeno.
- **Backups antes de mexer:** `settings.homeSections`.
- **Mercado Pago:** uma credencial de TESTE confirmada pelo dono antes de qualquer pagamento. Cartões de teste em `docs/ProjectDocs/03-SETUP.md` §7 (Visa 4235 6477 2802 5682, Mastercard 5480 8328 0103 3311, CVV 123, validade futura, CPF 12345678909, titulares APRO, OTHE e CONT).
- **Navegador:** DevTools com "Disable cache", throttling (Slow 3G e Offline), Network request blocking, Rendering › prefers-reduced-motion, janela anônima e redimensionamento.

### 7.15 Notas para o agente de navegador

1. **Onde fica cada direito LGPD:**
   - exportar: "Baixar meus dados" em `/conta`;
   - excluir: "Excluir minha conta" em `/conta` e depois "Excluir permanentemente" em `/conta?delete_token=…`;
   - revogar cookies: **só** em `/privacidade#cookies`.
2. **Sem Shell:** `/login`, `/conta`, `/reset-password` e `/admin`. Cada página monta o próprio Shell, então trocar de rota fecha o menu e o drawer e reseta a newsletter.
3. **Carrinho:** não tem quantidade (é sempre 1) e fica em `localStorage['cart']`.
4. **Dados fixos × reais:**
   - **Fixos no código:** o hero, o marquee, "Como funciona", os números da prova social, os 3 depoimentos da Home, os 4 benefícios padrão, o texto sob o preço, os selos dos cards e os chips PDF/Canva/Imprimível.
   - **Vêm do banco:** as vitrines, o catálogo, o preço, a galeria, os benefícios, o FAQ e os reviews (os três últimos digitados pelo admin).
5. **Elementos duplicados:** há dois "Entrar" no `/login` (use `form button[type=submit]`), dois tipos de "Remover" no checkout, dois "Aceitar todos"/"Apenas essenciais" em `/privacidade` com o banner visível (use `#cookies button`), e o h3 e o botão "Excluir minha conta" em `/conta`.
6. **Caixa alta:** os rótulos em caixa alta são CSS, e o `textContent` traz o texto citado neste mapa.
7. **StrictMode:** em dev ele duplica os efeitos (`home-sections`, `view_catalog`, `confirm-subscription`, `unsubscribe` por token, as sessões). Isso é esperado.
8. **E-mails:** o banco é compartilhado com produção e os e-mails são reais. Use endereços de teste, prefixe tudo com `[TESTE]` e limpe no fim (F05).

---

## 8. O que mudou desde a versão de 13/08 (`49b81c0` → `05b0066` + working tree)

### 8.1 Login e rotas (working tree, não commitado)

- `/admin` passou a ser a única entrada. Sem sessão, o `ProtectedRoute` renderiza `AdminLoginPage` (antes `ProfessorLoginPage`) como `fallback` na própria `/admin`, sem redirect. Os textos voltaram a "Painel administrativo" / "Acesso restrito" / "Use o e-mail Supabase do perfil master/admin para acessar o painel." / "E-mail do admin", com o toast "Login administrativo realizado.". O link "Não é professor? Entrar como cliente" foi removido.
- `/painel-acesso-privado-atelie` e `/admin-login` deixaram de existir (levam à 404). `PROFESSOR_LOGIN_PATH` e `ROUTES.professorLogin` saíram de `src/constants/routes.js`. Continua o redirect `/admin/usuarios` → `/admin`. O `robots.txt` perdeu a linha do caminho antigo.
- O `/login` (`CustomerAuthPage`) perdeu o seletor "Entrar como: Cliente \| Professor" e é só de cliente. Um admin que loga ali vira sessão de **cliente** com papel admin.
- "Encerrar sessão" não navega mais para `/login`: o formulário aparece na própria `/admin`. O banner de bypass aponta para `/admin?login`, e o `ProtectedRoute` ganhou `wantsLogin`.
- "Verificando sessão" agora diz "Aguarde enquanto validamos seu acesso ao painel." (antes, "…acesso administrativo.").
- O subset de ícones perdeu `mortarboard`, `mortarboard-fill` e `person` (107 ícones). `check-circle-fill` e `exclamation-circle-fill` já faltavam antes e continuam faltando (B36, novo achado).

### 8.2 Backend e API (commits entre `49b81c0` e `05b0066`)

- Os handlers saíram de `api/*.js` para `handlers/*.js`. `api/index.js` é a **única** função serverless: o `vercel.json` reescreve `/api/(.*)` para `/api/index?__path=$1` e `/api/admin-(.*)` para `admin/$1`. O Express local monta os mesmos módulos. Todas as referências da base antiga no formato `api/<arquivo>.js:linha` agora são `handlers/<arquivo>.js`, com outras linhas.
- O front chama `/api/admin/<recurso>` (com barra), não `/api/admin-<recurso>`. Em dev, o formato com hífen dá 404.
- **Envelope de erro unificado:** `{success:false, error:{code, message}}` (`lib/http.js`), com códigos em SCREAMING_SNAKE (`COUPON_NOT_FOUND`, `DOWNLOAD_TOKEN_USED`, `ADMIN_SESSION_INVALID`, `RATE_LIMITED` etc.). As checagens antigas, como `{code:'not_found'}` e `{"error":"Token já utilizado"}`, ficaram obsoletas.
- Os recursos CRUD do admin usam a factory `lib/admin-resource-handler.js` (auditoria de toda escrita) e validação zod (`validation/admin.schemas.js`). Os ids de produto, categoria e usuário são UUID; o de cupom é bigint. O `create-payment` passou a usar zod e dinheiro em centavos, com as mensagens novas "Email do cliente é obrigatório", "Email inválido.", "Nome muito longo.", "Item inválido: productId é obrigatório.", "Items são obrigatórios", "Quantidade de itens inválida." e o fallback "Erro ao criar pagamento" (sem ponto).
- **Rate limit:** os `express-rate-limit` por rota foram removidos. A política real passou a ser o Postgres (`rate_limit_hit`), com os baldes novos: login de cliente por conta + varredura, cadastro, Google, `confirm-subscription`, `catalog` (120/min, compartilhado), `download`, `me-export-data`, `send-confirmation-email` e `admin-settings-2fa`, além do fail-closed (503). Ficou só o limitador de borda local (250 a cada 15 min, com JSON em português). **Corrigidos:** S51 (login sem limite em produção, mas ainda não publicado, B06), S115 ("Credenciais invalidas.") e S119/S28 parcial (429 em texto puro). Reiniciar a API não zera mais os limites.
- **Cache:** os caches em Map/X-Cache dos relatórios deram lugar a `Cache-Control: private, max-age=3600`, que desde `08e1535` (18/08) também vale para `/admin/dashboard`. Daí o novo achado B20.
- `/admin/dashboard` ganhou tetos por tabela e o campo `truncated` (S191 corrigido, mas a UI não mostra o campo: B188).
- **2FA:** o `totpSecret` passou a ser cifrado (AES-256-GCM com `ADMIN_2FA_ENC_KEY`, commit `5949cc7`) e o `fallbackPin` hasheado (scrypt), com anti-replay de TOTP e de desafio (TTL de 120 s) e um balde de 2FA separado e fail-closed. Isso reduz S08 (B85), mas cria o trancamento por chave divergente (B23, novo).
- **Catálogo:** `/products` não seleciona mais `download_url`, e `/cross-sell` valida o UUID (400 "productId é obrigatório.").
- **`/confirm-subscription`** passou a usar status HTTP reais: 404 "Token inválido ou expirado.", 409 "Inscrição cancelada. …" e 410 "Link de confirmação expirado. …". A checagem antiga "`?token=abc` → 200 `{confirmed:false}`" não vale mais.
- **`POST /unsubscribe`** passou a responder `{success:true, confirmationRequired:true}` com uma mensagem neutra. A tela trata isso como o estado "pending".
- **Exclusão de conta:** agora também apaga os `abandoned_carts` do e-mail (`625e6e5`) e zera `analytics_events.customer_email` (`43ea1e0`).
- O `vercel.json` perdeu a rota `/api/notfound` quebrada e o bloco `env` com `@segredos` (S101 corrigido).

### 8.3 Front-end (commits)

- **Novo:** o botão "Baixar meus dados" em `/conta`, que chama `GET /api/me-export-data` e monta o JSON no navegador (`0663705`).
- **Novo:** o bloco "Suas preferências de cookies" em `/privacidade#cookies` (`625e6e5`), com "Apenas essenciais" (recarrega a página ao revogar) e "Aceitar todos". A política aponta para ele nas seções 4 e 7, e a seção 7 foi reescrita (portabilidade + exclusão + revogação). **S32 corrigido** (antes não havia caminho na UI para rever a escolha), mas não há link no banner, no header nem no rodapé, e surgiu a dessincronia banner × bloco (B34, novo).
- **S07 corrigido:** `isSessionError` decide pelo código (`src/constants/error-codes.js:79-82`). Um 401 nas abas controladas pelo AdminPage mostra o toast âmbar e volta ao formulário, mas Funil, Segmentos, Cupons, Análise e KPIs continuam sem isso (B80). O `format.js` foi removido.
- **S263 corrigido em parte:** no bypass sem sessão, o Dashboard fica zerado em vez de mostrar o cartão rosa. O texto do banner ficou desatualizado (B186).
- **S87 corrigido:** o rank 1 é sempre da classe A (`src/utils/abc.js` e `lib/abc-classification.js`, com teste de paridade). O texto "cauda C" continua (B195).
- **S193 corrigido em parte:** o Comparativo usa `formatPercent` com vírgula; o Dashboard continua diferente (B196).
- **S167 corrigido em parte:** o `CouponField` usa `apiRequest` (timeout de 15 s; resposta sem JSON vira "Cupom inválido."), mas com a rede fora ainda aparece "Failed to fetch".
- **S53 corrigido em parte:** a corrida em produção entre o bootstrap e o callback do Google foi resolvida (`cda6218`); sobra o problema em dev/StrictMode (B152).
- **Refactors:**
  - o `AdminPage` carrega as 14 abas e os 2 wizards por `lazy()`/Suspense (daí o "Carregando…" na 1ª visita e o `fallback={null}` dos wizards);
  - `DashboardTab` → `dashboard-charts.js`, `AnalysisTab` → `analysis-content.js`, `ProductWizard` → `product-wizard-form.js`;
  - formatadores em `src/utils/number.js`;
  - serviços por domínio (`checkout.js`, `coupons.js`, `downloads.js`, `newsletter.js`, `subscription.js`, `customer-auth.js`);
  - rotas centralizadas em `src/constants/routes.js` (`sanitizeRedirectPath` também rejeita `\`);
  - SDK do Supabase por import dinâmico.
- A Home lê `prefers-reduced-motion` via `useSyncExternalStore`, sem o quadro inicial animado.
- `/confirmar-inscricao` sem token já nasce no estado de erro.
- Os ícones são auto-hospedados também no local (`/fonts/bootstrap-icons-subset.css`), então o marcador de versão da base antiga (jsdelivr × `/fonts`) deixou de servir.

### 8.4 Ambiente e documentação

- O deploy continua anterior a `244226c` (B06). No deploy atual, o "Sair" do cliente pelo alias **não** dá 403; o S30 com 403 só volta a valer depois do próximo deploy (B26).
- `HANDOFF.md`, `docs/SETUP.md` e `docs/NextFeatures/PENDENCIAS.md` não existem mais (consolidados em `docs/ProjectDocs`, `f018a86`). As contas de teste deixaram de estar documentadas no repositório.
- O `node_modules` não existe no disco: é um novo pré-requisito para subir o ambiente.
- A divergência sobre o `sendBeacon` (S97 da base) não foi reincluída, porque não há evidência no código.

### 8.5 Suspeitas da base antiga reconfirmadas no código atual

Cada suspeita da seção 6 traz entre colchetes o código `Sxx` da base de 13/08 quando já existia lá. Todas foram conferidas de novo no código atual, com as linhas atualizadas. As que não estão na seção 6 se encaixam num destes grupos:

- **Corrigidas:** S07, S32, S51 (só no código; o deploy ainda está sem a correção, B06), S87 (a regra do líder), S101, S115, S119 e S191.
- **Corrigidas em parte:** S08 (o segredo agora é cifrado ou hasheado, B85), S28 (o limite de `/api/auth` saiu, mas a borda do dev continua, B105), S53 (continua só em dev, B152), S167 (continua "Failed to fetch", B171), S193 (só o Comparativo, B196) e S263 (o texto do banner, B186).
- **Ampliadas pela mudança de cache:** o cache de 1 h, que a base registrava só em Análise, Funil e KPIs (S92/S189), agora vale também para `/admin/dashboard` (B20).
- **Não reavaliadas:** a S97 (divergência do `sendBeacon`), por falta de evidência no código.
