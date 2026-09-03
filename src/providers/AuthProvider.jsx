import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { getAdminSession, loginAdmin, logoutAdmin } from '../services/admin-auth';
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
      async loginAdmin(credentials) {
        const data = await loginAdmin(credentials);
        // Só autentica de fato quando NÃO há segundo fator pendente. Quando
        // há 2FA, devolvemos o `data` para o ProfessorLoginPage tratar o desafio
        // (requiresSecondFactor / challengeToken / methods) sem marcar sessão.
        if (!data?.requiresSecondFactor) {
          setAdminAuthenticated(true);
        }
        return data;
      },
      async logoutAdmin() {
        await logoutAdmin();
        setAdminAuthenticated(false);
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
      async logoutCustomer() {
        await logoutCustomerSession();
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
    [authReady, adminAuthenticated, customerSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
