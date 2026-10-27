import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import {
  assignAdminProductSeller,
  fetchAdminDashboardData,
  fetchAdminUsers,
  fetchStoreOwner,
  setStoreOwner,
  updateAdminUser,
} from '../../../services/admin-panel';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { StatCard } from '../ui/StatCard';

// Aba "Professores e clientes" do admin da plataforma: quem vende, quem
// compra, qual professora administra a loja (white label) e os produtos ainda
// sem dono. Era a página /admin/plataforma; virou aba do painel do admin.

const roleOf = (user) => String(user.role || '').toLowerCase();

export function PlatformTab() {
  const { pushToast } = useToast();
  const [dashboard, setDashboard] = useState({ summary: {}, products: [] });
  const [users, setUsers] = useState([]);
  const [storeOwnerId, setStoreOwnerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');

  const load = useCallback(
    () =>
      Promise.all([fetchAdminDashboardData(), fetchAdminUsers(), fetchStoreOwner()])
        .then(([dashboardData, usersData, owner]) => {
          setDashboard(dashboardData);
          setUsers(usersData.users || []);
          setStoreOwnerId(owner.sellerId || null);
        })
        .catch((error) => {
          pushToast(error.message || 'Não foi possível carregar professores e clientes.', 'error');
        })
        .finally(() => setLoading(false)),
    [pushToast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const teachers = useMemo(() => users.filter((user) => roleOf(user) === 'seller'), [users]);
  // Só CLIENTE: admin fora da lista, para "Tornar professor" nunca rebaixar
  // a conta da administração.
  const customers = useMemo(
    () => users.filter((user) => ['customer', ''].includes(roleOf(user))),
    [users],
  );
  const productsByTeacher = useMemo(() => {
    const counts = new Map();
    for (const product of dashboard.products || []) {
      if (!product.sellerId) continue;
      counts.set(product.sellerId, (counts.get(product.sellerId) || 0) + 1);
    }
    return counts;
  }, [dashboard.products]);
  const orphanProducts = (dashboard.products || []).filter((product) => !product.sellerId);

  async function run(id, action, success) {
    setUpdatingId(id);
    try {
      await action();
      pushToast(success, 'success');
      await load();
    } catch (error) {
      pushToast(error.message || 'Não foi possível salvar.', 'error');
    } finally {
      setUpdatingId('');
    }
  }

  const summary = dashboard.summary || {};
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Professores" value={teachers.length} icon="mortarboard-fill" />
        <StatCard label="Clientes" value={customers.length} icon="people-fill" accent="info" />
        <StatCard
          label="Faturamento total"
          value={formatPrice(summary.revenueTotal || 0)}
          icon="bank2"
          accent="success"
        />
        <StatCard
          label="Faturamento no mês"
          value={formatPrice(summary.revenueMonth || 0)}
          icon="cash-coin"
          accent="success"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Professores"
          subtitle="Quem vende na plataforma. A dona da loja administra produtos, pedidos e a página da loja."
        >
          {loading ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum professor cadastrado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {teachers.map((teacher) => {
                const owner = teacher.id === storeOwnerId;
                return (
                  <li key={teacher.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-semibold text-slate-900">
                        {teacher.name || teacher.email}
                        {owner ? (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                            Dona da loja
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {teacher.email} · {productsByTeacher.get(teacher.id) || 0} produtos
                      </p>
                    </div>
                    {owner ? null : (
                      <button
                        type="button"
                        disabled={updatingId === teacher.id}
                        onClick={() =>
                          run(
                            teacher.id,
                            () => setStoreOwner(teacher.id),
                            'Dona da loja definida. Vale a partir do próximo login dela.',
                          )
                        }
                        className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-50"
                      >
                        Tornar dona da loja
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={updatingId === teacher.id || owner}
                      title={owner ? 'Defina outra dona da loja antes de remover.' : undefined}
                      onClick={() =>
                        run(
                          teacher.id,
                          () => updateAdminUser({ id: teacher.id, role: 'customer' }),
                          'Acesso de professor removido.',
                        )
                      }
                      className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                    >
                      Remover acesso
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Clientes" subtitle="Promova uma conta de cliente para professor(a).">
          {loading ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : customers.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum cliente cadastrado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {customers.slice(0, 12).map((customer) => (
                <li key={customer.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {customer.name || customer.email}
                    </p>
                    <p className="truncate text-sm text-slate-500">{customer.email}</p>
                  </div>
                  <button
                    type="button"
                    disabled={updatingId === customer.id}
                    onClick={() =>
                      run(
                        customer.id,
                        () => updateAdminUser({ id: customer.id, role: 'seller' }),
                        'Conta promovida a professor(a).',
                      )
                    }
                    className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-50"
                  >
                    Tornar professor(a)
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Produtos sem professor"
        subtitle="Atribua cada produto a um(a) professor(a) para ele aparecer na área dele(a)."
      >
        {orphanProducts.length === 0 ? (
          <p className="text-sm text-slate-500">Todos os produtos já têm professor responsável.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orphanProducts.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center gap-3 py-3">
                <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                  {product.name}
                </p>
                <select
                  defaultValue=""
                  aria-label={`Professor(a) de ${product.name}`}
                  disabled={updatingId === product.id}
                  onChange={(event) =>
                    event.target.value &&
                    run(
                      product.id,
                      () => assignAdminProductSeller(product.id, event.target.value),
                      'Produto atribuído.',
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Atribuir professor(a)…</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name || teacher.email}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
