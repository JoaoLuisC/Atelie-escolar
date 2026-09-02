import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisTab } from '../AnalysisTab';

// ════════════════════════════════════════════════════════════════════
// TESTE DE CARACTERIZAÇÃO — escrito ANTES de mexer no arquivo.
//
// Mesma sequência do DashboardTab, pelo mesmo motivo: `AnalysisTab.jsx` tem
// 676 linhas e nenhum teste, e quebrar um arquivo desse tamanho sem rede foi
// exatamente o erro que a extração do ProductWizard cometeu e só um teste
// pegou.
//
// Ele descreve o que a aba FAZ hoje: as três chamadas que ela dispara em
// paralelo, o estado de carregamento, o de erro (uma falha derruba a aba
// inteira, porque as três vão num `Promise.all`), os resumos de curva ABC e
// os estados vazios. É o suficiente para provar que a extração seguinte é
// refatoração.
// ════════════════════════════════════════════════════════════════════

const fetchAdminAbcProducts = vi.fn();
const fetchAdminAbcCustomers = vi.fn();
const fetchAdminCohort = vi.fn();

vi.mock('../../../../services/admin-panel', () => ({
  fetchAdminAbcProducts: (...args) => fetchAdminAbcProducts(...args),
  fetchAdminAbcCustomers: (...args) => fetchAdminAbcCustomers(...args),
  fetchAdminCohort: (...args) => fetchAdminCohort(...args),
}));

const PRODUTOS = {
  summary: { A: 3, B: 5, C: 12 },
  totalRevenue: 4321.5,
  items: [
    {
      rank: 1,
      curve: 'A',
      name: 'Apostila de Alfabetização',
      categoryName: 'Apostilas',
      qty: 20,
      revenue: 1800,
      sharePct: 41.6,
      cumulativePct: 41.6,
    },
  ],
};

const CLIENTES = {
  relationshipSummary: { vip: 2, recorrente: 7, eventual: 30 },
  items: [{ rank: 1, curve: 'A', relationship: 'vip', revenue: 900, orders: 4 }],
};

const COORTE = {
  months: [0, 1, 2],
  cohorts: [{ cohort: '2026-06', size: 10, retention: [100, 40, 10] }],
};

function renderAba(props = {}) {
  return render(<AnalysisTab categories={[{ id: 'c1', name: 'Apostilas' }]} {...props} />);
}

beforeEach(() => {
  fetchAdminAbcProducts.mockReset().mockResolvedValue(PRODUTOS);
  fetchAdminAbcCustomers.mockReset().mockResolvedValue(CLIENTES);
  fetchAdminCohort.mockReset().mockResolvedValue(COORTE);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AnalysisTab · carregamento', () => {
  it('dispara as três consultas com os períodos padrão', async () => {
    renderAba();

    await waitFor(() => expect(fetchAdminAbcProducts).toHaveBeenCalled());
    // Produtos e clientes têm período PRÓPRIO, e o default de cada um é
    // diferente de propósito — mês para produto, trimestre para cliente.
    expect(fetchAdminAbcProducts).toHaveBeenCalledWith({ period: 'month', categoryId: null });
    expect(fetchAdminAbcCustomers).toHaveBeenCalledWith({ period: 'quarter' });
    expect(fetchAdminCohort).toHaveBeenCalledWith({ months: 12 });
  });

  it('mostra os resumos das duas curvas quando os dados chegam', async () => {
    renderAba();

    await waitFor(() => expect(screen.getByText('Curva ABC — Produtos')).toBeInTheDocument());
    expect(screen.getByText('Curva ABC — Clientes')).toBeInTheDocument();
    expect(screen.getByText(/4\.321,50/)).toBeInTheDocument();
  });

  it('uma falha derruba a aba inteira — as três vão num Promise.all', async () => {
    // Comportamento ATUAL, registrado como é: não há carregamento parcial.
    // Se um dia virar resiliente por card, este teste é o que avisa.
    fetchAdminCohort.mockRejectedValue(new Error('cohort fora do ar'));

    renderAba();

    await waitFor(() => expect(screen.getByText('cohort fora do ar')).toBeInTheDocument());
    expect(screen.queryByText('Curva ABC — Produtos')).not.toBeInTheDocument();
  });

  it('lista as categorias recebidas por prop, com a opção de todas', async () => {
    renderAba();

    await waitFor(() => expect(screen.getByLabelText('Filtro de categoria')).toBeInTheDocument());
    const seletor = screen.getByLabelText('Filtro de categoria');
    expect(seletor).toHaveTextContent('Todas as categorias');
    expect(seletor).toHaveTextContent('Apostilas');
  });
});

describe('AnalysisTab · estados vazios', () => {
  it('não quebra quando as três respostas vêm vazias', async () => {
    fetchAdminAbcProducts.mockResolvedValue({ summary: {}, items: [], totalRevenue: 0 });
    fetchAdminAbcCustomers.mockResolvedValue({ relationshipSummary: {}, items: [] });
    fetchAdminCohort.mockResolvedValue({ months: [], cohorts: [] });

    renderAba();

    await waitFor(() => expect(screen.getByText('Curva ABC — Produtos')).toBeInTheDocument());
    expect(screen.getByText('Retenção por coorte (últimos 12 meses)')).toBeInTheDocument();
  });

  it('trata resposta sem os campos de resumo como zero', async () => {
    // O backend pode responder sem `summary` numa janela sem venda; zerar é o
    // comportamento atual, e é o certo — `undefined` na tela seria pior.
    fetchAdminAbcProducts.mockResolvedValue({ items: [] });
    fetchAdminAbcCustomers.mockResolvedValue({ items: [] });

    renderAba();

    await waitFor(() => expect(screen.getByText('Curva ABC — Produtos')).toBeInTheDocument());
    expect(screen.getByText(/R\$\s?0,00/)).toBeInTheDocument();
  });
});
