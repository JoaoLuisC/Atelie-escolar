export const TAB_LABELS = {
  dashboard: 'Dashboard',
  produtos: 'Produtos',
  categorias: 'Categorias',
  pedidos: 'Pedidos',
  cupons: 'Cupons',
  'prod-saida': 'Desempenho dos produtos',
  faturamento: 'Faturamento',
  comparativo: 'Comparativo mensal',
  funil: 'Funil de conversão',
  analise: 'Análise (Curva ABC + Coorte)',
  segmentos: 'Segmentos de email',
  usuarios: 'Usuários',
  vitrine: 'Vitrine',
  seguranca: 'Segurança',
};

export const TABS_NEEDING_DASHBOARD = new Set([
  'dashboard',
  'faturamento',
  'comparativo',
  'prod-saida',
  'vitrine',
  'produtos',
  'categorias',
  'analise',
]);
