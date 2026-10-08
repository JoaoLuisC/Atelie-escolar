# Relatório de validação — fluxos de escrita ponta a ponta

Data: 2026-10-05 · Ambiente: http://localhost:5173 + API http://localhost:3000 (LOCAL, commit `0994018`) · Banco: **produção** (Supabase) · Mercado Pago: **sandbox** (vendedor de teste `3188331128`) · Navegador: Claude in Chrome · Login admin e login no MP feitos pelo humano.

Cadastro/login de cliente: validado pelo dono à parte (fora deste relatório).

## 1. Resumo

- Os achados críticos de 01/10 (CROSS-01 a CROSS-05) estão **corrigidos**: sem categoria-fantasma, editar preço não apaga dados, carrinho/checkout repreçam e removem produto pausado, cupom com mínimo formatado e "Aplicar" desabilitado com carrinho vazio.
- Compra paga ponta a ponta funcionou no sandbox, inclusive **sem webhook** (ngrok desligado): o `verify-payment` reconciliou e liberou o download.
- Problemas novos: alta 2 · média 3 · baixa 4.

## 2. Cobertura

| Fluxo                                                                                               | Resultado                                                                                          |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Categoria: criar, nome vazio, duplicada (case-insensitive), editar nome + destaque                  | ok                                                                                                 |
| Categoria: excluir com produto dentro (Cancelar / OK)                                               | ok — avisa "1 produto ficará Sem categoria"; loja aguenta produto sem categoria                    |
| Produto: wizard (validações de nome, imagem, preço 0), 2 imagens, PDF, benefício, FAQ, publicar     | ok — sem categoria-fantasma; caminho do PDF não vaza em `/api/products` nem `/api/product-details` |
| Produto: editar só o preço                                                                          | ok — galeria, FAQ, benefício, PDF, preço original e categoria preservados                          |
| Produto: busca na lista, pausar, ativar                                                             | ok — some/volta na API pública na hora; página do pausado mostra "Produto não encontrado"          |
| Produto: excluir                                                                                    | **falha** (ver ACH-04)                                                                             |
| Carrinho/checkout após mudança de preço e pausa                                                     | ok — aviso "preço mudou de R$ 9,90 para R$ 12,90"; item pausado sai com aviso                      |
| Cupom: 150% recusado, espaço removido do código, criar, mínimo, editar, aplicar, desativar, excluir | ok — total 12,90 − 1,29 = 11,61; MP cobrou 11,61                                                   |
| Checkout convidado → MP (sem pagar)                                                                 | ok                                                                                                 |
| Retorno `?status=failure` / `?status=pending`                                                       | ok — avisos com número do pedido; "Acompanhar pedido" leva a /downloads                            |
| /downloads com e-mail errado                                                                        | ok — "Pedido não encontrado", sem vazar dados                                                      |
| API de download: token ausente/curto/falso                                                          | ok — 400/401                                                                                       |
| Compra paga (sandbox, comprador de teste logado no MP)                                              | ok — Liberado, PDF baixado (396 bytes, URL assinada), 2º uso = `DOWNLOAD_TOKEN_USED`               |
| "Atualizar" após usar o link                                                                        | **falha** (ver ACH-01)                                                                             |
| Admin reflete a venda                                                                               | ok — aprovados 10→11, receita 556,60→569,50, Desempenho 1 download, Curva ABC, Comparativo         |
| Pedidos: lista, detalhe, filtro Pendente/Aprovado                                                   | ok (detalhe sem desconto: ACH-06)                                                                  |
| Vitrine: adicionar seção, renomear, reordenar, confirm Cancelar/OK, salvar, home, restaurar         | ok — restaurada idêntica ao snapshot                                                               |
| Usuários: busca, sem resultado                                                                      | ok                                                                                                 |
| Usuários: trocar papel                                                                              | **falha** (ver ACH-02)                                                                             |
| Usuários: revogar acesso                                                                            | ok — pedidos do usuário preservados (ver ACH-07)                                                   |
| Newsletter: vazio, inscrever, token inválido, descadastro por formulário                            | ok — mensagem neutra no descadastro                                                                |
| 404 e rotas antigas do painel                                                                       | ok — título "Página não encontrada"                                                                |
| Abas de leitura (Desempenho, Faturamento, Comparativo, Funil, Análise, Segmentos, Segurança)        | ok — números batem entre abas                                                                      |

## 3. Problemas

### ACH-01 — "Atualizar" não gera link novo depois do download (alta)

- Passos: comprar → Baixar (ok) → clicar "Atualizar" em /downloads → o botão "Baixar" continua com o mesmo token → 401 `DOWNLOAD_TOKEN_USED`.
- A página promete: "Se um download não abrir ou o link já tiver sido usado, clique em Atualizar acima para gerar novos links".
- Causa: `handlers/verify-payment.js:295-298` devolve os tokens existentes mesmo usados; nenhum handler reemite token. `mapTokenRows` (`:194`) descarta `used`, então a tela mostra "Baixar" ativo para um link morto.
- Efeito: quem pagou baixa uma única vez; download interrompido no navegador = chamado de suporte.

### ACH-02 — Trocar papel do usuário sempre falha com 500 (alta)

- Passos: Usuários → select "Vendedor" → toast "Erro ao carregar usuários do admin."; `PUT /api/admin/users` = 500.
- Log: `new row for relation "profiles" violates check constraint "check_valid_role"`.
- Causa: `validation/admin.schemas.js:236-241` faz `toLowerCase()` e `handlers/admin/users.js:115` grava `'seller'` cru; o banco usa papéis em maiúsculas (`'CUSTOMER'`). A constraint `check_valid_role` **não está em nenhuma migration do repo** — divergência entre produção e `supabase/migrations`.
- A mensagem de erro é o `errorMessage` genérico do recurso (`users.js:150`), que diz "carregar" para uma falha de gravação.

### ACH-03 — Abrir o pagamento consome o cupom mesmo sem pagar (média)

- Passos: cupom com limite 1 → aplicar → "Ir para pagamento" → fechar o MP sem pagar → cupom fica "1 uso · limite 1" e a API devolve `COUPON_EXHAUSTED`.
- Causa: decisão documentada em `handlers/create-payment.js:285-293` (reserva antes de criar a preferência), mas não há devolução do uso quando o pedido expira ou é abandonado. Cada "Cancelar e tentar de novo" também gasta um uso.

### ACH-04 — Excluir produto com pedidos dá 500 genérico (média)

- Passos: Lista de produtos → lixeira → OK → toast "Erro ao processar produtos do admin".
- Log: violação de `order_items_product_id_fkey`. Bloquear está certo (preserva histórico), mas deveria ser 409 com orientação ("tem pedidos — pause em vez de excluir"). Qualquer checkout aberto, mesmo abandonado, já impede a exclusão.

### ACH-05 — Página de produto sem `<title>`/description próprios (média)

- `/produtos/teste-produto-qa` ficou com `document.title = "Ateliê da Escola"` e sem `meta[name=description]`, enquanto /produtos, /termos e a 404 têm títulos próprios.

### ACH-06 — Detalhe do pedido não mostra cupom/desconto (baixa)

- Pedido com cupom: total R$ 11,61, item "1 × R$ 12,90", sem linha de desconto nem código do cupom.

### ACH-07 — "Revogar acesso" só apaga `profiles` (baixa, a confirmar)

- `handlers/admin/users.js:144` remove a linha de `profiles`; o usuário de `auth.users` continua. Verificar se ele ainda consegue entrar e com que papel.

### ACH-08 — Comparativo mostra "+100,0%" vindo de R$ 0 (baixa)

- Setembro R$ 0,00 → Outubro R$ 12,90 aparece como +100,0%; a variação a partir de zero é indefinida ("novo" ou "—" seria mais honesto).

### ACH-09 — Produto "teste" de R$ 123,00 ativo e público em produção (baixa)

- Pré-existente, categoria "Sem nome (renomeie)". Não foi alterado.

## 4. Observações de ambiente

- MP sandbox: pagar como convidado com cartão de teste falha ("A transação não aceita este meio de pagamento" / "Não foi possível processar"). É preciso logar no MP com o **comprador de teste**.
- Com o ngrok desligado, o `back_url` do MP cai em `ERR_NGROK_3200`; a liberação acontece mesmo assim pelo poll do `verify-payment` em /downloads.
- O comprador convidado vira usuário automaticamente após a aprovação (convite de senha).

## 5. O que ficou no banco de produção

| Dado                                                                     | Situação                                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Categoria `[TESTE] Categoria QA editada`                                 | excluída (8 categorias, igual ao início)                                                                                                                     |
| Cupom `TESTE-QA-01`                                                      | excluído (0 cupons)                                                                                                                                          |
| Vitrine                                                                  | restaurada idêntica                                                                                                                                          |
| Produto `[TESTE] Produto QA` (id `ff154d88-139f-4d88-809c-a0fbc6c79e40`) | **pausado**, não excluível pela UI (FK de `order_items`); 3 arquivos no Storage                                                                              |
| Pedidos de teste                                                         | 3: 2 pendentes (`teste-qa@example.com`, `teste-qa-pago@example.com`) e 1 aprovado de R$ 12,90 (`teste-qa-pago@example.com`) — **somam na receita do painel** |
| Usuário `Teste QA Pago`                                                  | perfil revogado; usuário de auth continua                                                                                                                    |
| Usuário `Cliente Teste QA`                                               | criado pelo dono no teste de cadastro — não alterado                                                                                                         |
| Newsletter `newsletter-qa@example.com`                                   | inscrição não confirmada                                                                                                                                     |

## 6. Correções (2026-10-08)

| Achado | Situação                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACH-01 | Corrigido — `verify-payment` reemite link usado/expirado de pedido aprovado (teto de 5 downloads por item via `download_logs`); a tela mostra "Limite de downloads atingido" em vez de um "Baixar" morto                                                                                  |
| ACH-02 | Corrigido no código — papel gravado em maiúsculas (`CUSTOMER`/`SELLER`); violação da constraint vira 400; mensagem de erro por método. Migration `20261008000001_profiles_role_check.sql` traz a `check_valid_role` para o repo — **conferir a definição de produção antes do `db push`** |
| ACH-03 | Corrigido, **depende da migration** `20261008000000_coupon_usage_release.sql`: devolve o uso após 2h sem pagamento (pg_cron) e reconta em pagamento tardio (trigger)                                                                                                                      |
| ACH-04 | Corrigido — FK de `order_items` vira 409 "pause o produto"                                                                                                                                                                                                                                |
| ACH-05 | Corrigido — `<Helmet defer={false}>`: o Helmet aplicava as tags num `requestAnimationFrame`, que não roda em aba oculta (mesmo artefato do relatório 1A). Revalidar com a aba visível                                                                                                     |
| ACH-06 | Corrigido — detalhe do pedido mostra linha de desconto com o cupom                                                                                                                                                                                                                        |
| ACH-07 | Corrigido — "Revogar" aplica ban na conta de auth antes de apagar o perfil (sessão aberta expira em até 8h)                                                                                                                                                                               |
| ACH-08 | Corrigido — variação a partir de R$ 0 aparece como "Novo"                                                                                                                                                                                                                                 |
| ACH-09 | Não é código — produto "teste" de R$ 123,00 em produção segue para a dona decidir                                                                                                                                                                                                         |
