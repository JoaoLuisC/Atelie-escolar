import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { ModalWizard } from './ModalWizard';
import { useToast } from '../hooks/useToast';

export function CategoryWizard({
  isOpen,
  onClose,
  onSubmit,
  initialCategory = null,
}) {
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
      <div className="wizard-panel">
        <div className="form-grid">
          <div className="form-group full-width">
            <label htmlFor="cat-name">Nome da Categoria *</label>
            <input
              type="text"
              id="cat-name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Ex: Festa Junina"
            />
          </div>

          <div className="form-group">
            <label htmlFor="cat-color">Cor de destaque</label>
            <input
              type="color"
              id="cat-color"
              name="color"
              value={formData.color}
              onChange={handleInputChange}
            />
            <div className="category-color-preview" aria-live="polite">
              <span
                className="category-color-swatch"
                style={{ backgroundColor: formData.color }}
                aria-hidden="true"
              />
              <span className="category-color-code">Cor selecionada: {String(formData.color || '').toUpperCase()}</span>
            </div>
          </div>

          <div className="form-group full-width">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="featured"
                checked={formData.featured}
                onChange={handleInputChange}
              />
              <span>★ Evidenciar na página de produtos</span>
            </label>
            <p className="form-hint">
              Categorias evidenciadas aparecem em destaque no topo da lista de produtos.
            </p>
          </div>

          <div className="form-group full-width">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="active"
                checked={formData.active}
                onChange={handleInputChange}
              />
              <span>Categoria ativa</span>
            </label>
            <p className="form-hint">
              Desative para ocultar a categoria da loja, mas manter dados.
            </p>
          </div>
        </div>
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
