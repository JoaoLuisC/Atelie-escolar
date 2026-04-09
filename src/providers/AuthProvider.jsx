import { createContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getAdminSession, loginAdmin, logoutAdmin } from '../services/admin-auth';
import { loginCustomerWithEmail, registerCustomerWithEmail } from '../services/customer-auth';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [customerSession, setCustomerSession] = useState(() => {
    const email = localStorage.getItem('customer_email') || '';
    const name = localStorage.getItem('customer_name') || '';
    const uid = localStorage.getItem('customer_uid') || '';
    const idToken = localStorage.getItem('customer_id_token') || '';
    const refreshToken = localStorage.getItem('customer_refresh_token') || '';

    if (!email) {
      return null;
    }

    return {
      uid,
      email,
      name,
      idToken,
      refreshToken,
    };
  });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const data = await getAdminSession();
        if (!cancelled) {
          setAdminAuthenticated(data.authenticated === true);
        }
      } catch {
        if (!cancelled) {
          setAdminAuthenticated(false);
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
        localStorage.setItem('customer_email', email);
        localStorage.setItem('customer_name', session.name || '');
        localStorage.setItem('customer_uid', session.uid || '');
        localStorage.setItem('customer_id_token', session.idToken || '');
        localStorage.setItem('customer_refresh_token', session.refreshToken || '');
        setCustomerSession(session);
      },
      async registerCustomer({ name, email, password }) {
        const session = await registerCustomerWithEmail(name, email, password);
        localStorage.setItem('customer_email', email);
        localStorage.setItem('customer_name', session.name || '');
        localStorage.setItem('customer_uid', session.uid || '');
        localStorage.setItem('customer_id_token', session.idToken || '');
        localStorage.setItem('customer_refresh_token', session.refreshToken || '');
        setCustomerSession(session);
      },
      logoutCustomer() {
        localStorage.removeItem('customer_email');
        localStorage.removeItem('customer_name');
        localStorage.removeItem('customer_uid');
        localStorage.removeItem('customer_id_token');
        localStorage.removeItem('customer_refresh_token');
        setCustomerSession(null);
      },
      setCustomerSession(session) {
        const email = String(session?.email || '').trim();
        if (!email) return;

        const name = String(session?.name || '').trim();
        const uid = String(session?.uid || '').trim();
        const idToken = String(session?.idToken || '').trim();
        const refreshToken = String(session?.refreshToken || '').trim();

        localStorage.setItem('customer_email', email);
        localStorage.setItem('customer_name', name);
        localStorage.setItem('customer_uid', uid);
        localStorage.setItem('customer_id_token', idToken);
        localStorage.setItem('customer_refresh_token', refreshToken);

        setCustomerSession({ email, name, uid, idToken, refreshToken });
      },
    }),
    [authReady, adminAuthenticated, customerSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
