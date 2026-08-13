import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { ModalWizard } from './ModalWizard';
import { useToast } from '../hooks/useToast';

export function CategoryWizard({ isOpen, onClose, onSubmit, initialCategory = null }) {
  const { pushToast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    color: '#9B5DE5',
    featured: false,
    active: true,
  });

  useEffect(() => {
    if (initialCategory) {
      setFormData({
        id: initialCategory.id || '',
        name: initialCategory.name || '',
        color: initialCategory.color || '#9B5DE5',
        featured: initialCategory.featured || false,
        active: initialCategory.active !== false,
      });
      setCurrentStep(0);
    } else {
      resetForm();
    }
  }, [initialCategory, isOpen]);

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      color: '#9B5DE5',
      featured: false,
      active: true,
    });
    setCurrentStep(0);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    let newValue = value;
    if (type === 'checkbox') {
      newValue = checked;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      pushToast('Nome da categoria é obrigatório', 'error');
      return false;
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSubmit(formData);
    onClose();
  };

  if (!isOpen) return null;

  const steps = [{ id: 'info', label: 'Informações' }];

  return (
    <ModalWizard
      title={initialCategory ? 'Editar Categoria' : 'Adicionar Categoria'}
      steps={steps}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Salvar Categoria"
      showProgress={false}
      size="modal-medium"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="cat-name"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Nome da categoria *
          </label>
          <input
            id="cat-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Ex: Festa Junina"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label
            htmlFor="cat-color"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Cor de destaque
          </label>
          <div className="flex items-center gap-3">
            <input
              id="cat-color"
              type="color"
              name="color"
              value={formData.color}
              onChange={handleInputChange}
              className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white"
            />
            <div
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded ring-1 ring-slate-200"
                style={{ backgroundColor: formData.color }}
              />
              <span className="font-mono text-xs text-slate-600">
                {String(formData.color || '').toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <input
            type="checkbox"
            name="featured"
            checked={formData.featured}
            onChange={handleInputChange}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">
              ★ Evidenciar na página de produtos
            </span>
            <span className="block text-xs text-slate-500">
              Categorias evidenciadas aparecem em destaque no topo da lista de produtos.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <input
            type="checkbox"
            name="active"
            checked={formData.active}
            onChange={handleInputChange}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Categoria ativa</span>
            <span className="block text-xs text-slate-500">
              Desative para ocultar a categoria da loja, mantendo os dados.
            </span>
          </span>
        </label>
      </div>
    </ModalWizard>
  );
}

CategoryWizard.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  initialCategory: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    color: PropTypes.string,
    featured: PropTypes.bool,
    active: PropTypes.bool,
  }),
};
