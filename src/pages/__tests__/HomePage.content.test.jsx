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

describe('HomePage · banner com foto, degradê e enfeites', () => {
  it('com foto do banner, renderiza <picture> com uma versão por tela e o texto por cima', async () => {
    fetchHomeContent.mockResolvedValue({
      hero: {
        title: 'Volta às aulas',
        banner: {
          desktop: 'https://x.supabase.co/d.jpg',
          tablet: 'https://x.supabase.co/t.jpg',
          mobile: 'https://x.supabase.co/m.jpg',
          alt: 'Arte do banner',
          textOverlay: true,
        },
      },
    });
    renderHome();

    const img = await screen.findByAltText('Arte do banner');
    expect(img).toHaveAttribute('src', 'https://x.supabase.co/d.jpg');
    const sources = img.closest('picture').querySelectorAll('source');
    expect([...sources].map((s) => s.getAttribute('srcset'))).toEqual([
      'https://x.supabase.co/m.jpg',
      'https://x.supabase.co/t.jpg',
    ]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-white');
  });

  it('degradê usa as cores e o ângulo configurados', async () => {
    fetchHomeContent.mockResolvedValue({
      hero: {
        backgroundStyle: 'linear',
        backgroundStops: ['#111111', '#222222', '#333333'],
        gradientAngle: 90,
      },
    });
    renderHome();

    const h1 = await screen.findByRole('heading', { level: 1 });
    const section = h1.closest('section');
    expect(section.style.background).toContain('90deg');
    // O jsdom normaliza a cor para rgb().
    expect(section.style.background).toContain('rgb(17, 17, 17)');
    expect(section.style.background).toContain('rgb(51, 51, 51)');
  });

  it('imagens flutuantes substituem os emojis', async () => {
    fetchHomeContent.mockResolvedValue({
      hero: { floatingImages: ['https://x.supabase.co/estrela.png'] },
    });
    renderHome();

    await screen.findByRole('heading', { level: 1 });
    const floating = document.querySelectorAll('img[src="https://x.supabase.co/estrela.png"]');
    expect(floating.length).toBeGreaterThan(0);
    expect(screen.queryByText('✏️')).toBeNull();
  });
});
