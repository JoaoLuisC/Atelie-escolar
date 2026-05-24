import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { ProductWizard } from '../components/ProductWizard';
import { CategoryWizard } from '../components/CategoryWizard';
import { AdminLayout } from '../components/admin/AdminLayout';
import { DashboardTab } from '../components/admin/tabs/DashboardTab';
import { ProductsTab } from '../components/admin/tabs/ProductsTab';
import { CategoriesTab } from '../components/admin/tabs/CategoriesTab';
import { OrdersTab } from '../components/admin/tabs/OrdersTab';
import { UsersTab } from '../components/admin/tabs/UsersTab';
import { FinanceTab } from '../components/admin/tabs/FinanceTab';
import { ComparisonTab } from '../components/admin/tabs/ComparisonTab';
import { PerformanceTab } from '../components/admin/tabs/PerformanceTab';
import { VitrineTab } from '../components/admin/tabs/VitrineTab';
import { SecurityTab } from '../components/admin/tabs/SecurityTab';
import { OrderDetailModal } from '../components/admin/OrderDetailModal';
import {
  createAdminCategory,
  deleteAdminCategory,
  deleteAdminUser,
  fetchAdminDashboardData,
  fetchAdminOrders,
  fetchAdminSetting,
  fetchAdminUsers,
  patchAdminProduct,
  saveAdminSetting,
  updateAdminCategory,
  updateAdminUser,
} from '../services/admin-panel';
import {
  createAdminProduct,
  deleteAdminProduct,
  updateAdminProduct,
} from '../services/admin-products';
import {
  deriveAbcCurve,
  deriveApprovedOrders,
  deriveCategoryRevenue,
  deriveComparisonDelta,
  deriveCustomerMix,
  deriveDailyRevenue,
  deriveFaturamentoSeries,
  deriveMonthlyComparison,
  deriveMonthSparkline,
  deriveProductPerformance,
  deriveRecentOrders,
  deriveTicketMedio,
  getSectionDefaultTitle,
  parseHomeSectionsSetting,
  serializeHomeSections,
} from '../components/admin/utils/derive';
import { isSessionError } from '../components/admin/utils/format';
import { TAB_LABELS, TABS_NEEDING_DASHBOARD } from '../components/admin/utils/tabs';

const EMPTY_DASHBOARD = {
  summary: {
    revenueMonth: 0,
    revenueTotal: 0,
    approvedOrders: 0,
    pendingOrders: 0,
    activeProducts: 0,
    totalUsers: 0,
  },
  products: [],
  orders: [],
  categories: [],
  users: [],
  settings: { homeSections: { sections: [] } },
};

export function AdminPage() {
  const { logoutAdmin, setAdminAuthenticated } = useAuth();
  const { pushToast } = useToast();
  const allowAdminBypass = import.meta.env.DEV || import.meta.env.VITE_ALLOW_ADMIN_BYPASS === 'true';

  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(EMPTY_DASHBOARD);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState('');
  const [vitrineSections, setVitrineSections] = useState([]);
  const [vitrineSaving, setVitrineSaving] = useState(false);
  const [adminConfig, setAdminConfig] = useState({});
  const [securitySaving, setSecuritySaving] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState('');
  const [usersUpdatingId, setUsersUpdatingId] = useState('');

  const [orderDetail, setOrderDetail] = useState(null);
  const [productWizardOpen, setProductWizardOpen] = useState(false);
  const [categoryWizardOpen, setCategoryWizardOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);

  const pageTitle = TAB_LABELS[activeTab] || 'Painel Admin';

  const onAuthExpired = useCallback(() => {
    if (allowAdminBypass) return;
    setAdminAuthenticated(false);
    pushToast('Sessão admin expirada. Faça login novamente.', 'warning');
  }, [allowAdminBypass, setAdminAuthenticated, pushToast]);

  const handleAdminError = useCallback((error, fallback) => {
    if (isSessionError(error)) {
      onAuthExpired();
    }
    pushToast(error?.message || fallback, 'error');
  }, [onAuthExpired, pushToast]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setTabLoading(true);
      setTabError('');
      try {
        if (TABS_NEEDING_DASHBOARD.has(activeTab)) {
          const data = await fetchAdminDashboardData();
          if (cancelled) return;
          setDashboardData(data);
          if (activeTab === 'vitrine') {
            setVitrineSections(parseHomeSectionsSetting(data.settings?.homeSections || { sections: [] }, data.categories || []));
          }
        }

        if (activeTab === 'usuarios') {
          const data = await fetchAdminUsers();
          if (!cancelled) setUsers(data.users || []);
        }

        if (activeTab === 'pedidos') {
          const data = await fetchAdminOrders(ordersFilter);
          if (!cancelled) setOrders(data.orders || []);
        }

        if (activeTab === 'seguranca') {
          const data = await fetchAdminSetting('adminConfig');
          if (!cancelled) setAdminConfig(data.value || {});
        }
      } catch (error) {
        if (cancelled) return;
        if (isSessionError(error) && allowAdminBypass) {
          setDashboardData(EMPTY_DASHBOARD);
          return;
        }
        if (isSessionError(error)) onAuthExpired();
        setTabError(error?.message || 'Erro ao carregar dados da aba.');
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, ordersFilter, allowAdminBypass, onAuthExpired]);

  const approvedOrders = useMemo(() => deriveApprovedOrders(dashboardData.orders), [dashboardData.orders]);
  const productPerformance = useMemo(() => deriveProductPerformance(dashboardData.products, approvedOrders), [dashboardData.products, approvedOrders]);
  const monthlyComparison = useMemo(() => deriveMonthlyComparison(approvedOrders), [approvedOrders]);
  const comparisonDelta = useMemo(() => deriveComparisonDelta(monthlyComparison), [monthlyComparison]);
  const recentOrders = useMemo(() => deriveRecentOrders(dashboardData.orders), [dashboardData.orders]);
  const dailyRevenue = useMemo(() => deriveDailyRevenue(approvedOrders), [approvedOrders]);
  const categoryRevenue = useMemo(() => deriveCategoryRevenue(dashboardData.products, approvedOrders), [dashboardData.products, approvedOrders]);
  const faturamentoSeries = useMemo(() => deriveFaturamentoSeries(approvedOrders), [approvedOrders]);
  const ticketMedio = useMemo(() => deriveTicketMedio(monthlyComparison), [monthlyComparison]);
  const customerMix = useMemo(() => deriveCustomerMix(dashboardData.users), [dashboardData.users]);
  const abcCurve = useMemo(() => deriveAbcCurve(productPerformance), [productPerformance]);
  const sparkline = useMemo(() => deriveMonthSparkline(approvedOrders, 14), [approvedOrders]);

  async function refreshDashboard() {
    try {
      const data = await fetchAdminDashboardData();
      setDashboardData(data);
    } catch (error) {
      handleAdminError(error, 'Erro ao atualizar dados.');
    }
  }

  async function onLogout() {
    try {
      await logoutAdmin();
      pushToast('Sessão administrativa encerrada.', 'info');
    } catch (error) {
      pushToast(error?.message || 'Erro ao encerrar sessão.', 'error');
    }
  }

  function openCreateProduct() {
    setEditingProduct(null);
    setProductWizardOpen(true);
  }

  function openEditProduct(product) {
    setEditingProduct(product);
    setProductWizardOpen(true);
  }

  function closeProductWizard() {
    setProductWizardOpen(false);
    setEditingProduct(null);
  }

  async function handleProductSave(product) {
    try {
      const images = (product.images || []).map((url) => String(url || '').trim()).filter(Boolean);
      const videos = (product.videos || []).map((url) => String(url || '').trim()).filter(Boolean);

      const payload = {
        id: product.id || undefined,
        name: product.name,
        description: product.description,
        price: Number(product.price),
        originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
        image: images[0] || '',
        images,
        videos,
        downloadUrl: product.downloadUrl,
        categoryId: product.category,
        productType: product.productType || 'individual',
        active: product.active !== false,
        featured: product.featured === true,
      };

      if (payload.id) {
        await updateAdminProduct(payload);
        pushToast('Produto atualizado.', 'success');
      } else {
        await createAdminProduct(payload);
        pushToast('Produto criado.', 'success');
      }

      await refreshDashboard();
      closeProductWizard();
    } catch (error) {
      handleAdminError(error, 'Erro ao salvar produto.');
    }
  }

  async function handleToggleProductActive(product) {
    try {
      const nextActive = product.active === false;
      await patchAdminProduct({ id: product.id, active: nextActive });
      await refreshDashboard();
      pushToast(`Produto ${nextActive ? 'ativado' : 'pausado'}.`, 'success');
    } catch (error) {
      handleAdminError(error, 'Erro ao atualizar produto.');
    }
  }

  async function handleDeleteProduct(product) {
    if (typeof globalThis.window !== 'undefined' && !globalThis.window.confirm?.(`Excluir o produto "${product.name}"?`)) {
      return;
    }
    try {
      await deleteAdminProduct(product.id);
      await refreshDashboard();
      pushToast('Produto removido.', 'success');
    } catch (error) {
      handleAdminError(error, 'Erro ao remover produto.');
    }
  }

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryWizardOpen(true);
  }

  function openEditCategory(category) {
    setEditingCategory(category);
    setCategoryWizardOpen(true);
  }

  function closeCategoryWizard() {
    setCategoryWizardOpen(false);
    setEditingCategory(null);
  }

  async function handleCategorySave(category) {
    try {
      if (category.id) {
        await updateAdminCategory(category);
        pushToast('Categoria atualizada.', 'success');
      } else {
        await createAdminCategory(category);
        pushToast('Categoria criada.', 'success');
      }
      await refreshDashboard();
      closeCategoryWizard();
    } catch (error) {
      handleAdminError(error, 'Erro ao salvar categoria.');
    }
  }

  async function handleDeleteCategory(category) {
    if (typeof globalThis.window !== 'undefined' && !globalThis.window.confirm?.(`Excluir a categoria "${category.name}"?`)) {
      return;
    }
    try {
      await deleteAdminCategory(category.id);
      await refreshDashboard();
      pushToast('Categoria removida.', 'success');
    } catch (error) {
      handleAdminError(error, 'Erro ao remover categoria.');
    }
  }

  async function handleUserRoleChange(user, nextRole) {
    setUsersUpdatingId(user.id);
    try {
      await updateAdminUser({ id: user.id, role: String(nextRole || '').toLowerCase() });
      setUsers((prev) => prev.map((entry) => (
        entry.id === user.id ? { ...entry, role: nextRole } : entry
      )));
      pushToast('Papel do usuário atualizado.', 'success');
    } catch (error) {
      handleAdminError(error, 'Erro ao atualizar usuário.');
    } finally {
      setUsersUpdatingId('');
    }
  }

  async function handleUserDelete(user) {
    setUsersUpdatingId(user.id);
    try {
      await deleteAdminUser(user.id);
      setUsers((prev) => prev.filter((entry) => entry.id !== user.id));
      pushToast('Acesso revogado.', 'success');
    } catch (error) {
      handleAdminError(error, 'Erro ao revogar acesso.');
    } finally {
      setUsersUpdatingId('');
    }
  }

  async function handleVitrineSave() {
    try {
      setVitrineSaving(true);
      const payload = serializeHomeSections(vitrineSections, getSectionDefaultTitle);
      await saveAdminSetting({ key: 'homeSections', value: payload });
      pushToast('Vitrine salva com sucesso.', 'success');
    } catch (error) {
      handleAdminError(error, 'Erro ao salvar vitrine.');
    } finally {
      setVitrineSaving(false);
    }
  }

  async function handleSecuritySave(nextConfig) {
    try {
      setSecuritySaving(true);
      await saveAdminSetting({ key: 'adminConfig', value: nextConfig });
      setAdminConfig(nextConfig);
      pushToast('Configurações de segurança salvas.', 'success');
    } catch (error) {
      handleAdminError(error, 'Erro ao salvar configurações.');
    } finally {
      setSecuritySaving(false);
    }
  }

  function renderActiveTab() {
    if (tabError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
          <i className="bi bi-exclamation-triangle text-2xl" />
          <p className="font-semibold">{tabError}</p>
        </div>
      );
    }

    if (tabLoading) {
      return (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-12 text-sm text-slate-500">
          <i className="bi bi-arrow-clockwise mr-2 animate-spin" /> Carregando…
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardTab
            summary={dashboardData.summary}
            dailyRevenue={dailyRevenue}
            categoryRevenue={categoryRevenue}
            recentOrders={recentOrders}
            ticketMedio={ticketMedio}
            customerMix={customerMix}
            abcCurve={abcCurve}
            comparisonDelta={comparisonDelta}
            sparkline={sparkline}
            onOpenOrder={setOrderDetail}
          />
        );
      case 'produtos':
        return (
          <ProductsTab
            products={dashboardData.products || []}
            categories={dashboardData.categories || []}
            onCreate={openCreateProduct}
            onEdit={openEditProduct}
            onToggleActive={handleToggleProductActive}
            onDelete={handleDeleteProduct}
          />
        );
      case 'categorias':
        return (
          <CategoriesTab
            categories={dashboardData.categories || []}
            onCreate={openCreateCategory}
            onEdit={openEditCategory}
            onDelete={handleDeleteCategory}
          />
        );
      case 'pedidos':
        return (
          <OrdersTab
            orders={orders}
            statusFilter={ordersFilter}
            onStatusFilterChange={setOrdersFilter}
            onOpenOrder={setOrderDetail}
          />
        );
      case 'usuarios':
        return (
          <UsersTab
            users={users}
            onRoleChange={handleUserRoleChange}
            onDelete={handleUserDelete}
            updatingId={usersUpdatingId}
          />
        );
      case 'faturamento':
        return <FinanceTab approvedOrders={approvedOrders} faturamentoSeries={faturamentoSeries} />;
      case 'comparativo':
        return <ComparisonTab monthlyComparison={monthlyComparison} comparisonDelta={comparisonDelta} />;
      case 'prod-saida':
        return <PerformanceTab productPerformance={productPerformance} />;
      case 'vitrine':
        return (
          <VitrineTab
            sections={vitrineSections}
            categories={dashboardData.categories || []}
            onChange={setVitrineSections}
            onSave={handleVitrineSave}
            saving={vitrineSaving}
          />
        );
      case 'seguranca':
        return <SecurityTab config={adminConfig} onSave={handleSecuritySave} saving={securitySaving} />;
      default:
        return null;
    }
  }

  return (
    <>
      <AdminLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pageTitle={pageTitle}
        userLabel="Administrador"
        onLogout={onLogout}
      >
        {renderActiveTab()}
      </AdminLayout>

      <ProductWizard
        isOpen={productWizardOpen}
        onClose={closeProductWizard}
        onSubmit={handleProductSave}
        categories={dashboardData.categories || []}
        initialProduct={editingProduct}
      />

      <CategoryWizard
        isOpen={categoryWizardOpen}
        onClose={closeCategoryWizard}
        onSubmit={handleCategorySave}
        initialCategory={editingCategory}
      />

      {orderDetail ? <OrderDetailModal order={orderDetail} onClose={() => setOrderDetail(null)} /> : null}
    </>
  );
}
