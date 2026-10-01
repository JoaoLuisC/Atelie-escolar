# Relatório de validação — BLOCO 2B (Admin: produtos e categorias)

Data: 2026-10-01 · Ambiente: http://localhost:5173 (LOCAL) · Versão: ATUAL · Larguras reais: desktop 1920 px (janela maximizada); mobile 390 px emulado em iframe · Contorno de cache ligado a partir de: A18 item 3 (18:52:03) até o fim de A22 · session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · Início/fim: 18:37 / 18:56

Arquivos de upload: gerados sinteticamente pelo agente, a pedido do humano ("gera"): `qa-imagem-ok.png` (283 kB, gradiente com o texto "TESTE QA"), `qa-imagem-grande.png` (641 kB) e `qa-arquivo.pdf` (1 página, "Arquivo de teste QA"). Nenhum dado pessoal. A extensão desconectou uma vez durante um upload e foi reconectada pelo humano; nada foi enviado naquela tentativa.

## 1. Resumo executivo

- Telas validadas: 8 de 8 · Problemas: crítica 2 · alta 3 · média 5 · baixa 6 · cosmética 1
- Os 5 mais graves:
  1. ADM-22: salvar um produto pelo wizard cria uma categoria NOVA cujo nome é o id da categoria escolhida, e o produto vai para ela. As 4 categorias-fantasma da base nasceram assim.
  2. ADM-23: editar e salvar um produto sem mudar nada apaga a 2ª imagem, o preço original, o tipo "kit", a FAQ, os benefícios e os depoimentos, **reativa o produto pausado** e cria outra categoria-fantasma.
  3. ADM-24: depois de salvar, a lista continua mostrando o dado velho (GET /admin/dashboard servido do cache do navegador, `private, max-age=3600`).
  4. ADM-25: no mobile, a coluna AÇÕES da Lista de produtos fica cortada (overflow hidden): não dá para editar, pausar ou excluir pelo celular.
  5. ADM-26: renomear uma categoria para um nome que já existe devolve 500 "Erro ao processar categorias do admin." em vez de 409.

## 2. Tabela de cobertura

| Tela                  | Desktop | Mobile                 | Console | Observações                              |
| --------------------- | ------- | ---------------------- | ------- | ---------------------------------------- |
| A15 Linha de base     | ok      | —                      | —       | 4 fantasmas antigas; vitrine salva       |
| A16 Lista de produtos | ok      | falha (ações cortadas) | limpo   | UUID na coluna CATEGORIA                 |
| A17 Wizard de produto | ok      | ok (modal cabe)        | limpo   | criação ok; categoria errada no servidor |
| A18 Cache do painel   | falha   | —                      | —       | lista desatualizada                      |
| A19 Ações e edição    | falha   | —                      | limpo   | edição destrói dados e reativa           |
| A20 Categorias        | parcial | ok                     | limpo   | 500 no rename duplicado                  |
| A21 Varredura mobile  | parcial | iframe 390             | —       | ADM-25                                   |
| A22 Limpeza           | ok      | —                      | —       | tudo igual à linha de base               |

## 3. Problemas encontrados

### ADM-22 — O wizard de produto cria uma categoria-fantasma com o id da categoria escolhida como nome

- Severidade: crítica (dado errado gravado em toda criação, poluindo loja, filtros e sitemap)
- Tela/URL: A17.16 / A18.2 — /admin, aba "Lista de produtos" (h1 "Produtos") — 1920 px
- Passos para reproduzir: 1. "Novo produto", categoria "Decoração de Sala" (id `d8f53f51-…`). 2. Complete e salve.
- Esperado: o produto gravado com categoryId `d8f53f51-…`.
- Obtido: o POST /admin/products enviou `categoryId: "d8f53f51-0074-41c5-b825-888237692d36"` (correto) e respondeu 201. No servidor, porém (`__resumo()`, sem cache), o produto ficou com `cat: d8f53f51-…` e `catId: 4655ad03-…`: foi criada a categoria **"d8f53f51-0074-41c5-b825-888237692d36"** (id `4655ad03-…`, cor padrão #9B5DE5) e o produto foi para ela. A linha da lista mostra o UUID na coluna CATEGORIA.
- Evidência: a linha de base já tinha 4 categorias com o mesmo padrão (nome = id de "Volta às Aulas", "Festa Junina", "Datas Comemorativas" e de outra fantasma). "Palavras Mágicas" e "Kit Festa Junina Completo" estão nelas, e por isso a loja mostra UUID nas pílulas e nos filtros (LOJA-02). A API de categorias recusa esse nome quando ele chega direto ("Nome inválido: não cole IDs no campo nome."), mas a rota de produtos o cria sem validar.
- Arquivo provável: handlers/admin/products.js (resolveCategoryId trata o id como nome e faz upsert por nome)
- Veio de verificação dirigida? sim (A18.2, ponto a confirmar 1)

### ADM-23 — Editar e salvar sem mudanças destrói dados do produto e o reativa

- Severidade: crítica
- Tela/URL: A19.3–A19.5 — /admin, "Lista de produtos", "Editar" no [TESTE-P2]
- Passos para reproduzir: 1. Produto criado com 2 imagens, preço original 19,90, tipo Kit, 1 benefício, 1 FAQ e 1 depoimento, depois pausado. 2. "Editar", avançar até o fim sem mudar nada, "Salvar Produto".
- Esperado: nenhuma alteração.
- Obtido: o modal de edição já abriu incompleto: categoria = o UUID fantasma, Mídia com 1 imagem, "Preço original" vazio, tipo "Produto individual" e o passo 4 vazio. O PUT 200 "Produto atualizado." gravou images 1, originalPrice null, productType "individual", faq 0, benefits 0, reviews 0, **active true** e categoryId `4655ad03-…`. O chip voltou para "Ativo" sozinho (produto pausado vendável de novo) e o servidor criou **outra** categoria-fantasma (nome "4655ad03-…", id `5f1ae4bd-…`).
- Evidência: tabela da seção 4.
- Arquivo provável: src/components/ProductWizard.jsx / product-wizard-form.js (mapeamento do produto para o formulário), handlers/admin/dashboard.js (campos da linha), handlers/admin/products.js
- Veio de verificação dirigida? sim (A19, ponto a confirmar 2)

### ADM-24 — Depois de salvar, a lista mostra dado velho (cache de 1 h)

- Severidade: alta
- Tela/URL: A18.1 — "Lista de produtos"
- Obtido: logo depois do toast "Produto criado.", a tabela continuava com "11 de 11 produto(s)" e sem a linha nova. O GET /admin/dashboard seguinte respondeu em 2 ms (cache do navegador). Com o contorno (`cache: 'no-store'`), a linha apareceu no topo com "12 de 12". O mesmo vale para categorias e para as mudanças de estado.
- Arquivo provável: handlers/admin/dashboard.js (Cache-Control "private, max-age=3600"), src/pages/AdminPage.jsx (refreshDashboard), src/services/admin-panel.js
- Veio de verificação dirigida? sim

### ADM-25 — Mobile: ações da Lista de produtos inacessíveis

- Severidade: alta
- Tela/URL: A21.1 — 390 px (iframe)
- Obtido: o contêiner da tabela tem scrollWidth 550 × clientWidth 307 e overflow-x hidden; o botão "Editar" fica em x=423, fora da tela. "Pausar" e a lixeira também ficam fora. A página não rola na horizontal.
- Arquivo provável: src/components/admin/tabs/ProductsTab.jsx
- Veio de verificação dirigida? sim (A21)

### ADM-26 — Renomear categoria para um nome existente dá 500

- Severidade: alta
- Tela/URL: A20.9 — "Categorias", Editar no [TESTE-P2]
- Obtido: PUT 500 {code:"INTERNAL_ERROR", message:"Erro ao processar categorias do admin."} e toast error com esse texto. Causa no log da API: `{"event":"handler_failed","module":"admin-categories","reason":"duplicate key value violates unique constraint \"categories_slug_key\""}`, ou seja, o handler não trata a violação de unicidade do slug no UPDATE. O esperado era 409 "Categoria já existe." (o POST com o mesmo nome dá 409 corretamente). A categoria de teste não mudou.
- Arquivo provável: handlers/admin/categories.js
- Veio de verificação dirigida? sim

### ADM-27 — Wizards fecham antes da resposta e perdem o que foi digitado

- Severidade: média
- Tela/URL: A20.4–A20.6 e A17.16
- Obtido: em "a" (400 "Nome deve ter entre 2 e 60 caracteres."), no UUID (400 "Nome inválido: não cole IDs no campo nome.") e no nome repetido (409 "Categoria já existe."), o modal fechou na hora (antes da resposta). O erro chega só como toast e o usuário precisa reabrir e redigitar. No produto (4 passos e uploads), uma falha no salvamento perderia todo o formulário.
- Arquivo provável: src/components/ModalWizard.jsx, src/components/CategoryWizard.jsx, src/components/ProductWizard.jsx
- Veio de verificação dirigida? sim

### ADM-28 — Não existe controle de "Destaque" para produtos

- Severidade: média
- Tela/URL: A16 dirigida / A17
- Obtido: a lista mostra o badge "Destaque" (Kit Volta às Aulas, Varal Alfabeto), mas nem a lista nem o wizard (4 passos) têm campo para marcar ou desmarcar. O POST sempre envia `featured:false`, e uma edição de um produto em destaque provavelmente remove o destaque.
- Arquivo provável: src/components/ProductWizard.jsx, src/components/admin/tabs/ProductsTab.jsx
- Veio de verificação dirigida? sim

### ADM-29 — Upload sem a etapa de confirmação e arquivos órfãos no Storage

- Severidade: média
- Tela/URL: A17.10–A17.13
- Obtido: o POST /admin/upload-url responde `confirmRequired:true`, mas nenhum POST de "confirm" sai depois do PUT (dirigida confirmada). O "Limpar" no PDF não apaga o arquivo já enviado (o 1º PDF ficou órfão), e o produto excluído deixa suas imagens e PDFs no Storage. O servidor anuncia maxSize 10 485 760 (10 MB) para imagens, enquanto o front limita a 500 kB.
- Arquivo provável: src/services/admin-panel.js, handlers/admin/upload-url.js
- Veio de verificação dirigida? sim

### ADM-30 — "Preço & Variações" sem nenhuma variação

- Severidade: média
- Tela/URL: A17.14
- Obtido: o passo 3 só tem "Preço (R$)", "Preço original" e "Tipo de produto" (Produto individual/Kit). Não há nenhum campo de variação, e um kit não lista os itens que contém.
- Arquivo provável: src/components/ProductWizard.jsx
- Veio de verificação dirigida? sim

### ADM-31 — Confirmação de exclusão de categoria não avisa as consequências

- Severidade: média
- Tela/URL: A20.10
- Obtido: o confirm diz só 'Excluir a categoria "[TESTE-P2] Categoria QA"?'. Não avisa que os produtos ficam "Sem categoria" nem que uma seção da vitrine some.
- Arquivo provável: src/pages/AdminPage.jsx / CategoriesTab.jsx
- Veio de verificação dirigida? sim

### ADM-32 — Enter no passo 1 avança e já valida o passo 2

- Severidade: baixa
- Tela/URL: A17.5
- Obtido: Enter no campo Nome submete o formulário: o wizard pula para "Mídia" e, na mesma ação, dispara o toast "Pelo menos uma imagem é obrigatória" antes de o usuário ver o passo. Enter no preço (passo 3) não faz nada.
- Arquivo provável: src/components/ModalWizard.jsx
- Veio de verificação dirigida? não

### ADM-33 — Lixeiras sem nome do item

- Severidade: baixa
- Tela/URL: A16 / A20 dirigidas
- Obtido: todas as lixeiras (produtos e categorias) têm aria-label "Excluir", sem o nome do produto ou da categoria.
- Arquivo provável: src/components/admin/tabs/ProductsTab.jsx, CategoriesTab.jsx
- Veio de verificação dirigida? sim

### ADM-34 — Textos do wizard

- Severidade: baixa
- Obtido: a dica diz 'Clique em "Escolher arquivo".', mas o botão é "Escolher"; o toast diz "Imagem 1 enviado." (concordância); há jargão interno para o usuário final ("regra B6" nos depoimentos; "Sobe pro Storage privado.").
- Arquivo provável: src/components/ProductWizard.jsx
- Veio de verificação dirigida? sim

### ADM-35 — Filtros e listas expõem as categorias-fantasma

- Severidade: baixa
- Tela/URL: A16 / A17.4
- Obtido: o select de categoria da lista e o #product-category do wizard (13 opções) trazem 4 nomes UUID, "teste" e "Sem nome (renomeie)", o que convida a escolher uma categoria-fantasma.
- Arquivo provável: dados + ProductsTab.jsx / ProductWizard.jsx
- Veio de verificação dirigida? sim

### ADM-36 — Cor e estrela da categoria sem efeito visível

- Severidade: baixa
- Tela/URL: A20 dirigida
- Obtido: as 4 categorias-fantasma e várias reais ficam com a cor padrão #9B5DE5. A loja (/produtos) não usa a cor da categoria nas pílulas nem a estrela ("Evidenciar na página de produtos") para ordenar os chips. A categoria de teste ficou inativa o tempo todo, então o efeito da estrela não pôde ser visto.
- Arquivo provável: src/components/ProductSidebar.jsx, src/pages/ProductsPage.jsx
- Veio de verificação dirigida? sim (parcial)

### ADM-37 — Ícones ausentes nos toasts de sucesso

- Severidade: cosmética
- Obtido: "Produto criado.", "Produto pausado." etc. com ícone vazio (mesma causa da LOJA-17).
- Arquivo provável: public/fonts/bootstrap-icons-subset.css

## 4. Campos perdidos na edição (A19)

| Campo          | Antes (criação, POST)                                                        | Depois (edição sem mudanças, PUT)            |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| Imagens        | 2                                                                            | 1                                            |
| Vídeos         | 0                                                                            | 0                                            |
| Preço original | 19,90                                                                        | null (vazio)                                 |
| Tipo           | kit                                                                          | individual                                   |
| FAQ            | 1                                                                            | 0                                            |
| Benefícios     | 1                                                                            | 0                                            |
| Depoimentos    | 1                                                                            | 0                                            |
| Ativo          | pausado (false)                                                              | **true** (reativado)                         |
| Destaque       | false                                                                        | false                                        |
| Categoria      | escolhida "Decoração de Sala" (`d8f53f51…`), gravada na fantasma `4655ad03…` | fantasma nova `5f1ae4bd…` (nome "4655ad03…") |
| PDF (download) | product_files/…d2df0d-qa-arquivo.pdf                                         | mantido                                      |

## 5. Pontos a confirmar: resultado de cada um

1. O produto fica numa categoria NOVA com nome em formato UUID (o id da escolhida): **confirmado** (ADM-22).
2. Editar e salvar sem mudanças **não** preserva os dados (ADM-23).
3. A lista **não** atualiza sozinha; só com o contorno de cache (ADM-24).
4. Modais (produto e categoria): Esc, X, véu e "Cancelar" fecham sem requisição; o foco vai para o X e fica preso (Tab/Shift+Tab); a rolagem trava (overflow hidden); o foco volta a "Novo produto". Confirmado.

## 6. Itens NÃO testados e por quê

| Item                                       | Motivo                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Envio de vídeo                             | o roteiro manda não enviar                                                                                                           |
| Efeito da estrela da categoria na loja     | a categoria de teste foi desativada logo após criar (regra de segurança)                                                             |
| PUT para o Storage pela ferramenta de rede | o rastreamento de rede reiniciou com a reconexão da extensão; o upload foi confirmado pelo GET 200 do arquivo público e pelos toasts |
| Larguras reais 390/1440                    | janela maximizada; iframe de 390 px                                                                                                  |

## 7. Dados [TESTE] criados

| Dado                                                      | Aba                    | Identificador                                          | Apagado?                | Observação                                                                         |
| --------------------------------------------------------- | ---------------------- | ------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| Produto "[TESTE-P2] Produto QA 1839"                      | Lista de produtos      | 55392863-def7-49b9-a803-abb4f29b5854                   | sim (18:55, DELETE 200) | ativo de 18:51:47 a 18:52:22 e de 18:52:46 a 18:52:56 (vendável nesses intervalos) |
| Categoria "[TESTE-P2] Categoria QA"                       | Categorias             | a4be312a-4832-415d-a10c-631fbffd27bb, #9B5DE5, estrela | sim                     | ativa de ~18:54:00 a 18:54:13                                                      |
| Categoria-fantasma "d8f53f51-0074-41c5-b825-888237692d36" | Categorias             | id 4655ad03-e7cc-478a-8005-e4dd4a5666c0, #9B5DE5       | sim                     | criada pelo bug (ADM-22)                                                           |
| Categoria-fantasma "4655ad03-e7cc-478a-8005-e4dd4a5666c0" | Categorias             | id 5f1ae4bd-8172-4ce7-8ae6-a450e306bda0, #9B5DE5       | sim                     | criada pelo bug (ADM-23)                                                           |
| Imagem                                                    | Storage product_images | 1790891411629-e46563-qa-imagem-ok.png                  | **não**                 | órfã: apagar no Storage                                                            |
| Imagem                                                    | Storage product_images | 1790891432638-c7fe74-qa-imagem-ok.png                  | **não**                 | órfã                                                                               |
| PDF                                                       | Storage product_files  | 1790891454117-f4ad8f-qa-arquivo.pdf                    | **não**                 | órfão (removido com "Limpar" só no formulário)                                     |
| PDF                                                       | Storage product_files  | 1790891474447-d2df0d-qa-arquivo.pdf                    | **não**                 | órfão                                                                              |

Contagens: antes 11 produtos / 12 categorias; depois 11 / 12 (idênticas à linha de base). Home pública sem seções [TESTE] ou UUID novas.

## 8. ESTADO PARA A PRÓXIMA ETAPA

- Versão: ATUAL · 2FA: não exigido
- Logins admin: nenhum novo neste bloco (último 18:36:25, do 2A)
- Sessão admin ativa? **sim**
- Pendências de limpeza: 4 arquivos no Storage (seção 7)
- session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9
- Último ADM-nn: ADM-37
