import { useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { useModalBehavior } from '../ui/useModalBehavior';

// Só os papéis que PUT /admin/users aceita (ASSIGNABLE_ROLES em
// validation/admin.schemas.js). A lista antiga oferecia "Admin" e "Suporte",
// que o endpoint sempre recusou com 400 (ADM-42): promover a admin por aqui
// seria escalada de privilégio, e "support" nunca foi um papel do sistema.
const ROLE_OPTIONS = [
  { value: 'customer', label: 'Cliente' },
  { value: 'seller', label: 'Vendedor' },
];

const ROLE_LABELS = { admin: 'Admin', support: 'Suporte', customer: 'Cliente', seller: 'Vendedor' };

function normalizeRole(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase();
  if (value === 'master') return 'admin';
  if (value === 'vendedor') return 'seller';
  if (value === 'cliente') return 'customer';
  return value || 'customer';
}

function getRoleBadgeClass(role) {
  const value = normalizeRole(role);
  if (value === 'admin') return 'bg-rose-100 text-rose-800 ring-rose-200';
  if (value === 'seller' || value === 'support') return 'bg-sky-100 text-sky-800 ring-sky-200';
  return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
}

function ConfirmRevokeDialog({ user, onCancel, onConfirm, busy }) {
  const dialogRef = useRef(null);
  useModalBehavior(dialogRef, onCancel);
  const nome = user.name || user.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        className="absolute inset-0 bg-slate-900/50"
        onClick={onCancel}
      />
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        aria-labelledby="revoke-dialog-title"
        tabIndex={-1}
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <h3 id="revoke-dialog-title" className="text-lg font-bold text-slate-900">
          Revogar acesso?
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Isto removerá <strong>{nome}</strong> da tabela de perfis.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Revogando…' : `Revogar acesso de ${nome}`}
          </Button>
        </div>
      </dialog>
    </div>
  );
}

ConfirmRevokeDialog.propTypes = {
  user: PropTypes.shape({ name: PropTypes.string, email: PropTypes.string }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  busy: PropTypes.bool,
};

export function UsersTab({ users, onRoleChange, onDelete, updatingId = '' }) {
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      return (
        String(user.name || '')
          .toLowerCase()
          .includes(query) ||
        String(user.email || '')
          .toLowerCase()
          .includes(query)
      );
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
          // overflow-x-auto, não hidden: no celular o select de papel e a
          // lixeira ficavam fora da tela, sem rolagem (ADM-40).
          <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                  const nome = user.name || user.email;
                  const roleIsAssignable = ROLE_OPTIONS.some((option) => option.value === role);
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-800">
                          {user.name || 'Sem nome'}
                        </div>
                        <div className="truncate text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${getRoleBadgeClass(role)}`}
                          >
                            {(ROLE_LABELS[role] || role).toUpperCase()}
                          </span>
                          <select
                            value={role}
                            onChange={(event) => onRoleChange(user, event.target.value)}
                            disabled={isUpdating}
                            aria-label={`Papel de ${nome}`}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                          >
                            {/* Papel gravado que esta tela não atribui: aparece,
                                mas não é escolhível — o select não pode mentir. */}
                            {roleIsAssignable ? null : (
                              <option value={role} disabled>
                                {ROLE_LABELS[role] || role}
                              </option>
                            )}
                            {ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
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
                          aria-label={`Revogar acesso de ${nome}`}
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
        <ConfirmRevokeDialog
          user={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
          busy={updatingId === confirmDelete.id}
        />
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
