import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { deleteAdminUser, fetchAdminUsers, updateAdminUser } from '../services/admin-panel';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'ADMIN' },
  { value: 'support', label: 'SUPPORT' },
  { value: 'customer', label: 'CUSTOMER' },
];

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'master') return 'admin';
  if (value === 'vendedor') return 'support';
  if (value === 'cliente') return 'customer';
  return value || 'customer';
}

function getRoleBadgeClass(role) {
  const value = normalizeRole(role);
  if (value === 'admin') {
    return 'border-red-200 bg-red-100 text-red-700';
  }
  if (value === 'support') {
    return 'border-blue-200 bg-blue-100 text-blue-700';
  }
  return 'border-green-200 bg-green-100 text-green-700';
}

function getRoleLabel(role) {
  return String(role || 'customer').trim().toUpperCase();
}

function AdminUsersSkeletonTable() {
  const rows = Array.from({ length: 6 }, (_, index) => `skeleton-${index}`);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full table-auto">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nome</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Papel</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Acoes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((id) => (
            <tr key={id} className="animate-pulse">
              <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-slate-200" /></td>
              <td className="px-4 py-3"><div className="h-4 w-48 rounded bg-slate-200" /></td>
              <td className="px-4 py-3"><div className="h-6 w-20 rounded-full bg-slate-200" /></td>
              <td className="px-4 py-3"><div className="h-9 w-40 rounded bg-slate-200" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmDeleteModal({ user, loading, onCancel, onConfirm }) {
  if (!user) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onCancel}
        aria-label="Fechar confirmação"
      />
      <article className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900">Revogar acesso?</h3>
        <p className="mt-2 text-sm text-slate-600">
          Esta acao vai remover o usuario <strong>{user.name || user.email}</strong> da tabela de perfis.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            className="button secondary small"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button primary small"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Revogando...' : 'Revogar / Excluir'}
          </button>
        </div>
      </article>
    </div>
  );
}

ConfirmDeleteModal.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
  }),
  loading: PropTypes.bool.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

ConfirmDeleteModal.defaultProps = {
  user: null,
};

function AdminUsersLayout({ children, onLogout }) {
  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <section className="admin-page-body legacy-admin-shell-wrap">
      <aside className="adm-sidebar">
        <div className="adm-brand">
          <div className="adm-brand-icon"><i className="bi bi-palette2" /></div>
          <div>
            <div className="adm-brand-name">Atelie da Escola</div>
            <div className="adm-brand-sub">Painel Admin</div>
          </div>
        </div>

        <nav className="adm-nav">
          <Link to="/admin" className="adm-nav-item">
            <i className="bi bi-grid-1x2-fill" /> Dashboard
          </Link>
          <button type="button" className="adm-nav-item active">
            <i className="bi bi-people-fill" /> Usuarios
          </button>
        </nav>

        <div className="adm-sidebar-foot">
          <div className="adm-user-chip">
            <i className="bi bi-shield-lock-fill" />
            <span>Acesso administrativo</span>
          </div>
          <button type="button" className="adm-logout-btn" onClick={onLogout}>
            <i className="bi bi-box-arrow-right" /> Sair
          </button>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-topbar">
          <div className="adm-topbar-left">
            <h1 className="adm-page-title">Gerenciamento de Usuarios</h1>
          </div>
          <div className="adm-topbar-right">
            <span className="adm-topbar-date">{today}</span>
          </div>
        </header>
        <main className="adm-content">{children}</main>
      </div>
    </section>
  );
}

AdminUsersLayout.propTypes = {
  children: PropTypes.node.isRequired,
  onLogout: PropTypes.func.isRequired,
};

export function AdminUsersPage() {
  const navigate = useNavigate();
  const { logoutAdmin } = useAuth();
  const { pushToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      try {
        const data = await fetchAdminUsers();
        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch (error) {
        pushToast(error.message || 'Erro ao carregar usuarios do admin.', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [pushToast]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) => {
      const name = String(user.name || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [search, users]);

  async function handleLogout() {
    try {
      await logoutAdmin();
      pushToast('Sessao administrativa encerrada.', 'warning');
      navigate('/admin-login', { replace: true });
    } catch (error) {
      pushToast(error.message || 'Erro ao encerrar sessao.', 'error');
    }
  }

  async function handleRoleChange(userId, nextRole) {
    setUpdatingUserId(userId);
    try {
      await updateAdminUser({ id: userId, role: String(nextRole || '').toLowerCase() });
      setUsers((previous) => previous.map((user) => (
        user.id === userId ? { ...user, role: String(nextRole || '').toLowerCase() } : user
      )));
      pushToast('Papel do usuario atualizado com sucesso.', 'success');
    } catch (error) {
      pushToast(error.message || 'Erro ao atualizar papel do usuario.', 'error');
    } finally {
      setUpdatingUserId('');
    }
  }

  async function handleDeleteUser() {
    if (!deleteCandidate?.id) {
      return;
    }

    setDeletingUserId(deleteCandidate.id);
    try {
      await deleteAdminUser(deleteCandidate.id);
      setUsers((previous) => previous.filter((user) => user.id !== deleteCandidate.id));
      pushToast('Acesso revogado com sucesso.', 'success');
      setDeleteCandidate(null);
    } catch (error) {
      pushToast(error.message || 'Erro ao revogar acesso do usuario.', 'error');
    } finally {
      setDeletingUserId('');
    }
  }

  return (
    <AdminUsersLayout onLogout={handleLogout}>
      <section className="admin-wrap">
        <article className="card admin-list-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="m-0">Usuarios da Plataforma</h3>
              <p className="m-0 text-sm text-slate-500">Gerencie papeis e acessos com seguranca.</p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou e-mail"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:max-w-xs"
            />
          </div>

          {loading ? <AdminUsersSkeletonTable /> : null}

          {loading ? null : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full table-auto">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Papel (Role)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                        Nenhum usuario encontrado.
                      </td>
                    </tr>
                  ) : null}

                  {filteredUsers.map((user) => {
                    const role = normalizeRole(user.role);
                    const isUpdating = updatingUserId === user.id;
                    const isDeleting = deletingUserId === user.id;

                    return (
                      <tr key={user.id}>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          <strong>{user.name || 'Sem nome'}</strong>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getRoleBadgeClass(role)}`}>
                            {getRoleLabel(role)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <select
                              value={role}
                              onChange={(event) => handleRoleChange(user.id, event.target.value)}
                              disabled={isUpdating || isDeleting}
                              className="min-w-[150px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                            >
                              {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>

                            <button
                              type="button"
                              className="button secondary small"
                              onClick={() => setDeleteCandidate(user)}
                              disabled={isUpdating || isDeleting}
                            >
                              {isDeleting ? 'Revogando...' : 'Revogar / Excluir'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <ConfirmDeleteModal
        user={deleteCandidate}
        loading={Boolean(deleteCandidate?.id) && deletingUserId === deleteCandidate?.id}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={handleDeleteUser}
      />
    </AdminUsersLayout>
  );
}
