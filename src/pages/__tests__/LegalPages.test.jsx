import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { describe, expect, it, vi } from 'vitest';

import { PrivacyPage, TermsPage } from '../LegalPages';
import { SELLER } from '../../constants/seller';

// Decreto 7.962/2013, art. 2º: quem vende online precisa mostrar nome
// empresarial, CNPJ, endereço e contato. Os dois documentos (e o rodapé) leem
// de src/constants/seller.js; este teste trava que a identificação não suma
// numa reescrita do texto.

vi.mock('../../hooks/useCart', () => ({
  useCart: () => ({ items: [], count: 0, addToCart: () => ({ ok: true, message: '' }) }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ customerSession: null, logoutCustomer: vi.fn() }),
}));

function renderPage(Page) {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe.each([
  ['Termos de Uso', TermsPage],
  ['Política de Privacidade', PrivacyPage],
])('%s', (_nome, Page) => {
  it('identifica quem vende: razão social, CNPJ, cidade e e-mail', () => {
    renderPage(Page);
    const main = screen.getByRole('main');

    expect(main).toHaveTextContent(SELLER.name);
    expect(main).toHaveTextContent(SELLER.cnpj);
    expect(main).toHaveTextContent(SELLER.city);
    expect(main).toHaveTextContent(SELLER.email);
  });

  it('não cita mais o domínio antigo, que não existe', () => {
    const { container } = renderPage(Page);
    expect(container.innerHTML).not.toContain('profamarciarcardoso.com.br');
  });
});
