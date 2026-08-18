import { MemoryRouter } from 'react-router-dom';
import { render, waitFor } from '@testing-library/react';
import { AdminPage } from '../AdminPage';

// ════════════════════════════════════════════════════════════════════
// P0.1 — o elo que quebrou o re-login da dona da loja.
//
// Este teste NÃO mocka `src/services/admin-panel.js`. Ele mocka só o `fetch`,
// para que a cadeia inteira rode de verdade:
//
//   envelope do backend
//     → apiRequest / parseJson  (achata `error`, expõe `errorCode`)
//       → apiError              (preserva o code no Error lançado)
//         → isSessionError      (ramifica por code, não por texto)
//           → onAuthExpired     (setAdminAuthenticated(false) + toast)
//
// Mockar o serviço pularia exatamente os dois pontos onde o bug morava. O
// envelope literal abaixo é o que `fail()` de `lib/http.js` emite — a paridade
// dos códigos entre backend e front já é travada por
// `src/constants/__tests__/error-codes.test.js`.
// ════════════════════════════════════════════════════════════════════

const setAdminAuthenticated = vi.fn();
const pushToast = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    logoutAdmin: vi.fn(),
    setAdminAuthenticated,
    adminAuthenticated: true,
  }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast }),
}));

function respondWith(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderAdminPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage · sessão expirada (P0.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispara onAuthExpired diante do envelope com ADMIN_SESSION_INVALID', async () => {
    globalThis.fetch = vi.fn(async () =>
      respondWith(401, {
        success: false,
        error: {
          code: 'ADMIN_SESSION_INVALID',
          message: 'Sessão admin inválida ou expirada.',
        },
      }),
    );

    renderAdminPage();

    await waitFor(() => {
      expect(setAdminAuthenticated).toHaveBeenCalledWith(false);
    });
    expect(pushToast).toHaveBeenCalledWith(
      'Sessão admin expirada. Faça login novamente.',
      'warning',
    );
  });

  it('NÃO dispara re-login quando o erro é de outra natureza', async () => {
    globalThis.fetch = vi.fn(async () =>
      respondWith(500, {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar painel.' },
      }),
    );

    renderAdminPage();

    // Espera o efeito de carga terminar antes de afirmar a ausência da chamada.
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(setAdminAuthenticated).not.toHaveBeenCalled();
    });
  });

  it('não depende do TEXTO da mensagem — só do code', async () => {
    // Mesmo status e mesma condição, com a mensagem reescrita. Era exatamente
    // este caso que o fallback por `includes('sessao admin')` errava.
    globalThis.fetch = vi.fn(async () =>
      respondWith(401, {
        success: false,
        error: {
          code: 'ADMIN_SESSION_INVALID',
          message: 'Sua credencial de administrador não vale mais.',
        },
      }),
    );

    renderAdminPage();

    await waitFor(() => {
      expect(setAdminAuthenticated).toHaveBeenCalledWith(false);
    });
  });
});
