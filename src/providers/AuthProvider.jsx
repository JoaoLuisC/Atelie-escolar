import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  completeStaffGoogleLogin,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
  startStaffGoogleLogin,
} from '../services/admin-auth';
import {
  fetchCustomerSession,
  consumeCustomerSessionFromAuthCallback,
  loginCustomerWithEmail,
  loginCustomerWithGoogle,
  logoutCustomerSession,
  registerCustomerWithEmail,
} from '../services/customer-auth';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminRole, setAdminRole] = useState('');
  // Professor(a) dona da loja: abre o painel da loja em /professores.
  const [adminStoreOwner, setAdminStoreOwner] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [customerSession, setCustomerSession] = useState(null);
  // Garante que o consumo do callback OAuth rode uma única vez (evita
  // dupla execução em React StrictMode, que dispararia o POST 2x).
  const oauthCallbackConsumedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Paraleliza as duas consultas de sessão para cortar 1 RTT no boot.
        const [data, customer] = await Promise.all([getAdminSession(), fetchCustomerSession()]);
        if (!cancelled) {
          setAdminAuthenticated(data.authenticated === true);
          setAdminRole(data.role || '');
          setAdminStoreOwner(data.storeOwner === true);
          // Atualização FUNCIONAL, e não `setCustomerSession(customer)` direto:
          // este efeito corre em paralelo com o do callback OAuth, e os dois
          // escrevem no mesmo estado. Na volta do Google, `fetchCustomerSession`
          // sai ANTES de o callback trocar o token pelo cookie, então devolve
          // `null` — e uma escrita incondicional apagaria a sessão que o
          // callback acabou de estabelecer, deixando o usuário deslogado até o
          // próximo F5. Na prática o POST do callback costuma ser mais lento e
          // chegar por último, o que escondia a corrida; a ordem nunca foi
          // garantida. `atual ?? customer` só preenche o que ainda está vazio.
          setCustomerSession((atual) => atual ?? customer);
        }
      } catch {
        if (!cancelled) {
          setAdminAuthenticated(false);
          setAdminRole('');
          setAdminStoreOwner(false);
          setCustomerSession(null);
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (oauthCallbackConsumedRef.current) {
      return undefined;
    }
    oauthCallbackConsumedRef.current = true;

    let cancelled = false;

    async function hydrateFromOAuthCallback() {
      try {
        const callbackSession = await consumeCustomerSessionFromAuthCallback();
        if (!callbackSession?.email || cancelled) {
          return;
        }
        setCustomerSession(callbackSession);
      } catch {
        // Ignore callback parse errors and keep existing local session state.
      }
    }

    hydrateFromOAuthCallback();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      authReady,
      adminAuthenticated,
      adminRole,
      adminStoreOwner,
      async loginAdmin(credentials) {
        const data = await loginAdmin(credentials);
        // Só autentica de fato quando NÃO há segundo fator pendente. Quando
        // há 2FA, devolvemos o `data` para o AdminLoginPage tratar o desafio
        // (requiresSecondFactor / challengeToken / methods) sem marcar sessão.
        if (!data?.requiresSecondFactor) {
          setAdminAuthenticated(true);
          setAdminRole(String(data?.user?.role || '').toLowerCase());
          setAdminStoreOwner(data?.user?.storeOwner === true);
        }
        return data;
      },
      async loginAdminGoogle() {
        await startStaffGoogleLogin();
      },
      // Volta do Google do professor(a). `null` quando a URL não é essa volta.
      async completeAdminGoogle() {
        const data = await completeStaffGoogleLogin();
        if (data?.success) {
          setAdminAuthenticated(true);
          setAdminRole(String(data.user?.role || '').toLowerCase());
          setAdminStoreOwner(data.user?.storeOwner === true);
        }
        return data;
      },
      async logoutAdmin() {
        try {
          await logoutAdmin();
        } catch (error) {
          // A resposta pode ter se perdido DEPOIS de o servidor apagar o cookie
          // (ADM-06). Antes de dizer "a sessão continua aberta", pergunta ao
          // servidor: se ela já acabou, o logout valeu e o painel deve fechar.
          const session = await getAdminSession().catch(() => null);
          if (session && session.authenticated === false) {
            setAdminAuthenticated(false);
            setAdminRole('');
            setAdminStoreOwner(false);
            return;
          }
          error.sessionStillActive = true;
          throw error;
        }
        setAdminAuthenticated(false);
        setAdminRole('');
        setAdminStoreOwner(false);
      },
      setAdminAuthenticated,
      customerSession,
      async loginCustomer({ email, password }) {
        const session = await loginCustomerWithEmail(email, password);
        setCustomerSession(session);
        return session;
      },
      async loginCustomerGoogle(redirectPath = '/checkout') {
        await loginCustomerWithGoogle(redirectPath);
      },
      async registerCustomer({ name, email, password }) {
        const result = await registerCustomerWithEmail(name, email, password);
        if (result.verificationRequired) {
          return result;
        }

        setCustomerSession(result.user || null);
        return result;
      },
      // Só zera a sessão local DEPOIS de o servidor confirmar, e propaga a
      // falha (LOJA-39): com a rede caída o cookie continua valendo, e limpar
      // aqui deixaria a tela "deslogada" com a conta ainda aberta. Quem chama
      // precisa `await` + tratar o erro antes de anunciar "Sessão encerrada.".
      async logoutCustomer() {
        try {
          await logoutCustomerSession();
        } catch (error) {
          // `fetch` sem rede rejeita com TypeError ("Failed to fetch"): texto
          // do navegador, em inglês — e quem chama vai mostrá-lo num toast.
          if (error?.name === 'TypeError') {
            throw new Error(
              'Não foi possível sair da conta: sem conexão com o servidor. Tente novamente.',
            );
          }
          throw error;
        }
        setCustomerSession(null);
      },
      setCustomerSession(session) {
        const email = String(session?.email || '').trim();
        if (!email) {
          setCustomerSession(null);
          return;
        }

        const name = String(session?.name || '').trim();
        const uid = String(session?.uid || '').trim();
        const role = String(session?.role || '')
          .trim()
          .toLowerCase();
        setCustomerSession({ email, name, uid, role });
      },
    }),
    [authReady, adminAuthenticated, adminRole, adminStoreOwner, customerSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
