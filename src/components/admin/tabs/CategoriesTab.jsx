import PropTypes from 'prop-types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

export function CategoriesTab({ categories, onCreate, onEdit, onDelete }) {
  return (
    <Card
      title="Categorias"
      subtitle={`${categories.length} categoria(s) cadastrada(s)`}
      action={<Button icon="plus-lg" onClick={onCreate}>Nova categoria</Button>}
    >
      {categories.length === 0 ? (
        <EmptyState
          icon="tags"
          title="Nenhuma categoria"
          description="Crie sua primeira categoria para organizar os produtos."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <article
              key={category.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-sm"
            >
              <span
                className="mt-0.5 h-8 w-8 shrink-0 rounded-lg ring-1 ring-slate-200"
                style={{ backgroundColor: category.color || '#9B5DE5' }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-900">{category.name}</h3>
                  {category.featured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      <i className="bi bi-star-fill" />
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {category.color || '#9B5DE5'} · {category.active === false ? 'Inativa' : 'Ativa'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button variant="secondary" size="sm" onClick={() => onEdit(category)}>Editar</Button>
                  <Button variant="ghost" size="sm" icon="trash" onClick={() => onDelete(category)} aria-label="Excluir" />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

CategoriesTab.propTypes = {
  categories: PropTypes.array.isRequired,
  onCreate: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
