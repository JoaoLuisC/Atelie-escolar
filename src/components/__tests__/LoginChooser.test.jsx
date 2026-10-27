import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { LoginChooser } from '../LoginChooser';
import { ROUTES } from '../../constants/routes';

// O seletor do topo dos logins: cliente vai para `/login` (Supabase Auth, com
// Google) e professor para `/admin` (sessão de staff). Trocar os destinos
// mandaria a professora para o login de cliente, onde a senha dela não abre
// painel nenhum.

function renderChooser(active) {
  return render(
    <MemoryRouter>
      <LoginChooser active={active} />
    </MemoryRouter>,
  );
}

describe('LoginChooser', () => {
  it('leva cada público ao próprio login', () => {
    renderChooser('cliente');
    expect(screen.getByRole('link', { name: 'Sou cliente' })).toHaveAttribute('href', ROUTES.login);
    expect(screen.getByRole('link', { name: 'Sou professor(a)' })).toHaveAttribute(
      'href',
      ROUTES.admin,
    );
  });

  it('marca a opção da tela atual', () => {
    renderChooser('professor');
    expect(screen.getByRole('link', { name: 'Sou professor(a)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Sou cliente' })).not.toHaveAttribute('aria-current');
  });
});
