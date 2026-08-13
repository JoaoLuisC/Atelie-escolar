import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { formatToday } from '../../utils/date';
import { ROUTES } from '../../constants/routes';

const NAV_SECTIONS = [
  {
    type: 'item',
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'grid-1x2-fill',
  },
  {
    type: 'group',
    id: 'products-group',
    label: 'Produtos',
    icon: 'box-seam-fill',
    items: [
      { id: 'produtos', label: 'Lista de produtos', icon: 'box-fill' },
      { id: 'prod-saida', label: 'Desempenho', icon: 'graph-up' },
      { id: 'categorias', label: 'Categorias', icon: 'tags-fill' },
    ],
  },
  {
    type: 'item',
    id: 'pedidos',
    label: 'Pedidos',
    icon: 'receipt',
  },
  {
    type: 'item',
    id: 'cupons',
    label: 'Cupons',
    icon: 'ticket-perforated-fill',
  },
  {
    type: 'group',
    id: 'finance-group',
    label: 'Financeiro',
    icon: 'cash-coin',
    items: [
      { id: 'faturamento', label: 'Faturamento', icon: 'bar-chart-line-fill' },
      { id: 'comparativo', label: 'Comparativo', icon: 'bar-chart-steps' },
    ],
  },
  {
    type: 'item',
    id: 'funil',
    label: 'Funil',
    icon: 'funnel-fill',
  },
  {
    type: 'item',
    id: 'analise',
    label: 'Análise',
    icon: 'bar-chart-line-fill',
  },
  {
    type: 'item',
    id: 'segmentos',
    label: 'Segmentos',
    icon: 'envelope-heart-fill',
  },
  {
    type: 'item',
    id: 'usuarios',
    label: 'Usuários',
    icon: 'people-fill',
  },
  {
    type: 'item',
    id: 'vitrine',
    label: 'Vitrine',
    icon: 'layout-text-window-reverse',
  },
  {
    type: 'item',
    id: 'seguranca',
    label: 'Segurança',
    icon: 'shield-lock-fill',
  },
];

function NavItem({ active, label, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <i className={`bi bi-${icon} text-base`} />
      <span className="truncate">{label}</span>
    </button>
  );
}

NavItem.propTypes = {
  active: PropTypes.bool,
  label: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

function NavGroup({ section, activeTab, onSelect }) {
  const containsActive = section.items.some((item) => item.id === activeTab);
  const [open, setOpen] = useState(containsActive);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
      >
        <span className="flex items-center gap-3">
          <i className={`bi bi-${section.icon}`} />
          {section.label}
        </span>
        <i className={`bi bi-chevron-down text-xs transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="ml-2 flex flex-col gap-1 border-l border-slate-200 pl-3">
          {section.items.map((item) => (
            <NavItem
              key={item.id}
              active={activeTab === item.id}
              label={item.label}
              icon={item.icon}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

NavGroup.propTypes = {
  section: PropTypes.shape({
    items: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired })).isRequired,
    icon: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
  }).isRequired,
  activeTab: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export function AdminLayout({ activeTab, onTabChange, pageTitle, userLabel, onLogout, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const today = formatToday();

  function handleSelect(tabId) {
    onTabChange(tabId);
    setMobileMenuOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:flex`}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-sm">
            <i className="bi bi-palette2 text-lg" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900">Ateliê da Escola</div>
            <div className="truncate text-xs text-slate-500">Painel Administrativo</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <Link
            to={ROUTES.home}
            className="mb-2 flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            <i className="bi bi-shop text-base" />
            <span className="truncate">Ver loja</span>
            <i className="bi bi-arrow-up-right ml-auto text-xs opacity-60" />
          </Link>
          <div className="flex flex-col gap-1">
            {NAV_SECTIONS.map((section) => {
              if (section.type === 'group') {
                return (
                  <NavGroup
                    key={section.id}
                    section={section}
                    activeTab={activeTab}
                    onSelect={handleSelect}
                  />
                );
              }
              return (
                <NavItem
                  key={section.id}
                  active={activeTab === section.id}
                  label={section.label}
                  icon={section.icon}
                  onClick={() => handleSelect(section.id)}
                />
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <i className="bi bi-person-circle text-xl text-slate-400" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-700">{userLabel}</div>
              <div className="truncate text-[10px] uppercase tracking-wide text-slate-500">
                Sessão admin
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <i className="bi bi-box-arrow-right" />
            Encerrar sessão
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <i className="bi bi-list text-xl" />
            </button>
            <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">{pageTitle}</h1>
          </div>
          <span className="hidden text-sm text-slate-500 sm:inline">{today}</span>
        </header>

        <main className="flex-1 overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}

AdminLayout.propTypes = {
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
  pageTitle: PropTypes.string.isRequired,
  userLabel: PropTypes.string.isRequired,
  onLogout: PropTypes.func.isRequired,
  children: PropTypes.node,
};
