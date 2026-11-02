import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { HomeContentEditor } from '../HomeContentEditor';

// Editor da Página da loja: dois modos sobre o mesmo rascunho, seções na
// ordem da página e um "Aprimorar seção" por parte com texto.

const fetchAdminSetting = vi.fn(async () => ({ value: {} }));
const saveAdminSetting = vi.fn(async () => ({}));
const requestAiAssist = vi.fn(async () => ({ titulo: 'Título da IA', botao: 'Ver tudo' }));
vi.mock('../../../../services/admin-panel', () => ({
  fetchAdminSetting: (...args) => fetchAdminSetting(...args),
  saveAdminSetting: (...args) => saveAdminSetting(...args),
  requestAiAssist: (...args) => requestAiAssist(...args),
  uploadProductAsset: vi.fn(),
}));
vi.mock('../../../../services/products', () => ({
  fetchHomeContent: vi.fn(async () => ({})),
  fetchHomeSections: vi.fn(async () => []),
}));
vi.mock('../../../../services/store-settings', () => ({
  fetchStoreSettings: vi.fn(async () => ({})),
}));
const pushToast = vi.fn();
vi.mock('../../../../hooks/useToast', () => ({ useToast: () => ({ pushToast }) }));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ customerSession: null, logoutCustomer: vi.fn() }),
}));
vi.mock('../../../../hooks/useCart', () => ({
  useCart: () => ({ addToCart: () => ({ ok: true, message: '' }) }),
}));

function renderEditor() {
  return render(
    <MemoryRouter>
      <HomeContentEditor />
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('HomeContentEditor', () => {
  it('abre em "Editar na página", com a prévia editável', async () => {
    renderEditor();
    expect(await screen.findByText('Editando na página')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar na página' })).toBeInTheDocument();
  });

  it('"Editar pelos campos" lista as seções na ordem da página', async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar pelos campos' }));

    const titles = [
      ...document.querySelectorAll('details > summary > span > span.font-semibold'),
    ].map((el) => el.textContent);
    expect(titles).toEqual([
      'Ordem e visibilidade das partes',
      'Barra de navegação',
      'Banner principal (topo da página)',
      'Faixa de palavras que desliza',
      'Vitrine de produtos',
      'Passo a passo da compra',
      'Depoimentos, números e redes sociais',
      'Rodapé',
      'Como a loja aparece no Google',
    ]);
  });

  it('cada parte com texto tem o seu "Aprimorar seção", que só gera no clique e aplica ao rascunho', async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar pelos campos' }));

    const buttons = screen.getAllByRole('button', { name: 'Aprimorar seção' });
    expect(buttons).toHaveLength(6);
    expect(requestAiAssist).not.toHaveBeenCalled();

    fireEvent.click(buttons[0]); // banner
    expect(requestAiAssist).toHaveBeenCalledWith('homeHero', {
      currentText: expect.stringContaining('Título:'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Usar estes textos' }));

    const banner = document.getElementById('secao-hero');
    // O rótulo inclui o texto de ajuda; por isso o começo.
    expect(within(banner).getByLabelText(/^Título/)).toHaveValue('Título da IA');
    expect(within(banner).getByLabelText(/^Texto do botão/)).toHaveValue('Ver tudo');
    expect(saveAdminSetting).not.toHaveBeenCalled();
  });

  it('salvar manda o rascunho inteiro para a chave homeContent', async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar pelos campos' }));
    const nav = document.getElementById('secao-navigation');
    fireEvent.click(within(nav).getByText('Barra de navegação'));
    fireEvent.change(within(nav).getByLabelText('Nome ao lado do logo'), {
      target: { value: 'Loja da Ana' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Salvar página' })[0]);

    await screen.findByText(/Página salva/);
    expect(saveAdminSetting).toHaveBeenCalledWith({
      key: 'homeContent',
      value: expect.objectContaining({
        navigation: expect.objectContaining({ title: 'Loja da Ana' }),
      }),
    });
  });
});
