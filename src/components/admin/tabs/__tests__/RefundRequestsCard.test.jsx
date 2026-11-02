import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadProofText, RefundRequestsCard } from '../RefundRequestsCard';
import { fetchRefundRequests, updateRefundRequest } from '../../../../services/admin-panel';
import { NETWORK_ERROR_MESSAGE } from '../../utils/errors';

vi.mock('../../../../services/admin-panel', () => ({
  fetchRefundRequests: vi.fn(),
  updateRefundRequest: vi.fn(),
}));

const pushToast = vi.fn();
vi.mock('../../../../hooks/useToast', () => ({ useToast: () => ({ pushToast }) }));

const solicitacao = {
  id: 'r1',
  status: 'open',
  admin_response: '',
  reason_category: 'defeito',
  reason: 'Página 3 em branco',
  phone: '5511999999999',
  download_count: 2,
  first_download_at: '2026-10-20T13:45:00.000Z',
  firstDownloadIp: '10.0.0.1',
  order: { order_code: 'ABC123', customer_name: 'Maria', customer_email: 'maria@exemplo.com' },
};

describe('downloadProofText', () => {
  it('sem download registrado: "Nunca baixou"', () => {
    expect(downloadProofText({})).toBe('Nunca baixou');
    expect(downloadProofText({ download_count: 0, first_download_at: null })).toBe('Nunca baixou');
    // Contagem sem data (ou data sem contagem) não é prova de download.
    expect(downloadProofText({ download_count: 3 })).toBe('Nunca baixou');
  });

  it('com download: data, contagem e IP', () => {
    expect(downloadProofText(solicitacao)).toMatch(
      /^Baixou em \d{2}\/\d{2}\/\d{4},? \d{2}:\d{2} · 2 downloads · IP 10\.0\.0\.1$/,
    );
    expect(downloadProofText({ ...solicitacao, download_count: 1, firstDownloadIp: '' })).toMatch(
      /^Baixou em .+ · 1 download$/,
    );
  });
});

describe('<RefundRequestsCard />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateRefundRequest.mockResolvedValue({ success: true });
  });

  it('carregando → lista → salvar → toast', async () => {
    let resolver;
    fetchRefundRequests.mockReturnValueOnce(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    render(<RefundRequestsCard />);

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma solicitação/)).toBeNull();

    resolver({ success: true, requests: [solicitacao] });

    expect(await screen.findByText('Pedido #ABC123')).toBeInTheDocument();
    expect(screen.queryByText('Carregando…')).toBeNull();
    // Fluxo ausente não vira "Desistência simples".
    expect(screen.getByText('Fluxo não registrado')).toBeInTheDocument();
    expect(
      screen.getByText(/Motivo: Arquivo com defeito — Página 3 em branco/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Status da solicitação ABC123'), {
      target: { value: 'accepted' },
    });
    fireEvent.change(screen.getByLabelText('Resposta ao cliente ABC123'), {
      target: { value: 'Reembolso enviado.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateRefundRequest).toHaveBeenCalledTimes(1));
    expect(updateRefundRequest).toHaveBeenCalledWith({
      id: 'r1',
      status: 'accepted',
      response: 'Reembolso enviado.',
    });
    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith('Solicitação atualizada.', 'success'),
    );
  });

  it('fluxo conhecido usa o rótulo da política', async () => {
    fetchRefundRequests.mockResolvedValueOnce({
      success: true,
      requests: [{ ...solicitacao, flow: 'support' }],
    });
    render(<RefundRequestsCard />);
    expect(await screen.findByText(/Suporte \(já baixou/)).toBeInTheDocument();
  });

  it('lista vazia só depois de carregar', async () => {
    fetchRefundRequests.mockResolvedValueOnce({ success: true, requests: [] });
    render(<RefundRequestsCard />);
    expect(await screen.findByText('Nenhuma solicitação encontrada.')).toBeInTheDocument();
  });

  it('erro de rede ao carregar aparece em português', async () => {
    fetchRefundRequests.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<RefundRequestsCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(screen.queryByText('Carregando…')).toBeNull();
    expect(screen.queryByText(/Nenhuma solicitação/)).toBeNull();
  });

  it('erro ao salvar aparece e a lista continua', async () => {
    fetchRefundRequests.mockResolvedValueOnce({ success: true, requests: [solicitacao] });
    updateRefundRequest.mockRejectedValueOnce(new Error('Status inválido.'));
    render(<RefundRequestsCard />);
    await screen.findByText('Pedido #ABC123');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Status inválido.');
    expect(screen.getByText('Pedido #ABC123')).toBeInTheDocument();
    expect(pushToast).not.toHaveBeenCalled();
  });
});
