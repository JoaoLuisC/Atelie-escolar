# Relatório de validação — BLOCO 1A (Loja pública)

Data: 2026-10-01 · Ambiente: http://localhost:5173 (LOCAL) · Versão: ATUAL · Larguras reais: desktop 1920 px (janela maximizada, o redimensionamento foi ignorado); mobile 390 px emulado num iframe same-origin (e 800 px para a faixa 640–1023) · session_id início/fim: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 / o mesmo · Início/fim: 17:02 / 17:37

Executado pelo Claude Code com a extensão Claude in Chrome, numa conversa só (L01–L11, sem a parada intermediária).

Observações de ambiente:

- Os servidores `vite` e `node server.js` já estavam rodando, iniciados fora desta sessão e sem `RATE_LIMIT_MAX`. Em L11 a API inteira passou a responder 429 (limite de borda de 250/15 min). Reiniciei só a API com `RATE_LIMIT_MAX=3000` e repeti o passo. Não é bug.
- Até ~17:25 a aba do Chrome estava **oculta** (`visibilityState: hidden`). Nesse estado o Chrome não carrega imagens `loading="lazy"`, não anima `scrollBy` suave e não roda `requestAnimationFrame`, então o Helmet não atualiza o `<title>`. Os itens afetados foram refeitos com a aba visível. Um achado de "título/SEO quebrado" que eu tinha anotado foi **retirado** por ser artefato.
- Sem `{{EMAIL_DESCARTAVEL}}`, a inscrição e o descadastro da newsletter não foram feitos.

## 1. Resumo executivo

- Telas validadas: 11 de 11 (L04 e L09 parciais, sem e-mail)
- Problemas por severidade: crítica 0 · alta 3 · média 13 · baixa 19 · cosmética 1
- Os 5 mais graves:
  1. LOJA-01: um erro de armazenamento (cota cheia, aba anônima do Safari) ou um `cart` corrompido derruba o site inteiro em "Algo deu errado", e o botão "Recarregar" não resolve.
  2. LOJA-02: dados de teste estão públicos na loja: produto "teste" (R$ 123,00), categorias com nome UUID e "Sem nome (renomeie)", e a faixa "sejam bem vindos ao natal" vazia na home.
  3. LOJA-03: a faixa "Novidades" da home mostra 8 produtos, mas o "Mais produtos →" dela abre "0 produtos encontrados".
  4. LOJA-04: no mobile, com o banner de cookies pendente, o banner cobre todo o rodapé do carrinho ("Finalizar compra →").
  5. LOJA-05: `/produtos/123` (ou qualquer slug numérico) responde 500 na API.

## 2. Tabela de cobertura

| Tela                                | Desktop | Mobile           | Console                        | Observações                                          |
| ----------------------------------- | ------- | ---------------- | ------------------------------ | ---------------------------------------------------- |
| L01 Banner de cookies               | ok      | parcial (iframe) | limpo                          | banner cobre a faixa final; foco chega por último    |
| L02 Cabeçalho e menu mobile         | parcial | ok (iframe)      | limpo                          | âncora "Como Funciona" fora da home falha            |
| L03 Home                            | parcial | ok (iframe)      | limpo                          | Novidades × catálogo; faixa vazia                    |
| L04 Rodapé e newsletter             | parcial | não testado      | limpo                          | 4c não testado (sem e-mail); rolagem herdada         |
| L05 Catálogo e filtros              | parcial | ok (iframe)      | limpo                          | dados de teste; contadores; filtros só pelo nome     |
| L06 Página de produto               | parcial | ok (iframe)      | limpo                          | sem h1; /produtos/123 → 500                          |
| L07 Drawer e toasts                 | ok      | parcial (iframe) | limpo                          | "2 items"; toasts sem ícone; banner cobre o rodapé   |
| L08 Páginas legais e cookies        | parcial | ok (iframe)      | limpo                          | dessincronia banner × bloco; texto de retenção       |
| L09 Newsletter (confirmar/cancelar) | parcial | não testado      | limpo                          | 3 e 5 não testados (sem e-mail)                      |
| L10 404, rotas antigas, SEO         | parcial | —                | limpo                          | SEO medido no DEPLOY (Helmet não insere tags em dev) |
| L11 Robustez                        | parcial | —                | erro esperado do ErrorBoundary | cota de storage derruba a app                        |

## 3. Problemas encontrados

### LOJA-01 — Erro de armazenamento ou carrinho corrompido derruba o site inteiro, e "Recarregar" não resolve

- Severidade: alta
- Tela/URL: L11 — http://localhost:5173/produtos — 1920 px
- Passos para reproduzir: (a) no console, `Storage.prototype.setItem = () => { throw new DOMException('cota','QuotaExceededError') }` e clique "Adicionar" num card; (b) `localStorage.setItem('cart','{}')` e F5; (c) na tela de erro, clique "Recarregar".
- Esperado: o carrinho ignora a falha de gravação (ou avisa com um toast) e o dado inválido é descartado na leitura.
- Obtido: (a) a aplicação inteira cai em "Algo deu errado", sem cabeçalho e sem toast; (b) a tela inteira mostra "Algo deu errado / Tivemos um problema ao carregar esta página. Já registramos o ocorrido. Tente recarregar."; (c) "Recarregar" volta para a mesma tela enquanto o `cart` corrompido continua no localStorage. O botão Voltar do navegador muda a URL e o cartão de erro continua.
- Evidência: console "[ErrorBoundary] TypeError: cart.reduce is not a function at CartProvider.jsx:67"; track-event (client_error) → 204. Só voltou ao normal com `localStorage.setItem('cart','[]')`.
- Arquivo provável: src/providers/CartProvider.jsx, src/utils/cart-storage.js, src/components/ErrorBoundary.jsx
- Veio de verificação dirigida? sim (L11 itens 4–7)

### LOJA-02 — Dados de teste e categorias sem nome aparecem para o público

- Severidade: alta
- Tela/URL: L03, L05, L06, L10 — /, /produtos, /produtos/teste, /sitemap.xml
- Passos para reproduzir: abra / e /produtos como visitante.
- Esperado: só produtos e categorias revisados ficam visíveis.
- Obtido:
  - produto "teste" (R$ 123,00, de R$ 180,00), na categoria "SEM NOME (RENOMEIE)";
  - categorias "c0da613b-a3fc-4814-b171-28ce45e4028e" e "a672e791-c5e9-42c2-9dfe-a1357b96652a" e a categoria "Sem nome (renomeie)" nos chips, na sidebar e nas pílulas dos cards ("Palavras Mágicas" e "Kit Festa Junina Completo" mostram o UUID);
  - na home, a faixa "sejam bem vindos ao natal" sem produtos e sem mensagem, com as setas visíveis em ≥768 px, e o link dela é `?categoria=teste`;
  - o sitemap lista 4 categorias com slug UUID, mais "teste", "sem-nome-renomeie" e o produto "teste".
- Evidência: `/api/home-sections` → seção {title:"sejam bem vindos ao natal", type:"category", products:0, link:"/produtos?categoria=teste"}; `/api/products` → 11 produtos, 9 categorias (2 com nome UUID).
- Arquivo provável: dados no banco (painel admin); handlers/home-sections.js, handlers/products.js e handlers/sitemap.xml.js não filtram categorias sem nome nem produtos de teste
- Veio de verificação dirigida? sim (L03, L05)

### LOJA-03 — "Novidades" mostra 8 produtos na home, mas o catálogo filtrado mostra 0

- Severidade: alta
- Tela/URL: L03 item 7 / L05 item 10 — /produtos?preset=novidades — 1920 px
- Passos para reproduzir: na home, clique "Mais produtos →" da faixa "Novidades" (ou abra /produtos?preset=novidades).
- Esperado: os mesmos produtos da faixa, ou pelo menos a faixa e o catálogo com o mesmo critério.
- Obtido: "0 produtos encontrados" e "Nenhum produto encontrado nessa categoria.", com "Todos" ativo e sem nenhum indicador de que um filtro "novidades (últimos 7 dias)" está aplicado. A mensagem culpa uma categoria que não foi escolhida. Clicar "Todos" traz os 11.
- Evidência: `/api/home-sections` → Novidades (new_arrivals) com 8 produtos; catálogo → 0.
- Arquivo provável: src/hooks/useProductFilters.js (preset novidades = 7 dias), handlers/home-sections.js (new_arrivals sem janela), src/components/ProductGrid.jsx (mensagem)
- Veio de verificação dirigida? sim

### LOJA-04 — No mobile, o banner de cookies cobre todo o rodapé do carrinho

- Severidade: média
- Tela/URL: L07 dirigida — /produtos — 390 px (iframe)
- Passos para reproduzir: remova as chaves lgpd_*, F5, adicione 1 item e abra o carrinho.
- Esperado: "Finalizar compra →" clicável, ou o banner acima do drawer sem cobrir as ações.
- Obtido: o banner (z-index 50, o mesmo do drawer) fica por cima de "Subtotal", "Finalizar compra →" e "Esvaziar carrinho". `elementFromPoint` no centro de "Finalizar compra →" devolve o banner.
- Evidência: screenshot do iframe de 390 px com o drawer "1 item" e o card "Sua privacidade importa" no rodapé.
- Arquivo provável: src/components/ConsentBanner.jsx, src/components/CartDrawer.jsx (z-index)
- Veio de verificação dirigida? sim (L07)

### LOJA-05 — Slug numérico em /produtos/<n> responde 500

- Severidade: média
- Tela/URL: L06 item 10 — /produtos/123
- Passos para reproduzir: abra /produtos/123.
- Esperado: 404 "Produto não encontrado".
- Obtido: "Não foi possível carregar o produto / Falha ao carregar produto: 500". API: `GET /api/product-details?slug=123` → 500 {code:"INTERNAL_ERROR", message:"Erro ao buscar detalhes do produto"}.
- Evidência: handlers/product-details.js trata "número puro" como id bigint ("Bigint id puro → busca por id"), mas os ids são UUID, então a consulta falha no Postgres.
- Arquivo provável: handlers/product-details.js
- Veio de verificação dirigida? não

### LOJA-06 — Os links da faixa de categoria e do sitemap não filtram o catálogo

- Severidade: média
- Tela/URL: L03 item 7, L05 dirigida, L10 item 6
- Passos para reproduzir: abra /produtos?categoria=festa-junina (formato do sitemap) e /produtos?categoria=teste (link da faixa "natal").
- Esperado: o catálogo filtrado pela categoria.
- Obtido: "11 produtos encontrados" (tudo). Só `?categoria=<Nome exato>` filtra (ex.: `?categoria=Festa%20Junina` → 1). Todas as 12 URLs de categoria do sitemap usam slug.
- Arquivo provável: src/hooks/useProductFilters.js, handlers/sitemap.xml.js, handlers/home-sections.js
- Veio de verificação dirigida? sim

### LOJA-07 — Filtros não ficam na URL; "Produtos" no cabeçalho limpa a URL mas mantém o filtro

- Severidade: média
- Tela/URL: L05 dirigida — /produtos?categoria=Festa%20Junina
- Passos para reproduzir: abra a URL acima e clique "Produtos" no cabeçalho.
- Esperado: catálogo completo, ou a URL refletindo o filtro.
- Obtido: a URL vira /produtos, mas a lista continua "1 produto encontrado". Chips, faixa de preço e ordenação não alteram a URL, então F5 ou um link compartilhado perdem a escolha. Em navegação interna (pushState), mudar só a query não refiltra.
- Arquivo provável: src/hooks/useProductFilters.js, src/pages/ProductsPage.jsx
- Veio de verificação dirigida? sim

### LOJA-08 — Páginas abertas pelo rodapé (e por links internos) mantêm a rolagem da página anterior

- Severidade: média
- Tela/URL: L04 item 2 — rodapé de / — 1920 px
- Passos para reproduzir: role até o fim de / e clique em "Produtos", "Downloads", "Privacidade", "Termos" ou "Início" no rodapé.
- Esperado: a página nova abre no topo (scrollY 0).
- Obtido: Produtos scrollY 2056, Downloads 358, Início 2652, Privacidade 2269, Termos 1433. Só "Minha conta" (/login, sem Shell) abriu em 0. Não existe scroll-to-top na troca de rota.
- Arquivo provável: src/App.jsx / src/components/Shell.jsx (falta um ScrollToTop)
- Veio de verificação dirigida? sim

### LOJA-09 — "Como Funciona" fora da home recarrega a página e não rola até a seção

- Severidade: média
- Tela/URL: L02 item 6 — /produtos
- Passos para reproduzir: em /produtos, clique "Como Funciona" no cabeçalho.
- Esperado: navegação interna até /#como-funciona, com a seção visível.
- Obtido: recarga completa (`navigation.type = "navigate"`, `window.__marca` undefined) e a página fica no topo (scrollY 0, H2 "Do clique à impressão em minutos" em top 1831). O mesmo acontece em /privacidade#cookies aberto pela URL ou depois do reload da revogação.
- Arquivo provável: src/components/Shell.jsx
- Veio de verificação dirigida? não

### LOJA-10 — A descrição de "Palavras Mágicas" anuncia um preço diferente do cobrado

- Severidade: média
- Tela/URL: L05 item 7 — /produtos e /produtos/palavras-magicas
- Obtido: a descrição diz "Palavras Mágicas Apenas: R$ 4,00", e o preço do card e da página é R$ 5,00.
- Arquivo provável: dado do produto (painel admin)
- Veio de verificação dirigida? não

### LOJA-11 — O link de avaliação do e-mail pós-compra cai na 404

- Severidade: média
- Tela/URL: L06/L10 — /avaliar?order=teste
- Obtido: "404 Página não encontrada". A rota /avaliar não existe.
- Arquivo provável: src/App.jsx e o template do e-mail pós-compra (services/ ou handlers/cron-email-jobs)
- Veio de verificação dirigida? sim

### LOJA-12 — Política de Privacidade: retenção e compartilhamento divergem do comportamento real

- Severidade: média
- Tela/URL: L08 dirigida — /privacidade
- Obtido: a seção 6 diz "Eventos de analytics: 24 meses, depois agregados", mas a rotina de limpeza apaga com 180 dias (segundo o mapa). A seção 5 ("Com quem compartilhamos") não cita a Vercel, embora o Vercel Analytics (`va.vercel-scripts.com/v1/script.debug.js`) carregue antes de qualquer decisão no banner (em dev ele não envia nada).
- Arquivo provável: src/pages/LegalPages.jsx, src/main.jsx (VercelAnalytics fora do consentimento)
- Veio de verificação dirigida? sim

### LOJA-13 — Contatos e redes do rodapé são fictícios ou genéricos, e o domínio da marca não existe

- Severidade: média
- Tela/URL: L04 itens 3 e 4, L10
- Obtido:
  - WhatsApp "(11) 99999-9999" → wa.me/5511999999999;
  - Facebook → https://www.facebook.com e Pinterest → https://www.pinterest.com (genéricos);
  - `profamarciarcardoso.com.br` não resolve DNS, mas é usado no JSON-LD (Organization, WebSite e SearchAction) e na linha "Sitemap:" do robots.txt.
- Arquivo provável: src/components/Shell.jsx (rodapé), src/pages/HomePage.jsx (JSON-LD), public/robots.txt
- Veio de verificação dirigida? sim

### LOJA-14 — Os contadores da sidebar ignoram a faixa de preço

- Severidade: média
- Tela/URL: L05 dirigida — /produtos
- Obtido: com "Até R$ 25", a lista mostra "3 produtos encontrados" e a sidebar continua "Todos 11", "Formatura 2"…
- Arquivo provável: src/components/ProductSidebar.jsx, src/hooks/useProductFilters.js
- Veio de verificação dirigida? sim

### LOJA-15 — Erros de rede mostram "Failed to fetch" cru, sem botão de tentar de novo

- Severidade: média
- Tela/URL: L11 itens 1–3, L09 item 7
- Obtido:
  - home: "Failed to fetch" no lugar das faixas;
  - catálogo: "Erro ao carregar produtos. Tente novamente." + "Failed to fetch", sem botão;
  - produto: "Não foi possível carregar o produto / Failed to fetch";
  - /desinscrever?token=…: só "Failed to fetch", sem formulário nem botão de nova tentativa.
- Arquivo provável: src/pages/HomePage.jsx, src/components/ProductGrid.jsx, src/pages/ProductDetailsPage.jsx, src/pages/SubscriptionPages.jsx
- Veio de verificação dirigida? sim

### LOJA-16 — Banner de cookies e bloco de preferências dessincronizados na mesma aba

- Severidade: média
- Tela/URL: L08 item 6 — /privacidade
- Obtido: (b) "Aceitar todos" no bloco #cookies grava "granted", mas o banner inferior continua visível até o F5; (c) "Apenas essenciais" no banner grava "denied", mas o bloco continua "Situação atual: Você ainda não escolheu." até o F5.
- Arquivo provável: src/components/ConsentPreferences.jsx, src/components/ConsentBanner.jsx, src/utils/consent.js (sem evento compartilhado)
- Veio de verificação dirigida? sim

### LOJA-17 — Os toasts de sucesso e de aviso aparecem sem ícone

- Severidade: baixa
- Tela/URL: L05 item 8, L06 item 8, L07
- Obtido: `getComputedStyle(i,'::before').content` → "none" em "success: Produto adicionado ao carrinho." e em "warning: Este produto já está no carrinho.".
- Arquivo provável: public/fonts/bootstrap-icons-subset.css (faltam bi-check-circle-fill e bi-exclamation-circle-fill), scripts/icons-usados.json
- Veio de verificação dirigida? sim (L07)

### LOJA-18 — Carrinho com plural em inglês ("2 items")

- Severidade: baixa
- Tela/URL: L07 item 4
- Obtido: h2 "2 items"; com 1, "1 item".
- Arquivo provável: src/components/CartDrawer.jsx
- Veio de verificação dirigida? não

### LOJA-19 — O card do catálogo não mostra o preço original riscado

- Severidade: baixa
- Tela/URL: L05 dirigida — /produtos
- Obtido: kit-volta-as-aulas (64,90), painel-formatura-infantil (89,90) e teste (180,00) têm `originalPrice` e aparecem riscados só na página do produto. O card mostra apenas o preço atual.
- Arquivo provável: src/components/ProductGrid.jsx
- Veio de verificação dirigida? sim

### LOJA-20 — A página do produto não tem `<h1>`

- Severidade: baixa
- Tela/URL: L06 item 1
- Obtido: `document.querySelectorAll('h1').length === 0`; o nome do produto fica num H2.
- Arquivo provável: src/pages/ProductDetailsPage.jsx
- Veio de verificação dirigida? não

### LOJA-21 — Sugestões por mesma categoria usam o título "Quem comprou este levou também"

- Severidade: baixa
- Tela/URL: L06 item 7 — /produtos/pascoa-pedagogica (strategy "same_category")
- Arquivo provável: src/components/CrossSellSection.jsx
- Veio de verificação dirigida? sim

### LOJA-22 — Textos inconsistentes na página do produto

- Severidade: baixa
- Tela/URL: L06 dirigida
- Obtido: "PDF em alta resolução" aparece 2 vezes na mesma coluna (texto fixo e benefício padrão), e "Download imediato após pagamento" (benefício) convive com "download imediato após aprovação" (texto fixo). Os kits não listam o próprio conteúdo.
- Arquivo provável: src/components/ProductBenefits.jsx, src/pages/ProductDetailsPage.jsx
- Veio de verificação dirigida? sim

### LOJA-23 — ?q= não filtra, mas o JSON-LD declara busca em /produtos?q=

- Severidade: baixa
- Tela/URL: L05 dirigida — /produtos?q=junina → 11 produtos
- Arquivo provável: src/pages/HomePage.jsx (SearchAction), src/hooks/useProductFilters.js
- Veio de verificação dirigida? sim

### LOJA-24 — SEO técnico (medido no DEPLOY): description duplicada, JSON-LD da home vazando, og:image SVG

- Severidade: baixa
- Tela/URL: L10 item 4 — https://atelie-escolar-joao-luis-c.vercel.app (código do SEO.jsx igual ao local)
- Obtido:
  - `meta[name=description]` aparece 2 vezes em todas as páginas (index.html + Helmet);
  - o JSON-LD Organization/WebSite da home continua no `<head>` depois de navegar para /produtos, /termos etc. (em carga direta de /termos são 0 scripts);
  - `og:image` padrão = /favicon.svg, que as redes sociais não aceitam.
- Arquivo provável: index.html, src/components/SEO.jsx
- Veio de verificação dirigida? sim

### LOJA-25 — Sitemap e robots.txt conflitantes

- Severidade: baixa
- Tela/URL: L10 itens 5 e 6 — /robots.txt, http://localhost:3000/sitemap.xml
- Obtido: o sitemap inclui /login, que o robots.txt bloqueia; a linha "Sitemap:" do robots.txt aponta para profamarciarcardoso.com.br (não resolve); o soft-404 responde 200 em qualquer rota inexistente (LOCAL e DEPLOY).
- Arquivo provável: handlers/sitemap.xml.js, public/robots.txt, vercel.json
- Veio de verificação dirigida? sim

### LOJA-26 — /admin sem meta robots noindex e sem título próprio

- Severidade: baixa
- Tela/URL: L10 item 3 — /admin
- Obtido: document.title "Ateliê da Escola", sem `meta[name=robots]`. O robots.txt bloqueia, mas a página não se declara noindex.
- Arquivo provável: src/pages/AdminPage.jsx
- Veio de verificação dirigida? não

### LOJA-27 — Em dev, o Helmet congela o título e não insere canonical/robots/og/JSON-LD

- Severidade: baixa (só em desenvolvimento)
- Tela/URL: L06/L10 — http://localhost:5173/produtos/kit-volta-as-aulas
- Obtido: depois de carregar o produto, o título fica "Carregando produto · Ateliê da Escola" e o `<head>` não tem nenhuma tag do Helmet (canonical, robots, og:*, JSON-LD). No DEPLOY (mesmo React 19.2.4) tudo aparece. Provável combinação de StrictMode com react-helmet-async 2.0.5. Isso impede validar o SEO em LOCAL.
- Arquivo provável: src/main.jsx, package.json (react-helmet-async)
- Veio de verificação dirigida? não

### LOJA-28 — Menu mobile: Esc e clique fora não fecham, e o menu persiste depois de redimensionar e por baixo do carrinho

- Severidade: baixa
- Tela/URL: L02 dirigida — 390 px
- Obtido: Esc não fecha; clique fora não fecha; sem `aria-controls`; alargar para ≥1024 e voltar → o menu reaparece aberto; abrir e fechar o carrinho com o menu aberto → o menu continua aberto por baixo.
- Arquivo provável: src/components/Shell.jsx
- Veio de verificação dirigida? sim

### LOJA-29 — Painel de filtros mobile: Esc não fecha, sem role=dialog, foco em elementos fora da tela

- Severidade: baixa
- Tela/URL: L05 item 12 — /produtos — 390 px
- Obtido: Esc não fecha; o painel não tem `role="dialog"`; com o painel FECHADO há 22 elementos focáveis fora da tela que o Tab percorre.
- Arquivo provável: src/pages/ProductsPage.jsx, src/components/ProductSidebar.jsx
- Veio de verificação dirigida? sim

### LOJA-30 — Acessibilidade do banner de cookies

- Severidade: baixa
- Tela/URL: L01 dirigida
- Obtido: o banner não tem `aria-modal`; não existe "Pular para o conteúdo"; no Tab, os botões do banner são o 56º e o 57º de 59 focáveis, depois do rodapé inteiro; em 390 px os botões têm 34 e 32 px de altura (< 44). Em 390 px, o banner cobre "Privacidade", "Termos" e a nota da newsletter na faixa final.
- Arquivo provável: src/components/ConsentBanner.jsx
- Veio de verificação dirigida? sim

### LOJA-31 — Hierarquia de títulos da home pula níveis

- Severidade: baixa
- Tela/URL: L03 item 8 — section#como-funciona
- Obtido: os 4 passos ficam em `<h5>` logo depois do `<h2>`, sem h3/h4.
- Arquivo provável: src/pages/HomePage.jsx
- Veio de verificação dirigida? sim

### LOJA-32 — Cabeçalhos recolhíveis da sidebar sem aria-expanded

- Severidade: baixa
- Tela/URL: L05 item 6
- Obtido: "CATEGORIAS" e "FAIXA DE PREÇO" recolhem (o chevron gira), mas o botão não expõe `aria-expanded`.
- Arquivo provável: src/components/ProductSidebar.jsx
- Veio de verificação dirigida? não

### LOJA-33 — A mensagem de lista vazia culpa a categoria em qualquer filtro

- Severidade: baixa
- Tela/URL: L05 item 6 / L03 item 7
- Obtido: "Nenhum produto encontrado nessa categoria." aparece também com o preset novidades ou só com a faixa de preço.
- Arquivo provável: src/components/ProductGrid.jsx
- Veio de verificação dirigida? sim

### LOJA-34 — Números de prova social incoerentes

- Severidade: baixa
- Tela/URL: L03 item 9
- Obtido: H2 "Mais de 16.000 professoras nos seguem nas redes" × cartão "4,2k seguidores".
- Arquivo provável: src/pages/HomePage.jsx, src/components/SocialProofStrip.jsx
- Veio de verificação dirigida? sim

### LOJA-35 — Descadastro com token inventado afirma "Pronto, você foi removido"

- Severidade: baixa (observação de desenho anti-enumeração)
- Tela/URL: L09 item 6 — /desinscrever?token=abc → 200 e "✓ CANCELADO / Pronto, você foi removido"
- Arquivo provável: handlers/unsubscribe.js, src/pages/SubscriptionPages.jsx
- Veio de verificação dirigida? sim

### LOJA-36 — Contraste baixo do texto "©" no rodapé

- Severidade: cosmética
- Tela/URL: L04 dirigida — 12 px #64748b sobre #020617 (≈ 4,2:1, abaixo de 4,5:1)
- Arquivo provável: src/components/Shell.jsx
- Veio de verificação dirigida? sim

## 4. Pontos a confirmar (seção 6): resultado de cada um

1. "Adicionar ao carrinho" abre o drawer? **Não.** Só mostra o toast e incrementa o badge, como o código prevê. A documentação está errada.
2. O banner tem "Personalizar"? **Não**: só "Apenas essenciais" e "Aceitar todos". A revogação só existe em /privacidade#cookies, sem link no banner, no cabeçalho ou no rodapé.
3. /login é só de cliente? Aberto apenas para leitura via cabeçalho e rodapé. Não houve login. (A leitura detalhada fica para o 1B.)
4. /painel-acesso-privado-atelie e /admin-login caem na 404? **Sim**, sem formulário (código novo presente).
5. O visitante nunca vê "Painel admin" nem "Meus produtos"? **Confirmado**: o cabeçalho só tem Início, Como Funciona, Contato, Produtos, carrinho e Entrar.

## 5. Itens NÃO testados e por quê

| Tela/item                                          | Motivo                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| L04 6c, L09 3 e 5                                  | `{{EMAIL_DESCARTAVEL}}` não informado: nenhuma inscrição nem descadastro feitos                                                 |
| L04 6d                                             | proibido pelo prompt (limite de 5/min)                                                                                          |
| L01 7                                              | IDs de analytics ausentes neste ambiente (nenhum gtag/fbevents carregou com "granted")                                          |
| L06 vídeo, FAQ, depoimentos, benefício customizado | nenhum produto com essa característica                                                                                          |
| L07 duas abas                                      | opcional, não feito                                                                                                             |
| L11 8                                              | requer DevTools (falha de chunk e rede lenta)                                                                                   |
| Larguras reais 390/1440                            | a janela do Chrome está maximizada e ignora o redimensionamento; mobile emulado em iframe de 390 px e desktop medido em 1920 px |
| SEO em LOCAL                                       | o Helmet não insere tags em dev (LOJA-27); itens conferidos no DEPLOY                                                           |

## 6. Dados [TESTE] criados

| Dado                                                                                    | Onde                   | Identificador                                                                 | Apagado? | Observação                                                                                                              |
| --------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| analytics_events (view_catalog, view_item, add_to_cart, remove_from_cart, client_error) | Supabase compartilhado | session_id 71dc5f61-855b-4e10-8999-09ba8e57e4e9, 2026-10-01 17:02–17:37 (BRT) | não      | purgar por session_id e horário                                                                                         |
| Newsletter                                                                              | —                      | —                                                                             | —        | nada enviado                                                                                                            |
| localStorage final                                                                      | navegador              | cart "[]", lgpd_consent "denied" (versão 2026-05-24)                          | —        | no DEPLOY o consentimento estava "granted" (decisão anterior do usuário); foi trocado para "denied", conforme a regra 7 |
| API local                                                                               | processo               | `node server.js` reiniciado com RATE_LIMIT_MAX=3000                           | —        | o processo original (PID 21196) foi encerrado                                                                           |

## 7. ESTADO PARA A PRÓXIMA ETAPA

- Telas já concluídas: L01–L11 (L04c e L09 3/5 pendentes por falta de e-mail)
- Versão observada: ATUAL
- Decisão do banner LGPD: Apenas essenciais (denied)
- Newsletter enviada? Não. Descadastro enviado? Não.
- session_id e horário de início: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · 17:02
- Último achado numerado (LOJA-nn): LOJA-36
