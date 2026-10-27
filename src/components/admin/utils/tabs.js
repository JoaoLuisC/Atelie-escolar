export const TAB_LABELS = {
  dashboard: 'Dashboard',
  produtos: 'Produtos',
  categorias: 'Categorias',
  pedidos: 'Pedidos',
  cupons: 'Cupons',
  'prod-saida': 'Desempenho dos produtos',
  faturamento: 'Faturamento',
  comparativo: 'Comparativo mensal',
  vendas: 'Vendas',
  segmentos: 'Segmentos de email',
  usuarios: 'Usuários',
  vitrine: 'Página da loja',
  seguranca: 'Segurança',
  plataforma: 'Professores e clientes',
  conta: 'Minha conta',
};

// ════════════════════════════════════════════════════════════════════
// DUAS VERSÕES DO PAINEL
//   • platform — o admin da plataforma (/admin): professores e clientes,
//     usuários e segurança.
//   • store — a professora dona da loja (/professores): tudo da loja.
// O servidor aplica o mesmo corte (ensureAdminSession × ensureStoreSession);
// esconder a aba aqui é conveniência, não proteção.
// ════════════════════════════════════════════════════════════════════
export const PANEL_TABS = Object.freeze({
  platform: ['plataforma', 'usuarios', 'seguranca', 'conta'],
  store: [
    'dashboard',
    'produtos',
    'prod-saida',
    'categorias',
    'pedidos',
    'cupons',
    'faturamento',
    'comparativo',
    'vendas',
    'segmentos',
    'vitrine',
    'conta',
  ],
});

export const TABS_NEEDING_DASHBOARD = new Set([
  'dashboard',
  'faturamento',
  'comparativo',
  'prod-saida',
  'vitrine',
  'produtos',
  'categorias',
  'vendas',
]);
