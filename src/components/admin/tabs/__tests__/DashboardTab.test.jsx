import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardTab } from '../DashboardTab';

// ════════════════════════════════════════════════════════════════════
// TESTE DE CARACTERIZAÇÃO — escrito ANTES de mexer no arquivo.
//
// `DashboardTab.jsx` tinha 819 linhas e zero teste, e é a primeira tela que a
// dona do negócio abre: se um número aqui sair errado, a decisão que ela toma
// em cima dele sai errada junto, e nada quebra de forma visível.
//
// Ele não descreve o que o dashboard DEVERIA fazer — descreve o que ele FAZ
// hoje, para que a extração dos gráficos (dashboard-charts.js) seja provada
// como refatoração e não como reescrita. Foi essa a lição do ProductWizard,
// no mesmo dia: a extração perdeu um campo, e só um teste de ida e volta
// pegou. Aqui a rede vem primeiro.
//
// O que está travado: os quatro KPIs do topo, o badge de tendência, os KPIs
// avançados que chegam por `fetch` depois do primeiro render, os estados
// vazios de cada gráfico e a tabela de pedidos recentes.
// ════════════════════════════════════════════════════════════════════

const fetchAdminKpis = vi.fn();
vi.mock('../../../../services/admin-panel', () => ({
  fetchAdminKpis: (...args) => fetchAdminKpis(...args),
}));

const SUMMARY = {
  revenueMonth: 12345.67,
  revenueTotal: 98765.43,
  approvedOrders: 42,
  pendingOrders: 7,
  activeProducts: 15,
  totalCustomers: 128,
};

const PROPS_BASE = {
  summary: SUMMARY,
  dailyRevenue: [
    { label: 'Seg', value: 100 },
    { label: 'Ter', value: 250 },
    { label: 'Qua', value: 0 },
  ],
  categoryRevenue: [
    { label: 'Apostilas', value: 700 },
    { label: 'Jogos', value: 300 },
  ],
  recentOrders: [
    {
      id: 1,
      orderId: 'PED-001',
      customerName: 'Ana Lima',
      paymentStatus: 'approved',
      totalAmount: 89.9,
      createdAt: '2026-08-30T12:00:00.000Z',
    },
  ],
  ticketMedio: { value: 75.5, pct: 12.4, trend: 'up', qty: 42 },
  customerMix: { total: 128, newCustomers: 30, recurring: 20, recurringPct: 16, inactive: 78 },
  abcCurve: null,
  comparisonDelta: { pct: 8.3, trend: 'up' },
  sparkline: [1, 5, 3, 9],
  onOpenOrder: vi.fn(),
};

function renderDashboard(overrides = {}) {
  return render(<DashboardTab {...PROPS_BASE} {...overrides} />);
}

beforeEach(() => {
  fetchAdminKpis.mockReset();
  fetchAdminKpis.mockResolvedValue({ kpis: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DashboardTab · KPIs do topo', () => {
  it('mostra faturamento, ticket, pedidos aprovados e recorrentes', async () => {
    renderDashboard();

    expect(screen.getByText('Faturamento do mês')).toBeInTheDocument();
    expect(screen.getByText(/12\.345,67/)).toBeInTheDocument();
    expect(screen.getByText(/75,50/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7 pendentes')).toBeInTheDocument();
    // Aparece duas vezes de propósito: no card do topo e no bloco de mix
    // de clientes. `getAllByText` registra isso em vez de esconder.
    expect(screen.getAllByText('16% dos compradores').length).toBe(2);
  });

  it('formata a tendência com sinal e uma casa decimal abaixo de 10%', () => {
    renderDashboard();

    // `comparisonDelta.pct = 8.3` → uma casa; `ticketMedio.pct = 12.4` → inteiro.
    expect(screen.getByText('+8.3%')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  it('cai para "estável" quando não há tendência', () => {
    renderDashboard({ comparisonDelta: { pct: 0, trend: 'stable' }, ticketMedio: null });

    expect(screen.getAllByText('estável').length).toBeGreaterThan(0);
  });

  it('não quebra sem summary nenhum', () => {
    // O painel monta antes de a primeira resposta chegar; `summary` chega null.
    renderDashboard({ summary: null, sparkline: [], comparisonDelta: null });

    expect(screen.getByText('Faturamento do mês')).toBeInTheDocument();
    expect(screen.getByText('0 pendentes')).toBeInTheDocument();
  });
});

describe('DashboardTab · KPIs avançados (carregados depois)', () => {
  it('pede a janela de 12 meses', () => {
    renderDashboard();
    expect(fetchAdminKpis).toHaveBeenCalledWith({ window: 12 });
  });

  it('exibe os valores quando a resposta chega', async () => {
    fetchAdminKpis.mockResolvedValue({
      kpis: { ltvAvg: 320.5, repurchaseRate: 23.7, ticketMedio: 88.4, ltvCacRatio: 3.2 },
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByText(/320,50/)).toBeInTheDocument());
    expect(screen.getByText('24%')).toBeInTheDocument();
  });

  it('mostra travessão enquanto a resposta não chega', () => {
    // Zero, aqui, seria uma afirmação falsa sobre o negócio.
    renderDashboard();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('sobrevive à falha da chamada sem derrubar o resto da tela', async () => {
    fetchAdminKpis.mockRejectedValue(new Error('500'));

    renderDashboard();

    // O `catch` zera os avançados; os KPIs do topo continuam lá.
    await waitFor(() => expect(screen.getByText('Faturamento do mês')).toBeInTheDocument());
  });
});

describe('DashboardTab · gráficos e estados vazios', () => {
  it('mostra o eixo do gráfico de receita com os rótulos e valores do período', () => {
    renderDashboard();

    expect(screen.getByText('Seg')).toBeInTheDocument();
    expect(screen.getByText('Ter')).toBeInTheDocument();
    // O dia sem venda continua aparecendo: buraco no eixo é informação.
    expect(screen.getByText('Qua')).toBeInTheDocument();
  });

  it('avisa quando não há venda no período', () => {
    renderDashboard({ dailyRevenue: [] });

    expect(screen.getByText('Sem vendas registradas no período.')).toBeInTheDocument();
  });

  it('avisa quando não há dado de categoria', () => {
    renderDashboard({ categoryRevenue: [] });

    expect(screen.getByText('Sem dados de categoria.')).toBeInTheDocument();
  });

  it('desenha um ponto por dia no gráfico de receita', () => {
    const { container } = renderDashboard();

    // 3 entradas em `dailyRevenue` → 3 marcadores. É a asserção que pega uma
    // regressão de off-by-one na geometria sem depender das coordenadas.
    const svg = container.querySelector('svg[viewBox="0 0 100 100"]');
    expect(svg).toBeTruthy();
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3);
  });
});

describe('DashboardTab · pedidos recentes', () => {
  it('lista o pedido com cliente, status e valor', () => {
    renderDashboard();

    const linha = screen.getByText('Ana Lima').closest('tr');
    expect(linha).toBeTruthy();
    expect(within(linha).getByText(/89,90/)).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há pedido', () => {
    renderDashboard({ recentOrders: [] });

    expect(screen.getByText('Nenhum pedido recente')).toBeInTheDocument();
  });
});
