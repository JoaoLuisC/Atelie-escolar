import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmSubscriptionPage, UnsubscribePage } from '../SubscriptionPages';

// O `Shell` (cabeçalho/rodapé) consome `useAuth` e `useCart`. Nenhum dos dois
// participa do que este arquivo verifica.
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ customerSession: null, logoutCustomer: vi.fn() }),
}));

vi.mock('../../hooks/useCart', () => ({
  useCart: () => ({ cart: [], cartCount: 0, addToCart: vi.fn(), removeFromCart: vi.fn() }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

// ════════════════════════════════════════════════════════════════════
// `SubscriptionPages` — itens P4.2 (cobertura) e D5 (queimar o aviso).
//
// O aviso `react-hooks/set-state-in-effect` aqui não era estilo. "Sem token" é
// conhecido no PRIMEIRO render — está na URL, não vem de rede —, e mesmo assim
// a página pintava "Confirmando sua inscrição…" para só então trocar para o
// erro. Quem clicava num link truncado via, por um quadro, a promessa de que
// algo estava sendo confirmado.
//
// Estes testes afirmam sobre o PRIMEIRO render de propósito: é isso que
// impede o padrão de voltar.
// ════════════════════════════════════════════════════════════════════

function renderEm(caminho, elemento) {
  return render(<MemoryRouter initialEntries={[caminho]}>{elemento}</MemoryRouter>);
}

function respostaJson(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('ConfirmSubscriptionPage', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => respostaJson({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem token: erro JÁ no primeiro render, sem passar por "confirmando"', () => {
    // Sem `await`: o estado certo tem de nascer certo.
    renderEm('/confirmar-inscricao', <ConfirmSubscriptionPage />);

    expect(screen.getByText(/Link inválido/i)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmando sua inscrição/i)).not.toBeInTheDocument();
    // E nem chega a chamar a API por um token que não existe.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('com token: confirma e mostra as boas-vindas', async () => {
    globalThis.fetch = vi.fn(async () => respostaJson({ success: true, email: 'a@b.com' }));

    renderEm('/confirmar-inscricao?token=tok-1', <ConfirmSubscriptionPage />);

    expect(await screen.findByText(/Inscrição confirmada/i)).toBeInTheDocument();
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain(
      '/confirm-subscription?token=tok-1',
    );
  });

  it('já confirmado antes tem mensagem própria', async () => {
    globalThis.fetch = vi.fn(async () => respostaJson({ success: true, alreadyConfirmed: true }));

    renderEm('/confirmar-inscricao?token=tok-1', <ConfirmSubscriptionPage />);

    expect(await screen.findByText(/já tinha confirmado antes/i)).toBeInTheDocument();
  });

  it('erro do backend chega pela mensagem do ENVELOPE, não por texto inventado', async () => {
    // Depois que o shim de achatamento saiu (P1.x), a mensagem mora em
    // `error.message`. Se alguém voltar a ler `data.error` como string, este
    // teste cai.
    globalThis.fetch = vi.fn(async () =>
      respostaJson(
        {
          success: false,
          error: { code: 'CONFIRMATION_EXPIRED', message: 'Este link expirou.' },
        },
        { ok: false, status: 410 },
      ),
    );

    renderEm('/confirmar-inscricao?token=velho', <ConfirmSubscriptionPage />);

    expect(await screen.findByText('Este link expirou.')).toBeInTheDocument();
  });

  it('token escapado na query string', async () => {
    renderEm('/confirmar-inscricao?token=a%2Fb', <ConfirmSubscriptionPage />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain('token=a%2Fb');
  });
});

describe('UnsubscribePage', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => respostaJson({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem token mostra o formulário e não chama a API', () => {
    renderEm('/desinscrever', <UnsubscribePage />);

    expect(screen.getByLabelText(/Email cadastrado/i)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('com token cancela direto e troca o título', async () => {
    globalThis.fetch = vi.fn(async () =>
      respostaJson({ success: true, message: 'Inscrição cancelada.' }),
    );

    renderEm('/desinscrever?token=tok-1', <UnsubscribePage />);

    expect(await screen.findByText(/Pronto, você foi removido/i)).toBeInTheDocument();
  });

  it('`confirmationRequired` NÃO é sucesso nem erro — o formulário fica', async () => {
    // Item P1.5: antes isto vinha como `success: false`, o que pintava de erro
    // uma operação que deu certo. Agora é um campo de domínio num corpo de
    // sucesso, e a tela mantém o formulário com a mensagem neutra.
    globalThis.fetch = vi.fn(async () =>
      respostaJson({
        success: true,
        confirmationRequired: true,
        message: 'Se este e-mail estiver na lista, enviamos um link de confirmação.',
      }),
    );

    renderEm('/desinscrever', <UnsubscribePage />);

    const campo = screen.getByLabelText(/Email cadastrado/i);
    fireEvent.change(campo, { target: { value: 'cliente@exemplo.test' } });
    fireEvent.submit(campo.closest('form'));

    expect(await screen.findByText(/enviamos um link de confirmação/i)).toBeInTheDocument();
    // Título NÃO vira "Pronto, você foi removido" — nada foi removido ainda.
    expect(screen.queryByText(/Pronto, você foi removido/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Email cadastrado/i)).toBeInTheDocument();
  });
});
