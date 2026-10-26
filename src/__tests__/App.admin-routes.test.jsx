import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import App from '../App';
import { ROUTES } from '../constants/routes';

// ════════════════════════════════════════════════════════════════════
// Qual página cada rota do painel monta.
//
// O commit da plataforma de professores (a2c7d40) apontou `ROUTES.admin` para a
// `PlatformAdminPage` (professores, alunos, faturamento) e o `AdminPage` — o
// painel da loja, com Produtos, Home, Vendas, Cupons e Segurança — ficou sem
// rota nenhuma. Em produção a dona perdeu o cadastro de produto sem nenhum
// teste falhar. As páginas são trocadas por marcadores: o que importa aqui é
// o mapa rota → página, não o conteúdo delas.
// ════════════════════════════════════════════════════════════════════

const authState = { authReady: true, adminAuthenticated: true, adminRole: 'admin' };

vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../pages/AdminPage', () => ({ AdminPage: () => <p>painel-da-loja</p> }));
vi.mock('../pages/PlatformAdminPage', () => ({
  PlatformAdminPage: () => <p>painel-da-plataforma</p>,
}));
vi.mock('../pages/TeachersPage', () => ({ TeachersPage: () => <p>area-do-professor</p> }));
vi.mock('../pages/AdminLoginPage', () => ({ AdminLoginPage: () => <p>login</p> }));

function renderAt(path, role) {
  authState.adminRole = role;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('rotas do painel', () => {
  it('/admin abre o painel da loja', async () => {
    renderAt(ROUTES.admin, 'admin');
    expect(await screen.findByText('painel-da-loja')).toBeInTheDocument();
  });

  it('/admin/plataforma abre a visão da plataforma para admin', async () => {
    renderAt(ROUTES.adminPlataforma, 'master');
    expect(await screen.findByText('painel-da-plataforma')).toBeInTheDocument();
  });

  it('professor não entra no painel da loja nem na plataforma', async () => {
    renderAt(ROUTES.admin, 'seller');
    expect(await screen.findByText('login')).toBeInTheDocument();
  });

  it('/professores abre a área do professor', async () => {
    renderAt(ROUTES.professores, 'seller');
    expect(await screen.findByText('area-do-professor')).toBeInTheDocument();
  });
});
