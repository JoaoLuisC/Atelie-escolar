import { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from './Button';
import { uploadProductAsset } from '../../../services/admin-panel';
import { friendlyAdminError } from '../utils/errors';

/**
 * Envio de UMA imagem com o tamanho recomendado na cara: a dica do slot
 * (src/constants/home-content.js → IMAGE_SLOTS) aparece embaixo do rótulo, o
 * painel recusa arquivo acima do teto e avisa quando a imagem enviada foge
 * muito das medidas (não bloqueia — foto 4:3 num slot quadrado só fica com
 * faixas). O arquivo vai para o bucket público de imagens.
 */
export function ImageUploadField({ label, slot, value, onChange, onNotify, compact = false }) {
  const [uploading, setUploading] = useState(0);
  const [sizeWarning, setSizeWarning] = useState('');

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('Escolha um arquivo de imagem (JPG, PNG ou WebP).', 'error');
      return;
    }
    if (file.size > slot.maxBytes) {
      onNotify(
        `A imagem passa de ${Math.round(slot.maxBytes / 1024)} kB. Reduza o tamanho e tente de novo.`,
        'error',
      );
      return;
    }
    setSizeWarning(await describeSizeMismatch(file, slot));
    try {
      setUploading(1);
      const { url } = await uploadProductAsset({
        kind: 'image',
        file,
        onProgress: (pct) => setUploading(Math.max(1, pct)),
      });
      onChange(url);
      onNotify('Imagem enviada. Ela só vai para o site quando você salvar a página.', 'success');
    } catch (error) {
      onNotify(friendlyAdminError(error, 'Erro ao enviar a imagem.'), 'error');
    } finally {
      setUploading(0);
    }
  }

  return (
    <div className={`rounded-lg border border-dashed border-slate-300 ${compact ? 'p-2' : 'p-3'}`}>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">{slot.hint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            className="h-16 w-24 rounded-lg bg-slate-50 object-contain ring-1 ring-slate-200"
          />
        ) : null}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <i className="bi bi-upload" aria-hidden="true" />
          {uploading ? `Enviando… ${uploading}%` : value ? 'Trocar' : 'Enviar imagem'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={Boolean(uploading)}
            onChange={handleFile}
          />
        </label>
        {value ? (
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            onClick={() => {
              setSizeWarning('');
              onChange('');
            }}
          >
            Remover
          </Button>
        ) : null}
      </div>
      {sizeWarning ? <p className="mt-2 text-xs text-amber-700">{sizeWarning}</p> : null}
    </div>
  );
}

ImageUploadField.propTypes = {
  label: PropTypes.string.isRequired,
  slot: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    maxBytes: PropTypes.number.isRequired,
    hint: PropTypes.string.isRequired,
  }).isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onNotify: PropTypes.func.isRequired,
  compact: PropTypes.bool,
};

/** Mede a imagem no navegador e compara com o slot. Vazio = está bom. */
export function describeSizeMismatch(file, slot) {
  return new Promise((resolve) => {
    if (typeof globalThis.createImageBitmap !== 'function') {
      resolve('');
      return;
    }
    globalThis
      .createImageBitmap(file)
      .then((bitmap) => {
        const { width, height } = bitmap;
        bitmap.close?.();
        const ratio = width / height;
        const wanted = slot.width / slot.height;
        const tooSmall = width < slot.width * 0.6;
        const wrongShape = Math.abs(ratio - wanted) / wanted > 0.25;
        if (!tooSmall && !wrongShape) {
          resolve('');
          return;
        }
        resolve(
          `Esta imagem tem ${width} × ${height} px; o recomendado é ${slot.width} × ${slot.height} px.` +
            (tooSmall ? ' Ela pode aparecer embaçada em telas grandes.' : '') +
            (wrongShape ? ' Com outra proporção ela fica com faixas ou cortada.' : ''),
        );
      })
      .catch(() => resolve(''));
  });
}
