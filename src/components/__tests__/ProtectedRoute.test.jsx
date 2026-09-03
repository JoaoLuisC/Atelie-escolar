import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { ProtectedRoute } from '../ProtectedRoute';
import { PROFESSOR_LOGIN_PATH } from '../../constants/routes';

// ════════════════════════════════════════════════════════════════════
// `ProtectedRoute` — o único guard de rota do app.
//
// POR QUE ELE MERECE TESTE PRÓPRIO
// São 39 linhas com TRÊS estados, e o do meio é o que costuma sumir num
// refactor: enquanto a sessão não foi verificada (`authReady === false`) o
// componente não pode nem liberar nem redirecionar. Liberar seria abrir o
// painel a quem não provou nada; redirecionar jogaria a dona para o login a
// cada F5, porque no primeiro render `adminAuthenticated` é sempre `false`.
//
// O bypass de desenvolvimento é a outra metade: ele existe para o trabalho
// local, e depende de `import.meta.env.DEV` para ficar INERTE no bundle de
// produção — `VITE_ALLOW_ADMIN_BYPASS` é inlined e pode vazar para o deploy.
// ════════════════════════════════════════════════════════════════════

const authState = { authReady: true, adminAuthenticated: false };

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

function renderRoute({ authReady, adminAuthenticated }) {
  authState.authReady = authReady;
  authState.adminAuthenticated = adminAuthenticated;

  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <p>painel secreto</p>
            </ProtectedRoute>
          }
        />
        <Route path={PROFESSOR_LOGIN_PATH} element={<p>tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ProtectedRoute', () => {
  it('sessão verificada e admin autenticado: renderiza o conteúdo', () => {
    renderRoute({ authReady: true, adminAuthenticated: true });

    expect(screen.getByText('painel secreto')).toBeInTheDocument();
  });

  it('sessão verificada e NÃO autenticado: manda para o login', () => {
    renderRoute({ authReady: true, adminAuthenticated: false });

    expect(screen.getByText('tela de login')).toBeInTheDocument();
    expect(screen.queryByText('painel secreto')).not.toBeInTheDocument();
  });

  describe('enquanto a sessão não foi verificada', () => {
    it('não renderiza o conteúdo protegido', () => {
      // Liberar aqui abriria o painel antes de qualquer prova de identidade.
      renderRoute({ authReady: false, adminAuthenticated: false });

      expect(screen.queryByText('painel secreto')).not.toBeInTheDocument();
    });

    it('não redireciona para o login', () => {
      // Redirecionar aqui jogaria a dona para o login a cada F5: no primeiro
      // render `adminAuthenticated` é sempre false, antes de a sessão chegar.
      renderRoute({ authReady: false, adminAuthenticated: false });

      expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
    });

    it('mostra o estado de verificação', () => {
      renderRoute({ authReady: false, adminAuthenticated: false });

      expect(screen.getByText('Verificando sessão')).toBeInTheDocument();
    });

    it('segura o conteúdo mesmo quando já autenticado', () => {
      // `authReady` é o portão: sem ele, a ordem de chegada dos dois estados
      // decidiria o que aparece na tela.
      renderRoute({ authReady: false, adminAuthenticated: true });

      expect(screen.queryByText('painel secreto')).not.toBeInTheDocument();
      expect(screen.getByText('Verificando sessão')).toBeInTheDocument();
    });
  });

  describe('bypass de desenvolvimento', () => {
    it('com DEV + flag ligada, libera sem sessão', () => {
      vi.stubEnv('DEV', true);
      vi.stubEnv('VITE_ALLOW_ADMIN_BYPASS', 'true');

      renderRoute({ authReady: true, adminAuthenticated: false });

      expect(screen.getByText('painel secreto')).toBeInTheDocument();
    });

    it('FORA de DEV a flag é inerte, mesmo valendo "true"', () => {
      // A propriedade que importa: `VITE_*` é inlined no bundle público, então
      // a flag PODE vazar para produção. `import.meta.env.DEV` é o que garante
      // que vazar não abre o painel.
      vi.stubEnv('DEV', false);
      vi.stubEnv('VITE_ALLOW_ADMIN_BYPASS', 'true');

      renderRoute({ authReady: true, adminAuthenticated: false });

      expect(screen.queryByText('painel secreto')).not.toBeInTheDocument();
      expect(screen.getByText('tela de login')).toBeInTheDocument();
    });

    it('em DEV, qualquer valor diferente de "true" não libera', () => {
      vi.stubEnv('DEV', true);
      vi.stubEnv('VITE_ALLOW_ADMIN_BYPASS', '1');

      renderRoute({ authReady: true, adminAuthenticated: false });

      expect(screen.queryByText('painel secreto')).not.toBeInTheDocument();
    });
  });
});
