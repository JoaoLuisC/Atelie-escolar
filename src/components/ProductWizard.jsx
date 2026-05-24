import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { ModalWizard } from './ModalWizard';
import { useToast } from '../hooks/useToast';

export function ProductWizard({
  isOpen,
  onClose,
  onSubmit,
  categories = [],
  initialProduct = null,
}) {
  const { pushToast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: '',
    description: '',
    downloadUrl: '',
    price: '',
    originalPrice: '',
    productType: 'individual',
  });

  useEffect(() => {
    if (initialProduct) {
      const initialCategoryId = String(
        initialProduct.categoryId
          ?? initialProduct.category_id
          ?? (categories.find((cat) => cat.name === initialProduct.category)?.id ?? ''),
      );
      setFormData({
        id: initialProduct.id || '',
        name: initialProduct.name || '',
        category: initialCategoryId,
        description: initialProduct.description || '',
        downloadUrl: initialProduct.downloadUrl || '',
        price: initialProduct.price || '',
        originalPrice: initialProduct.originalPrice || '',
        productType: initialProduct.productType || 'individual',
      });
      setImages(initialProduct.images && initialProduct.images.length > 0
        ? initialProduct.images
        : (initialProduct.image ? [initialProduct.image] : ['']));
      setVideos(initialProduct.videos || []);
      setCurrentStep(0);
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProduct, isOpen]);

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      category: '',
      description: '',
      downloadUrl: '',
      price: '',
      originalPrice: '',
      productType: 'individual',
    });
    setImages(['']);
    setVideos([]);
    setCurrentStep(0);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddImage = () => {
    setImages([...images, '']);
  };

  const handleRemoveImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleImageChange = (index, value) => {
    const newImages = [...images];
    newImages[index] = value;
    setImages(newImages);
  };

  const handleAddVideo = () => {
    setVideos([...videos, '']);
  };

  const handleRemoveVideo = (index) => {
    setVideos(videos.filter((_, i) => i !== index));
  };

  const handleVideoChange = (index, value) => {
    const newVideos = [...videos];
    newVideos[index] = value;
    setVideos(newVideos);
  };

  const validateStep = (step) => {
    if (step === 0) {
      if (!formData.name.trim()) {
        pushToast('Nome do produto é obrigatório', 'error');
        return false;
      }
      if (!formData.category.trim()) {
        pushToast('Categoria é obrigatória', 'error');
        return false;
      }
      if (!formData.description.trim()) {
        pushToast('Descrição é obrigatória', 'error');
        return false;
      }
    }

    if (step === 1) {
      const validImages = images.filter((img) => img.trim());
      if (validImages.length === 0) {
        pushToast('Pelo menos uma imagem é obrigatória', 'error');
        return false;
      }
      if (!formData.downloadUrl.trim()) {
        pushToast('URL de download é obrigatória', 'error');
        return false;
      }
    }

    if (step === 2) {
      if (!formData.price || Number.parseFloat(formData.price) <= 0) {
        pushToast('Preço válido é obrigatório', 'error');
        return false;
      }
    }

    return true;
  };

  const handleStepChange = (newStep) => {
    if (newStep > currentStep && !validateStep(currentStep)) {
      return;
    }
    setCurrentStep(newStep);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateStep(2)) {
      return;
    }

    const validImages = images.filter((img) => img.trim());
    const validVideos = videos.filter((vid) => vid.trim());

    const completeProduct = {
      ...formData,
      images: validImages,
      videos: validVideos,
    };

    onSubmit(completeProduct);
    onClose();
  };

  if (!isOpen) return null;

  const steps = [
    { id: 'basic', label: 'Básico' },
    { id: 'media', label: 'Mídia' },
    { id: 'pricing', label: 'Preço & Variações' },
  ];

  return (
    <ModalWizard
      title={initialProduct ? 'Editar Produto' : 'Adicionar Produto'}
      steps={steps}
      currentStep={currentStep}
      onStepChange={handleStepChange}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Salvar Produto"
      size="modal-large"
    >
      {currentStep === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="Nome do produto *" htmlFor="product-name">
            <input
              id="product-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Ex: Kit Festa Junina Completo"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Categoria *" htmlFor="product-category">
            <select
              id="product-category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className={INPUT_CLASS}
            >
              <option value="">Selecione uma categoria…</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </Field>

          <Field className="sm:col-span-2" label="Descrição *" htmlFor="product-description">
            <textarea
              id="product-description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows="5"
              placeholder="Descreva o produto: o que está incluso, formatos de arquivo, para qual ocasião serve…"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      ) : null}

      {currentStep === 1 ? (
        <div className="flex flex-col gap-5">
          <Field
            label="Imagens do produto *"
            htmlFor="product-images"
            hint="Cole a URL de cada imagem (Google Drive, Imgur, etc.)."
          >
            <div id="product-images" className="flex flex-col gap-2">
              {images.map((image, idx) => (
                <div key={`image-${idx}`} className="flex gap-2">
                  <input
                    type="url"
                    value={image}
                    onChange={(e) => handleImageChange(idx, e.target.value)}
                    placeholder={`https://... (Imagem ${idx + 1})`}
                    className={INPUT_CLASS}
                  />
                  {images.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      aria-label="Remover imagem"
                      className="rounded-lg border border-slate-200 bg-white px-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <button type="button" onClick={handleAddImage} className={`${SECONDARY_BTN_CLASS} mt-2`}>
              <i className="bi bi-plus-lg" /> Adicionar imagem
            </button>
          </Field>

          <Field label="Vídeos (opcional)" htmlFor="product-videos">
            <div id="product-videos" className="flex flex-col gap-2">
              {videos.map((video, idx) => (
                <div key={`video-${idx}`} className="flex gap-2">
                  <input
                    type="url"
                    value={video}
                    onChange={(e) => handleVideoChange(idx, e.target.value)}
                    placeholder="https://youtube.com/..."
                    className={INPUT_CLASS}
                  />
                  {videos.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveVideo(idx)}
                      aria-label="Remover vídeo"
                      className="rounded-lg border border-slate-200 bg-white px-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <button type="button" onClick={handleAddVideo} className={`${SECONDARY_BTN_CLASS} mt-2`}>
              <i className="bi bi-plus-lg" /> Adicionar vídeo
            </button>
          </Field>

          <Field
            label="URL do arquivo para download *"
            htmlFor="product-download"
            hint="Link direto do Google Drive, Dropbox ou similar."
          >
            <input
              id="product-download"
              type="url"
              name="downloadUrl"
              value={formData.downloadUrl}
              onChange={handleInputChange}
              placeholder="https://drive.google.com/file/d/..."
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      ) : null}

      {currentStep === 2 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preço (R$) *" htmlFor="product-price">
            <input
              id="product-price"
              type="number"
              name="price"
              value={formData.price}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              placeholder="Ex: 39.90"
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            label="Preço original (opcional)"
            htmlFor="product-original-price"
            hint='Exibe o "de R$..." riscado para destacar a economia.'
          >
            <input
              id="product-original-price"
              type="number"
              name="originalPrice"
              value={formData.originalPrice}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              placeholder="Ex: 65.00"
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            className="sm:col-span-2"
            label="Tipo de produto"
            htmlFor="product-type"
            hint="Kits podem conter múltiplos produtos. Produtos individuais são vendidos isoladamente."
          >
            <select
              id="product-type"
              name="productType"
              value={formData.productType}
              onChange={handleInputChange}
              className={INPUT_CLASS}
            >
              <option value="individual">Produto individual</option>
              <option value="kit">Kit</option>
            </select>
          </Field>
        </div>
      ) : null}
    </ModalWizard>
  );
}

const INPUT_CLASS = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const SECONDARY_BTN_CLASS = 'inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50';

function Field({ label, htmlFor, children, hint, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

Field.propTypes = {
  label: PropTypes.string.isRequired,
  htmlFor: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  hint: PropTypes.string,
  className: PropTypes.string,
};

ProductWizard.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ),
  initialProduct: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    category: PropTypes.string,
    description: PropTypes.string,
    downloadUrl: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    originalPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    images: PropTypes.arrayOf(PropTypes.string),
    videos: PropTypes.arrayOf(PropTypes.string),
    productType: PropTypes.string,
  }),
};
