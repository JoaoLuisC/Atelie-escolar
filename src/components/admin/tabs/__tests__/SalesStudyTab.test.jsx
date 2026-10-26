import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SalesStudyTab } from '../SalesStudyTab';
import { fetchSalesStudy, generateSalesStudy } from '../../../../services/admin-panel';

vi.mock('../../../../services/admin-panel', () => ({
  fetchSalesStudy: vi.fn(),
  generateSalesStudy: vi.fn(),
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

const STUDY = {
  generatedAt: '2026-10-26T12:00:00Z',
  days: 30,
  model: 'gemini-2.5-flash',
  aiError: null,
  aiMessage: null,
  insights: {
    resumo: 'Suas vendas cresceram com o Painel Outono.',
    destaques: ['Instagram trouxe metade da receita.'],
    pontosDeAtencao: ['Poucos chegam do carrinho ao pagamento.'],
    acoes: ['Crie um cupom de volta às aulas.'],
    confianca: 'media',
  },
  data: {
    periodoAtual: { sessoesNoSite: 120, pedidosAprovados: 6, receita: 180, ticketMedio: 30 },
    periodoAnterior: { sessoesNoSite: 80, pedidosAprovados: 3, receita: 90, ticketMedio: 30 },
  },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('<SalesStudyTab />', () => {
  it('mostra a última análise salva: resumo, listas e comparação de períodos', async () => {
    fetchSalesStudy.mockResolvedValue({ study: STUDY, aiConfigured: true });
    render(<SalesStudyTab />);

    expect(await screen.findByText(/cresceram com o Painel Outono/)).toBeInTheDocument();
    expect(screen.getByText('Instagram trouxe metade da receita.')).toBeInTheDocument();
    expect(screen.getByText('Crie um cupom de volta às aulas.')).toBeInTheDocument();
    expect(screen.getByText('Confiança média')).toBeInTheDocument();
    expect(screen.getByText('+50%')).toBeInTheDocument(); // sessões 80 → 120
  });

  it('sem análise salva, convida a gerar; o botão chama a geração com o período', async () => {
    fetchSalesStudy.mockResolvedValue({ study: null, aiConfigured: true });
    generateSalesStudy.mockResolvedValue({ study: STUDY, aiConfigured: true });
    render(<SalesStudyTab />);

    expect(await screen.findByText(/Nenhuma análise ainda/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /Gerar nova análise/ }));

    expect(generateSalesStudy).toHaveBeenCalledWith(60);
    expect(await screen.findByText(/cresceram com o Painel Outono/)).toBeInTheDocument();
  });

  it('sem IA configurada, avisa sem esconder os números', async () => {
    fetchSalesStudy.mockResolvedValue({ study: null, aiConfigured: false });
    render(<SalesStudyTab />);

    expect(await screen.findByText(/A IA não está configurada/)).toBeInTheDocument();
  });
});
