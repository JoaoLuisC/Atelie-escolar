import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ROUTES } from '../constants/routes';
import { SEO } from '../components/SEO';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { AdminLayout } from '../components/admin/AdminLayout';
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
  fetchAdminProduct,
  updateAdminProduct,
} from '../services/admin-products';
import { getAdminSession } from '../services/admin-auth';
import { friendlyAdminError } from '../components/admin/utils/errors';
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
import { isSessionError } from '../constants/error-codes';
import { TAB_LABELS, TABS_NEEDING_DASHBOARD } from '../components/admin/utils/tabs';

// ════════════════════════════════════════════════════════════════════
// 14 ABAS E 2 WIZARDS POR `lazy()` — §1.3 do doc de otimização.
//
// Estaticamente, os 16 imports produziam um `AdminPage-*.js` de 147 KB
// (36,2 KB gz), o maior chunk de aplicação do projeto. Quem abria a aba
// "Produtos" baixava `DashboardTab` (809 linhas), `AnalysisTab` (673),
// `FunnelTab` (242), `SegmentsTab` (157), `ComparisonTab` (78) e
// `ProductWizard` (879) — sem abrir nenhum deles.
//
// Mesmo padrão do `App.jsx:5`. O `<Suspense>` envolve SÓ a área de conteúdo do
// `AdminLayout`: a navegação lateral continua instantânea, então trocar de aba
// não pisca o painel inteiro.
// ════════════════════════════════════════════════════════════════════
const lazyTab = (nome, carregar) => lazy(() => carregar().then((m) => ({ default: m[nome] })));

const ProductWizard = lazyTab('ProductWizard', () => import('../components/ProductWizard'));
const CategoryWizard = lazyTab('CategoryWizard', () => import('../components/CategoryWizard'));
const DashboardTab = lazyTab('DashboardTab', () => import('../components/admin/tabs/DashboardTab'));
const ProductsTab = lazyTab('ProductsTab', () => import('../components/admin/tabs/ProductsTab'));
const CategoriesTab = lazyTab(
  'CategoriesTab',
  () => import('../components/admin/tabs/CategoriesTab'),
);
const OrdersTab = lazyTab('OrdersTab', () => import('../components/admin/tabs/OrdersTab'));
const CouponsTab = lazyTab('CouponsTab', () => import('../components/admin/tabs/CouponsTab'));
const UsersTab = lazyTab('UsersTab', () => import('../components/admin/tabs/UsersTab'));
const FinanceTab = lazyTab('FinanceTab', () => import('../components/admin/tabs/FinanceTab'));
const ComparisonTab = lazyTab(
  'ComparisonTab',
  () => import('../components/admin/tabs/ComparisonTab'),
);
const PerformanceTab = lazyTab(
  'PerformanceTab',
  () => import('../components/admin/tabs/PerformanceTab'),
);
const VitrineTab = lazyTab('VitrineTab', () => import('../components/admin/tabs/VitrineTab'));
const SecurityTab = lazyTab('SecurityTab', () => import('../components/admin/tabs/SecurityTab'));
const AnalysisTab = lazyTab('AnalysisTab', () => import('../components/admin/tabs/AnalysisTab'));
const FunnelTab = lazyTab('FunnelTab', () => import('../components/admin/tabs/FunnelTab'));
const SegmentsTab = lazyTab('SegmentsTab', () => import('../components/admin/tabs/SegmentsTab'));

/** Mesmo indicador do `App.jsx`, restrito à área de conteúdo. */
function TabFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      <i className="bi bi-arrow-clockwise mr-2 animate-spin" />
      Carregando…
    </div>
  );
}

// Identidade ESTÁVEL para o caso "esta aba não precisa desta derivação". Um
// `[]` literal a cada render mudaria a referência e faria os `useMemo`
// dependentes recalcularem — o oposto do que o recorte existe para fazer.
const EMPTY_LIST = Object.freeze([]);

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
  const { logoutAdmin, setAdminAuthenticated, adminAuthenticated } = useAuth();
  const { pushToast } = useToast();
  // Só em DEV: em produção a flag é inerte (ver ProtectedRoute).
  const allowAdminBypass =
    import.meta.env.DEV && import.meta.env.VITE_ALLOW_ADMIN_BYPASS === 'true';
  const showBypassBanner = allowAdminBypass && !adminAuthenticated;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(EMPTY_DASHBOARD);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState('');
  const [vitrineSections, setVitrineSections] = useState([]);
  const [vitrineSaving, setVitrineSaving] = useState(false);
  const [adminConfig, setAdminConfig] = useState({});
  const [securitySaving, setSecuritySaving] = useState(false);
  // Começa em `true`: com `false`, o 1º render montava a aba (que já dispara
  // as próprias consultas, como /admin/kpis) e o efeito de carga a desmontava
  // em seguida — KPIs pedidos 3–4 vezes por visita ao Dashboard (ADM-17).
  const [tabLoading, setTabLoading] = useState(true);
  const [tabError, setTabError] = useState('');
  const [tabReloadKey, setTabReloadKey] = useState(0);
  const [usersUpdatingId, setUsersUpdatingId] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

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

  const handleAdminError = useCallback(
    (error, fallback) => {
      if (isSessionError(error)) {
        onAuthExpired();
      }
      pushToast(friendlyAdminError(error, fallback), 'error');
    },
    [onAuthExpired, pushToast],
  );

  // ── A sessão do servidor é a verdade, não o estado em memória ──────────
  // O painel podia aparecer com sessão já encerrada: aba da loja aberta antes
  // do logout ("Painel admin" sem F5, CROSS-13) e o botão Voltar restaurando a
  // página do bfcache (ADM-41). Confere ao montar e a cada `pageshow`
  // restaurado. Erro de rede aqui é ignorado: as consultas da aba tratam.
  useEffect(() => {
    if (allowAdminBypass) return undefined;
    let cancelled = false;

    async function verifySession() {
      try {
        const session = await getAdminSession();
        if (cancelled) return;
        if (!session.authenticated) {
          onAuthExpired();
          return;
        }
        setAdminEmail(session.email || '');
      } catch {
        /* sem rede: a carga da aba mostra o erro */
      }
    }

    function onPageShow(event) {
      if (event.persisted) verifySession();
    }

    verifySession();
    globalThis.addEventListener?.('pageshow', onPageShow);
    return () => {
      cancelled = true;
      globalThis.removeEventListener?.('pageshow', onPageShow);
    };
  }, [allowAdminBypass, onAuthExpired]);

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
            setVitrineSections(
              parseHomeSectionsSetting(
                data.settings?.homeSections || { sections: [] },
                data.categories || [],
              ),
            );
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
        setTabError(friendlyAdminError(error, 'Erro ao carregar dados da aba.'));
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, ordersFilter, allowAdminBypass, onAuthExpired, tabReloadKey]);

  // ── As 12 derivações só rodam para as abas que as consomem (§1.3) ──
  // Elas percorrem TODOS os pedidos aprovados e TODOS os produtos, e rodavam a
  // cada carga do dashboard independentemente da aba aberta — inclusive em
  // "Usuários" e "Segurança", que não usam nenhuma delas.
  // `TABS_NEEDING_DASHBOARD` já existia em `tabs.js` para decidir se os dados
  // são BUSCADOS; aqui ele decide se são PROCESSADOS.
  const precisaDerivar = TABS_NEEDING_DASHBOARD.has(activeTab);

  const approvedOrders = useMemo(
    () => (precisaDerivar ? deriveApprovedOrders(dashboardData.orders) : EMPTY_LIST),
    [precisaDerivar, dashboardData.orders],
  );
  const productPerformance = useMemo(
    () =>
      precisaDerivar
        ? deriveProductPerformance(dashboardData.products, approvedOrders)
        : EMPTY_LIST,
    [precisaDerivar, dashboardData.products, approvedOrders],
  );
  const monthlyComparison = useMemo(
    () => (precisaDerivar ? deriveMonthlyComparison(approvedOrders) : EMPTY_LIST),
    [precisaDerivar, approvedOrders],
  );
  const comparisonDelta = useMemo(
    () => (precisaDerivar ? deriveComparisonDelta(monthlyComparison) : null),
    [precisaDerivar, monthlyComparison],
  );
  const recentOrders = useMemo(
    () => (precisaDerivar ? deriveRecentOrders(dashboardData.orders) : EMPTY_LIST),
    [precisaDerivar, dashboardData.orders],
  );
  const dailyRevenue = useMemo(
    () => (precisaDerivar ? deriveDailyRevenue(approvedOrders) : EMPTY_LIST),
    [precisaDerivar, approvedOrders],
  );
  const categoryRevenue = useMemo(
    () =>
      precisaDerivar ? deriveCategoryRevenue(dashboardData.products, approvedOrders) : EMPTY_LIST,
    [precisaDerivar, dashboardData.products, approvedOrders],
  );
  const faturamentoSeries = useMemo(
    () => (precisaDerivar ? deriveFaturamentoSeries(approvedOrders) : EMPTY_LIST),
    [precisaDerivar, approvedOrders],
  );
  const ticketMedio = useMemo(
    () => (precisaDerivar ? deriveTicketMedio(monthlyComparison) : null),
    [precisaDerivar, monthlyComparison],
  );
  const customerMix = useMemo(
    () => (precisaDerivar ? deriveCustomerMix(dashboardData.users) : null),
    [precisaDerivar, dashboardData.users],
  );
  const abcCurve = useMemo(
    () => (precisaDerivar ? deriveAbcCurve(productPerformance) : EMPTY_LIST),
    [precisaDerivar, productPerformance],
  );
  const sparkline = useMemo(
    () => (precisaDerivar ? deriveMonthSparkline(approvedOrders, 14) : EMPTY_LIST),
    [precisaDerivar, approvedOrders],
  );

  async function refreshDashboard() {
    try {
      const data = await fetchAdminDashboardData();
      setDashboardData(data);
    } catch (error) {
      handleAdminError(error, 'Erro ao atualizar dados.');
    }
  }

  // Sem redirect: com a sessão encerrada, o ProtectedRoute mostra o login na própria /admin.
  async function onLogout() {
    try {
      await logoutAdmin();
      pushToast('Sessão administrativa encerrada.', 'info');
    } catch (error) {
      // O painel continua na tela porque a sessão CONTINUA aberta — e isso
      // precisa ser dito. Antes saía só "Failed to fetch" (ADM-06), e num
      // computador compartilhado a pessoa ia embora achando que tinha saído.
      pushToast(
        `Não foi possível encerrar a sessão: ela continua ATIVA neste navegador. ${friendlyAdminError(
          error,
          'Tente de novo.',
        )}`,
        'error',
      );
    }
  }

  function openCreateProduct() {
    setEditingProduct(null);
    setProductWizardOpen(true);
  }

  // Edição parte do produto COMPLETO (ADM-23 / CROSS-02). A linha da lista
  // vem do /admin/dashboard, resumida: sem galeria, preço original, tipo, FAQ,
  // benefícios e depoimentos — e o PUT regravava tudo isso vazio. Sem o
  // produto completo o wizard não abre: abrir com dado parcial é o que apagava.
  async function openEditProduct(product) {
    try {
      const fullProduct = await fetchAdminProduct(product.id);
      setEditingProduct(fullProduct);
      setProductWizardOpen(true);
    } catch (error) {
      handleAdminError(error, 'Erro ao carregar o produto para edição.');
    }
  }

  function closeProductWizard() {
    setProductWizardOpen(false);
    setEditingProduct(null);
  }

  async function handleProductSave(product) {
    try {
      const images = (product.images || []).map((url) => String(url || '').trim()).filter(Boolean);
      const videos = (product.videos || []).map((url) => String(url || '').trim()).filter(Boolean);

      const productType = product.productType || 'individual';
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
        productType,
        isKit: productType === 'kit',
        featured: product.featured === true,
        faq: Array.isArray(product.faq) ? product.faq : [],
        reviews: Array.isArray(product.reviews) ? product.reviews : [],
        benefits: Array.isArray(product.benefits) ? product.benefits : [],
      };
      // `active` só na criação. Na edição ele fica de fora e o servidor
      // preserva o gravado: mandar `true` aqui REATIVAVA o produto pausado a
      // cada "Salvar" (ADM-23). Pausar/ativar é o botão da lista.
      if (!payload.id) payload.active = true;

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
    if (
      typeof globalThis.window !== 'undefined' &&
      !globalThis.window.confirm?.(`Excluir o produto "${product.name}"?`)
    ) {
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
    // A confirmação diz o que acontece depois (ADM-31): os produtos ficam sem
    // categoria e a seção da página inicial ligada a ela some.
    const id = String(category.id);
    const productCount = (dashboardData.products || []).filter(
      (product) => String(product.categoryId || '') === id,
    ).length;
    const sectionCount = (dashboardData.settings?.homeSections?.sections || []).filter(
      (section) => section?.type === 'category' && String(section?.categoryId || '') === id,
    ).length;
    const consequencias = [
      productCount > 0
        ? `${productCount} ${productCount === 1 ? 'produto ficará' : 'produtos ficarão'} "Sem categoria".`
        : 'Nenhum produto usa esta categoria.',
      sectionCount > 0
        ? `A página inicial perde ${sectionCount === 1 ? 'a seção ligada' : `${sectionCount} seções ligadas`} a ela.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (
      typeof globalThis.window !== 'undefined' &&
      !globalThis.window.confirm?.(`Excluir a categoria "${category.name}"?\n\n${consequencias}`)
    ) {
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
      setUsers((prev) =>
        prev.map((entry) => (entry.id === user.id ? { ...entry, role: nextRole } : entry)),
      );
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

  // `extras` = códigos que acompanham a escrita sem serem gravados
  // (`confirmationCode`, `totpVerificationCode`). Devolve se salvou, para a aba
  // só limpar os campos digitados no sucesso.
  async function handleSecuritySave(nextConfig, extras = {}) {
    try {
      setSecuritySaving(true);
      await saveAdminSetting({ key: 'adminConfig', value: nextConfig, ...extras });
      // Re-busca para refletir as flags redigidas (has2FA/hasPin) sem manter
      // segredos no estado do cliente.
      const fresh = await fetchAdminSetting('adminConfig');
      setAdminConfig(fresh?.value || {});
      pushToast('Configurações de segurança salvas.', 'success');
      return true;
    } catch (error) {
      handleAdminError(error, 'Erro ao salvar configurações.');
      return false;
    } finally {
      setSecuritySaving(false);
    }
  }

  function renderActiveTab() {
    if (tabError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700"
        >
          <i className="bi bi-exclamation-triangle text-2xl" />
          <p className="font-semibold">{tabError}</p>
          <button
            type="button"
            onClick={() => setTabReloadKey((n) => n + 1)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <i className="bi bi-arrow-clockwise" /> Tentar de novo
          </button>
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
      case 'cupons':
        return <CouponsTab />;
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
        return (
          <ComparisonTab monthlyComparison={monthlyComparison} comparisonDelta={comparisonDelta} />
        );
      case 'funil':
        return <FunnelTab />;
      case 'analise':
        return <AnalysisTab categories={dashboardData.categories || []} />;
      case 'segmentos':
        return <SegmentsTab />;
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
        return (
          <SecurityTab config={adminConfig} onSave={handleSecuritySave} saving={securitySaving} />
        );
      default:
        return null;
    }
  }

  return (
    <>
      {/* Título próprio e noindex/nofollow: o painel não é página para buscador (LOJA-26). */}
      <SEO title="Painel administrativo" pathname={ROUTES.admin} noindex />
      <AdminLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pageTitle={pageTitle}
        userLabel={adminEmail || 'Administrador'}
        onLogout={onLogout}
      >
        {showBypassBanner ? (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <i className="bi bi-exclamation-triangle-fill mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">
                Modo de desenvolvimento (bypass) — sem sessão admin real.
              </p>
              <p className="mt-0.5 text-amber-800">
                O painel abre sem login, mas as APIs exigem sessão: por isso o Dashboard fica vazio
                e abas como Segmentos, Cupons e Usuários mostram “sessão expirada”.{' '}
                <a href={`${ROUTES.admin}?login`} className="font-semibold underline">
                  Faça login
                </a>{' '}
                para carregar os dados.
              </p>
            </div>
          </div>
        ) : null}
        {/* Suspense SÓ na área de conteúdo: a navegação lateral do
            AdminLayout já está montada e continua instantânea. */}
        <Suspense fallback={<TabFallback />}>{renderActiveTab()}</Suspense>
      </AdminLayout>

      {/* Os wizards só são BAIXADOS quando alguém abre um. Renderizá-los
          incondicionalmente (mesmo com `isOpen={false}`) traria as ~1.280
          linhas dos dois de volta para o carregamento inicial do painel e
          anularia o `lazy()`. */}
      {productWizardOpen ? (
        <Suspense fallback={null}>
          <ProductWizard
            isOpen={productWizardOpen}
            onClose={closeProductWizard}
            onSubmit={handleProductSave}
            categories={dashboardData.categories || []}
            initialProduct={editingProduct}
          />
        </Suspense>
      ) : null}

      {categoryWizardOpen ? (
        <Suspense fallback={null}>
          <CategoryWizard
            isOpen={categoryWizardOpen}
            onClose={closeCategoryWizard}
            onSubmit={handleCategorySave}
            initialCategory={editingCategory}
          />
        </Suspense>
      ) : null}

      {orderDetail ? (
        <OrderDetailModal order={orderDetail} onClose={() => setOrderDetail(null)} />
      ) : null}
    </>
  );
}
