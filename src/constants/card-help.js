// ════════════════════════════════════════════════════════════════════
// O "?" DOS CARDS — o que cada número ou quadro do painel significa.
//
// Chave = o título (ou rótulo) exato do card. `InfoHint` procura aqui quando
// o card não traz texto próprio. Linguagem de quem vende, não de quem
// programa: o que é, de onde vem e para que serve.
// ════════════════════════════════════════════════════════════════════

export const CARD_HELP = Object.freeze({
  // ── Dashboard ──
  'Faturamento do mês':
    'Soma dos pedidos pagos (aprovados) desde o dia 1º deste mês. A seta compara com o mesmo período do mês passado.',
  'Ticket médio':
    'Valor médio de cada pedido pago: faturamento dividido pelo número de pedidos aprovados.',
  'Pedidos aprovados':
    'Pedidos com pagamento confirmado pelo Mercado Pago. Os pendentes ainda esperam o pagamento (ex.: Pix ou boleto não pago).',
  'Clientes recorrentes':
    'Quantos clientes compraram mais de uma vez. A porcentagem é sobre todos que já compraram.',
  'Receita total': 'Tudo que já foi vendido e pago desde o início da loja.',
  'Produtos ativos': 'Produtos visíveis na loja. Produto pausado não conta.',
  Pendentes:
    'Pedidos criados que ainda não foram pagos. Depois de 2 horas sem pagamento, o cupom usado volta a ficar disponível.',
  'Clientes cadastrados': 'Contas de cliente criadas na loja (por e-mail ou Google).',
  'LTV médio (12m)':
    'Quanto, em média, cada cliente gastou na loja nos últimos 12 meses somando todas as compras.',
  'Taxa de recompra':
    'Porcentagem de clientes que voltaram e compraram de novo nos últimos 12 meses.',
  'Ticket médio (12m)': 'Valor médio de cada pedido pago nos últimos 12 meses.',
  'LTV / CAC':
    'Quanto um cliente rende dividido por quanto custa conquistá-lo. Fica vazio enquanto não há custo de anúncio cadastrado.',
  'Receita dos últimos 7 dias': 'Quanto entrou de pedidos pagos em cada um dos últimos 7 dias.',
  'Receita por categoria': 'As 5 categorias que mais faturaram com pedidos pagos.',
  'Curva ABC':
    'Ordena os produtos pelo quanto faturam. Classe A: os poucos que trazem 80% da receita; B: os próximos 15%; C: o restante.',
  'Mix de clientes':
    'Proporção entre clientes que compraram uma vez e os que já voltaram a comprar.',
  'Pedidos recentes': 'Os 8 pedidos mais novos, de qualquer status (pago, pendente, recusado).',
  'Vendas por região':
    'Vai mostrar de quais estados vêm as vendas quando o checkout passar a pedir o estado.',

  // ── Financeiro ──
  'Bruto acumulado': 'Soma de todos os pedidos pagos, antes das taxas do Mercado Pago.',
  'Faturamento dos últimos 6 meses':
    'Quanto entrou de pedidos pagos em cada um dos últimos 6 meses.',
  'Comparativo mensal':
    'Coloca este mês lado a lado com o anterior, com a variação de um para o outro.',
  'Desempenho de produtos':
    'Quantas unidades cada produto vendeu e quanto faturou, do mais vendido para o menos vendido.',

  // ── Vendas ──
  'Estudo de vendas':
    'A IA lê os números da loja e escreve, em linguagem simples, o que vai bem, onde se perde venda e o que fazer. Só gera quando você clica.',
  'Funil canônico':
    'Caminho de quem visita a loja: viu o produto → pôs no carrinho → foi ao checkout → pagou. Mostra em que etapa as pessoas desistem.',
  'Atribuição por UTM source':
    'De onde vieram as vendas: Instagram, e-mail, WhatsApp… "direct" é quem chegou sem link rastreado.',
  'Curva ABC — Produtos':
    'Os produtos que mais faturam. Classe A merece destaque na loja; classe C pode precisar de ajuste de preço ou divulgação.',
  'Curva ABC — Clientes':
    'Os clientes que mais compram, agrupados (VIP, recorrente, eventual) para campanhas. Os e-mails aparecem mascarados.',
  'Retenção por coorte (últimos 12 meses)':
    'Para quem comprou pela primeira vez em cada mês, quantos voltaram nos meses seguintes. Mostra a sazonalidade do ano letivo.',

  // ── Outras abas ──
  'Tags por número de assinantes':
    'Quantas pessoas da newsletter se interessam por cada assunto, para escolher o tema das campanhas.',
  'Faixas de produtos':
    'As faixas de produtos da página inicial: quais aparecem, em que ordem e quantos produtos cada uma mostra.',
  'Textos e imagens da página':
    'Os textos, a imagem e a ordem dos blocos da página que o cliente vê ao entrar na loja.',
  'Descrição padrão de todos os produtos':
    'Um texto que aparece em todas as páginas de produto, logo abaixo da descrição de cada um (ex.: como funciona o download).',
  'Segundo fator': 'Código extra pedido no login da administração, além da senha.',

  // ── Plataforma e área do professor ──
  Professores: 'Contas com perfil de professor(a): podem vender materiais na plataforma.',
  Clientes: 'Contas de quem compra na loja.',
  'Faturamento total': 'Tudo que já foi vendido e pago na plataforma.',
  'Faturamento no mês': 'Pedidos pagos desde o dia 1º deste mês.',
  'Meus produtos': 'Quantos materiais você cadastrou e quantos estão visíveis na loja.',
  Vendas: 'Unidades vendidas dos seus materiais, contando só pedidos pagos.',
  Receita: 'Quanto seus materiais faturaram em pedidos pagos.',
});
