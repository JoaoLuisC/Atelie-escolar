import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { ModalWizard } from './ModalWizard';
import { useToast } from '../hooks/useToast';
import { uploadProductAsset } from '../services/admin-panel';
import {
  cleanBenefits,
  cleanFaq,
  cleanReviews,
  deriveDisplayName,
  normalizeBenefits,
  normalizeFaq,
  normalizeReviews,
  validateProductStep,
} from './product-wizard-form';

const EMPTY_PRODUCT_FORM = {
  id: '',
  name: '',
  category: '',
  description: '',
  downloadUrl: '',
  price: '',
  originalPrice: '',
  productType: 'individual',
};

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
  const [benefits, setBenefits] = useState([]);
  const [faq, setFaq] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [formData, setFormData] = useState({ ...EMPTY_PRODUCT_FORM });

  // Declarado ANTES do efeito que o chama: o React Compiler acusa
  // `react-hooks/immutability` quando um valor é acessado acima da própria
  // declaração, e a ordem antiga só funcionava porque efeito roda depois do
  // render. Mover é reordenação pura — nada muda em runtime.
  const resetForm = () => {
    setFormData({ ...EMPTY_PRODUCT_FORM });
    setImages(['']);
    setVideos([]);
    setBenefits([]);
    setFaq([]);
    setReviews([]);
    setCurrentStep(0);
  };

  useEffect(() => {
    if (initialProduct) {
      const initialCategoryId = String(
        initialProduct.categoryId ??
          initialProduct.category_id ??
          categories.find((cat) => cat.name === initialProduct.category)?.id ??
          '',
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
      setImages(
        initialProduct.images && initialProduct.images.length > 0
          ? initialProduct.images
          : initialProduct.image
            ? [initialProduct.image]
            : [''],
      );
      setVideos(initialProduct.videos || []);
      setBenefits(normalizeBenefits(initialProduct.benefits));
      setFaq(normalizeFaq(initialProduct.faq));
      setReviews(normalizeReviews(initialProduct.reviews));
      setCurrentStep(0);
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProduct, isOpen]);

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

  // A REGRA mora em product-wizard-form.js; aqui fica só como avisar.
  // Separar as duas foi o que tornou a validação testável: ela decide se um
  // produto pode ser salvo, e vivia dentro de um componente que nenhuma
  // suíte monta.
  const validateStep = (step) => {
    const erro = validateProductStep(step, formData, images);
    if (erro) {
      pushToast(erro, 'error');
      return false;
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

    // Ao salvar, valida os campos obrigatórios de TODOS os steps (não só o
    // atual). Se algum falhar, leva ao primeiro step incompleto e bloqueia o
    // save — evita persistir produto incompleto a partir de qualquer step.
    const REQUIRED_STEPS = [0, 1, 2];
    for (const step of REQUIRED_STEPS) {
      if (!validateStep(step)) {
        setCurrentStep(step);
        return;
      }
    }

    const validImages = images.filter((img) => img.trim());
    const validVideos = videos.filter((vid) => vid.trim());

    const completeProduct = {
      ...formData,
      images: validImages,
      videos: validVideos,
      benefits: cleanBenefits(benefits),
      faq: cleanFaq(faq),
      reviews: cleanReviews(reviews),
    };

    onSubmit(completeProduct);
    onClose();
  };

  if (!isOpen) return null;

  const steps = [
    { id: 'basic', label: 'Básico' },
    { id: 'media', label: 'Mídia' },
    { id: 'pricing', label: 'Preço & Variações' },
    { id: 'conversion', label: 'Conversão' },
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
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
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
            hint="Selecione cada imagem do seu computador. JPG, PNG ou WebP até 500kB — imagens leves deixam a loja rápida."
          >
            <div id="product-images" className="flex flex-col gap-3">
              {images.map((image, idx) => (
                <AssetUploader
                  key={`image-${idx}`}
                  kind="image"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                  label={`Imagem ${idx + 1}`}
                  value={image}
                  onChange={(v) => handleImageChange(idx, v)}
                  onRemove={images.length > 1 ? () => handleRemoveImage(idx) : null}
                  pushToast={pushToast}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddImage}
              className={`${SECONDARY_BTN_CLASS} mt-2`}
            >
              <i className="bi bi-plus-lg" /> Adicionar imagem
            </button>
          </Field>

          <Field
            label="Vídeos (opcional)"
            htmlFor="product-videos"
            hint="MP4, WebM ou MOV até 50MB. Sobe pro Storage privado."
          >
            <div id="product-videos" className="flex flex-col gap-3">
              {videos.map((video, idx) => (
                <AssetUploader
                  key={`video-${idx}`}
                  kind="video"
                  accept="video/mp4,video/webm,video/quicktime"
                  label={`Vídeo ${idx + 1}`}
                  value={video}
                  onChange={(v) => handleVideoChange(idx, v)}
                  onRemove={() => handleRemoveVideo(idx)}
                  pushToast={pushToast}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddVideo}
              className={`${SECONDARY_BTN_CLASS} mt-2`}
            >
              <i className="bi bi-plus-lg" /> Adicionar vídeo
            </button>
          </Field>

          <Field
            label="Arquivo para download *"
            htmlFor="product-download"
            hint="PDF, ZIP ou similar até 50MB. Entregue ao cliente via URL assinada após pagamento aprovado."
          >
            <AssetUploader
              kind="download"
              accept="application/pdf,application/zip,application/x-zip-compressed,application/octet-stream"
              label="Arquivo do produto"
              value={formData.downloadUrl}
              onChange={(v) => setFormData((prev) => ({ ...prev, downloadUrl: v }))}
              pushToast={pushToast}
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

      {currentStep === 3 ? (
        <div className="flex flex-col gap-6">
          <BenefitsEditor value={benefits} onChange={setBenefits} />
          <FaqEditor value={faq} onChange={setFaq} />
          <ReviewsEditor value={reviews} onChange={setReviews} />
        </div>
      ) : null}
    </ModalWizard>
  );
}

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const SECONDARY_BTN_CLASS =
  'inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50';
const IMAGE_MAX_BYTES = 500 * 1024; // §3.2 guard rail: 500kB por imagem

const EDITOR_PROP_TYPES = {
  value: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};

function RemoveRowButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
    >
      <i className="bi bi-trash" />
    </button>
  );
}

RemoveRowButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};

function BenefitsEditor({ value, onChange }) {
  const update = (index, patch) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () => onChange([...value, { icon: '', label: '' }]);
  const remove = (index) => onChange(value.filter((_, i) => i !== index));

  return (
    <Field
      label="Benefícios"
      htmlFor="product-benefits"
      hint="Bullets curtos exibidos na página do produto. Ícone Bootstrap opcional (ex.: printer-fill, file-pdf-fill). Se ficar vazio, a loja mostra 4 benefícios padrão."
    >
      <div id="product-benefits" className="flex flex-col gap-2">
        {value.map((item, idx) => (
          <div key={`benefit-${idx}`} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <input
              type="text"
              value={item.icon}
              onChange={(e) => update(idx, { icon: e.target.value })}
              placeholder="ícone (opcional)"
              aria-label={`Ícone do benefício ${idx + 1}`}
              className={`${INPUT_CLASS} sm:w-44`}
            />
            <div className="flex flex-1 items-start gap-2">
              <input
                type="text"
                value={item.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                placeholder="Ex: PDF em alta resolução"
                aria-label={`Texto do benefício ${idx + 1}`}
                className={INPUT_CLASS}
              />
              <RemoveRowButton onClick={() => remove(idx)} label={`Remover benefício ${idx + 1}`} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className={`${SECONDARY_BTN_CLASS} mt-2`}>
        <i className="bi bi-plus-lg" /> Adicionar benefício
      </button>
    </Field>
  );
}

BenefitsEditor.propTypes = EDITOR_PROP_TYPES;

function FaqEditor({ value, onChange }) {
  const update = (index, patch) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () => onChange([...value, { question: '', answer: '' }]);
  const remove = (index) => onChange(value.filter((_, i) => i !== index));

  return (
    <Field
      label="Perguntas frequentes (FAQ)"
      htmlFor="product-faq"
      hint="Aparecem em accordion na página do produto. Pergunta + resposta. Linhas vazias são descartadas."
    >
      <div id="product-faq" className="flex flex-col gap-3">
        {value.map((item, idx) => (
          <div key={`faq-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={item.question}
                onChange={(e) => update(idx, { question: e.target.value })}
                placeholder="Pergunta"
                aria-label={`Pergunta ${idx + 1}`}
                className={INPUT_CLASS}
              />
              <RemoveRowButton onClick={() => remove(idx)} label={`Remover pergunta ${idx + 1}`} />
            </div>
            <textarea
              value={item.answer}
              onChange={(e) => update(idx, { answer: e.target.value })}
              placeholder="Resposta"
              rows="2"
              aria-label={`Resposta ${idx + 1}`}
              className={`${INPUT_CLASS} mt-2`}
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className={`${SECONDARY_BTN_CLASS} mt-2`}>
        <i className="bi bi-plus-lg" /> Adicionar pergunta
      </button>
    </Field>
  );
}

FaqEditor.propTypes = EDITOR_PROP_TYPES;

function ReviewsEditor({ value, onChange }) {
  const update = (index, patch) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () =>
    onChange([...value, { author: '', role: '', location: '', text: '', rating: '' }]);
  const remove = (index) => onChange(value.filter((_, i) => i !== index));

  return (
    <Field
      label="Depoimentos"
      htmlFor="product-reviews"
      hint="Depoimentos reais (não inventar — regra B6). Autor e texto são obrigatórios; o resto é opcional."
    >
      <div id="product-reviews" className="flex flex-col gap-3">
        {value.map((item, idx) => (
          <div
            key={`review-${idx}`}
            className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
          >
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={item.author}
                onChange={(e) => update(idx, { author: e.target.value })}
                placeholder="Autor *"
                aria-label={`Autor do depoimento ${idx + 1}`}
                className={INPUT_CLASS}
              />
              <RemoveRowButton
                onClick={() => remove(idx)}
                label={`Remover depoimento ${idx + 1}`}
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={item.role}
                onChange={(e) => update(idx, { role: e.target.value })}
                placeholder="Cargo (ex.: Professora)"
                aria-label={`Cargo ${idx + 1}`}
                className={INPUT_CLASS}
              />
              <input
                type="text"
                value={item.location}
                onChange={(e) => update(idx, { location: e.target.value })}
                placeholder="Local (ex.: SP)"
                aria-label={`Local ${idx + 1}`}
                className={INPUT_CLASS}
              />
              <select
                value={item.rating}
                onChange={(e) => update(idx, { rating: e.target.value })}
                aria-label={`Nota ${idx + 1}`}
                className={INPUT_CLASS}
              >
                <option value="">Sem nota</option>
                <option value="5">★★★★★ (5)</option>
                <option value="4">★★★★ (4)</option>
                <option value="3">★★★ (3)</option>
                <option value="2">★★ (2)</option>
                <option value="1">★ (1)</option>
              </select>
            </div>
            <textarea
              value={item.text}
              onChange={(e) => update(idx, { text: e.target.value })}
              placeholder="Depoimento *"
              rows="2"
              aria-label={`Texto do depoimento ${idx + 1}`}
              className={`${INPUT_CLASS} mt-2`}
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className={`${SECONDARY_BTN_CLASS} mt-2`}>
        <i className="bi bi-plus-lg" /> Adicionar depoimento
      </button>
    </Field>
  );
}

ReviewsEditor.propTypes = EDITOR_PROP_TYPES;

function Field({ label, htmlFor, children, hint, className = '' }) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
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

function AssetUploader({ kind, accept, label, value, onChange, onRemove, pushToast }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const isImage = kind === 'image';
  const hasValue = Boolean(value && value.trim());
  const displayName = hasValue ? deriveDisplayName(value) : '';

  function openPicker() {
    if (uploading) return;
    inputRef.current?.click();
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo depois
    if (!file) return;

    // Guard rail de performance (pendência §3.2): imagens pesadas degradam
    // LCP/CLS na vitrine. Bloqueia no front antes de gastar o upload. Vídeos
    // e arquivos continuam limitados só pelo bucket (50MB) no backend.
    if (kind === 'image' && file.size > IMAGE_MAX_BYTES) {
      const sizeKb = Math.round(file.size / 1024);
      const limitKb = Math.round(IMAGE_MAX_BYTES / 1024);
      const msg = `Imagem de ${sizeKb}kB excede o limite de ${limitKb}kB. Otimize (ex.: squoosh.app ou tinypng.com) antes de subir.`;
      setError(msg);
      pushToast(msg, 'error');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError('');

    try {
      const result = await uploadProductAsset({
        kind,
        file,
        onProgress: setProgress,
      });
      onChange(result.url);
      pushToast(`${label} enviado.`, 'success');
    } catch (err) {
      const msg = err?.message || 'Falha no upload.';
      setError(msg);
      pushToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  }

  function handleClear() {
    onChange('');
    setError('');
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center gap-3">
        {isImage && hasValue ? (
          <img
            src={value}
            alt={`Preview de ${label}`}
            className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
            onError={(e) => {
              e.currentTarget.style.opacity = '0.3';
            }}
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-slate-200 text-slate-400">
            <i
              className={`bi ${isImage ? 'bi-image' : kind === 'video' ? 'bi-film' : 'bi-file-earmark-arrow-down'} text-2xl`}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">
            {hasValue ? (
              displayName
            ) : (
              <span className="text-slate-500">Nenhum arquivo selecionado</span>
            )}
          </p>
          {hasValue ? (
            <p className="truncate text-[11px] text-slate-500" title={value}>
              {value}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">Clique em &quot;Escolher arquivo&quot;.</p>
          )}
          {uploading ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
          {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={openPicker}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
          >
            <i
              className={`bi ${uploading ? 'bi-arrow-clockwise animate-spin' : hasValue ? 'bi-arrow-repeat' : 'bi-upload'}`}
            />
            {uploading ? `${progress}%` : hasValue ? 'Trocar' : 'Escolher'}
          </button>
          {hasValue && !uploading ? (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
            >
              <i className="bi bi-trash" /> Limpar
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={uploading}
              aria-label="Remover slot"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
            >
              <i className="bi bi-x-lg" />
            </button>
          ) : null}
        </div>
      </div>

      <input ref={inputRef} type="file" accept={accept} onChange={handleFile} className="hidden" />
    </div>
  );
}

AssetUploader.propTypes = {
  kind: PropTypes.oneOf(['image', 'video', 'download']).isRequired,
  accept: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func,
  pushToast: PropTypes.func.isRequired,
};

ProductWizard.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    }),
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
    faq: PropTypes.array,
    reviews: PropTypes.array,
    benefits: PropTypes.array,
  }),
};
