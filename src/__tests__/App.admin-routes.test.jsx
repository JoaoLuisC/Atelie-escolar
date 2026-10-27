import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import App from '../App';
import { ROUTES } from '../constants/routes';

// ════════════════════════════════════════════════════════════════════
// Qual painel cada rota e cada conta abrem.
//
// O commit da plataforma de professores (a2c7d40) já deixou o painel da loja
// sem rota uma vez, sem nenhum teste falhar. Hoje são três destinos:
//   • admin/master em /admin       → painel da PLATAFORMA (professores e
//     clientes, usuários, segurança);
//   • dona da loja em /professores → painel da LOJA (produtos, pedidos…);
//   • outro professor em /professores → área simples.
// As páginas viram marcadores: o que importa é o mapa rota × conta → página.
// ════════════════════════════════════════════════════════════════════

const authState = {
  authReady: true,
  adminAuthenticated: true,
  adminRole: 'admin',
  adminStoreOwner: false,
};

vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../pages/AdminPage', () => ({
  AdminPage: ({ variant }) => <p>painel-{variant}</p>,
}));
vi.mock('../pages/TeachersPage', () => ({ TeachersPage: () => <p>area-do-professor</p> }));
vi.mock('../pages/AdminLoginPage', () => ({ AdminLoginPage: () => <p>login</p> }));

function renderAt(path, { role, storeOwner = false }) {
  authState.adminRole = role;
  authState.adminStoreOwner = storeOwner;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('rotas do painel', () => {
  it('admin em /admin abre o painel da plataforma', async () => {
    renderAt(ROUTES.admin, { role: 'admin' });
    expect(await screen.findByText('painel-platform')).toBeInTheDocument();
  });

  it('o antigo /admin/plataforma leva ao /admin', async () => {
    renderAt('/admin/plataforma', { role: 'master' });
    expect(await screen.findByText('painel-platform')).toBeInTheDocument();
  });

  it('dona da loja em /professores abre o painel da loja', async () => {
    renderAt(ROUTES.professores, { role: 'seller', storeOwner: true });
    expect(await screen.findByText('painel-store')).toBeInTheDocument();
  });

  it('outro professor em /professores fica com a área simples', async () => {
    renderAt(ROUTES.professores, { role: 'seller' });
    expect(await screen.findByText('area-do-professor')).toBeInTheDocument();
  });

  it('professor(a) logado(a) no /admin vai para o painel dele(a), não para o login', async () => {
    renderAt(ROUTES.admin, { role: 'seller', storeOwner: true });
    expect(await screen.findByText('painel-store')).toBeInTheDocument();
    expect(screen.queryByText('painel-platform')).not.toBeInTheDocument();
  });

  it('admin logado no /professores vai para o /admin', async () => {
    renderAt(ROUTES.professores, { role: 'admin' });
    expect(await screen.findByText('painel-platform')).toBeInTheDocument();
  });

  it('sem sessão, o /admin mostra o login', async () => {
    authState.adminAuthenticated = false;
    try {
      renderAt(ROUTES.admin, { role: null });
      expect(await screen.findByText('login')).toBeInTheDocument();
    } finally {
      authState.adminAuthenticated = true;
    }
  });
});
