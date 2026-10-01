import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { ProtectedRoute } from '../ProtectedRoute';
import { ROUTES } from '../../constants/routes';

// ════════════════════════════════════════════════════════════════════
// `ProtectedRoute` — o único guard de rota do app.
//
// POR QUE ELE MERECE TESTE PRÓPRIO
// São poucas linhas com TRÊS estados, e o do meio é o que costuma sumir num
// refactor: enquanto a sessão não foi verificada (`authReady === false`) o
// componente não pode nem liberar nem mostrar o login. Liberar seria abrir o
// painel a quem não provou nada; mostrar o login pediria senha à dona a cada
// F5, porque no primeiro render `adminAuthenticated` é sempre `false`.
//
// Sem sessão, o login aparece NA PRÓPRIA `/admin` (o `fallback`), sem
// redirect: `/admin` é a única entrada do painel.
//
// O bypass de desenvolvimento é a outra metade: ele existe para o trabalho
// local, e depende de `import.meta.env.DEV` para ficar INERTE no bundle de
// produção — `VITE_ALLOW_ADMIN_BYPASS` é inlined e pode vazar para o deploy.
// ════════════════════════════════════════════════════════════════════

const authState = { authReady: true, adminAuthenticated: false };

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

function renderRoute({ authReady, adminAuthenticated, path = ROUTES.admin }) {
  authState.authReady = authReady;
  authState.adminAuthenticated = adminAuthenticated;

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={ROUTES.admin}
          element={
            <ProtectedRoute fallback={<p>tela de login</p>}>
              <p>painel secreto</p>
            </ProtectedRoute>
          }
        />
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
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
  });

  it('sessão verificada e NÃO autenticado: mostra o login na própria /admin', () => {
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

    it('não mostra o login', () => {
      // Mostrar aqui pediria senha à dona a cada F5: no primeiro render
      // `adminAuthenticated` é sempre false, antes de a sessão chegar.
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

    it('com bypass ligado, `?login` ainda mostra o formulário', () => {
      // Sem isto, ligar o bypass tornaria impossível obter uma sessão real
      // em DEV: `/admin` é a única porta de entrada do login.
      vi.stubEnv('DEV', true);
      vi.stubEnv('VITE_ALLOW_ADMIN_BYPASS', 'true');

      renderRoute({ authReady: true, adminAuthenticated: false, path: `${ROUTES.admin}?login` });

      expect(screen.getByText('tela de login')).toBeInTheDocument();
      expect(screen.queryByText('painel secreto')).not.toBeInTheDocument();
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
