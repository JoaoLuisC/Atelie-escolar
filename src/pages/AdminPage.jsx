import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { AdminProductsManager } from '../features/admin/AdminProductsManager';
import { ProductWizard } from '../components/ProductWizard';
import { CategoryWizard } from '../components/CategoryWizard';
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminDashboardData,
  fetchAdminOrders,
  fetchAdminSetting,
  fetchAdminUsers,
  patchAdminProduct,
  saveAdminSetting,
  updateAdminCategory,
} from '../services/admin-panel';
import { formatPrice } from '../utils/currency';

function toDateSafe(value) {
  const dt = new Date(value || 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateTime(value) {
  const dt = toDateSafe(value);
  if (!dt) return '-';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  const map = {
    approved: 'Aprovado',
    pending: 'Pendente',
    rejected: 'Recusado',
    cancelled: 'Cancelado',
    failed: 'Falhou',
    completed: 'Concluido',
  };
  return map[normalized] || status || '-';
}

function createEmptyDashboardData() {
  return {
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
    settings: {
      homeSections: { sections: [] },
    },
  };
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function AdminPage() {
  const { logoutAdmin, setAdminAuthenticated } = useAuth();
  const { pushToast } = useToast();
  const allowAdminBypass = import.meta.env.DEV || import.meta.env.VITE_ALLOW_ADMIN_BYPASS === 'true';
  const [activeTab, setActiveTab] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [productsGroupOpen, setProductsGroupOpen] = useState(true);
  const [financeGroupOpen, setFinanceGroupOpen] = useState(false);
  const [siteGroupOpen, setSiteGroupOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState(createEmptyDashboardData);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState('');
  const [usersFilter, setUsersFilter] = useState('');
  const [vitrineJson, setVitrineJson] = useState('');
  const [securityJson, setSecurityJson] = useState('');
  const [tabStatus, setTabStatus] = useState('');
  const [tabLoading, setTabLoading] = useState(false);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [productWizardOpen, setProductWizardOpen] = useState(false);
  const [categoryWizardOpen, setCategoryWizardOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);

  const pageTitle = useMemo(() => {
    const titles = {
      dashboard: 'Dashboard',
      produtos: 'Produtos',
      categorias: 'Categorias',
      pedidos: 'Pedidos',
      'prod-config': 'Configuracao de Produtos',
      'prod-saida': 'Saida e Desempenho',
      faturamento: 'Faturamento',
      comparativo: 'Comparativo',
      usuarios: 'Usuarios',
      vitrine: 'Vitrine',
      seguranca: 'Seguranca',
    };

    return titles[activeTab] || 'Painel Admin';
  }, [activeTab]);

  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  async function onLogout() {
    try {
      await logoutAdmin();
      pushToast('Sessao administrativa encerrada.', 'info');
    } catch (error) {
      pushToast(error.message || 'Erro ao encerrar sessao.', 'error');
    }
  }

  function onAuthExpired() {
    if (allowAdminBypass) {
      return;
    }
    setAdminAuthenticated(false);
    pushToast('Sessao admin expirada. Faca login novamente.', 'warning');
  }

  useEffect(() => {
    // eslint-disable-next-line sonarjs/cognitive-complexity
    async function loadForTab() {
      try {
        setTabLoading(true);
        setTabStatus('Carregando...');

        if (['dashboard', 'faturamento', 'comparativo', 'prod-saida', 'prod-config', 'vitrine'].includes(activeTab)) {
          const data = await fetchAdminDashboardData();
          setDashboardData(data);
          setCategories(data.categories || []);
          if (activeTab === 'vitrine') {
            setVitrineJson(JSON.stringify(data.settings?.homeSections || { sections: [] }, null, 2));
          }
        }

        if (activeTab === 'usuarios') {
          const data = await fetchAdminUsers();
          setUsers(data.users || []);
        }

        if (activeTab === 'pedidos') {
          const data = await fetchAdminOrders(ordersFilter);
          setOrders(data.orders || []);
        }

        if (activeTab === 'categorias') {
          const data = await fetchAdminDashboardData();
          setCategories(data.categories || []);
        }

        if (activeTab === 'seguranca') {
          const data = await fetchAdminSetting('adminConfig');
          setSecurityJson(JSON.stringify(data.value || {}, null, 2));
        }

        setTabStatus('');
      } catch (error) {
        const isSessionError = String(error.message || '').toLowerCase().includes('sessao admin');

        if (isSessionError && allowAdminBypass) {
          setDashboardData(createEmptyDashboardData());
          setCategories([]);
          setUsers([]);
          setOrders([]);
          if (activeTab === 'vitrine') {
            setVitrineJson(JSON.stringify({ sections: [] }, null, 2));
          }
          if (activeTab === 'seguranca') {
            setSecurityJson(JSON.stringify({}, null, 2));
          }
          setTabStatus('');
          return;
        }

        if (isSessionError) {
          onAuthExpired();
        }
        setTabStatus(error.message || 'Erro ao carregar dados da aba.');
      } finally {
        setTabLoading(false);
      }
    }

    loadForTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ordersFilter]);

  const approvedOrders = useMemo(
    () => (dashboardData?.orders || []).filter((order) => order.paymentStatus === 'approved'),
    [dashboardData],
  );

  const productPerformance = useMemo(() => {
    const base = (dashboardData?.products || []).map((product) => ({
      ...product,
      qty: 0,
      rev: 0,
      downloads: Number(product.downloads || 0),
    }));

    const index = Object.fromEntries(base.map((product) => [String(product.id), product]));
    for (const order of approvedOrders) {
      for (const item of order.items || []) {
        const id = String(item.id || item.productId || '');
        if (!id || !index[id]) continue;
        index[id].qty += Number(item.quantity || 0);
        index[id].rev += Number(item.price || 0) * Number(item.quantity || 0);
      }
    }

    return base.sort((a, b) => b.qty - a.qty);
  }, [dashboardData, approvedOrders]);

  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const months = [0, 1].map((offset) => {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const monthOrders = approvedOrders.filter((order) => {
        const dt = new Date(order.completedAt || order.createdAt || 0);
        return dt >= start && dt < end;
      });

      const gross = monthOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const qty = monthOrders.length;
      const avg = qty ? gross / qty : 0;

      return { label, gross, qty, avg };
    });

    return months.reverse();
  }, [approvedOrders]);

  const recentOrders = useMemo(() => {
    const ordered = [...(dashboardData?.orders || [])].sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    });
    return ordered.slice(0, 8);
  }, [dashboardData]);

  const dailyRevenue = useMemo(() => {
    const days = 7;
    const now = new Date();
    const labels = [];
    const values = [];
    const map = new Map();

    for (const order of approvedOrders) {
      const dt = toDateSafe(order.completedAt || order.createdAt);
      if (!dt) continue;
      const key = dt.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + Number(order.totalAmount || 0));
    }

    for (let i = days - 1; i >= 0; i -= 1) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      labels.push(dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
      values.push(map.get(key) || 0);
    }

    const max = Math.max(1, ...values);
    return values.map((value, index) => ({
      label: labels[index],
      value,
      pct: Math.max(6, Math.round((value / max) * 100)),
    }));
  }, [approvedOrders]);

  const categoryRevenue = useMemo(() => {
    const productCategory = {};
    for (const product of dashboardData?.products || []) {
      productCategory[String(product.id)] = product.category || 'Sem categoria';
    }

    const buckets = {};
    for (const order of approvedOrders) {
      for (const item of order.items || []) {
        const id = String(item.id || item.productId || '');
        const category = productCategory[id] || 'Sem categoria';
        buckets[category] = (buckets[category] || 0) + Number(item.price || 0) * Number(item.quantity || 0);
      }
    }

    const list = Object.entries(buckets)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const max = Math.max(1, ...list.map((item) => item.value), 1);
    return list.map((item) => ({
      ...item,
      pct: Math.max(8, Math.round((item.value / max) * 100)),
    }));
  }, [approvedOrders, dashboardData]);

  const faturamentoSeries = useMemo(() => {
    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i -= 1) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
      const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
      const value = approvedOrders
        .filter((order) => {
          const date = toDateSafe(order.completedAt || order.createdAt);
          return date && date >= start && date < end;
        })
        .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

      months.push({
        label: dt.toLocaleDateString('pt-BR', { month: 'short' }),
        value,
      });
    }

    const max = Math.max(1, ...months.map((item) => item.value), 1);
    return months.map((item) => ({ ...item, pct: Math.max(8, Math.round((item.value / max) * 100)) }));
  }, [approvedOrders]);

  const comparisonDelta = useMemo(() => {
    if (monthlyComparison.length < 2) {
      return { pct: 0, trend: 'stable' };
    }

    const prev = monthlyComparison[0].gross;
    const current = monthlyComparison[1].gross;
    if (!prev && !current) {
      return { pct: 0, trend: 'stable' };
    }

    if (!prev && current) {
      return { pct: 100, trend: 'up' };
    }

    const pct = ((current - prev) / prev) * 100;
    if (pct > 0.01) return { pct, trend: 'up' };
    if (pct < -0.01) return { pct, trend: 'down' };
    return { pct, trend: 'stable' };
  }, [monthlyComparison]);



  async function removeCategory(id) {
    try {
      await deleteAdminCategory(id);
      const data = await fetchAdminDashboardData();
      setCategories(data.categories || []);
      pushToast('Categoria removida.', 'success');
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sessao admin')) {
        onAuthExpired();
      }
      pushToast(error.message || 'Erro ao remover categoria.', 'error');
    }
  }

  async function toggleProductActive(product) {
    try {
      const isInactive = product.active === false;
      await patchAdminProduct({ id: product.id, active: isInactive });
      const data = await fetchAdminDashboardData();
      setDashboardData(data);
      pushToast(`Produto ${isInactive ? 'ativado' : 'desativado'}.`, 'success');
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sessao admin')) {
        onAuthExpired();
      }
      pushToast(error.message || 'Erro ao atualizar produto.', 'error');
    }
  }

  async function saveVitrine() {
    try {
      const parsed = JSON.parse(vitrineJson || '{}');
      await saveAdminSetting({ key: 'homeSections', value: parsed });
      pushToast('Configuracao da vitrine salva.', 'success');
    } catch (error) {
      pushToast(error.message || 'JSON invalido para vitrine.', 'error');
    }
  }

  async function saveSecurity() {
    try {
      const parsed = JSON.parse(securityJson || '{}');
      await saveAdminSetting({ key: 'adminConfig', value: parsed });
      pushToast('Configuracao de seguranca salva.', 'success');
    } catch (error) {
      pushToast(error.message || 'JSON invalido para seguranca.', 'error');
    }
  }

  function openOrderDetail(order) {
    setSelectedOrder(order);
    setOrderDetailOpen(true);
  }

  function closeOrderDetail() {
    setOrderDetailOpen(false);
    setSelectedOrder(null);
  }

  async function handleProductSave(product) {
    try {
      if (product.id) {
        await patchAdminProduct(product);
        pushToast('Produto atualizado.', 'success');
      } else {
        // For new products, store in Firestore/Oracle
        // This will depend on your API structure
        pushToast('Produto criado. Implementar API de criacao.', 'info');
      }
      const data = await fetchAdminDashboardData();
      setDashboardData(data);
      setProductWizardOpen(false);
      setEditingProduct(null);
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sessao admin')) {
        onAuthExpired();
      }
      pushToast(error.message || 'Erro ao salvar produto.', 'error');
    }
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
      const data = await fetchAdminDashboardData();
      setCategories(data.categories || []);
      setCategoryWizardOpen(false);
      setEditingCategory(null);
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sessao admin')) {
        onAuthExpired();
      }
      pushToast(error.message || 'Erro ao salvar categoria.', 'error');
    }
  }

  function closeProductWizard() {
    setProductWizardOpen(false);
    setEditingProduct(null);
  }

  function closeCategoryWizard() {
    setCategoryWizardOpen(false);
    setEditingCategory(null);
  }

  const filteredUsers = useMemo(() => {
    const q = usersFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) => String(user.name || '').toLowerCase().includes(q) || String(user.email || '').toLowerCase().includes(q),
    );
  }, [users, usersFilter]);

  return (
    <>
      <section className="admin-page-body legacy-admin-shell-wrap">
        <button type="button" className="adm-toggle" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          <i className="bi bi-list" />
        </button>

        <button
          type="button"
          className={`adm-overlay${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />

        <aside className={`adm-sidebar${menuOpen ? ' open' : ''}`}>
          <div className="adm-brand">
            <div className="adm-brand-icon"><i className="bi bi-palette2" /></div>
            <div>
              <div className="adm-brand-name">Atelie da Escola</div>
              <div className="adm-brand-sub">Painel Admin</div>
            </div>
          </div>

          <nav className="adm-nav">
            <button type="button" className={`adm-nav-item${activeTab === 'dashboard' ? ' active' : ''}`} onClick={() => { setActiveTab('dashboard'); setMenuOpen(false); }}>
              <i className="bi bi-grid-1x2-fill" /> Dashboard
            </button>

            <div className="adm-nav-group">
              <button type="button" className="adm-nav-group-head" onClick={() => setProductsGroupOpen((value) => !value)}>
                <span><i className="bi bi-box-seam-fill" /> Produtos</span>
                <i className={`bi bi-chevron-down adm-grp-chevron${productsGroupOpen ? ' open' : ''}`} />
              </button>
              <div className={`adm-nav-sub${productsGroupOpen ? ' open' : ''}`}>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'prod-config' ? ' active' : ''}`} onClick={() => { setActiveTab('prod-config'); setMenuOpen(false); }}>
                  <i className="bi bi-sliders" /> Configuracao
                </button>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'prod-saida' ? ' active' : ''}`} onClick={() => { setActiveTab('prod-saida'); setMenuOpen(false); }}>
                  <i className="bi bi-graph-up" /> Saida e Desempenho
                </button>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'categorias' ? ' active' : ''}`} onClick={() => { setActiveTab('categorias'); setMenuOpen(false); }}>
                  <i className="bi bi-tags-fill" /> Categorias
                </button>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'pedidos' ? ' active' : ''}`} onClick={() => { setActiveTab('pedidos'); setMenuOpen(false); }}>
                  <i className="bi bi-receipt" /> Pedidos
                </button>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'produtos' ? ' active' : ''}`} onClick={() => { setActiveTab('produtos'); setMenuOpen(false); }}>
                  <i className="bi bi-box-fill" /> Lista de Produtos
                </button>
              </div>
            </div>

            <div className="adm-nav-group">
              <button type="button" className="adm-nav-group-head" onClick={() => setFinanceGroupOpen((value) => !value)}>
                <span><i className="bi bi-cash-coin" /> Financeiro</span>
                <i className={`bi bi-chevron-down adm-grp-chevron${financeGroupOpen ? ' open' : ''}`} />
              </button>
              <div className={`adm-nav-sub${financeGroupOpen ? ' open' : ''}`}>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'faturamento' ? ' active' : ''}`} onClick={() => { setActiveTab('faturamento'); setMenuOpen(false); }}>
                  <i className="bi bi-bar-chart-line-fill" /> Faturamento
                </button>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'comparativo' ? ' active' : ''}`} onClick={() => { setActiveTab('comparativo'); setMenuOpen(false); }}>
                  <i className="bi bi-bar-chart-steps" /> Comparativo
                </button>
              </div>
            </div>

            <button type="button" className={`adm-nav-item${activeTab === 'usuarios' ? ' active' : ''}`} onClick={() => { setActiveTab('usuarios'); setMenuOpen(false); }}>
              <i className="bi bi-people-fill" /> Usuarios
            </button>

            <div className="adm-nav-group">
              <button type="button" className="adm-nav-group-head" onClick={() => setSiteGroupOpen((value) => !value)}>
                <span><i className="bi bi-gear-fill" /> Configuracoes do Site</span>
                <i className={`bi bi-chevron-down adm-grp-chevron${siteGroupOpen ? ' open' : ''}`} />
              </button>
              <div className={`adm-nav-sub${siteGroupOpen ? ' open' : ''}`}>
                <button type="button" className={`adm-nav-sub-item${activeTab === 'vitrine' ? ' active' : ''}`} onClick={() => { setActiveTab('vitrine'); setMenuOpen(false); }}>
                  <i className="bi bi-layout-text-window-reverse" /> Vitrine
                </button>
              </div>
            </div>

            <button type="button" className={`adm-nav-item${activeTab === 'seguranca' ? ' active' : ''}`} onClick={() => { setActiveTab('seguranca'); setMenuOpen(false); }}>
              <i className="bi bi-shield-lock-fill" /> Seguranca
            </button>
          </nav>

          <div className="adm-sidebar-foot">
            <div className="adm-user-chip">
              <i className="bi bi-person-circle" />
              <span>admin@atelie</span>
            </div>
            <button type="button" className="adm-logout-btn" onClick={onLogout}>
              <i className="bi bi-box-arrow-right" /> Sair
            </button>
          </div>
        </aside>

        <div className="adm-main">
          <div className="adm-topbar">
            <div className="adm-topbar-left">
              <h1 className="adm-page-title">{pageTitle}</h1>
            </div>
            <div className="adm-topbar-right">
              <span className="adm-topbar-date">{today}</span>
            </div>
          </div>

          <div className="adm-content">
            <div className={`tab-panel${activeTab === 'dashboard' ? ' active' : ''}`}>
              {tabLoading && activeTab === 'dashboard' ? <div className="loading-state"><p>Carregando dashboard...</p></div> : null}
              {tabStatus && activeTab === 'dashboard' ? <p className="admin-status">{tabStatus}</p> : null}
              {!tabLoading && !tabStatus && activeTab === 'dashboard' ? (
                <div className="admin-wrap">
                  <article className="card admin-list-card">
                    <h3>Resumo do painel</h3>
                    <div className="adm-kpi-grid">
                      <div className="adm-kpi-card">
                        <span>Faturamento do mes</span>
                        <strong>{formatPrice(dashboardData?.summary?.revenueMonth || 0)}</strong>
                      </div>
                      <div className="adm-kpi-card">
                        <span>Receita total</span>
                        <strong>{formatPrice(dashboardData?.summary?.revenueTotal || 0)}</strong>
                      </div>
                      <div className="adm-kpi-card">
                        <span>Pedidos aprovados</span>
                        <strong>{dashboardData?.summary?.approvedOrders || 0}</strong>
                      </div>
                      <div className="adm-kpi-card">
                        <span>Pendentes</span>
                        <strong>{dashboardData?.summary?.pendingOrders || 0}</strong>
                      </div>
                      <div className="adm-kpi-card">
                        <span>Produtos ativos</span>
                        <strong>{dashboardData?.summary?.activeProducts || 0}</strong>
                      </div>
                      <div className="adm-kpi-card">
                        <span>Usuarios</span>
                        <strong>{dashboardData?.summary?.totalUsers || 0}</strong>
                      </div>
                    </div>
                  </article>

                  <article className="card admin-list-card">
                    <h3>Receita dos ultimos 7 dias</h3>
                    <div className="adm-bars-grid">
                      {dailyRevenue.map((day) => (
                        <div key={day.label} className="adm-bar-item">
                          <div className="adm-bar-track">
                            <div className="adm-bar-fill" style={{ width: `${day.pct}%` }} />
                          </div>
                          <div className="adm-bar-meta">
                            <span>{day.label}</span>
                            <strong>{formatPrice(day.value)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="card admin-list-card">
                    <h3>Receita por categoria</h3>
                    {categoryRevenue.length === 0 ? <p className="empty-text">Sem dados de categoria no periodo.</p> : null}
                    <div className="adm-bars-grid">
                      {categoryRevenue.map((entry) => (
                        <div key={entry.category} className="adm-bar-item">
                          <div className="adm-bar-track">
                            <div className="adm-bar-fill adm-bar-fill-alt" style={{ width: `${entry.pct}%` }} />
                          </div>
                          <div className="adm-bar-meta">
                            <span>{entry.category}</span>
                            <strong>{formatPrice(entry.value)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="card admin-list-card">
                    <h3>Pedidos recentes</h3>
                    {recentOrders.length === 0 ? <p className="empty-text">Nenhum pedido recente.</p> : null}
                    <div className="adm-orders-table">
                      {recentOrders.map((order) => (
                        <div key={order.id} className="adm-orders-row">
                          <div>
                            <strong>{order.orderId || order.id}</strong>
                            <p>{order.customerEmail || order.customerName || 'Cliente nao identificado'}</p>
                          </div>
                          <div>
                            <span className={`adm-status-chip status-${String(order.paymentStatus || '').toLowerCase()}`}>
                              {getStatusLabel(order.paymentStatus)}
                            </span>
                            <p>{formatDateTime(order.createdAt)}</p>
                          </div>
                          <div>
                            <strong>{formatPrice(order.totalAmount || 0)}</strong>
                            <button
                              type="button"
                              className="button secondary small"
                              onClick={() => openOrderDetail(order)}
                            >
                              Detalhes
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              ) : null}
            </div>

            <div className={`tab-panel${activeTab === 'produtos' ? ' active' : ''}`}>
              <AdminProductsManager onAuthExpired={onAuthExpired} />
            </div>

            <div className={`tab-panel${activeTab === 'categorias' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-list-card">
                  <div className="admin-list-header">
                    <h3>Categorias</h3>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setEditingCategory(null);
                        setCategoryWizardOpen(true);
                      }}
                    >
                      <i className="bi bi-plus-lg" /> Adicionar Categoria
                    </button>
                  </div>
                  {categories.length === 0 ? <p className="empty-text">Nenhuma categoria cadastrada.</p> : null}
                  <div className="admin-products-list">
                    {categories.map((category) => (
                      <article key={category.id} className="admin-product-item">
                        <div>
                          <strong>{category.name}</strong>
                          <p>Cor: {category.color || '#9B5DE5'}</p>
                        </div>
                        <div className="admin-item-actions">
                          <button
                            type="button"
                            className="button secondary small"
                            onClick={() => {
                              setEditingCategory(category);
                              setCategoryWizardOpen(true);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="button secondary small"
                            onClick={() => removeCategory(category.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'usuarios' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-list-card">
                  <h3>Usuarios</h3>
                  <input
                    value={usersFilter}
                    placeholder="Buscar por nome ou email"
                    onChange={(event) => setUsersFilter(event.target.value)}
                  />
                  {filteredUsers.length === 0 ? <p className="empty-text">Nenhum usuario encontrado.</p> : null}
                  <div className="admin-products-list">
                    {filteredUsers.map((user) => (
                      <article key={user.id} className="admin-product-item">
                        <div>
                          <strong>{user.name || 'Sem nome'}</strong>
                          <p>{user.email} | Compras: {user.purchases || 0} | Total: {formatPrice(user.totalSpent || 0)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'pedidos' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-list-card">
                  <h3>Pedidos</h3>
                  <div className="admin-actions">
                    <select value={ordersFilter} onChange={(event) => setOrdersFilter(event.target.value)}>
                      <option value="">Todos os status</option>
                      <option value="approved">Aprovado</option>
                      <option value="pending">Pendente</option>
                      <option value="rejected">Recusado</option>
                      <option value="cancelled">Cancelado</option>
                      <option value="failed">Falhou</option>
                    </select>
                  </div>
                  {orders.length === 0 ? <p className="empty-text">Nenhum pedido encontrado.</p> : null}
                  <div className="adm-orders-table">
                    {orders.map((order) => (
                      <article key={order.id} className="adm-orders-row">
                        <div>
                          <strong>{order.orderId || order.id}</strong>
                          <p>{order.customerEmail || order.customerName || 'Cliente nao identificado'}</p>
                        </div>
                        <div>
                          <span className={`adm-status-chip status-${String(order.paymentStatus || '').toLowerCase()}`}>
                            {getStatusLabel(order.paymentStatus)}
                          </span>
                          <p>{formatDateTime(order.createdAt)}</p>
                        </div>
                        <div>
                          <strong>{formatPrice(order.totalAmount || 0)}</strong>
                          <button
                            type="button"
                            className="button secondary small"
                            onClick={() => openOrderDetail(order)}
                          >
                            Detalhes
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'vitrine' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-form-card">
                  <h3>Configuracao da vitrine</h3>
                  <p>Edite o JSON das secoes da pagina inicial.</p>
                  <textarea rows="16" value={vitrineJson} onChange={(event) => setVitrineJson(event.target.value)} />
                  <div className="admin-actions">
                    <button type="button" className="button primary small" onClick={saveVitrine}>Salvar vitrine</button>
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'faturamento' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-list-card">
                  <h3>Faturamento</h3>
                  <p>Pedidos aprovados: {approvedOrders.length}</p>
                  <p>Bruto acumulado: <strong>{formatPrice(approvedOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0))}</strong></p>
                  <div className="adm-bars-grid">
                    {faturamentoSeries.map((entry) => (
                      <div key={entry.label} className="adm-bar-item">
                        <div className="adm-bar-track">
                          <div className="adm-bar-fill" style={{ width: `${entry.pct}%` }} />
                        </div>
                        <div className="adm-bar-meta">
                          <span>{entry.label}</span>
                          <strong>{formatPrice(entry.value)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'comparativo' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-list-card">
                  <h3>Comparativo mensal</h3>
                  <p>
                    Variacao:
                    {' '}
                    <strong className={`adm-delta-${comparisonDelta.trend}`}>
                      {comparisonDelta.pct > 0 ? '+' : ''}
                      {comparisonDelta.pct.toFixed(1)}%
                    </strong>
                  </p>
                  <div className="admin-products-list">
                    {monthlyComparison.map((month) => (
                      <article key={month.label} className="admin-product-item">
                        <div>
                          <strong>{month.label}</strong>
                          <p>Vendas: {month.qty} | Receita: {formatPrice(month.gross)} | Ticket medio: {formatPrice(month.avg)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'prod-config' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-list-card">
                  <h3>Configuracao de produtos</h3>
                  <div className="admin-products-list">
                    {(dashboardData?.products || []).map((product) => (
                      <article key={product.id} className="admin-product-item">
                        <div>
                          <strong>{product.name}</strong>
                          <p>{formatPrice(product.price)} | {product.category || 'Sem categoria'} | {product.active === false ? 'Inativo' : 'Ativo'}</p>
                        </div>
                        <div className="admin-item-actions">
                          <button type="button" className="button secondary small" onClick={() => toggleProductActive(product)}>
                            {product.active === false ? 'Ativar' : 'Desativar'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'prod-saida' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-list-card">
                  <h3>Saida e desempenho</h3>
                  <div className="admin-products-list">
                    {productPerformance.map((product) => (
                      <article key={product.id} className="admin-product-item">
                        <div>
                          <strong>{product.name}</strong>
                          <p>Vendas: {product.qty} | Receita: {formatPrice(product.rev)} | Downloads: {product.downloads || 0}</p>
                          <div className="adm-inline-progress-wrap">
                            <span>Conversao</span>
                            <div className="adm-inline-progress">
                              <div
                                className="adm-inline-progress-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(6, Math.round(((product.downloads || 0) / Math.max(product.qty || 1, 1)) * 100)))}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className={`tab-panel${activeTab === 'seguranca' ? ' active' : ''}`}>
              <section className="admin-wrap">
                <article className="card admin-form-card">
                  <h3>Configuracao de seguranca</h3>
                  <p>Gerencie a configuracao do admin (exemplo: totpSecret, fallbackPin).</p>
                  <textarea rows="12" value={securityJson} onChange={(event) => setSecurityJson(event.target.value)} />
                  <div className="admin-actions">
                    <button type="button" className="button primary small" onClick={saveSecurity}>Salvar seguranca</button>
                  </div>
                </article>
              </section>
            </div>
          </div>
        </div>
      </section>

      {orderDetailOpen && selectedOrder ? (
        <div className="adm-modal-root">
          <button type="button" className="adm-modal-overlay" aria-label="Fechar detalhes do pedido" onClick={closeOrderDetail} />
          <dialog open className="adm-modal-card" aria-labelledby="adm-order-title">
            <div className="adm-modal-head">
              <h3 id="adm-order-title">Pedido {selectedOrder.orderId || selectedOrder.id}</h3>
              <button type="button" className="button secondary small" onClick={closeOrderDetail}>Fechar</button>
            </div>
            <p>
              Cliente: <strong>{selectedOrder.customerName || selectedOrder.customerEmail || '-'}</strong>
            </p>
            <p>
              E-mail: <strong>{selectedOrder.customerEmail || '-'}</strong>
            </p>
            <p>
              Status: <strong>{getStatusLabel(selectedOrder.paymentStatus)}</strong>
            </p>
            <p>
              Total: <strong>{formatPrice(selectedOrder.totalAmount || 0)}</strong>
            </p>
            <p>
              Data: <strong>{formatDateTime(selectedOrder.createdAt)}</strong>
            </p>

            <h4>Itens</h4>
            {(selectedOrder.items || []).length === 0 ? <p className="empty-text">Sem itens vinculados.</p> : null}
            <div className="adm-modal-items">
              {(selectedOrder.items || []).map((item, index) => (
                <div key={`${item.id || item.productId || 'item'}-${index}`} className="adm-modal-item-row">
                  <span>{item.title || `Produto ${item.id || item.productId || index + 1}`}</span>
                  <span>
                    {item.quantity || 1} x {formatPrice(item.price || 0)}
                  </span>
                </div>
              ))}
            </div>
          </dialog>
        </div>
      ) : null}

      <ProductWizard
        isOpen={productWizardOpen}
        onClose={closeProductWizard}
        onSubmit={handleProductSave}
        categories={categories}
        initialProduct={editingProduct}
      />

      <CategoryWizard
        isOpen={categoryWizardOpen}
        onClose={closeCategoryWizard}
        onSubmit={handleCategorySave}
        initialCategory={editingCategory}
      />
    </>
  );
}
