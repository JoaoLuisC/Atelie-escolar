import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomePage } from '../HomePage';
import { fetchHomeContent } from '../../services/products';

// A home montada a partir do conteúdo salvo no painel (aba "Página inicial").

vi.mock('../../services/products', () => ({
  fetchHomeContent: vi.fn(),
  fetchHomeSections: vi.fn(async () => []),
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

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('HomePage · conteúdo configurável', () => {
  it('usa o título salvo, com o trecho entre asteriscos destacado', async () => {
    fetchHomeContent.mockResolvedValue({ hero: { title: 'Materiais com *amor*' } });
    renderHome();

    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Materiais com amor');
    expect(screen.getByText('amor').className).toMatch(/bg-clip-text/);
  });

  it('bloco desligado não aparece', async () => {
    fetchHomeContent.mockResolvedValue({
      blocks: [{ id: 'howItWorks', enabled: false }],
    });
    renderHome();

    await screen.findByRole('heading', { level: 1 });
    expect(document.getElementById('como-funciona')).toBeNull();
  });

  it('imagem do hero aparece inteira (object-contain) quando configurada', async () => {
    fetchHomeContent.mockResolvedValue({
      hero: { imageUrl: 'https://x.supabase.co/hero.png', imageAlt: 'Painel da professora' },
    });
    renderHome();

    const img = await screen.findByAltText('Painel da professora');
    expect(img).toHaveClass('object-contain');
  });

  it('falha ao carregar a configuração cai nos textos padrão, sem quebrar', async () => {
    fetchHomeContent.mockRejectedValue(new Error('rede'));
    renderHome();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      /Painéis e recursos pedagógicos/,
    );
  });

  it('testemunhos e redes vazios somem', async () => {
    fetchHomeContent.mockResolvedValue({
      socialProof: { testimonials: [], instagramUrl: '', tiktokUrl: '' },
    });
    renderHome();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/Carla M\./)).toBeNull();
    // O rodapé (Shell) tem o próprio ícone do Instagram; o que some é o botão
    // da seção, que mostra o @ da conta.
    expect(screen.queryByText('@profamarciarcardoso')).toBeNull();
  });
});
