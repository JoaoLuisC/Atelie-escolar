import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminPage } from '../AdminPage';

// ════════════════════════════════════════════════════════════════════
// ADM-23 / CROSS-02 da validação de 2026-10-01 — "editar e salvar sem mudar
// nada" apagava a 2ª imagem, o preço original, o tipo kit, FAQ, benefícios e
// depoimentos, e REATIVAVA o produto pausado.
//
// Causa: o wizard era alimentado pela linha RESUMIDA do /admin/dashboard, e o
// PUT mandava `active: true` sempre. Este teste roda a cadeia real (AdminPage →
// serviço → `fetch`), com só o `fetch` trocado: a linha resumida da lista não
// pode ser a fonte da edição, e o PUT não pode falar de `active`.
//
// De quebra trava o ADM-01/ADM-24: toda leitura do painel sai com
// `cache: 'no-store'`.
// ════════════════════════════════════════════════════════════════════

const setAdminAuthenticated = vi.fn();
const pushToast = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    logoutAdmin: vi.fn(),
    setAdminAuthenticated,
    adminAuthenticated: true,
  }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast }),
}));

const PRODUTO_ID = '55392863-def7-49b9-a803-abb4f29b5854';
const CATEGORIA_ID = 'd8f53f51-0074-41c5-b825-888237692d36';

// O que o /admin/dashboard devolve: SEM galeria, preço original, tipo, FAQ…
const LINHA_RESUMIDA = {
  id: PRODUTO_ID,
  name: 'Kit Festa',
  description: 'desc',
  price: 9.9,
  image: 'https://cdn/a.png',
  downloadUrl: 'product_files/a.pdf',
  category: 'Festa Junina',
  categoryId: CATEGORIA_ID,
  active: false,
  featured: true,
};

// O que o GET /admin/products?id= devolve: o produto inteiro.
const PRODUTO_COMPLETO = {
  ...LINHA_RESUMIDA,
  originalPrice: 19.9,
  images: ['https://cdn/a.png', 'https://cdn/b.png'],
  videos: [],
  productType: 'kit',
  isKit: true,
  faq: [{ question: 'P?', answer: 'R.' }],
  reviews: [{ author: 'Ana', role: '', location: '', text: 'Bom', rating: 5 }],
  benefits: [{ icon: '', label: 'PDF' }],
};

function respond(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function installFetch() {
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const path = String(url).replace(/^.*\/api/, '');
    const method = options.method || 'GET';
    if (path.startsWith('/admin/session')) {
      return respond({ success: true, authenticated: true, email: 'dona@loja.test' });
    }
    if (path.startsWith('/admin/dashboard')) {
      return respond({
        success: true,
        summary: {},
        products: [LINHA_RESUMIDA],
        categories: [{ id: CATEGORIA_ID, name: 'Festa Junina' }],
        orders: [],
        users: [],
        settings: {},
      });
    }
    if (path.startsWith('/admin/kpis')) return respond({ success: true, kpis: null });
    if (path === `/admin/products?id=${PRODUTO_ID}`) {
      return respond({ success: true, product: PRODUTO_COMPLETO });
    }
    if (path === '/admin/products' && method === 'PUT') return respond({ success: true });
    return respond({ success: false, error: { code: 'NOT_FOUND', message: path } }, 404);
  });
}

// Abas e wizard chegam por `lazy()`: com a suíte inteira rodando em paralelo,
// o import dinâmico passa do 1 s padrão do `findBy*`.
const LAZY = { timeout: 8000 };

function renderAdminPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage · editar produto não destrói dados (ADM-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFetch();
  });

  it(
    'carrega o produto completo, e o PUT preserva galeria/FAQ/tipo e não fala de `active`',
    { timeout: 30000 },
    async () => {
      renderAdminPage();

      fireEvent.click(await screen.findByRole('button', { name: /^Produtos$/ }, LAZY));
      fireEvent.click(screen.getByRole('button', { name: 'Lista de produtos' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Editar Kit Festa' }, LAZY));

      // A fonte da edição é o GET por id, não a linha da lista.
      await screen.findByRole('heading', { name: 'Editar Produto' }, LAZY);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/admin/products?id=${PRODUTO_ID}`),
        expect.objectContaining({ cache: 'no-store' }),
      );

      // O formulário é preenchido por efeito, depois do 1º render do wizard.
      await screen.findByDisplayValue('Kit Festa', {}, LAZY);
      // Avança os 3 passos sem mexer em nada e salva.
      for (let i = 0; i < 3; i += 1) {
        fireEvent.click(screen.getByRole('button', { name: 'Avançar →' }));
      }
      fireEvent.click(screen.getByRole('button', { name: /Salvar Produto/ }));

      await waitFor(() => {
        expect(globalThis.fetch.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(
          true,
        );
      }, LAZY);
      const [, putOptions] = globalThis.fetch.mock.calls.find(
        ([, options]) => options?.method === 'PUT',
      );
      const body = JSON.parse(putOptions.body);

      expect(body).not.toHaveProperty('active');
      expect(body.images).toEqual(PRODUTO_COMPLETO.images);
      expect(body.originalPrice).toBe(19.9);
      expect(body.productType).toBe('kit');
      expect(body.isKit).toBe(true);
      expect(body.featured).toBe(true);
      expect(body.faq).toHaveLength(1);
      expect(body.reviews).toHaveLength(1);
      expect(body.benefits).toHaveLength(1);
      // A categoria vai como o UUID da categoria EXISTENTE (ADM-22 é do servidor).
      expect(body.categoryId).toBe(CATEGORIA_ID);
    },
  );

  it('toda leitura do painel pede `cache: no-store` (ADM-01/ADM-24)', async () => {
    renderAdminPage();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/dashboard'),
        expect.anything(),
      );
    });
    for (const [url, options] of globalThis.fetch.mock.calls) {
      if (String(url).includes('/admin/')) {
        expect(options, String(url)).toEqual(expect.objectContaining({ cache: 'no-store' }));
      }
    }
  });

  it('mostra no rodapé o e-mail da conta admin logada (ADM-19)', async () => {
    renderAdminPage();
    expect(await screen.findByText('dona@loja.test', {}, LAZY)).toBeInTheDocument();
  });
});
