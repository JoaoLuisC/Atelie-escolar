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
      setFormData({
        id: initialProduct.id || '',
        name: initialProduct.name || '',
        category: initialProduct.category || '',
        description: initialProduct.description || '',
        downloadUrl: initialProduct.downloadUrl || '',
        price: initialProduct.price || '',
        originalPrice: initialProduct.originalPrice || '',
        productType: initialProduct.productType || 'individual',
      });
      setImages(initialProduct.images || []);
      setVideos(initialProduct.videos || []);
      setCurrentStep(0);
    } else {
      resetForm();
    }
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
    setImages([]);
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
      {/* Step 1: Básico */}
      {currentStep === 0 && (
        <div className="wizard-panel">
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="product-name">Nome do Produto *</label>
              <input
                type="text"
                id="product-name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Ex: Kit Festa Junina Completo"
              />
            </div>

            <div className="form-group">
              <label htmlFor="product-category">Categoria *</label>
              <select
                id="product-category"
                name="category"
                value={formData.category}
                onChange={handleInputChange}
              >
                <option value="">Selecione uma categoria...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group full-width">
              <label htmlFor="product-description">Descrição *</label>
              <textarea
                id="product-description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="5"
                placeholder="Descreva o produto: o que está incluso, formatos de arquivo, para qual ocasião serve..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Mídia */}
      {currentStep === 1 && (
        <div className="wizard-panel">
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="product-images">Imagens do Produto *</label>
              <p className="form-hint">
                Cole a URL de cada imagem (Google Drive, Imgur, etc.).
              </p>
              <div className="image-input-group-container" id="product-images">
                {images.map((image, idx) => (
                  <div key={`image-${idx}-${image.slice(0, 10)}`} className="image-input-group">
                    <input
                      type="url"
                      value={image}
                      onChange={(e) => handleImageChange(idx, e.target.value)}
                      placeholder={`https://... (Imagem ${idx + 1})`}
                    />
                    {images.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => handleRemoveImage(idx)}
                        aria-label="Remover imagem"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddImage}
                style={{ marginTop: '10px' }}
              >
                + Adicionar Imagem
              </button>
            </div>

            <div className="form-group full-width">
              <label htmlFor="product-videos">Vídeos (opcional)</label>
              <div className="video-input-group-container" id="product-videos">
                {videos.map((video, idx) => (
                  <div key={`video-${idx}-${video.slice(0, 10)}`} className="video-input-group">
                    <input
                      type="url"
                      value={video}
                      onChange={(e) => handleVideoChange(idx, e.target.value)}
                      placeholder="https://youtube.com/..."
                    />
                    {videos.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => handleRemoveVideo(idx)}
                        aria-label="Remover vídeo"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddVideo}
                style={{ marginTop: '10px' }}
              >
                + Adicionar Vídeo
              </button>
            </div>

            <div className="form-group full-width">
              <label htmlFor="product-download">
                URL do Arquivo para Download *
              </label>
              <p className="form-hint">
                Link direto do Google Drive, Dropbox ou similar.
              </p>
              <input
                type="url"
                id="product-download"
                name="downloadUrl"
                value={formData.downloadUrl}
                onChange={handleInputChange}
                placeholder="https://drive.google.com/file/d/..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Preço & Variações */}
      {currentStep === 2 && (
        <div className="wizard-panel">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="product-price">Preço (R$) *</label>
              <input
                type="number"
                id="product-price"
                name="price"
                value={formData.price}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                placeholder="Ex: 39.90"
              />
            </div>

            <div className="form-group">
              <label htmlFor="product-original-price">
                Preço Original (opcional)
              </label>
              <input
                type="number"
                id="product-original-price"
                name="originalPrice"
                value={formData.originalPrice}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                placeholder="Ex: 65.00"
              />
              <p className="form-hint">
                Exibe o "de R$..." riscado para destacar a economia.
              </p>
            </div>

            <div className="form-group full-width">
              <label htmlFor="product-type">Tipo de Produto</label>
              <select
                id="product-type"
                name="productType"
                value={formData.productType}
                onChange={handleInputChange}
              >
                <option value="individual">Produto Individual</option>
                <option value="kit">Kit</option>
              </select>
              <p className="form-hint">
                Kits podem conter múltiplos produtos. Produtos individuais são vendidos isoladamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </ModalWizard>
  );
}

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
