import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ScrollToTop } from './components/ScrollToTop';
import { ROUTES } from './constants/routes';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const ProductsPage = lazy(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
);
const ProductDetailsPage = lazy(() =>
  import('./pages/ProductDetailsPage').then((m) => ({ default: m.ProductDetailsPage })),
);
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
);
const CustomerAuthPage = lazy(() =>
  import('./pages/CustomerAuthPage').then((m) => ({ default: m.CustomerAuthPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const DownloadsPage = lazy(() =>
  import('./pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const PrivacyPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })));
const ConfirmSubscriptionPage = lazy(() =>
  import('./pages/SubscriptionPages').then((m) => ({ default: m.ConfirmSubscriptionPage })),
);
const UnsubscribePage = lazy(() =>
  import('./pages/SubscriptionPages').then((m) => ({ default: m.UnsubscribePage })),
);
const AdminLoginPage = lazy(() =>
  import('./pages/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })),
);
const AdminPage = lazy(() =>
  import('./pages/PlatformAdminPage').then((m) => ({ default: m.PlatformAdminPage })),
);
const TeachersPage = lazy(() =>
  import('./pages/TeachersPage').then((m) => ({ default: m.TeachersPage })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
      <i className="bi bi-arrow-clockwise mr-2 animate-spin" />
      Carregando…
    </div>
  );
}

export default function App() {
  return (
    <>
      {/* LOJA-08/09: topo na troca de rota e rolagem até #âncora. */}
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/produtos/:slug" element={<ProductDetailsPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/login" element={<CustomerAuthPage />} />
          <Route path="/conta" element={<CustomerAuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/privacidade" element={<PrivacyPage />} />
          <Route path="/termos" element={<TermsPage />} />
          <Route path="/confirmar-inscricao" element={<ConfirmSubscriptionPage />} />
          <Route path="/desinscrever" element={<UnsubscribePage />} />
          <Route
            path={ROUTES.admin}
            element={
              <ProtectedRoute fallback={<AdminLoginPage />} allowedRoles={['admin', 'master']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.professores}
            element={
              <ProtectedRoute fallback={<AdminLoginPage />} allowedRoles={['seller']}>
                <TeachersPage />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/usuarios" element={<Navigate to={ROUTES.admin} replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
