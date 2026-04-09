import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ProductsPage } from '../ProductsPage';
import { fetchProducts } from '../../services/products';

vi.mock('../../services/products', () => ({
  fetchProducts: vi.fn(),
}));

vi.mock('../../hooks/useCart', () => ({
  useCart: () => ({
    addToCart: () => ({ ok: true, message: 'Produto adicionado.' }),
  }),
}));

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

describe('ProductsPage', () => {
  it('renderiza produtos retornados pela API', async () => {
    fetchProducts.mockResolvedValue([
      {
        id: 1,
        name: 'Kit de Alfabetizacao',
        description: 'Material digital',
        price: 49.9,
        category: 'Educacao',
        image: '',
      },
    ]);

    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Kit de Alfabetizacao')).toBeInTheDocument();
    expect(screen.getByText('Material digital')).toBeInTheDocument();
  });
});
