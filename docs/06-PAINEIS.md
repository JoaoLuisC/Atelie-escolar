# 06 — Painéis

Três telas para quem administra ou vende. Este documento diz o que cada aba mostra, de onde vêm os
dados e o que dá para fazer. Os fluxos de login, troca de senha e cadastro de produto estão em
[05-FLUXOS](./05-FLUXOS.md); os endpoints, em [09-API](./09-API.md).

| Rota           | Quem                                                | Tela                                   | Abas                       |
| -------------- | --------------------------------------------------- | -------------------------------------- | -------------------------- |
| `/admin`       | admin / master                                      | **Administração da plataforma**        | 4                          |
| `/professores` | professora **dona da loja** (`settings.storeOwner`) | **Painel da loja**                     | 12 (10 itens no menu)      |
| `/professores` | outro professor (perfil `SELLER` que não é a dona)  | **Área do professor** (`TeachersPage`) | página única + Minha conta |

As abas de cada versão estão em `PANEL_TABS` (`src/components/admin/utils/tabs.js`), os nomes em
`TAB_LABELS`, e o menu lateral em `AdminLayout.jsx`. Esconder a aba no front é conveniência: o
servidor aplica o mesmo corte (`ensureAdminSession` para a plataforma, `ensureStoreSession` para a
loja, `ensureRoleSession(['seller'])` para a área simples).

---

## Acesso

- `/admin` e `/professores` mostram, sem sessão, o mesmo formulário (`AdminLoginPage`), com o
  seletor **Sou cliente | Sou professor(a)** no topo (`LoginChooser.jsx`). Com sessão, o painel na
  mesma URL. "Encerrar sessão" volta ao formulário.
- Login por e-mail e senha para todos os papéis de staff; 2º fator (app autenticador, código por
  e-mail ou PIN) só para admin/master, quando ligado na aba Segurança.
- "Continuar com o Google" só para professor(a): volta em `/admin?oauth=staff` e
  `POST /api/admin/login-google` abre a sessão. Admin/master com Google recebem 403.
- Cookie `admin_session` HttpOnly, HMAC-SHA256, 8 h, `SameSite=Strict`, com papel, id da conta e a
  marca `storeOwner`.
- O papel decide o destino: admin/master → `/admin`; professor(a) → `/professores`. Em
  `/professores`, `TeacherHome` (`App.jsx`) mostra o Painel da loja para a dona e a área simples
  para os demais.
- Ao abrir e ao voltar pelo botão Voltar do navegador, o painel confere `GET /api/admin/session`;
  sessão encerrada ou 401 em qualquer API derruba o painel com o aviso "Sessão admin expirada".
- `/admin/usuarios` e `/admin/plataforma` redirecionam para `/admin`.
- Em desenvolvimento, `VITE_ALLOW_ADMIN_BYPASS=true` abre o painel sem login, com faixa amarela de
  aviso; as APIs continuam exigindo sessão (a flag não vale em produção).

Detalhes: [05-FLUXOS](./05-FLUXOS.md), seções 12, 13 e 14.

---

## O que vale para todas as telas

**"?" nos cards.** `InfoHint` (`src/components/admin/ui/InfoHint.jsx`) mostra a explicação do
card. `Card`, `StatCard` e os cards do Dashboard procuram o texto pelo título exato em
`src/constants/card-help.js`; card cujo título não está lá fica sem "?". Card novo: acrescentar a
explicação no arquivo.

**IA por botão.** Todo uso do Gemini é um botão que diz o que faz e só gera no clique
(`AiAssistPanel`). A sugestão aparece para revisar; nada entra no formulário sem clicar em
"Usar…", e nada é gravado sem salvar. A IA recebe só o que foi digitado e nomes, categorias e
preços do catálogo — nunca dado de cliente.

| Onde                         | Botão                           | O que sugere                                                         |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Cadastro de produto, passo 1 | Escrever descrição com IA       | Descrição de venda, benefícios e FAQ                                 |
| Cadastro de produto, passo 1 | Sugerir nome, Google e preço    | Nome, resumo para o Google e faixa de preço comparada ao catálogo    |
| Página da loja               | Sugerir textos da página com IA | Banner, vitrine e passo a passo (aparecem na prévia antes de salvar) |
| Vendas → Estudo de vendas    | Gerar nova análise              | Leitura dos números do período                                       |

Backend: `POST /api/admin/ai-assist` (`lib/ai-assist.js` sobre `lib/gemini.js`; tarefas
`productCopy`, `productSeo`, `homeCopy`; 30 pedidos/hora) e `POST /api/admin/sales-study`
(10/hora).

**Carga das abas.** As abas em `TABS_NEEDING_DASHBOARD` (Dashboard, Produtos, Desempenho,
Categorias, Faturamento, Comparativo, Vendas, Página da loja) recarregam
`GET /api/admin/dashboard` ao serem abertas e derivam os números no navegador
(`components/admin/utils/derive.js`); as demais buscam os próprios dados. Cada aba carrega sob
demanda (`lazy`). Erro de carga mostra a mensagem e "Tentar de novo".

**Sem cache.** Relatórios do painel respondem `private, no-store` (`CACHE_POLICIES.adminReport`):
com cache, o relatório continuava visível depois do logout.

**Auditoria.** Toda escrita (produtos, categorias, cupons, pedidos, usuários, settings, upload,
dona da loja, papel, Minha conta, limpeza de eventos) vai para `admin_audit_log`
(`lib/admin-audit.js`): e-mail de quem fez, ação, alvo, antes/depois com segredos redigidos e IP.
A tabela é append-only (triggers barram UPDATE/DELETE), com retenção de 18 meses. Leituras não
são registradas.

---

## Administração da plataforma (`/admin`)

Quatro abas, nesta ordem no menu: Professores e clientes, Usuários, Segurança, Minha conta. A
plataforma não tem tela de pedidos, produtos nem relatórios: isso é da dona da loja.

### Professores e clientes (`plataforma`)

`PlatformTab`. Quem vende, quem compra, quem administra a loja e os produtos sem dono.

- **Cards:** número de professores e de clientes, faturamento total e do mês (plataforma inteira).
- **Professores:** nome, e-mail, número de produtos, selo "Dona da loja". Ações: **Tornar dona da
  loja** (`PUT /api/admin/store-owner`; vale a partir do próximo login dela) e **Remover acesso**
  (volta a cliente; desabilitado para a dona).
- **Clientes:** os 12 mais recentes, com **Tornar professor(a)**.
- **Produtos sem professor:** produtos com `seller_id` vazio e um seletor para atribuir
  (`PUT /api/admin/product-seller`). Só a plataforma vê esses produtos: o painel da dona mostra
  apenas os dela.

Fonte: `GET /api/admin/dashboard`, `GET /api/admin/users`, `GET /api/admin/store-owner`.

### Usuários (`usuarios`)

`UsersTab`. Lista de `profiles` não privilegiados (admin/master ficam fora), com nome, e-mail,
papel, número de compras e total gasto (pedidos aprovados pelo e-mail). Busca por nome ou e-mail.

- **Trocar papel:** Cliente ou Vendedor (`PUT /api/admin/users`, gravado como `CUSTOMER`/`SELLER`;
  admin/master não são editáveis — 403).
- **Revogar acesso:** modal de confirmação → `DELETE /api/admin/users`: bane a conta no Supabase
  Auth e remove a linha de `profiles`; os pedidos ficam.

A exclusão LGPD feita pelo próprio cliente (com anonimização dos pedidos) é pela `/conta`
(`/api/me-delete-account`), não por aqui.

### Segurança (`seguranca`)

`SecurityTab`. O 2º fator do login da administração (setting `adminConfig`, uma configuração para
todos os admins).

- **Exigir 2FA no login** — só liga com app autenticador ou PIN cadastrado.
- **App autenticador (TOTP):** "Gerar" cria o segredo no navegador e mostra o QR code
  (`otpauth://`, biblioteca `qrcode` carregada sob demanda). O segredo novo só é salvo junto com um
  código de 6 dígitos gerado por ele.
- **PIN de recuperação:** 6+ dígitos, para emergência.
- **Aceitar código por e-mail:** código de 6 dígitos válido por 10 min. Só liga se houver app ou
  PIN como reserva — tela e servidor recusam o e-mail sozinho.
- Com o 2FA em vigor, qualquer mudança pede o código atual (TOTP ou PIN); sem ele, 403.
- Card de boas práticas.

O `GET` devolve só as flags (`has2FA`, `hasPin`), nunca os segredos; campo deixado em branco
preserva o segredo guardado; depois de salvar, a aba relê a configuração. O PUT é auditado com os
segredos redigidos. Professor(a), inclusive a dona da loja, não tem 2º fator.

### Minha conta (`conta`)

`AccountTab`, igual nas três telas — ver [Minha conta](#minha-conta) abaixo.

---

## Painel da loja (`/professores`, dona da loja)

Doze abas em dez itens de menu: Dashboard · Produtos (Lista de produtos, Desempenho, Categorias) ·
Pedidos · Cupons · Financeiro (Faturamento, Comparativo) · Vendas · Segmentos · Página da loja ·
Minha conta.

### Só os dados dela

O servidor recorta tudo pelo `seller_id` dela (`lib/seller-scope.js`):

- **Pedidos:** só os que têm material dela; dentro deles, só os itens dela, e o valor é a parte
  dela: `total_amount × (itens dela ÷ todos os itens)` — o pedido inteiro, com o desconto do cupom,
  quando só tem material dela.
- **Clientes:** só quem comprou dela.
- **Produtos:** só os dela; produto de outro professor responde 404.
- Dashboard, KPIs, Curva ABC, coorte, funil (pedidos e receita) e Estudo de vendas seguem o mesmo
  recorte. O Estudo de vendas dela fica em `settings.salesStudy:<id>`.
- Ficam da loja inteira: as visitas do funil (`analytics_events`), os segmentos da newsletter, as
  categorias, os cupons e a página da loja.

Admin/master não têm recorte, mas não usam essas abas pela interface.

### Dashboard (`dashboard`)

Visão de relance, só leitura.

- **Destaques:** faturamento do mês (com variação contra o mês anterior e minigráfico de 14 dias),
  ticket médio, pedidos aprovados (+ pendentes), clientes recorrentes.
- **Números menores:** receita total, produtos ativos, pendentes, clientes cadastrados.
- **12 meses:** LTV médio, taxa de recompra, ticket médio, LTV/CAC (mostra "—": não há custo de
  aquisição cadastrado, o endpoint devolve `cac: null`).
- **Gráficos:** receita dos últimos 7 dias, receita por categoria (top 5), Curva ABC resumida
  (top 8), mix de clientes novos × recorrentes.
- **Pedidos recentes:** os 8 últimos, com "Detalhes" (`OrderDetailModal`).
- **Vendas por região:** card reservado, sem dados (o checkout não pede o estado).

Fonte: `GET /api/admin/dashboard` + `GET /api/admin/kpis?window=12`.

### Produtos → Lista de produtos (`produtos`)

- **Descrição padrão de todos os produtos** (`ProductDefaultsCard`): título opcional + texto de até
  4.000 caracteres, exibido na página de cada produto logo abaixo da descrição própria; vazio não
  aparece. Setting `productDefaults`, servido ao público como `sharedDescription` em
  `GET /api/product-details`.
- **Lista:** nome, selo "Destaque", categoria, preço, ativo/pausado. Busca por nome, filtro por
  categoria e por status.
- **Ações:** Novo produto e Editar (`ProductWizard`, 4 passos: Básico → Mídia → Preço e tipo →
  Conversão, com os dois botões de IA no passo 1); Pausar/Ativar (`PATCH`); Excluir (exclusão
  real, com confirmação — prefira pausar).
- Produto criado aqui já nasce com o `seller_id` dela.

Fluxo completo e limites de upload: [05-FLUXOS](./05-FLUXOS.md), seção 15.

### Produtos → Desempenho (`prod-saida`)

Tabela por produto, ordenada por unidades vendidas: vendas, receita, downloads e taxa de download
(downloads ÷ vendas). Derivada de pedidos aprovados e `download_logs`.

### Produtos → Categorias (`categorias`)

Cards com cor, nome, selo destaque e status. Nova/Editar (`CategoryWizard`: nome, cor, destaque,
ativa; o slug sai do nome) e Excluir — a confirmação avisa quantos produtos ficam "Sem categoria" e
se alguma faixa da página inicial some. Fonte: `/api/admin/categories` (409 em slug repetido).

### Pedidos (`pedidos`)

Tabela com código, cliente, status de pagamento, data e total (a parte dela). Filtro: aprovado,
pendente, recusado, cancelado, falhou. "Detalhes" abre o `OrderDetailModal` com cliente, status,
total, data e itens.

Fonte: `GET /api/admin/orders?status=`. A API também aceita `PUT` (status, cliente, total) e
`DELETE` (exclusão real), ambos auditados, sem botão na tela. Pedido tem valor histórico: não
apagar.

### Cupons (`cupons`)

Cards com código, desconto (% ou valor fixo), status, validade, usos (`used_count`/`max_uses`) e
pedido mínimo. Novo/Editar (`CouponWizard`) e Excluir. Fonte: `/api/admin/coupons`. A validação de
uso acontece no checkout (`/api/validate-coupon` como prévia, `create-payment` de verdade). Cupom
vale para o pedido inteiro.

### Financeiro → Faturamento (`faturamento`)

Bruto acumulado, pedidos aprovados, ticket médio e barras do faturamento dos últimos 6 meses (só
pedidos aprovados).

### Financeiro → Comparativo (`comparativo`)

Mês atual × mês anterior: vendas, receita e ticket médio, com selo de variação (verde subindo,
vermelho caindo, cinza estável).

### Vendas (`vendas`)

`SalesHub`, com três subabas.

**Estudo de vendas** (`SalesStudyTab`). "Gerar nova análise" para 30, 60 ou 90 dias, comparados ao
período anterior de mesma duração. O servidor (`lib/sales-study.js`) calcula funil, receita,
pedidos, ticket, cupons, recompra, Curva ABC, categorias e origem das vendas e manda só esses
números ao Gemini (`GEMINI_API_KEY`, modelo `GEMINI_MODEL`, padrão `gemini-2.5-flash`), com a regra
de não inventar números. A resposta tem formato fixo: resumo, o que está bom, onde perde venda, o
que fazer e grau de confiança. Com menos de 3 pedidos aprovados e menos de 30 sessões no período,
a IA não é chamada ("dados insuficientes"). A última análise fica salva: abrir a aba não gasta
cota.

**Funil.** Sessões únicas por etapa (`view_catalog` → `view_item` → `add_to_cart` →
`begin_checkout` → `purchase`) com a conversão de cada passo; totais do período; atribuição por
`utm_source` (`direct` = sem UTM); período de 7, 30 ou 90 dias. Fonte: `GET /api/admin/funnel`.

**Curva ABC e coorte.**

- Curva ABC de produtos: ordenados por receita; A até 80 % acumulado, B até 95 %, C o resto. Filtro
  por período e categoria.
- Curva ABC de clientes: mesma classificação, com relação VIP / Recorrente / Eventual e e-mail
  mascarado.
- Coorte mensal: 12 meses, linhas = mês da primeira compra, colunas = M+0…M+11, % que voltou a
  comprar.
- Cada quadro tem "Como ler" e exportação CSV (`src/utils/csv-export.js`) — as únicas exportações
  do painel.

Fonte: `/api/admin/abc-products`, `/api/admin/abc-customers`, `/api/admin/cohort?months=12`.

### Segmentos (`segmentos`)

Base da newsletter (loja inteira): inscritos, confirmados, aguardando confirmação, descadastrados,
e o número de assinantes por tag — `cliente_ativo` (compra em até 90 dias), `cliente_recorrente`
(2+ pedidos), `cliente_vip` (5+ pedidos ou LTV acima de `VIP_LTV_THRESHOLD`, padrão R$ 300),
`inativo_30d`, `inativo_90d` (alvo de reativação), `inativo_180d` (não recebe mais e-mail) e
`categoria:<slug>`. Só contagens, sem lista de e-mails. Fonte: `GET /api/admin/segments`
(`lib/customer-segmentation.js`).

### Página da loja (`vitrine`)

Tudo o que aparece na home pública, em dois cartões.

**Textos e imagens da página** (`HomeContentEditor`, setting `homeContent`). Formulário à
esquerda e, ao lado, a prévia ao vivo (`HomePreview`): a própria `HomePage` renderizada com o
rascunho, numa tela de 1280 px reduzida e sem cliques (`inert`), com o selo "Alterações ainda não
salvas" ou "Igual ao que está no site".

- **Ordem das partes da página:** ligar, desligar e reordenar os blocos.
- **Banner principal (topo da página):** título (trecho entre `*asteriscos*` sai colorido),
  subtítulo, texto e link do botão, imagem opcional (até 1 MB, exibida inteira) e texto
  alternativo.
- **Faixa de palavras que desliza**, **Vitrine de produtos** (título e botão da área de
  produtos), **Passo a passo da compra**, **Depoimentos, números e redes sociais** (até 6
  depoimentos, 4 números, Instagram e TikTok) e **Como a loja aparece no Google** (título e
  descrição).
- Botão de IA "Sugerir textos da página com IA" (banner, vitrine e passo a passo).
- Campo vazio some da home; bloco vazio não aparece. "Restaurar textos padrão" volta ao texto
  original (só grava ao salvar). Textos padrão em `src/constants/home-content.js`.
- O servidor limpa o que é gravado (`lib/store-content.js`: só campos conhecidos, tetos de tamanho,
  links `https://` ou caminho interno). A home lê `GET /api/home-content` (cache de CDN de ~1 min).

**Faixas de produtos** (`VitrineTab`, setting `homeSections`). Lista ordenada de faixas: por
**Categoria**, **Mais vendidos** ou **Novidades** (no máximo uma de cada especial), com título e
limite de 4 a 20 produtos. Adicionar, remover, subir/descer e "Salvar vitrine" (grava tudo de uma
vez). A home lê `GET /api/home-sections`. A prévia mostra as faixas como estão salvas, não o
rascunho deste cartão.

### Minha conta (`conta`)

Ver [Minha conta](#minha-conta) abaixo.

---

## Área do professor (`/professores`, outros professores)

`TeachersPage`, página única para professor(a) que não é a dona da loja.

- **Cards:** meus produtos (quantos visíveis na loja), vendas e receita.
- **Meus produtos:** nome, categoria, preço, vendas e receita de cada um, com Pausar/Ativar
  (`PATCH /api/teacher/products`).
- **Novo material:** nome, descrição, link do arquivo, preço e categoria
  (`POST /api/teacher/products`; nasce ativo e com o `seller_id` dele).
- **Minha conta** no fim da página. Botão "Sair".

Fonte: `GET /api/teacher/dashboard` (só produtos com o `seller_id` dele). Não vê pedidos, clientes
nem relatórios da loja.

---

## Minha conta

`AccountTab` + `AccountSecurityCards`, a mesma nas três telas. Endpoint `/api/teacher/account`
(qualquer sessão de staff).

- **Seus dados:** nome editável (até 80 caracteres); e-mail, tipo de conta ("Professor(a) · dona
  da loja", "Professor(a)" ou "Administração da plataforma"), forma de login e data de criação.
- **Conta com senha:** "Trocar senha" (senha atual + nova duas vezes; 8+ caracteres com maiúscula,
  minúscula e número) com o link "Esqueci a senha atual (receber link por e-mail)", e "Trocar
  e-mail" (e-mail novo + senha atual; a troca só vale depois do clique no link enviado ao endereço
  novo).
- **Conta Google:** "Senha e e-mail" com "Enviar link para criar senha"; o e-mail é o da conta
  Google e não muda por aqui.

Fluxo e regras: [05-FLUXOS](./05-FLUXOS.md), seção 14.

---

## Componentes compartilhados

`src/components/admin/`:

| Arquivo                  | Uso                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `AdminLayout.jsx`        | Menu lateral (grupos Produtos e Financeiro), cabeçalho, "Ver loja", "Encerrar sessão"; menu móvel fecha com Esc |
| `OrderDetailModal.jsx`   | Detalhe do pedido (foco preso no modal, Esc fecha)                                                              |
| `ui/Card.jsx`            | Contêiner com título, subtítulo, ação e "?"                                                                     |
| `ui/StatCard.jsx`        | Número grande + rótulo + ícone + "?"                                                                            |
| `ui/InfoHint.jsx`        | O "?" e o balão de explicação                                                                                   |
| `ui/AiAssistPanel.jsx`   | Bloco de IA: descrição, botão, sugestão e erro                                                                  |
| `ui/BarList.jsx`         | Barras horizontais                                                                                              |
| `ui/StatusChip.jsx`      | Selo colorido de status de pagamento                                                                            |
| `ui/Button.jsx`          | Botões primary, secondary, ghost, danger                                                                        |
| `ui/EmptyState.jsx`      | Mensagem de lista vazia                                                                                         |
| `ui/useModalBehavior.js` | Foco e Esc dos modais                                                                                           |
| `utils/tabs.js`          | `TAB_LABELS`, `PANEL_TABS`, `TABS_NEEDING_DASHBOARD`                                                            |
| `utils/derive.js`        | Derivações do Dashboard, Financeiro e Desempenho                                                                |
| `utils/errors.js`        | Mensagens de erro em linguagem simples                                                                          |

Os wizards (`ProductWizard`, `CategoryWizard`) ficam em `src/components/` e só são baixados quando
abertos.

---

## Pendências dos painéis

Itens a resolver, também listados em [10-ROADMAP](./10-ROADMAP.md):

- **Área do professor não entrega arquivo.** O formulário pede "Link do arquivo para download"
  (campo de URL), mas o servidor só aceita arquivo do Storage da loja e o upload
  (`/api/admin/upload-url`) é só da dona. Na prática, outro professor não consegue cadastrar um
  material vendável. Também não tem fotos nem edição depois de criado.
- **Usuários × Professores e clientes.** As duas abas trocam papel; Usuários chama o professor de
  "Vendedor". A lista de Usuários esconde um e-mail fixo no código (`handlers/admin/users.js`).
- **Dona da loja sem 2º fator.** Ela vê pedidos e e-mails de clientes e entra só com senha ou
  Google.
- **Vendas por região** é um card vazio no Dashboard.
- **Sem visualização de `security_events`** no painel (consulta por SQL ou pelo webhook de alerta
  `SECURITY_ALERT_WEBHOOK_URL`); `/api/admin/cleanup-events` existe sem botão.
- A plataforma não tem tela de pedidos: em caso de suporte, a consulta é no Supabase.
