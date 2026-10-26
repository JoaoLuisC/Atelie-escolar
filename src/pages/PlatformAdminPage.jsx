import { useEffect, useMemo, useState } from 'react';
import { SEO } from '../components/SEO';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  assignAdminProductSeller,
  fetchAdminDashboardData,
  fetchAdminUsers,
  updateAdminUser,
} from '../services/admin-panel';

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value || 0),
  );
}

export function PlatformAdminPage() {
  const { logoutAdmin } = useAuth();
  const { pushToast } = useToast();
  const [dashboard, setDashboard] = useState({ summary: {}, products: [] });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [dashboardData, usersData] = await Promise.all([
        fetchAdminDashboardData(),
        fetchAdminUsers(),
      ]);
      setDashboard(dashboardData);
      setUsers(usersData.users || []);
    } catch (error) {
      pushToast(error.message || 'Não foi possível carregar a administração.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teachers = useMemo(
    () => users.filter((user) => String(user.role || '').toLowerCase() === 'seller'),
    [users],
  );
  const students = useMemo(
    () => users.filter((user) => String(user.role || '').toLowerCase() !== 'seller'),
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

  async function changeRole(user, role) {
    setUpdatingId(user.id);
    try {
      await updateAdminUser({ id: user.id, role });
      pushToast('Papel atualizado.', 'success');
      await load();
    } catch (error) {
      pushToast(error.message || 'Não foi possível atualizar o usuário.', 'error');
    } finally {
      setUpdatingId('');
    }
  }

  async function assignProduct(productId, sellerId) {
    if (!sellerId) return;
    setUpdatingId(productId);
    try {
      await assignAdminProductSeller(productId, sellerId);
      pushToast('Produto atribuído ao professor.', 'success');
      await load();
    } catch (error) {
      pushToast(error.message || 'Não foi possível atribuir o produto.', 'error');
    } finally {
      setUpdatingId('');
    }
  }

  const summary = dashboard.summary || {};
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <SEO title="Administração da plataforma" pathname={ROUTES.admin} noindex />
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-violet-700">Ateliê da Escola</p>
            <h1 className="text-3xl font-bold text-slate-900">Administração da plataforma</h1>
            <p className="mt-1 text-slate-600">Professores, alunos e visão geral de faturamento.</p>
          </div>
          <button
            type="button"
            onClick={() => logoutAdmin()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Sair
          </button>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Professores', teachers.length],
            ['Alunos', students.length],
            ['Faturamento total', currency(summary.revenueTotal)],
            ['Faturamento no mês', currency(summary.revenueMonth)],
          ].map(([label, value]) => (
            <article
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold text-slate-900">Professores</h2>
              <p className="mt-1 text-sm text-slate-500">
                Gerencie quem pode vender na plataforma.
              </p>
            </div>
            {loading ? (
              <p className="p-5 text-sm text-slate-500">Carregando...</p>
            ) : teachers.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Nenhum professor cadastrado.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {teachers.map((teacher) => (
                  <div key={teacher.id} className="flex items-center gap-3 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {teacher.name || teacher.email}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {teacher.email} · {productsByTeacher.get(teacher.id) || 0} produtos
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={updatingId === teacher.id}
                      onClick={() => changeRole(teacher, 'customer')}
                      className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                    >
                      Remover acesso
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold text-slate-900">Alunos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Promova uma conta para professora quando necessário.
              </p>
            </div>
            {loading ? (
              <p className="p-5 text-sm text-slate-500">Carregando...</p>
            ) : students.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Nenhum aluno cadastrado.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.slice(0, 12).map((student) => (
                  <div key={student.id} className="flex items-center gap-3 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {student.name || student.email}
                      </p>
                      <p className="truncate text-sm text-slate-500">{student.email}</p>
                    </div>
                    <button
                      type="button"
                      disabled={updatingId === student.id}
                      onClick={() => changeRole(student, 'seller')}
                      className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-50"
                    >
                      Tornar professor
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-bold text-slate-900">Produtos sem professor</h2>
            <p className="mt-1 text-sm text-slate-500">
              Atribua o catálogo legado antes de disponibilizá-lo para gestão individual.
            </p>
          </div>
          {(dashboard.products || []).filter((product) => !product.sellerId).length === 0 ? (
            <p className="p-5 text-sm text-slate-500">
              Todos os produtos já têm professor responsável.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {(dashboard.products || [])
                .filter((product) => !product.sellerId)
                .map((product) => (
                  <div key={product.id} className="flex flex-wrap items-center gap-3 p-5">
                    <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                      {product.name}
                    </p>
                    <select
                      defaultValue=""
                      disabled={updatingId === product.id}
                      onChange={(event) => assignProduct(product.id, event.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Atribuir professor...</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name || teacher.email}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
