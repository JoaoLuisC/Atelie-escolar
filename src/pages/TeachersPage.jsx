import { useEffect, useState } from 'react';
import { SEO } from '../components/SEO';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { ROUTES } from '../constants/routes';
import {
  createTeacherProduct,
  fetchTeacherDashboard,
  setTeacherProductActive,
} from '../services/teacher-panel';

const EMPTY_FORM = { name: '', description: '', price: '', categoryId: '', downloadUrl: '' };

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value || 0),
  );
}

export function TeachersPage() {
  const { logoutAdmin } = useAuth();
  const { pushToast } = useToast();
  const [data, setData] = useState({ products: [], categories: [], summary: {} });
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await fetchTeacherDashboard());
    } catch (error) {
      pushToast(error.message || 'Não foi possível carregar seu painel.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProduct(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await createTeacherProduct({
        ...form,
        price: Number(form.price),
        categoryId: form.categoryId || undefined,
      });
      setForm(EMPTY_FORM);
      pushToast('Produto criado e vinculado ao seu perfil.', 'success');
      await load();
    } catch (error) {
      pushToast(error.message || 'Não foi possível criar o produto.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleProduct(product) {
    try {
      await setTeacherProductActive(product.id, !product.active);
      await load();
    } catch (error) {
      pushToast(error.message || 'Não foi possível atualizar o produto.', 'error');
    }
  }

  const summary = data.summary || {};
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <SEO title="Área do professor" pathname={ROUTES.professores} noindex />
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-violet-700">Ateliê da Escola</p>
            <h1 className="text-3xl font-bold text-slate-900">Área do professor</h1>
            <p className="mt-1 text-slate-600">Gerencie seus materiais e acompanhe suas vendas.</p>
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
            ['Produtos', summary.products || 0],
            ['Produtos ativos', summary.activeProducts || 0],
            ['Vendas aprovadas', summary.sales || 0],
            ['Faturamento', currency(summary.revenue)],
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

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold text-slate-900">Meus produtos</h2>
            </div>
            {loading ? (
              <p className="p-5 text-sm text-slate-500">Carregando produtos...</p>
            ) : data.products.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Você ainda não cadastrou materiais.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.products.map((product) => (
                  <div key={product.id} className="flex flex-wrap items-center gap-3 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {product.category || 'Sem categoria'} · {currency(product.price)} ·{' '}
                        {product.sales} vendas
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">
                      {currency(product.revenue)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleProduct(product)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      {product.active ? 'Pausar' : 'Ativar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>

          <form
            onSubmit={createProduct}
            className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-bold text-slate-900">Novo material</h2>
            <div className="mt-4 space-y-3">
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nome do material"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Descrição"
                rows="3"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                type="url"
                value={form.downloadUrl}
                onChange={(event) => setForm({ ...form, downloadUrl: event.target.value })}
                placeholder="Link do arquivo para download"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                placeholder="Preço"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Sem categoria</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-violet-300"
              >
                {saving ? 'Salvando...' : 'Cadastrar material'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
