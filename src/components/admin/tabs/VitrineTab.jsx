import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

function getSectionHeadline(section, categories) {
  if (section.type === 'category') {
    const categoryName = categories.find((cat) => String(cat.id) === String(section.categoryId))?.name || 'Sem categoria';
    return `Categoria: ${categoryName}`;
  }
  if (section.type === 'best_sellers') return 'Especial · Mais vendidos';
  return 'Especial · Novidades';
}

function getSectionTypeBadge(type) {
  if (type === 'best_sellers') return { label: 'Mais vendidos', cls: 'bg-amber-100 text-amber-700 ring-amber-200' };
  if (type === 'new_arrivals') return { label: 'Novidades', cls: 'bg-sky-100 text-sky-700 ring-sky-200' };
  return { label: 'Categoria', cls: 'bg-violet-100 text-violet-700 ring-violet-200' };
}

export function VitrineTab({
  sections,
  categories,
  onChange,
  onSave,
  saving = false,
}) {
  const [categoryToAdd, setCategoryToAdd] = useState('');

  const availableCategories = useMemo(() => {
    const used = new Set(
      sections
        .filter((section) => section.type === 'category' && section.categoryId)
        .map((section) => String(section.categoryId)),
    );
    return categories.filter((category) => !used.has(String(category.id)));
  }, [categories, sections]);

  function moveSection(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    const next = [...sections];
    const [current] = next.splice(index, 1);
    next.splice(targetIndex, 0, current);
    onChange(next);
  }

  function updateSection(localId, patch) {
    onChange(sections.map((section) => (section.localId === localId ? { ...section, ...patch } : section)));
  }

  function removeSection(localId) {
    onChange(sections.filter((section) => section.localId !== localId));
  }

  function addCategorySection() {
    if (!categoryToAdd) return;
    const category = categories.find((item) => String(item.id) === String(categoryToAdd));
    if (!category) return;
    onChange([
      ...sections,
      {
        localId: `section-${Math.random().toString(36).slice(2, 10)}`,
        type: 'category',
        title: category.name,
        categoryId: String(category.id),
        limit: 8,
        enabled: true,
      },
    ]);
    setCategoryToAdd('');
  }

  function addSpecialSection(type) {
    if (sections.some((section) => section.type === type)) return;
    onChange([
      ...sections,
      {
        localId: `section-${Math.random().toString(36).slice(2, 10)}`,
        type,
        title: type === 'best_sellers' ? 'Mais vendidos' : 'Novidades',
        limit: 8,
        enabled: true,
      },
    ]);
  }

  return (
    <Card
      title="Vitrine da home"
      subtitle="Defina quais seções aparecem na página inicial, em que ordem e com quantos produtos."
      action={<Button icon="check-lg" onClick={onSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar vitrine'}</Button>}
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <select
          value={categoryToAdd}
          onChange={(event) => setCategoryToAdd(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Selecionar categoria…</option>
          {availableCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <Button variant="secondary" icon="plus-lg" onClick={addCategorySection} disabled={!categoryToAdd}>
          Categoria
        </Button>
        <Button variant="secondary" icon="star" onClick={() => addSpecialSection('best_sellers')}>
          Mais vendidos
        </Button>
        <Button variant="secondary" icon="lightning" onClick={() => addSpecialSection('new_arrivals')}>
          Novidades
        </Button>
      </div>

      {sections.length === 0 ? (
        <EmptyState icon="layout-text-window" title="Vitrine vazia" description="Adicione seções para compor a home." />
      ) : (
        <ul className="flex flex-col gap-3">
          {sections.map((section, index) => {
            const badge = getSectionTypeBadge(section.type);
            return (
              <li key={section.localId} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-slate-500">Ordem {index + 1}</span>
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {getSectionHeadline(section, categories)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" icon="arrow-up" aria-label="Subir" onClick={() => moveSection(index, -1)} />
                    <Button variant="ghost" size="sm" icon="arrow-down" aria-label="Descer" onClick={() => moveSection(index, 1)} />
                    <Button variant="ghost" size="sm" icon="trash" aria-label="Remover" onClick={() => removeSection(section.localId)} />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label htmlFor={`section-title-${section.localId}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Título exibido
                    </label>
                    <input
                      id={`section-title-${section.localId}`}
                      value={section.title}
                      onChange={(event) => updateSection(section.localId, { title: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`section-limit-${section.localId}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Produtos exibidos (4–20)
                    </label>
                    <input
                      id={`section-limit-${section.localId}`}
                      type="number"
                      min="4"
                      max="20"
                      value={section.limit}
                      onChange={(event) => updateSection(section.localId, { limit: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  {section.type === 'category' ? (
                    <div>
                      <label htmlFor={`section-category-${section.localId}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Categoria vinculada
                      </label>
                      <select
                        id={`section-category-${section.localId}`}
                        value={section.categoryId}
                        onChange={(event) => updateSection(section.localId, { categoryId: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

VitrineTab.propTypes = {
  sections: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool,
};
