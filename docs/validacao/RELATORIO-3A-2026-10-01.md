# Relatório de validação — BLOCO 3A (Cruzados I)

Data: 2026-10-01 · Ambiente: http://localhost:5173 (LOCAL) · Versão: ATUAL · Contorno de cache do painel: ligado desde 19:56:16 · Larguras reais: aba ADMIN 1920 px; LOJA num iframe de 1272 px sobreposto à mesma aba (a 2ª aba do Chrome ficava "hidden" e com scripts estrangulados) · session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · Início/fim: 19:55 / 20:03

Login admin às 19:55:44 (senha digitada pelo humano; 2FA desligado). Arquivos de upload sintéticos (os mesmos do 2B). **X05 (pedido pendente) não foi executado:** a resposta do humano ("ok") não autorizou claramente a criação do pedido.

## 1. Resumo executivo

- Fluxos validados: 5 de 6 (X05 não autorizado) · Problemas: crítica 2 · alta 2 · média 4 · baixa 2 · cosmética 0
- Os 5 mais graves:
  1. CROSS-01: o produto criado na "Festa Junina" foi para a categoria-fantasma "7c48c087-…": não entra na seção "Festa Junina" da home nem no filtro da categoria, e a loja mostra o UUID na pílula.
  2. CROSS-02: a edição para mudar só o preço apagou o preço original, a FAQ e o benefício, e criou mais uma categoria-fantasma.
  3. CROSS-03: o preço muda no admin, mas o carrinho e o checkout continuam com o preço antigo (R$ 9,90 × R$ 12,90 no servidor). O cupom é calculado sobre o preço do navegador, então a tela mostra R$ 35,82 enquanto o create-payment cobraria R$ 38,52, sem aviso.
  4. CROSS-04: produto pausado continua no carrinho sem aviso, e a página dele continua acessível com "Adicionar" numa recarga normal (cache de 5 min).
  5. CROSS-05: cupom aplicado com carrinho vazio ("−R$ 0,00"), e o mínimo exibido como "R$ 1000.00".

## 2. Tabela de cobertura

| Fluxo                     | Lado LOJA                          | Lado ADMIN                   | Console | Observações                   |
| ------------------------- | ---------------------------------- | ---------------------------- | ------- | ----------------------------- |
| X00 Linha de base         | ok                                 | ok                           | limpo   | igual ao fim do 2B/2C         |
| X01 Produto criado → loja | parcial (cache)                    | ok                           | limpo   | categoria-fantasma            |
| X02 Pausar/ativar         | ok (API) / falha (página em cache) | ok                           | limpo   | carrinho sem aviso            |
| X03 Preço alterado        | falha                              | falha (edição destrói dados) | limpo   | preço velho no carrinho       |
| X04 Cupom × checkout      | parcial                            | ok                           | limpo   | prévia com preço do navegador |
| X05 Pedido de teste       | não testado                        | não testado                  | —       | sem autorização               |

## 3. Tabela de números (X00)

| Métrica                        | Onde             | Antes  | Depois                           | Deveria ser | Bate? |
| ------------------------------ | ---------------- | ------ | -------------------------------- | ----------- | ----- |
| summary.totalProducts          | /admin/dashboard | 11     | 12 (com o [TESTE-P3] pausado)    | +1          | sim   |
| activeProducts                 | /admin/dashboard | 11     | 11 (teste pausado)               | —           | sim   |
| pendingOrders / approvedOrders | /admin/dashboard | 3 / 10 | 3 / 10                           | sem X05     | sim   |
| revenueTotal                   | /admin/dashboard | 556,60 | 556,60                           | —           | sim   |
| Cupons                         | /admin/coupons   | 0      | 2 (inativos)                     | +2          | sim   |
| /api/products total            | loja             | 11     | 12 com o teste ativo; 11 pausado | —           | sim   |

## 4. Tempos de propagação (admin → loja, LOCAL)

| Mudança                       | Via __get (sem cache)                | Recarga forçada | Recarga normal                                                                                                |
| ----------------------------- | ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| Produto criado (19:58:13)     | imediato (total 12)                  | —               | /produtos às ~19:59 ainda com 11 e sem o produto (cache de 5 min de /api/products); "?preset=novidades" com 0 |
| Produto pausado (19:59:07)    | imediato (some; product-details 404) | —               | a página /produtos/<slug> ainda mostra o produto com "Adicionar" (product-details em cache)                   |
| Preço 9,90 → 12,90 (19:59:36) | imediato (12.9)                      | —               | a página do produto ainda mostra R$ 9,90 com R$ 19,90 riscado, FAQ e benefício                                |
| Home "Novidades"              | imediato                             | —               | o card do teste apareceu na faixa "Novidades" na 1ª carga da home                                             |

## 5. Problemas encontrados

### CROSS-01 — Produto criado numa categoria real vai para a categoria-fantasma

- Severidade: crítica
- Fluxo/URL: X01 — ADMIN "Lista de produtos"; LOJA /produtos, /produtos/teste-p3-produto-cruzado-1957, /
- Passos para reproduzir: wizard com categoria "Festa Junina" (id 7c48c087-…) → salvar.
- Esperado: catId 7c48c087-…, card no filtro "Festa Junina" e na seção "Festa Junina" da home.
- Obtido: o POST enviou categoryId "7c48c087-…" (correto). No servidor, o produto ficou em cat "7c48c087-…" / catId 208f1934-…, que é a categoria-fantasma já existente cujo **nome** é o id de Festa Junina. Como ela já existia, desta vez não foi criada outra. API pública: category "7c48c087-0225-40af-bfc7-05d2ada5c638". Na loja, a pílula da página do produto mostra "7C48C087-0225-40AF-BFC7-05D2ADA5C638", o filtro "Festa Junina" mostra 1 produto (sem o teste) e a seção "Festa Junina" da home não traz o produto (só "Novidades" traz).
- Arquivo provável: handlers/admin/products.js (resolveCategoryId) — mesmo defeito do ADM-22
- Veio de verificação dirigida? sim

### CROSS-02 — Editar só o preço apaga dados e cria outra categoria-fantasma

- Severidade: crítica
- Fluxo/URL: X03.1 — ADMIN "Editar" no [TESTE-P3]
- Obtido: o wizard abriu com a categoria "7c48c087-…", o preço original vazio (era 19,90) e o passo 4 vazio (havia 1 benefício e 1 FAQ). PUT 200 com price 12.9, originalPrice null, faq 0, benefits 0, active true e categoryId 208f1934-…. O servidor criou a categoria "208f1934-faa7-481d-8942-1923922891d2" (id 53b743e0-…, #9B5DE5) e moveu o produto para ela. product-details passou a responder price 12.9, originalPrice 0, faq 0 e benefits 0, com category "208f1934-…".
- Arquivo provável: src/components/ProductWizard.jsx, handlers/admin/products.js — mesmo defeito do ADM-23
- Veio de verificação dirigida? sim

### CROSS-03 — Carrinho e checkout com preço antigo; cupom calculado sobre o preço do navegador

- Severidade: alta (o valor cobrado diverge do mostrado)
- Fluxo/URL: X03.3–X03.4 e X04.2 — LOJA drawer e /checkout
- Obtido: depois do preço ir para 12,90 no servidor, o drawer mostra "[TESTE-P3] … R$ 9,90 / Subtotal R$ 9,90" (localStorage.cart price 9.9) e o checkout "Total R$ 9,90". Com Banner Quadrilha (29,90) + TESTE-QA-P3-01, `POST /validate-coupon` recebeu do navegador `items[].price` 9.9 e respondeu subtotal 39.8, discount 3.98 e total 35.82; a tela mostrou "Subtotal R$ 39,80 / Desconto −R$ 3,98 / Total R$ 35,82". O handlers/create-payment.js relê o preço do banco (linhas 205–232), então cobraria (12,90 + 29,90) − 10% = R$ 38,52. A tela não avisa a mudança de preço.
- Arquivo provável: src/providers/CartProvider.jsx (preço gravado no carrinho), handlers/validate-coupon.js (usa price e categoryId enviados pelo cliente), src/pages/CheckoutPage.jsx
- Veio de verificação dirigida? sim

### CROSS-04 — Produto pausado continua no carrinho e acessível pela página em cache

- Severidade: alta
- Fluxo/URL: X02.4–X02.6
- Obtido: depois de pausar (19:59:07), `/api/products` sem cache já não traz o produto e `/api/product-details?slug=…` → 404 "Produto não encontrado". Mas /produtos/<slug> numa carga normal ainda renderizou o produto (preço, descrição) com "Adicionar" (product-details em cache por até 5 min), e o drawer manteve "[TESTE-P3] … R$ 9,90", com "Finalizar compra", sem nenhum aviso de indisponibilidade.
- Arquivo provável: src/providers/CartProvider.jsx, src/components/CartDrawer.jsx, handlers/product-details.js (Cache-Control)
- Veio de verificação dirigida? sim

### CROSS-05 — Cupom aceito com carrinho vazio e mínimo em formato "1000.00"

- Severidade: média
- Fluxo/URL: X04.6 e X04.9 — LOJA /checkout
- Obtido: carrinho vazio + TESTE-QA-P3-01 ativo → o botão "Aplicar" fica habilitado → 200 {subtotal 0, discount 0, total 0} → bloco "CUPOM APLICADO TESTE-QA-P3-01 · −R$ 0,00". TESTE-QA-P3-02 → 422 COUPON_MINIMUM_NOT_MET "Pedido mínimo para este cupom é R$ 1000.00." (ponto decimal, sem milhar), enquanto o admin mostra "Mín. R$ 1.000,00".
- Arquivo provável: lib/coupons.js / handlers/validate-coupon.js (mensagem), src/components/CouponField.jsx
- Veio de verificação dirigida? sim

### CROSS-06 — Remover item com cupom deixa "Desconto aplicado" velho na tela

- Severidade: média
- Fluxo/URL: X04.5 — LOJA /checkout
- Obtido: com o -01 aplicado (Total R$ 35,82), ao remover um item o bloco verde some e o total vai a "R$ 29,90" sem desconto. O painel reaparece com o código "TESTE-QA-P3-01" preenchido e a linha "Desconto aplicado: R$ 3,98", que já não vale.
- Arquivo provável: src/components/CouponField.jsx, src/pages/CheckoutPage.jsx
- Veio de verificação dirigida? sim

### CROSS-07 — Mudanças do admin demoram até 5 min para aparecer na loja, sem indicação

- Severidade: média
- Fluxo/URL: X01–X03 (seção 4)
- Obtido: produto novo ausente do catálogo e de "?preset=novidades" na carga normal; produto pausado e preço antigo visíveis na página do produto. Em LOCAL não há CDN; no deploy a demora tende a ser maior (s-maxage + stale-while-revalidate=3600).
- Arquivo provável: handlers/products.js, handlers/product-details.js, handlers/home-sections.js (Cache-Control)
- Veio de verificação dirigida? sim

### CROSS-08 — "Remover" do cupom e prévia: OK, mas o cupom ignora a categoria real

- Severidade: média (potencial)
- Fluxo/URL: X04.2
- Obtido: o validate-coupon recebe `categoryId` de cada item enviado pelo navegador (para o [TESTE-P3]: 208f1934-…, o id da categoria-fantasma). Cupons restritos por categoria seriam avaliados com o dado do cliente e com as categorias-fantasma (não testado com cupom restrito).
- Arquivo provável: handlers/validate-coupon.js, lib/coupons.js
- Veio de verificação dirigida? não

### CROSS-09 — Benefício sem ícone renderiza um <i> vazio

- Severidade: baixa
- Fluxo/URL: X01.5 — /produtos/<slug>
- Obtido: o benefício "PDF para imprimir" (sem ícone) aparece com um `<i>` de content "none" (espaço de ícone vazio). A FAQ abre com a 1ª pergunta expandida (ok).
- Arquivo provável: src/components/ProductBenefits.jsx
- Veio de verificação dirigida? não

### CROSS-10 — Cupom: formato do mínimo e de usos

- Severidade: baixa
- Obtido: cartão do -02: "0 uso(s)" (sem limite) × "0/5 usos" no -01; "Sem expiração" ok; "Mín. R$ 1.000,00" no admin × "R$ 1000.00" na loja (CROSS-05).
- Arquivo provável: src/components/admin/tabs/CouponsTab.jsx

## 6. Pontos a confirmar: resultado de cada um

1. Tempo até aparecer na loja (LOCAL): imediato via API sem cache; na carga normal até ~5 min (catálogo, produto e preço). Ver seção 4.
2. O produto criado fica na categoria escolhida? **Não**: vai para a categoria-fantasma (CROSS-01).
3. Carrinho e checkout usam o preço gravado no navegador? **Sim** (CROSS-03).
4. A prévia do cupom não consome uso? **Confirmado** (0/5 depois da prévia). O pedido pendente consome? Não testado (X05).

## 7. Itens NÃO testados e por quê

| Item                                                                             | Motivo                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| X05 inteiro (pedido pendente, Pedidos/Dashboard/Funil, uso do cupom, /downloads) | sem autorização escrita para criar o pedido |
| X04.8 cupom expirado                                                             | opcional; não feito                         |
| Tempos no DEPLOY                                                                 | bloco rodado em LOCAL                       |

## 8. Dados [TESTE] criados

| Dado                                                      | Onde                   | Identificador                                                               | Apagado?                      | Observação                                                                                                    |
| --------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Produto "[TESTE-P3] Produto Cruzado 1957"                 | produtos               | id 17296a97-ed0a-4b97-b649-f899d77fceb4, slug teste-p3-produto-cruzado-1957 | não (PAUSADO, para o 3B)      | ativo de 19:58:13 a 19:59:07 e de 19:59:30 a 20:01:57; categoria atual: fantasma "208f1934-…" (id 53b743e0-…) |
| Categoria-fantasma "208f1934-faa7-481d-8942-1923922891d2" | categorias             | id 53b743e0-ad8a-4e3d-9080-3bb21d6f164f, #9B5DE5, ativa                     | não                           | criada pela edição (CROSS-02); apagar no 3B depois do produto                                                 |
| Cupom TESTE-QA-P3-01                                      | cupons                 | 10%, limite 5                                                               | não (INATIVO desde 20:01:30)  | ativo de 20:00:13 a 20:01:30                                                                                  |
| Cupom TESTE-QA-P3-02                                      | cupons                 | 10%, mín. 1000                                                              | não (INATIVO desde ~20:01:50) | ativo de 20:00:13 a ~20:01:50                                                                                 |
| Imagem                                                    | Storage product_images | 1790895454238-ec69fe-qa-imagem-ok.png                                       | não                           | órfã após a exclusão                                                                                          |
| PDF                                                       | Storage product_files  | 1790895471047-38e7fd-qa-arquivo.pdf                                         | não                           | idem                                                                                                          |
| ORD                                                       | —                      | nenhum                                                                      | —                             | X05 não executado                                                                                             |

A categoria-fantasma antiga "7c48c087-…" (id 208f1934-…) já existia na linha de base e NÃO deve ser apagada.

## 9. ESTADO PARA A PRÓXIMA ETAPA (o humano cola no bloco 3B)

- Fluxos concluídos: X00–X04 (X05 não autorizado)
- Linha de base X00: summary {totalOrders 14, approved 10, pending 3, totalProducts 11, activeProducts 11, totalUsers 10, revenueMonth 0, revenueTotal 556.60}; 11 produtos; 12 categorias (4 fantasmas antigas: 48495eaa… id 18dc2f35…, 7c48c087… id 208f1934…, a672e791… id 70817907…, c0da613b… id 48495eaa…; mais Atividades Pedagógicas, Datas Comemorativas, Decoração de Sala, Festa Junina 7c48c087…, Formatura, Sem nome (renomeie), teste 227b287d…, Volta às Aulas c0da613b…); 0 cupons; 14 pedidos (3 pendentes); vitrine [Mais vendidos, "sejam bem vindos ao natal" (teste), Festa Junina, Novidades]
- <categoria real>: Festa Junina, id 7c48c087-0225-40af-bfc7-05d2ada5c638
- Dados [TESTE-P3]: produto 17296a97-… (slug teste-p3-produto-cruzado-1957), PAUSADO, categoria fantasma nova 53b743e0-… (nome "208f1934-…"); cupons -01 e -02 INATIVOS; Storage: product_images/1790895454238-ec69fe-qa-imagem-ok.png e product_files/1790895471047-38e7fd-qa-arquivo.pdf
- ORD: nenhum
- Versão ATUAL; 2FA não exigido; login admin 19:55:44; sessão admin ativa: **sim**; sessão de cliente: não
- session_id 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · início 19:55 · Último CROSS-nn: CROSS-10
