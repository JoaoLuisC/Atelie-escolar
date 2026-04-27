import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminPage } from './pages/AdminPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CustomerAuthPage } from './pages/CustomerAuthPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ProductDetailsPage } from './pages/ProductDetailsPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ADMIN_LOGIN_PATH } from './constants/routes';

export default function App() {
  return (
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
      <Route
        path="/admin/usuarios"
        element={(
          <ProtectedRoute>
            <AdminUsersPage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
