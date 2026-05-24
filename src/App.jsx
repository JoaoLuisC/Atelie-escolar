import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ADMIN_LOGIN_PATH } from './constants/routes';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const ProductDetailsPage = lazy(() => import('./pages/ProductDetailsPage').then((m) => ({ default: m.ProductDetailsPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const CustomerAuthPage = lazy(() => import('./pages/CustomerAuthPage').then((m) => ({ default: m.CustomerAuthPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

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
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/produtos/:id" element={<ProductDetailsPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/login" element={<CustomerAuthPage />} />
        <Route path="/conta" element={<CustomerAuthPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path={ADMIN_LOGIN_PATH} element={<AdminLoginPage />} />
        <Route path="/admin-login" element={<Navigate to={ADMIN_LOGIN_PATH} replace />} />
        <Route
          path="/admin"
          element={(
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/admin/usuarios" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
