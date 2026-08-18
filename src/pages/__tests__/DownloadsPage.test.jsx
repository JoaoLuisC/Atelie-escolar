import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { DownloadsPage } from '../DownloadsPage';

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    pushToast: vi.fn(),
  }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    customerSession: null,
    logoutCustomer: vi.fn(),
  }),
}));

describe('DownloadsPage', () => {
  it('mostra estado vazio quando nao ha pedido selecionado', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, orders: [] }),
    });

    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nenhum pedido selecionado')).toBeInTheDocument();
  });

  it('mostra estado de erro quando pedido retorna falha de token invalido', async () => {
    // Envelope da regra A1. A fixture usava `{ error: 'texto' }`, o formato
    // que o CONTRIBUTING dá por extinto — e ela só passava porque o shim de
    // achatamento de `parseJson` ainda existia. Com o shim removido (marco do
    // fim da migração A1), a fixture precisa ser o que o backend realmente
    // emite: `fail()` de lib/http.js.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { code: 'DOWNLOAD_TOKEN_INVALID', message: 'Token invalido' },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/downloads?order=ORD-ERRO&email=cliente%40teste.com']}>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Falha ao carregar pedido')).toBeInTheDocument();
    expect(screen.getAllByText('Token invalido').length).toBeGreaterThan(0);
  });
});
