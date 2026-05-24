import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import App from './App';
import { AuthProvider } from './providers/AuthProvider';
import { CartProvider } from './providers/CartProvider';
import { ToastProvider } from './providers/ToastProvider';
import { ConsentBanner } from './components/ConsentBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initAnalytics } from './utils/analytics';
import './styles.css';

initAnalytics();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <AuthProvider>
            <CartProvider>
              <ToastProvider>
                <App />
                <ConsentBanner />
                <VercelAnalytics />
              </ToastProvider>
            </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
