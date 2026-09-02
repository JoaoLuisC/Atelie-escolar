// ════════════════════════════════════════════════════════════════════
// CONTEÚDO E ESCALA DA ABA DE ANÁLISE — o que não é JSX.
//
// POR QUE ESTE ARQUIVO EXISTE
// `AnalysisTab.jsx` tinha 676 linhas, e metade delas não era interface:
// eram TEXTOS (as explicações de cada gráfico, que é material de apoio ao
// negócio e muda por decisão editorial), TABELAS DE ESTILO por classe, e uma
// escala de cor. Nada disso tem estado, efeito ou render.
//
// Misturado ao componente, esse conteúdo tinha dois custos: quem ia ajustar
// uma frase precisava abrir um arquivo de 676 linhas com três `useState` e um
// `Promise.all`, e quem ia mexer no comportamento rolava por 76 linhas de
// texto corrido para achar o código.
//
// Fica ao lado do componente (regra C4) — é conteúdo desta aba e de mais
// nada, como `dashboard-charts.js` é a matemática daquele painel.
//
// ⚠️ MOVE, não reescrita: `AnalysisTab.test.jsx` foi escrito ANTES e é a
// prova de que a tela não mudou.
// ════════════════════════════════════════════════════════════════════
export const PERIOD_OPTIONS = [
  { value: 'month', label: 'Último mês' },
  { value: 'quarter', label: 'Último trimestre' },
  { value: 'year', label: 'Último ano' },
];

export const CURVE_STYLES = {
  A: {
    label: 'A',
    desc: '80% da receita',
    chip: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    bar: 'from-emerald-500 to-emerald-400',
  },
  B: {
    label: 'B',
    desc: '15% da receita',
    chip: 'bg-amber-100 text-amber-700 ring-amber-200',
    bar: 'from-amber-500 to-amber-400',
  },
  C: {
    label: 'C',
    desc: '5% da receita',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
    bar: 'from-slate-400 to-slate-300',
  },
};

export const RELATIONSHIP_STYLES = {
  vip: { label: 'VIP', chip: 'bg-violet-100 text-violet-700 ring-violet-200' },
  recorrente: { label: 'Recorrente', chip: 'bg-sky-100 text-sky-700 ring-sky-200' },
  eventual: { label: 'Eventual', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export const EXPLANATIONS = {
  products: {
    title: 'Curva ABC — Produtos',
    intro:
      'Aplicação do princípio de Pareto (80/20) ao seu catálogo. Cada produto é classificado pela receita que gera no período, e agrupado em três classes acumuladas.',
    how: [
      'Soma da receita real (preço × quantidade) de cada produto no período selecionado.',
      'Produtos ordenados do maior para o menor faturamento.',
      'Classe A: produtos que acumulam os primeiros 80% da receita.',
      'Classe B: próximos 15% (acumulado 80–95%).',
      'Classe C: cauda longa, últimos 5%.',
    ],
    observe: [
      'Quantos produtos formam a classe A? Saudável: 5–30% do catálogo. Menos = dependência perigosa de poucos itens. Mais = catálogo disperso sem hit definido.',
      'Receita total no período x perfil esperado (sazonal/normal). Se total caiu mas A se manteve, o problema é a cauda — não os campeões.',
      'Produto na classe C com tráfego alto (view_item) mas conversão baixa = oportunidade. Não é "produto morto", é vitrine ruim.',
      'Produto na classe C com ticket baixo pode ser "produto de entrada" — atrai cliente novo que depois compra A.',
    ],
    act: [
      'Classe A → vitrine sempre, lookalike de mídia paga, bundle com outros itens A, monitorar disponibilidade.',
      'Classe B → cross-sell agressivo combinando com itens A. Promover na sequência pós-compra D+15.',
      'Classe C com tráfego alto → revisar página de produto (título, imagens, depoimentos, preço).',
      'Classe C sem tráfego e sem ser produto de entrada → desativar trimestralmente (regra: 0 vendas em 90d).',
      'Nunca cortar produto C cegamente sem checar se é porta de entrada — pode matar aquisição de novos clientes.',
    ],
  },
  customers: {
    title: 'Curva ABC — Clientes',
    intro:
      'Mesma lógica aplicada a clientes. Quem gera quanto da sua receita, e qual o tipo de relacionamento que cada um tem com a loja.',
    how: [
      'Soma da receita por cliente no período (todos os pedidos aprovados).',
      'Classificação em A/B/C pela contribuição acumulada na receita.',
      'Sobreposto a isso: relação (VIP / Recorrente / Eventual) baseada em quantidade de pedidos e ticket médio.',
      'E-mails são mascarados na tela e no export por LGPD.',
    ],
    observe: [
      'Concentração: quanto % da receita está nos top 5 clientes? Acima de 30% = risco (LTV depende de poucos).',
      'Cliente classe A é VIP (recorrente) ou Eventual de ticket alto? Eventual de ticket alto pode ser uma compra única — não é base de receita previsível.',
      'Recompra geral: VIP + Recorrente / Total. Saudável: > 20%. Abaixo disso, pós-venda está vazando.',
      'Razão Eventual / Total alta = aquisição funciona, retenção não. Inverso = retenção boa mas aquisição parou.',
    ],
    act: [
      'VIPs → audiência semente de campanhas pagas (lookalike no Meta/Google). Acesso antecipado a lançamentos.',
      'Recorrentes → cross-sell por categoria comprada na sequência D+15 (regra D5: segmentação por categoria, não nome).',
      'Eventuais → puxar para segunda compra com email D+15 + cupom marginal (não maior que VOLTEI15).',
      'Cliente sem compra há 90–180d → entra no fluxo de reativação automaticamente (cron). > 180d: parar de enviar (regra D7).',
      'Nunca personalize nominalmente em escala ("Olá Maria,...") — Ferreira 2025: gera R$ 0 RPM. Segmente pelo comportamento, escreva para o grupo.',
    ],
  },
  cohort: {
    title: 'Retenção por coorte mensal',
    intro:
      'Cada linha é um grupo de clientes que comprou pela primeira vez no mesmo mês ("coorte de janeiro", "coorte de fevereiro"). As colunas mostram quantos % desse grupo voltaram a comprar nos meses seguintes.',
    how: [
      'M+0 = mês da primeira compra (sempre 100% por definição).',
      'M+1 = % do coorte que comprou de novo no mês seguinte.',
      'M+12 = % do coorte que ainda compra um ano depois.',
      'Cor da célula: verde escuro = retenção forte (≥ 50%); cinza = ninguém voltou.',
      'Coluna "Tam." = quantos clientes únicos compraram pela primeira vez naquele mês.',
    ],
    observe: [
      'Queda grande de M+0 para M+1 → pós-venda imediato (D+3 / D+15) não está convertendo. Email não chega, ou produto não fideliza.',
      'Coortes mais recentes com retenção pior que antigos → algo mudou (preço, produto destaque, atendimento, layout). Investigar.',
      'Sazonalidade: picos em fev (volta às aulas) e jun (festa junina) são esperados para esse nicho.',
      'Coorte grande com retenção baixa = aquisição cara que não vira LTV. Pior cenário comercial.',
      'Coorte pequeno com retenção alta = nicho fiel. Vale investir em expandir aquisição para esse perfil.',
    ],
    act: [
      'Retenção M+1 baixa → reforçar templates D+3 (review/satisfação) e D+15 (cross-sell). Considerar um produto barato de "segunda compra fácil".',
      'Coorte recente com queda → diagnóstico qualitativo: mudou preço? mudou produto destaque? mudou layout do checkout?',
      'Coortes sazonais (festa junina, formatura) → usar para prever caixa do próximo ciclo. Receita esperada = (coorte M+0) × (retenção média histórica) × ticket médio.',
      'Quando expandir mídia paga (Fase 5): mirar perfil de coorte com maior retenção histórica.',
    ],
  },
};

export const SECTION_TONES = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

/**
 * Escala de cor do heatmap de retenção, em degraus fixos.
 *
 * Degraus e não gradiente contínuo: o olho compara faixas muito melhor do
 * que tons vizinhos, e a leitura que importa nesta tabela é "esta coorte
 * está na mesma faixa da anterior?", não a diferença de 2pp.
 */
export function cellTone(pct) {
  if (pct >= 50) return 'bg-emerald-500 text-white';
  if (pct >= 30) return 'bg-emerald-300 text-emerald-900';
  if (pct >= 15) return 'bg-amber-200 text-amber-900';
  if (pct >= 5) return 'bg-orange-200 text-orange-900';
  if (pct > 0) return 'bg-slate-200 text-slate-700';
  return 'bg-slate-50 text-slate-400';
}
