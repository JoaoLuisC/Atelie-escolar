import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductDetailsPage } from '../ProductDetailsPage';
import { fetchProductByIdentifier } from '../../services/products';

// ════════════════════════════════════════════════════════════════════
// Página de produto — LOJA-05, 15, 20 e 22.
// ════════════════════════════════════════════════════════════════════

vi.mock('../../services/products', () => ({
  fetchProductByIdentifier: vi.fn(),
  fetchCrossSellSuggestions: vi.fn(async () => ({ products: [], strategy: '' })),
}));

vi.mock('../../hooks/useCart', () => ({
  useCart: () => ({ addToCart: () => ({ ok: true, message: '' }) }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ customerSession: null, logoutCustomer: vi.fn() }),
}));

function renderEm(caminho) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/produtos/:slug" element={<ProductDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProductDetailsPage', () => {
  it('produto inexistente é "não encontrado", com saída para o catálogo (LOJA-05)', async () => {
    fetchProductByIdentifier.mockResolvedValue(null);
    renderEm('/produtos/123');

    expect(
      await screen.findByRole('heading', { level: 1, name: /Produto não encontrado/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver o catálogo/i })).toHaveAttribute(
      'href',
      '/produtos',
    );
    expect(screen.queryByRole('button', { name: /Tentar novamente/i })).toBeNull();
  });

  it('falha de rede oferece "Tentar novamente", que refaz a busca (LOJA-15)', async () => {
    fetchProductByIdentifier
      .mockRejectedValueOnce(new Error('Não conseguimos falar com a loja.'))
      .mockResolvedValueOnce({ id: 'p1', slug: 'kit', name: 'Kit Volta às Aulas', price: 64.9 });
    renderEm('/produtos/kit');

    fireEvent.click(await screen.findByRole('button', { name: /Tentar novamente/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kit Volta às Aulas' }),
    ).toBeInTheDocument();
  });

  it('o nome é o h1, e a frase de entrega não se repete com os benefícios padrão (LOJA-20/22)', async () => {
    fetchProductByIdentifier.mockResolvedValue({
      id: 'p1',
      slug: 'kit',
      name: 'Kit Volta às Aulas',
      price: 64.9,
      isKit: true,
      kitItems: ['Painel de boas-vindas', { name: 'Crachás' }],
    });
    renderEm('/produtos/kit');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kit Volta às Aulas' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/PDF em alta resolução/i)).toHaveLength(1);
    expect(screen.getByText('Painel de boas-vindas')).toBeInTheDocument();
    expect(screen.getByText('Crachás')).toBeInTheDocument();
  });
});
