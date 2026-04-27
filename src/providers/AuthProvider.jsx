import { createContext, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const data = await getAdminSession();
        const customer = await fetchCustomerSession();
        if (!cancelled) {
          setAdminAuthenticated(data.authenticated === true);
          setCustomerSession(customer);
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
        await loginAdmin(credentials);
        setAdminAuthenticated(true);
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
        setCustomerSession({ email, name, uid });
      },
    }),
    [authReady, adminAuthenticated, customerSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
