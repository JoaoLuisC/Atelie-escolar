import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

export function ProductsTab({
  products,
  categories,
  onCreate,
  onEdit,
  onToggleActive,
  onDelete,
}) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState('all');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (query && !String(product.name || '').toLowerCase().includes(query)) return false;
      if (filterCategory) {
        const productCategoryId = String(product.categoryId || product.category_id || '');
        const productCategoryName = String(product.category || '');
        const matchesCategory = productCategoryId === String(filterCategory) || productCategoryName === filterCategory;
        if (!matchesCategory) return false;
      }
      if (filterActive === 'active' && product.active === false) return false;
      if (filterActive === 'inactive' && product.active !== false) return false;
      return true;
    });
  }, [products, search, filterCategory, filterActive]);

  return (
    <Card
      title="Produtos"
      subtitle={`${filtered.length} de ${products.length} produto(s)`}
      action={
        <Button icon="plus-lg" onClick={onCreate}>Novo produto</Button>
      }
    >
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome..."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 md:max-w-xs"
        />
        <select
          value={filterCategory}
          onChange={(event) => setFilterCategory(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(event) => setFilterActive(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="box-seam"
          title="Nenhum produto encontrado"
          description="Crie um novo produto ou ajuste os filtros."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-right">Preço</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">{product.name}</div>
                    {product.featured ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                        <i className="bi bi-star-fill" /> Destaque
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{product.category || 'Sem categoria'}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatPrice(product.price)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                      product.active === false
                        ? 'bg-slate-100 text-slate-600 ring-slate-200'
                        : 'bg-emerald-100 text-emerald-800 ring-emerald-200'
                    }`}>
                      {product.active === false ? 'Inativo' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" size="sm" onClick={() => onEdit(product)}>Editar</Button>
                      <Button variant="ghost" size="sm" onClick={() => onToggleActive(product)}>
                        {product.active === false ? 'Ativar' : 'Pausar'}
                      </Button>
                      <Button variant="ghost" size="sm" icon="trash" onClick={() => onDelete(product)} aria-label="Excluir" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

ProductsTab.propTypes = {
  products: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  onCreate: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
