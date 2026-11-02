import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { HomePreview, setPath } from '../HomePreview';
import { mergeHomeContent } from '../../../../constants/home-content';

// A prévia da aba "Página da loja": mostra o RASCUNHO do editor na própria
// HomePage — com cabeçalho e rodapé do rascunho —, sem buscar o conteúdo
// salvo. Em "Editar na página", os textos viram campos e as partes se movem.

const fetchHomeContent = vi.fn(async () => ({ hero: { title: 'Texto SALVO no site' } }));
vi.mock('../../../../services/products', () => ({
  fetchHomeContent: (...args) => fetchHomeContent(...args),
  fetchHomeSections: async () => [],
}));
vi.mock('../../../../services/store-settings', () => ({
  fetchStoreSettings: vi.fn(async () => ({ navigation: { title: 'Nome SALVO' } })),
}));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ customerSession: null, logoutCustomer: vi.fn() }),
}));
vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));
vi.mock('../../../../hooks/useCart', () => ({
  useCart: () => ({ addToCart: () => ({ ok: true, message: '' }) }),
}));

function renderPreview(content, props = {}) {
  return render(
    <MemoryRouter>
      <HomePreview content={content} {...props} />
    </MemoryRouter>,
  );
}

describe('HomePreview', () => {
  it('mostra o rascunho, não o conteúdo salvo — inclusive no cabeçalho e no rodapé', async () => {
    const draft = mergeHomeContent({
      hero: { title: 'Título do rascunho' },
      navigation: { title: 'Nome do RASCUNHO' },
      footer: { copyright: '© rascunho' },
    });
    renderPreview(draft);

    expect(await screen.findByText('Título do rascunho')).toBeInTheDocument();
    expect(fetchHomeContent).not.toHaveBeenCalled();
    expect(screen.queryByText('Texto SALVO no site')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveTextContent('Nome do RASCUNHO');
    expect(screen.queryByText('Nome SALVO')).not.toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('© rascunho');
  });

  it('avisa quando há alteração não salva', async () => {
    renderPreview(mergeHomeContent({}), { dirty: true });
    expect(await screen.findByText('Alterações ainda não salvas')).toBeInTheDocument();
  });

  it('bloco escondido some da prévia (só olhando)', async () => {
    const draft = mergeHomeContent({
      hero: { title: 'Banner visível' },
      blocks: [{ id: 'hero', enabled: false }],
    });
    renderPreview(draft);

    await screen.findByText('Igual ao que está no site');
    expect(screen.queryByText('Banner visível')).not.toBeInTheDocument();
  });

  it('troca o tamanho de tela da prévia', async () => {
    renderPreview(mergeHomeContent({}));
    const celular = await screen.findByRole('button', { name: 'Celular' });
    fireEvent.click(celular);
    expect(celular).toHaveAttribute('aria-pressed', 'true');
  });

  describe('editando na página', () => {
    it('digitar num texto manda o rascunho novo pelo onChange', async () => {
      const onChange = vi.fn();
      const draft = mergeHomeContent({ catalog: { eyebrow: 'Catálogo' } });
      renderPreview(draft, { editing: true, onChange });

      const campo = await screen.findByRole('textbox', { name: 'Editar catalog.eyebrow' });
      campo.textContent = 'Novidades';
      fireEvent.input(campo);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ catalog: expect.objectContaining({ eyebrow: 'Novidades' }) }),
      );
    });

    it('as setas de cada parte mudam a ordem; esconder desliga o bloco', async () => {
      const onChange = vi.fn();
      renderPreview(mergeHomeContent({}), { editing: true, onChange });

      fireEvent.click(
        await screen.findByRole('button', { name: 'Descer Banner principal (topo da página)' }),
      );
      expect(onChange.mock.calls[0][0].blocks.map((block) => block.id).slice(0, 2)).toEqual([
        'marquee',
        'hero',
      ]);

      fireEvent.click(screen.getAllByRole('button', { name: 'Esconder' })[0]);
      expect(onChange.mock.calls[1][0].blocks[0]).toEqual({ id: 'hero', enabled: false });
    });

    it('bloco escondido continua visível como aviso, para poder voltar', async () => {
      const draft = mergeHomeContent({ blocks: [{ id: 'marquee', enabled: false }] });
      renderPreview(draft, { editing: true });
      expect(
        await screen.findByText(/Faixa de palavras que desliza está escondido/),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mostrar' })).toBeInTheDocument();
    });

    it('"Editar campos" avisa qual seção abrir no formulário', async () => {
      const onOpenSection = vi.fn();
      renderPreview(mergeHomeContent({}), { editing: true, onOpenSection });
      fireEvent.click((await screen.findAllByRole('button', { name: 'Editar campos' }))[0]);
      expect(onOpenSection).toHaveBeenCalledWith('hero');
    });

    it('links da loja não navegam enquanto se edita', async () => {
      renderPreview(mergeHomeContent({}), { editing: true });
      const link = (await screen.findAllByRole('link', { name: /Produtos/ }))[0];
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });
});

describe('setPath', () => {
  it('grava num caminho aninhado sem mutar o original', () => {
    const base = { howItWorks: { steps: [{ title: 'a' }, { title: 'b' }] } };
    const next = setPath(base, 'howItWorks.steps.1.title', 'B');
    expect(next.howItWorks.steps[1].title).toBe('B');
    expect(base.howItWorks.steps[1].title).toBe('b');
    expect(next.howItWorks.steps[0]).toBe(base.howItWorks.steps[0]);
  });
});
