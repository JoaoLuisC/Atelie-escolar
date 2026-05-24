import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'support', label: 'Suporte' },
  { value: 'customer', label: 'Cliente' },
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
  if (value === 'admin') return 'bg-rose-100 text-rose-800 ring-rose-200';
  if (value === 'support') return 'bg-sky-100 text-sky-800 ring-sky-200';
  return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
}

export function UsersTab({ users, onRoleChange, onDelete, updatingId = '' }) {
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      return String(user.name || '').toLowerCase().includes(query)
        || String(user.email || '').toLowerCase().includes(query);
    });
  }, [users, search]);

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    await onDelete(confirmDelete);
    setConfirmDelete(null);
  }

  return (
    <>
      <Card
        title="Usuários"
        subtitle={`${filtered.length} de ${users.length} usuário(s)`}
        action={
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:max-w-xs"
          />
        }
      >
        {filtered.length === 0 ? (
          <EmptyState icon="people" title="Nenhum usuário encontrado" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Usuário</th>
                  <th className="px-3 py-2 text-left">Papel</th>
                  <th className="px-3 py-2 text-right">Compras</th>
                  <th className="px-3 py-2 text-right">Total gasto</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((user) => {
                  const role = normalizeRole(user.role);
                  const isUpdating = updatingId === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-800">{user.name || 'Sem nome'}</div>
                        <div className="truncate text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${getRoleBadgeClass(role)}`}>
                            {role.toUpperCase()}
                          </span>
                          <select
                            value={role}
                            onChange={(event) => onRoleChange(user, event.target.value)}
                            disabled={isUpdating}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                          >
                            {ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">{user.purchases || 0}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {formatPrice(user.totalSpent || 0)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          aria-label="Revogar acesso"
                          disabled={isUpdating}
                          onClick={() => setConfirmDelete(user)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancelar"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setConfirmDelete(null)}
          />
          <dialog open className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Revogar acesso?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Isto removerá <strong>{confirmDelete.name || confirmDelete.email}</strong> da tabela de perfis.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button variant="danger" onClick={handleConfirmDelete}>Revogar acesso</Button>
            </div>
          </dialog>
        </div>
      ) : null}
    </>
  );
}

UsersTab.propTypes = {
  users: PropTypes.array.isRequired,
  onRoleChange: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  updatingId: PropTypes.string,
};
