import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { HomePreview } from '../HomePreview';
import { mergeHomeContent } from '../../../../constants/home-content';

// A prévia ao vivo da aba "Página da loja": mostra o RASCUNHO do editor na
// própria HomePage, sem buscar o conteúdo salvo e sem cabeçalho da loja.

const fetchHomeContent = vi.fn(async () => ({ hero: { title: 'Texto SALVO no site' } }));
vi.mock('../../../../services/products', () => ({
  fetchHomeContent: (...args) => fetchHomeContent(...args),
  fetchHomeSections: async () => [],
}));

function renderPreview(content, dirty = false) {
  return render(
    <MemoryRouter>
      <HomePreview content={content} dirty={dirty} />
    </MemoryRouter>,
  );
}

describe('HomePreview', () => {
  it('mostra o rascunho, não o conteúdo salvo', async () => {
    const draft = mergeHomeContent({ hero: { title: 'Título do rascunho' } });
    renderPreview(draft);

    expect(await screen.findByText('Título do rascunho')).toBeInTheDocument();
    expect(fetchHomeContent).not.toHaveBeenCalled();
    expect(screen.queryByText('Texto SALVO no site')).not.toBeInTheDocument();
  });

  it('avisa quando há alteração não salva', async () => {
    renderPreview(mergeHomeContent({}), true);
    expect(await screen.findByText('Alterações ainda não salvas')).toBeInTheDocument();
  });

  it('bloco escondido no editor some da prévia', async () => {
    const draft = mergeHomeContent({
      hero: { title: 'Banner visível' },
      blocks: [{ id: 'hero', enabled: false }],
    });
    renderPreview(draft);

    await screen.findByText('Igual ao que está no site');
    expect(screen.queryByText('Banner visível')).not.toBeInTheDocument();
  });
});
