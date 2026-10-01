# Relatório de validação — BLOCO 3B (Cruzados II)

Data: 2026-10-01 · Ambiente: http://localhost:5173 (LOCAL) · Versão: ATUAL · Contorno de cache do painel: ligado desde 19:56:16 (herdado do 3A) até a limpeza · Larguras reais: aba 1920 px; LOJA num iframe de 1272 px (390 px para o menu mobile) sobreposto à mesma aba · session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · Início/fim: 20:03 / 20:13

Ordem ajustada para poupar logins do humano: X06.1, X07, X08 e X09 (sem senha) primeiro; depois X06.2–X06.9 e X10 (logins); X11 por último. Todas as senhas foram digitadas pelo humano. X06.10 ("Revogar acesso") e X08.4 ("Salvar vitrine") não foram feitos (exigem autorização escrita).

## 1. Resumo executivo

- Fluxos validados: 6 de 6 (X06 sem o item 10; X08 sem o item 4) · Problemas: crítica 1 · alta 2 · média 2 · baixa 1 · cosmética 0
- Os 5 mais graves:
  1. CROSS-11: escolher qualquer categoria no wizard (inclusive uma recém-criada) grava o produto numa categoria-fantasma com o id como nome. A categoria escolhida nunca aparece na loja, e a estrela "Evidenciar" não tem efeito.
  2. CROSS-12: as categorias-fantasma não podem ser editadas nem desativadas: salvar dá "Nome inválido: não cole IDs no campo nome." (o nome que o próprio servidor criou).
  3. CROSS-13: na loja, sem F5, "Painel admin" abre o painel inteiro com os números depois que a sessão admin já foi encerrada; só a aba Pedidos detecta.
  4. CROSS-14: o catálogo em cache mostra um produto pausado em "mais vendidos" durante ~5 min.
  5. CROSS-15: o admin logado como cliente consegue adicionar ao carrinho, mas não tem botão de carrinho.

## 2. Tabela de cobertura

| Fluxo                    | Lado LOJA | Lado ADMIN | Mobile           | Console | Observações                |
| ------------------------ | --------- | ---------- | ---------------- | ------- | -------------------------- |
| X06 Sessões e papel      | ok        | ok         | ok (menu 390 px) | limpo   | item 10 não autorizado     |
| X07 Categoria × loja     | falha     | falha      | —                | limpo   | fantasma; não editável     |
| X08 Vitrine × home       | ok        | ok         | —                | limpo   | sem salvar                 |
| X09 Números              | ok        | ok         | —                | —       | tudo bate                  |
| X10 Histórico do cliente | ok        | ok         | —                | —       | cliente sem pedidos        |
| X11 Limpeza              | ok        | ok         | —                | —       | tudo igual à linha de base |

## 3. Tabela de sessões (X06)

| Estado                                        | Cabeçalho da loja                                                                                                   | /admin mostra                                                                    | Esperado   | Bate?              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- | ------------------ |
| Só sessão admin (de /admin)                   | "Entrar", carrinho, sem "Painel admin"                                                                              | painel                                                                           | igual      | sim                |
| Admin logado em /login (role admin)           | "Painel admin" (âmbar), "Conta", "Sair"; sem carrinho e sem "Meus produtos"; no menu de 390 px "Painel admin" âmbar | —                                                                                | igual      | sim                |
| Cliente admin + sessão admin → "Painel admin" | —                                                                                                                   | painel direto                                                                    | igual      | sim                |
| "Encerrar sessão" no painel                   | cliente continua (session true)                                                                                     | formulário na mesma /admin                                                       | igual      | sim                |
| F5 na loja depois disso                       | "Painel admin", "Conta", "Sair"                                                                                     | "Painel admin" → formulário em /admin (não /painel-acesso-privado-atelie)        | igual      | sim                |
| Admin encerrado, loja SEM F5 → "Painel admin" | —                                                                                                                   | **painel inteiro com Dashboard e números**; só ao clicar Pedidos vira formulário | formulário | **não** (CROSS-13) |
| "Sair" na loja                                | visitante ("Entrar")                                                                                                | painel continua (admin true)                                                     | igual      | sim                |
| qa.descartavel em /login                      | "Meus produtos", carrinho, "Conta", "Sair"; sem "Painel admin"                                                      | —                                                                                | igual      | sim                |

## 4. Tabela de números (X09, X10)

| Métrica                                    | Onde                                        | Valor                               | Deveria ser igual a                                                | Bate?                                                    |
| ------------------------------------------ | ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Produtos ativos                            | Dashboard / Lista "Ativos" / /api/products  | 11 / 11 / 11                        | iguais (teste pausado)                                             | sim                                                      |
| Pedidos aprovados                          | Dashboard / Pedidos "Aprovado"              | 10 / 10                             | iguais                                                             | sim                                                      |
| Pendentes                                  | Dashboard / Pedidos "Pendente"              | 3 / 3                               | iguais                                                             | sim                                                      |
| Clientes cadastrados                       | Dashboard / Usuários                        | 10 / 10                             | Recorrentes 3 + Novos 4 + 3 sem compra = 10                        | sim                                                      |
| Receita total × Bruto acumulado            | Dashboard / Faturamento                     | R$ 556,60 / R$ 556,60               | iguais                                                             | sim (2A)                                                 |
| Faturamento do mês                         | Dashboard / Comparativo / Faturamento       | R$ 0,00 em todos                    | iguais                                                             | sim                                                      |
| Rosca "Total" × Receita total              | Dashboard                                   | R$ 468,90 × R$ 556,60               | top 5 categorias; diferença = demais categorias (inclui fantasmas) | explicado, sem indicação na tela                         |
| Mais vendidos (loja) × VENDAS (Desempenho) | /produtos?preset=mais-vendidos × Desempenho | mesma ordem (2,2,2,2,2,1,1,1,1,0,0) | iguais                                                             | sim (com o produto pausado aparecendo na loja, CROSS-14) |
| Histórico do cliente de teste              | /downloads × Pedidos × Usuários             | 0 pedidos / 0 / COMPRAS 0, R$ 0,00  | iguais                                                             | sim                                                      |

## 5. Problemas encontrados

### CROSS-11 — A categoria escolhida no wizard nunca é a gravada (inclusive categoria nova)

- Severidade: crítica
- Fluxo/URL: X07.1–X07.4 — ADMIN Categorias e Lista de produtos; LOJA /produtos
- Passos para reproduzir: 1. Criar "[TESTE-P3] Categoria Cruzada" com "★ Evidenciar" (201, id 4eb543a0-…). 2. Editar o produto e escolher essa categoria → salvar.
- Obtido: o PUT enviou categoryId 4eb543a0-… e respondeu 200. O servidor criou a categoria "4eb543a0-4076-4ae3-9480-d7cef9370974" (id e7d9bcd0-…) e pôs o produto nela. `/api/products` → category "4eb543a0-…". Na loja, nenhum chip ou item de sidebar "[TESTE-P3] Categoria Cruzada" (os filtros vêm das categorias dos produtos). A estrela e a cor não têm nenhum efeito visível.
- Arquivo provável: handlers/admin/products.js (resolveCategoryId) — ADM-22/CROSS-01
- Veio de verificação dirigida? sim (ponto a confirmar 4)

### CROSS-12 — Categorias-fantasma não podem ser editadas nem desativadas

- Severidade: alta
- Fluxo/URL: X07.5 — ADMIN Categorias, "Editar" na fantasma "4eb543a0-…"
- Obtido: ao desmarcar "Categoria ativa" e salvar → toast error "Nome inválido: não cole IDs no campo nome.", e o cartão continua "· Ativa". O nome foi gerado pelo próprio servidor, mas a validação o recusa em qualquer edição: pela interface, a única saída é excluir (e os produtos ficam sem categoria).
- Arquivo provável: handlers/admin/categories.js, validation/admin.schemas.js
- Veio de verificação dirigida? não

### CROSS-13 — "Painel admin" sem F5 abre o painel com dados depois do logout admin

- Severidade: alta
- Fluxo/URL: X06.7 — LOJA (iframe) carregada com sessão admin; ADMIN "Encerrar sessão"; LOJA "Painel admin" sem recarregar
- Obtido: `/admin/session` → false, mas a aba da loja mostrou o painel completo (h1 "Dashboard", números) sem toast. Só ao clicar "Pedidos" apareceu o formulário. Mesmo mecanismo de ADM-01/ADM-41 (cache HTTP de 1 h dos relatórios e estado de sessão em memória).
- Arquivo provável: src/providers/AuthProvider.jsx, src/pages/AdminPage.jsx, handlers/admin/dashboard.js (Cache-Control)
- Veio de verificação dirigida? sim

### CROSS-14 — Produto pausado aparece no catálogo em cache

- Severidade: média
- Fluxo/URL: X09.6 — LOJA /produtos?preset=mais-vendidos às ~20:05
- Obtido: o [TESTE-P3], pausado às 20:04:37, ainda aparecia na listagem da loja (resposta de /api/products em cache por até 5 min), com "Adicionar". O __get sem cache já não o trazia.
- Arquivo provável: handlers/products.js (Cache-Control) — CROSS-04/CROSS-07
- Veio de verificação dirigida? sim (ponto a confirmar 5)

### CROSS-15 — Admin logado como cliente adiciona ao carrinho sem poder abri-lo

- Severidade: média
- Fluxo/URL: X06.3 — LOJA /produtos logado como admin em /login
- Obtido: o cabeçalho não tem o ícone do carrinho nem "Meus produtos", mas o "Adicionar" dos cards continua funcionando (na 2ª tentativa veio o toast "Este produto já está no carrinho.", mostrando que o item foi gravado no estado do carrinho) e não há caminho para abrir o carrinho. Também ficou evidente que limpar `localStorage.cart` não limpa o estado em memória do carrinho até recarregar.
- Arquivo provável: src/components/Shell.jsx, src/providers/CartProvider.jsx
- Veio de verificação dirigida? sim

### CROSS-16 — /conta oferece "Excluir minha conta" ao admin

- Severidade: baixa (risco)
- Fluxo/URL: X06.2 — LOJA /conta logado com a conta admin
- Obtido: o card rosa "Excluir minha conta" aparece também para o perfil admin (não clicado). Excluir a conta do único admin pela loja trancaria o painel.
- Arquivo provável: src/pages/CustomerAuthPage.jsx, handlers/me-delete-account.js
- Veio de verificação dirigida? sim

## 6. Pontos a confirmar: resultado de cada um

1. Entrar só em /admin faz aparecer "Painel admin" na loja? **Não** (confirmado).
2. Admin em /login mostra "Painel admin"; sem sessão admin, o clique leva ao formulário em /admin (não à rota antiga)? **Sim**.
3. "Encerrar sessão" mantém o cliente e "Sair" mantém o admin? **Sim, nos dois sentidos.**
4. O produto fica na categoria escolhida no wizard? **Não** (CROSS-11).
5. Tempo até aparecer na loja (LOCAL): imediato via API sem cache; até ~5 min na carga normal (CROSS-14 e seção 4 do 3A).

## 7. Itens NÃO testados e por quê

| Item                                                                   | Motivo                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| X06.10 "Revogar acesso" na conta descartável                           | sem autorização escrita                                 |
| X08.4 "Salvar vitrine"                                                 | sem autorização escrita                                 |
| X07.5 parte da loja (rótulo "BANNER" de produto com categoria inativa) | a categoria-fantasma não pôde ser desativada (CROSS-12) |
| X10.2 comparar status e total de pedidos                               | o cliente de teste não tem pedidos                      |

## 8. Dados [TESTE] criados e limpeza

| Dado                                            | Onde                           | Identificador                                                              | Apagado?         | Observação                                                      |
| ----------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| Produto [TESTE-P3] Produto Cruzado 1957 (do 3A) | produtos                       | 17296a97-ed0a-4b97-b649-f899d77fceb4                                       | sim (DELETE 200) | ativo de 20:03:43 a 20:04:37 neste bloco                        |
| [TESTE-P3] Categoria Cruzada                    | categorias                     | 4eb543a0-4076-4ae3-9480-d7cef9370974, #9B5DE5, estrela                     | sim              | ativa de 20:03:30 até a limpeza (sem produtos visíveis na loja) |
| Fantasma "208f1934-…" (do 3A)                   | categorias                     | 53b743e0-ad8a-4e3d-9080-3bb21d6f164f                                       | sim              | —                                                               |
| Fantasma "4eb543a0-…"                           | categorias                     | e7d9bcd0-d66c-48c7-b00e-345e3f7ef06c                                       | sim              | criada pelo bug em X07.2                                        |
| Cupons TESTE-QA-P3-01 / -02 (do 3A)             | cupons                         | —                                                                          | sim              | inativos desde 20:01                                            |
| Storage (do 3A)                                 | product_images / product_files | 1790895454238-ec69fe-qa-imagem-ok.png; 1790895471047-38e7fd-qa-arquivo.pdf | **não**          | órfãos                                                          |
| Papel de qa.descartavel                         | usuários                       | —                                                                          | —                | "Suporte" recusado (400); continua CUSTOMER; não revogada       |
| ORD                                             | —                              | nenhum                                                                     | —                | —                                                               |

Contagens finais: 11 produtos, 12 categorias, 0 cupons, summary idêntico ao X00; /api/products total 11; home sem títulos [TESTE] ou UUID novos; vitrine idêntica à original.

## 9. ESTADO PARA A PRÓXIMA ETAPA

- Fluxos concluídos: X06–X11 (sem X06.10 e X08.4)
- Logins neste bloco: admin em /login 20:07:43; admin em /admin 20:09:05 e 20:09:53; qa.descartavel ~20:11; qa.cliente.teste ~20:12
- Sessões ativas: nenhuma (admin false e cliente false às 20:13:09)
- Dados [TESTE-P3] vivos: nenhum no banco; 2 arquivos órfãos no Storage
- Pendências de SQL: nenhuma (sem ORD)
- Contorno de cache desligado · session_id 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · Último CROSS-nn: CROSS-16
