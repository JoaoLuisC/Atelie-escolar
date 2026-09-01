import { render, screen, waitFor } from '@testing-library/react';
import { useContext, useEffect } from 'react';

import { AuthProvider, AuthContext } from '../AuthProvider';

// ════════════════════════════════════════════════════════════════════
// `AuthProvider` — a única fonte de "quem está logado" no app.
//
// O QUE ESTÁ TRAVADO AQUI
//
// 1. **`authReady` sempre chega**, inclusive quando as duas consultas de sessão
//    FALHAM. Se ele ficasse preso em `false`, o `ProtectedRoute` mostraria
//    "Verificando sessão" para sempre e o painel viraria inalcançável — uma
//    falha de rede no boot trancaria a dona para fora.
//
// 2. **2FA pendente NÃO é sessão.** `loginAdmin` só marca `adminAuthenticated`
//    quando o backend não pediu segundo fator. Marcar antes daria acesso ao
//    painel a quem só provou a senha — que é exatamente o que o 2FA existe
//    para impedir.
//
// 3. **Cadastro que exige verificação de e-mail não abre sessão.**
//
// 4. **`setCustomerSession` normaliza e rejeita sessão sem e-mail**, que é o
//    campo do qual o resto do app depende para saber que há alguém logado.
// ════════════════════════════════════════════════════════════════════

const getAdminSession = vi.fn();
const loginAdminService = vi.fn();
const logoutAdminService = vi.fn();
const fetchCustomerSession = vi.fn();
const consumeCustomerSessionFromAuthCallback = vi.fn();
const loginCustomerWithEmail = vi.fn();
const logoutCustomerSession = vi.fn();
const registerCustomerWithEmail = vi.fn();

vi.mock('../../services/admin-auth', () => ({
  getAdminSession: (...args) => getAdminSession(...args),
  loginAdmin: (...args) => loginAdminService(...args),
  logoutAdmin: (...args) => logoutAdminService(...args),
}));

vi.mock('../../services/customer-auth', () => ({
  fetchCustomerSession: (...args) => fetchCustomerSession(...args),
  consumeCustomerSessionFromAuthCallback: (...args) =>
    consumeCustomerSessionFromAuthCallback(...args),
  loginCustomerWithEmail: (...args) => loginCustomerWithEmail(...args),
  loginCustomerWithGoogle: vi.fn(),
  logoutCustomerSession: (...args) => logoutCustomerSession(...args),
  registerCustomerWithEmail: (...args) => registerCustomerWithEmail(...args),
}));

/**
 * Expõe o contexto para o teste sem precisar de uma tela real.
 *
 * Container mutável e não `let auth`: a regra `react-hooks/globals` proíbe
 * reatribuir binding de módulo dentro do corpo de um componente, e com razão —
 * escrita em variável externa durante o render é efeito colateral. Guardar num
 * campo deixa a intenção ("isto é uma sonda de teste") explícita.
 */
const ctx = { atual: null };

function Sonda() {
  const value = useContext(AuthContext);
  // A publicação acontece num EFEITO, não no corpo do componente: escrever em
  // estado externo durante o render é efeito colateral no meio da fase pura, o
  // que o React pode repetir ou descartar — e o lint recusa, com razão.
  useEffect(() => {
    ctx.atual = value;
  }, [value]);

  return (
    <div>
      <span data-testid="ready">{String(value.authReady)}</span>
      <span data-testid="admin">{String(value.adminAuthenticated)}</span>
      <span data-testid="customer">{value.customerSession?.email ?? 'nenhum'}</span>
    </div>
  );
}

async function montar() {
  render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminSession.mockResolvedValue({ authenticated: false });
  fetchCustomerSession.mockResolvedValue(null);
  consumeCustomerSessionFromAuthCallback.mockResolvedValue(null);
});

describe('bootstrap', () => {
  it('consulta as duas sessões e libera authReady', async () => {
    await montar();

    expect(getAdminSession).toHaveBeenCalled();
    expect(fetchCustomerSession).toHaveBeenCalled();
  });

  it('reflete a sessão admin existente', async () => {
    getAdminSession.mockResolvedValue({ authenticated: true });

    await montar();

    expect(screen.getByTestId('admin')).toHaveTextContent('true');
  });

  it('só aceita `authenticated === true`, não valor caimbo', async () => {
    getAdminSession.mockResolvedValue({ authenticated: 'sim' });

    await montar();

    expect(screen.getByTestId('admin')).toHaveTextContent('false');
  });

  it('reflete a sessão de cliente existente', async () => {
    fetchCustomerSession.mockResolvedValue({ email: 'cliente@exemplo.com' });

    await montar();

    expect(screen.getByTestId('customer')).toHaveTextContent('cliente@exemplo.com');
  });

  it('authReady vira true MESMO com as duas consultas falhando', async () => {
    // Sem isto o ProtectedRoute ficaria em "Verificando sessão" para sempre e
    // uma falha de rede no boot trancaria a dona fora do painel.
    getAdminSession.mockRejectedValue(new Error('rede caiu'));
    fetchCustomerSession.mockRejectedValue(new Error('rede caiu'));

    await montar();

    expect(screen.getByTestId('admin')).toHaveTextContent('false');
    expect(screen.getByTestId('customer')).toHaveTextContent('nenhum');
  });
});

describe('login admin', () => {
  it('sem 2º fator pendente, marca a sessão', async () => {
    await montar();
    loginAdminService.mockResolvedValue({ success: true });

    await ctx.atual.loginAdmin({ email: 'a@b.com', password: 'x' });

    await waitFor(() => expect(screen.getByTestId('admin')).toHaveTextContent('true'));
  });

  it('com 2º fator PENDENTE, NÃO marca a sessão', async () => {
    // O ponto da suíte: senha certa e 2FA pendente não é estar logado.
    await montar();
    loginAdminService.mockResolvedValue({
      requiresSecondFactor: true,
      challengeToken: 'tok',
      methods: ['totp'],
    });

    const data = await ctx.atual.loginAdmin({ email: 'a@b.com', password: 'x' });

    expect(data.requiresSecondFactor).toBe(true);
    expect(screen.getByTestId('admin')).toHaveTextContent('false');
  });

  it('logout limpa a sessão admin', async () => {
    getAdminSession.mockResolvedValue({ authenticated: true });
    await montar();
    logoutAdminService.mockResolvedValue(undefined);

    await ctx.atual.logoutAdmin();

    await waitFor(() => expect(screen.getByTestId('admin')).toHaveTextContent('false'));
  });
});

describe('cliente', () => {
  it('login guarda a sessão devolvida', async () => {
    await montar();
    loginCustomerWithEmail.mockResolvedValue({ email: 'cliente@exemplo.com', name: 'Cliente' });

    await ctx.atual.loginCustomer({ email: 'cliente@exemplo.com', password: 'x' });

    await waitFor(() =>
      expect(screen.getByTestId('customer')).toHaveTextContent('cliente@exemplo.com'),
    );
  });

  it('cadastro que exige verificação de e-mail NÃO abre sessão', async () => {
    await montar();
    registerCustomerWithEmail.mockResolvedValue({ verificationRequired: true });

    const resultado = await ctx.atual.registerCustomer({
      name: 'N',
      email: 'novo@exemplo.com',
      password: 'Senha123',
    });

    expect(resultado.verificationRequired).toBe(true);
    expect(screen.getByTestId('customer')).toHaveTextContent('nenhum');
  });

  it('cadastro já confirmado abre sessão', async () => {
    await montar();
    registerCustomerWithEmail.mockResolvedValue({ user: { email: 'novo@exemplo.com' } });

    await ctx.atual.registerCustomer({
      name: 'N',
      email: 'novo@exemplo.com',
      password: 'Senha123',
    });

    await waitFor(() =>
      expect(screen.getByTestId('customer')).toHaveTextContent('novo@exemplo.com'),
    );
  });

  it('logout limpa a sessão do cliente', async () => {
    fetchCustomerSession.mockResolvedValue({ email: 'cliente@exemplo.com' });
    await montar();
    logoutCustomerSession.mockResolvedValue(undefined);

    await ctx.atual.logoutCustomer();

    await waitFor(() => expect(screen.getByTestId('customer')).toHaveTextContent('nenhum'));
  });
});

describe('setCustomerSession', () => {
  it('normaliza os campos e baixa o papel para minúsculas', async () => {
    await montar();

    ctx.atual.setCustomerSession({
      email: '  Cliente@Exemplo.com  ',
      name: '  Cliente  ',
      uid: ' uid-1 ',
      role: 'CUSTOMER',
    });

    await waitFor(() =>
      expect(ctx.atual.customerSession).toEqual({
        email: 'Cliente@Exemplo.com',
        name: 'Cliente',
        uid: 'uid-1',
        role: 'customer',
      }),
    );
  });

  it('sessão sem e-mail é descartada', async () => {
    // `email` é o campo do qual o resto do app depende para saber que há
    // alguém logado; aceitar uma sessão sem ele criaria um usuário fantasma.
    fetchCustomerSession.mockResolvedValue({ email: 'cliente@exemplo.com' });
    await montar();

    ctx.atual.setCustomerSession({ name: 'Sem e-mail' });

    await waitFor(() => expect(screen.getByTestId('customer')).toHaveTextContent('nenhum'));
  });
});

describe('callback do OAuth', () => {
  it('hidrata a sessão quando o callback devolve uma', async () => {
    consumeCustomerSessionFromAuthCallback.mockResolvedValue({ email: 'google@exemplo.com' });

    await montar();

    await waitFor(() =>
      expect(screen.getByTestId('customer')).toHaveTextContent('google@exemplo.com'),
    );
  });

  it('a sessão do callback sobrevive ao bootstrap que devolve null', async () => {
    // A CORRIDA: os dois efeitos escrevem no mesmo estado. Na volta do Google,
    // `fetchCustomerSession` sai antes de o callback trocar o token pelo
    // cookie, entao devolve null — e o bootstrap, resolvendo por ultimo,
    // apagava a sessao recem-criada. Em producao o POST do callback costuma
    // ser mais lento e chegar depois, o que escondia o problema; a ordem nunca
    // foi garantida.
    fetchCustomerSession.mockResolvedValue(null);
    consumeCustomerSessionFromAuthCallback.mockResolvedValue({ email: 'google@exemplo.com' });

    await montar();

    // Espera alem do primeiro paint: se o bootstrap ainda for sobrescrever,
    // e aqui que apareceria.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('customer')).toHaveTextContent('google@exemplo.com');
  });

  it('é consumido UMA vez só (StrictMode não pode duplicar o POST)', async () => {
    await montar();

    expect(consumeCustomerSessionFromAuthCallback).toHaveBeenCalledTimes(1);
  });

  it('erro no callback não derruba o provider', async () => {
    consumeCustomerSessionFromAuthCallback.mockRejectedValue(new Error('parse falhou'));

    await montar();

    expect(screen.getByTestId('ready')).toHaveTextContent('true');
  });
});
