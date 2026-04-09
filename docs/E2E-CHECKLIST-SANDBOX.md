# Checklist E2E - Compra Sandbox

## Pre-condicoes

1. Aplicacao frontend rodando em ambiente de teste.
2. Backend rodando com credenciais de sandbox do Mercado Pago.
3. Pelo menos 1 produto ativo no catalogo.
4. Usuario de teste com e-mail valido.

## Fluxo principal de compra

1. Acessar /produtos e confirmar listagem carregada.
2. Abrir detalhe de um produto e adicionar ao carrinho.
3. Ir para /checkout e validar total do carrinho.
4. Preencher nome e e-mail (ou usar sessao de cliente).
5. Clicar em Ir para pagamento.
6. Confirmar que a URL de pagamento abriu em nova aba.
7. Concluir pagamento no sandbox.
8. Confirmar redirecionamento para /downloads?order=...&success=1.
9. Validar status aprovado e botoes de download visiveis.

## Fluxos de falha

1. Pagamento recusado:
   - Simular recusa no sandbox.
   - Confirmar mensagem de pagamento nao aprovado no checkout/downloads.
2. Timeout de confirmacao:
   - Nao concluir pagamento e aguardar limite de tentativas.
   - Confirmar mensagem de tempo de espera excedido.
3. Token invalido:
   - Acessar /api/download?token=token-invalido.
   - Confirmar resposta de erro e bloqueio de download.

## Pos-compra

1. Buscar pedidos por e-mail em /downloads.
2. Abrir pedido pelo historico.
3. Validar reconsulta automatica quando pedido estiver pendente.
4. Validar estado vazio quando pedido nao existir.

## Evidencias recomendadas

1. Print da etapa de checkout preenchido.
2. Print da tela de aprovacao com downloads liberados.
3. Print do caso recusado.
4. Print do caso timeout.
5. Log/print do caso token invalido.
