import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

// ════════════════════════════════════════════════════════════════════
// Filtros na URL — LOJA-03, 06, 07, 14, 23 e 33.
// ════════════════════════════════════════════════════════════════════
const ANTIGO = '2025-01-10T12:00:00.000Z';

const CATALOGO = [
  {
    id: 'p1',
    name: 'Banner Quadrilha',
    description: 'Arraiá',
    price: 29.9,
    originalPrice: 39.9,
    category: 'Festa Junina',
    categorySlug: 'festa-junina',
    createdAt: ANTIGO,
    soldCount: 1,
  },
  {
    id: 'p2',
    name: 'Painel Formatura',
    description: 'ABC',
    price: 89.9,
    category: 'Formatura',
    categorySlug: 'formatura',
    createdAt: '2025-03-01T12:00:00.000Z',
    soldCount: 5,
  },
  {
    id: 'p3',
    name: 'Palavras Mágicas',
    description: 'Cartazes',
    price: 5,
    category: 'Formatura',
    categorySlug: 'formatura',
    createdAt: '2025-02-01T12:00:00.000Z',
    soldCount: 0,
  },
  {
    // Categoria com nome de id (LOJA-02): nunca vira chip nem pílula.
    id: 'p4',
    name: 'Kit Festa',
    description: 'Kit',
    price: 20,
    category: 'c0da613b-a3fc-4814-b171-28ce45e4028e',
    categorySlug: null,
    createdAt: ANTIGO,
    soldCount: 0,
  },
];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderCatalogo(caminho) {
  fetchProducts.mockResolvedValue(CATALOGO);
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route
          path="/produtos"
          element={
            <>
              <ProductsPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function nomesNaLista() {
  await screen.findAllByRole('article');
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent)
    .sort();
}

describe('ProductsPage · filtros na URL', () => {
  it('?categoria=<slug> (formato do sitemap e da home) filtra — LOJA-06', async () => {
    renderCatalogo('/produtos?categoria=festa-junina');
    expect(await nomesNaLista()).toEqual(['Banner Quadrilha']);
  });

  it('?categoria=<Nome> (links antigos) continua filtrando', async () => {
    renderCatalogo('/produtos?categoria=Festa%20Junina');
    expect(await nomesNaLista()).toEqual(['Banner Quadrilha']);
  });

  it('?preset=novidades mostra o catálogo inteiro, do mais novo ao mais antigo, com indicador — LOJA-03', async () => {
    renderCatalogo('/produtos?preset=novidades');
    expect(await nomesNaLista()).toHaveLength(4);
    expect(screen.getByText(/Novidades — mais recentes primeiro/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Remover filtro: Novidades/i }));
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/produtos$/);
  });

  it('clicar num chip escreve a categoria na URL; "Todos" a remove — LOJA-07', async () => {
    renderCatalogo('/produtos');
    await nomesNaLista();

    fireEvent.click(screen.getByRole('button', { name: 'Formatura' }));
    expect(screen.getByTestId('url')).toHaveTextContent('/produtos?categoria=formatura');
    expect(await nomesNaLista()).toEqual(['Painel Formatura', 'Palavras Mágicas']);

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/produtos$/);
    expect(await nomesNaLista()).toHaveLength(4);
  });

  it('ordenação vai para a URL', async () => {
    renderCatalogo('/produtos');
    await nomesNaLista();

    fireEvent.change(screen.getByRole('combobox', { name: /Ordenar produtos/i }), {
      target: { value: 'price-asc' },
    });
    expect(screen.getByTestId('url')).toHaveTextContent('/produtos?ordem=price-asc');
  });

  it('os contadores da sidebar respeitam a faixa de preço — LOJA-14', async () => {
    renderCatalogo('/produtos?faixa=0-25');
    expect(await nomesNaLista()).toEqual(['Kit Festa', 'Palavras Mágicas']);

    const sidebar = screen.getByRole('complementary', { name: 'Filtros' });
    const formatura = within(sidebar).getByRole('button', { name: /Formatura/ });
    expect(formatura).toHaveTextContent('1');
    const todos = within(sidebar).getByRole('button', { name: /Todos/ });
    expect(todos).toHaveTextContent('2');
  });

  it('?q= filtra pelo texto, sem diferenciar acento — LOJA-23', async () => {
    renderCatalogo('/produtos?q=magicas');
    expect(await nomesNaLista()).toEqual(['Palavras Mágicas']);
    expect(screen.getByText(/Busca: “magicas”/)).toBeInTheDocument();
  });

  it('categoria com nome de UUID não vira chip nem pílula — LOJA-02', async () => {
    renderCatalogo('/produtos');
    await nomesNaLista();
    expect(screen.queryByText(/c0da613b/i)).not.toBeInTheDocument();
  });

  it('o card mostra o preço anterior riscado — LOJA-19', async () => {
    renderCatalogo('/produtos?categoria=festa-junina');
    await nomesNaLista();
    expect(screen.getByText(/R\$\s*39,90/)).toHaveClass('line-through');
  });

  it('lista vazia por filtro não culpa a categoria e oferece limpar — LOJA-33', async () => {
    renderCatalogo('/produtos?q=inexistente');
    expect(
      await screen.findByText('Nenhum produto encontrado com esses filtros.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Limpar filtros/i }));
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/produtos$/);
    expect(await nomesNaLista()).toHaveLength(4);
  });

  it('erro de rede mostra "Tentar novamente", que refaz a busca — LOJA-15', async () => {
    fetchProducts.mockRejectedValueOnce(new Error('Não conseguimos falar com a loja.'));
    fetchProducts.mockResolvedValue(CATALOGO);
    render(
      <MemoryRouter initialEntries={['/produtos']}>
        <ProductsPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Tentar novamente/i }));
    expect(await nomesNaLista()).toHaveLength(4);
  });
});
