import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useToast } from '../../../hooks/useToast';
import {
  fetchAdminSetting,
  saveAdminSetting,
  uploadProductAsset,
} from '../../../services/admin-panel';
import { HOME_BLOCKS, mergeHomeContent } from '../../../constants/home-content';
import { friendlyAdminError } from '../utils/errors';

// Imagem do topo da home: maior que a de produto (500kB), mas ainda leve — é o
// primeiro elemento que o visitante baixa.
const HERO_IMAGE_MAX_BYTES = 1024 * 1024;
const MAX_TESTIMONIALS = 6;
const STEP_SLOTS = 4;
const STAT_SLOTS = 4;

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

/** Mesma regra do servidor (lib/store-content.js): `https://` ou caminho interno. */
function linkProblem(value, { allowInternal = true } = {}) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (allowInternal && text.startsWith('/') && !text.startsWith('//')) return '';
  if (/^https:\/\/[^\s/]+/i.test(text)) return '';
  return allowInternal
    ? 'Use um caminho da loja (ex.: /produtos) ou um endereço começando com https://'
    : 'Use um endereço começando com https://';
}

function Field({ label, value, onChange, help, error, multiline = false, maxLength, rows = 3 }) {
  const id = `home-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
      <Tag
        id={id}
        className={`${inputClass} ${error ? 'border-rose-400' : ''}`}
        value={value ?? ''}
        maxLength={maxLength}
        rows={multiline ? rows : undefined}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? 'true' : undefined}
      />
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
      {!error && help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

Field.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  help: PropTypes.string,
  error: PropTypes.string,
  multiline: PropTypes.bool,
  maxLength: PropTypes.number,
  rows: PropTypes.number,
};

function Section({ title, children }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/50 open:bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-800">
        {title}
        <i className="bi bi-chevron-down text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-4 py-4">{children}</div>
    </details>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};

const HIGHLIGHT_HELP = 'Coloque entre *asteriscos* a palavra que deve aparecer colorida.';

/**
 * Editor dos textos e blocos da página inicial (chave `homeContent`).
 * Busca e salva sozinho, como a aba de cupons — o AdminPage só o posiciona.
 */
export function HomeContentEditor() {
  const { pushToast } = useToast();
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAdminSetting('homeContent')
      .then((data) => {
        if (!cancelled) setContent(mergeHomeContent(data?.value));
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(friendlyAdminError(error, 'Erro ao carregar a página inicial.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <Card title="Página inicial">
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </p>
      </Card>
    );
  }

  if (!content) {
    return (
      <Card title="Página inicial">
        <p className="text-sm text-slate-500">Carregando…</p>
      </Card>
    );
  }

  function update(section, field, value) {
    setContent((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  }

  function updateListItem(section, field, index, key, value, slots) {
    setContent((prev) => {
      const list = [...(prev[section][field] || [])];
      while (list.length < slots) list.push({});
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [section]: { ...prev[section], [field]: list } };
    });
  }

  function moveBlock(index, direction) {
    setContent((prev) => {
      const blocks = [...prev.blocks];
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return prev;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...prev, blocks };
    });
  }

  function toggleBlock(index) {
    setContent((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block, i) =>
        i === index ? { ...block, enabled: !block.enabled } : block,
      ),
    }));
  }

  async function handleHeroImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      pushToast('Escolha um arquivo de imagem (JPG, PNG ou WebP).', 'error');
      return;
    }
    if (file.size > HERO_IMAGE_MAX_BYTES) {
      pushToast('A imagem passa de 1 MB. Reduza o tamanho e tente de novo.', 'error');
      return;
    }
    try {
      setUploading(1);
      const { url } = await uploadProductAsset({
        kind: 'image',
        file,
        onProgress: (pct) => setUploading(Math.max(1, pct)),
      });
      update('hero', 'imageUrl', url);
      pushToast('Imagem enviada. Clique em "Salvar página inicial" para publicar.', 'success');
    } catch (error) {
      pushToast(friendlyAdminError(error, 'Erro ao enviar a imagem.'), 'error');
    } finally {
      setUploading(0);
    }
  }

  const steps = Array.from(
    { length: STEP_SLOTS },
    (_, i) => content.howItWorks.steps?.[i] || { title: '', text: '' },
  );
  const stats = Array.from(
    { length: STAT_SLOTS },
    (_, i) => content.socialProof.stats?.[i] || { value: '', label: '' },
  );
  const testimonials = content.socialProof.testimonials || [];

  const errors = {
    ctaLink: linkProblem(content.hero.ctaLink),
    instagramUrl: linkProblem(content.socialProof.instagramUrl, { allowInternal: false }),
    tiktokUrl: linkProblem(content.socialProof.tiktokUrl, { allowInternal: false }),
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function buildPayload() {
    const filled = (item, keys) => keys.some((key) => String(item?.[key] || '').trim());
    return {
      ...content,
      marquee: {
        items: (content.marquee.items || []).map((item) => item.trim()).filter(Boolean),
      },
      howItWorks: {
        ...content.howItWorks,
        steps: steps.filter((step) => filled(step, ['title', 'text'])),
      },
      socialProof: {
        ...content.socialProof,
        stats: stats.filter((stat) => filled(stat, ['value', 'label'])),
        testimonials: testimonials.filter((item) => filled(item, ['name', 'text'])),
      },
    };
  }

  async function handleSave() {
    if (hasErrors) return;
    try {
      setSaving(true);
      await saveAdminSetting({ key: 'homeContent', value: buildPayload() });
      pushToast('Página inicial salva. Ela aparece no site em até 1 minuto.', 'success');
    } catch (error) {
      pushToast(friendlyAdminError(error, 'Erro ao salvar a página inicial.'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleRestoreDefaults() {
    if (
      !globalThis.window.confirm?.(
        'Voltar todos os textos da página inicial ao padrão? Nada é salvo até você clicar em Salvar.',
      )
    ) {
      return;
    }
    setContent(mergeHomeContent({}));
  }

  const blockLabel = (id) => HOME_BLOCKS.find((block) => block.id === id)?.label || id;

  return (
    <Card
      title="Página inicial"
      subtitle="Textos, imagem e ordem dos blocos da home. As faixas de produtos ficam no cartão abaixo."
      action={
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          Ver a página inicial <i className="bi bi-box-arrow-up-right" />
        </a>
      }
    >
      <div className="space-y-3">
        <Section title="Blocos da página (ordem e visibilidade)">
          <ol className="space-y-2">
            {content.blocks.map((block, index) => (
              <li
                key={block.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={block.enabled}
                    onChange={() => toggleBlock(index)}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600"
                  />
                  {blockLabel(block.id)}
                  {!block.enabled ? (
                    <span className="text-xs text-slate-400">(escondido)</span>
                  ) : null}
                </label>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="arrow-up"
                    aria-label={`Subir ${blockLabel(block.id)}`}
                    disabled={index === 0}
                    onClick={() => moveBlock(index, -1)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="arrow-down"
                    aria-label={`Descer ${blockLabel(block.id)}`}
                    disabled={index === content.blocks.length - 1}
                    onClick={() => moveBlock(index, 1)}
                  />
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Topo (hero)">
          <Field
            label="Título"
            value={content.hero.title}
            onChange={(v) => update('hero', 'title', v)}
            help={HIGHLIGHT_HELP}
            maxLength={160}
          />
          <Field
            label="Subtítulo (opcional)"
            value={content.hero.subtitle}
            onChange={(v) => update('hero', 'subtitle', v)}
            multiline
            maxLength={600}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Texto do botão"
              value={content.hero.ctaLabel}
              onChange={(v) => update('hero', 'ctaLabel', v)}
              help="Deixe vazio para esconder o botão."
              maxLength={80}
            />
            <Field
              label="Link do botão"
              value={content.hero.ctaLink}
              onChange={(v) => update('hero', 'ctaLink', v)}
              error={errors.ctaLink}
              help="Ex.: /produtos"
              maxLength={500}
            />
          </div>
          <div className="rounded-lg border border-dashed border-slate-300 p-3">
            <p className="text-sm font-medium text-slate-700">Imagem do topo (opcional)</p>
            <p className="text-xs text-slate-500">
              Aparece ao lado do título, inteira, sem cortes. JPG, PNG ou WebP até 1 MB.
            </p>
            {content.hero.imageUrl ? (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={content.hero.imageUrl}
                  alt="Prévia da imagem do topo"
                  className="h-24 w-36 rounded-lg bg-slate-50 object-contain ring-1 ring-slate-200"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon="trash"
                  onClick={() => update('hero', 'imageUrl', '')}
                >
                  Remover imagem
                </Button>
              </div>
            ) : null}
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
              <i className="bi bi-upload" />
              {uploading
                ? `Enviando… ${uploading}%`
                : content.hero.imageUrl
                  ? 'Trocar imagem'
                  : 'Enviar imagem'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={Boolean(uploading)}
                onChange={handleHeroImage}
              />
            </label>
            {content.hero.imageUrl ? (
              <div className="mt-3">
                <Field
                  label="Descrição da imagem (para acessibilidade)"
                  value={content.hero.imageAlt}
                  onChange={(v) => update('hero', 'imageAlt', v)}
                  maxLength={160}
                />
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Faixa de palavras">
          <Field
            label="Palavras"
            value={(content.marquee.items || []).join(', ')}
            onChange={(v) =>
              update(
                'marquee',
                'items',
                // trimStart: sem ele o espaço depois da vírgula se acumula a
                // cada tecla, porque o campo exibe a lista com ', '.
                v.split(',').map((item) => item.trimStart()),
              )
            }
            help="Separe por vírgula. Até 12 palavras. Deixe vazio para esconder a faixa."
          />
        </Section>

        <Section title="Catálogo e faixas de produtos">
          <Field
            label="Texto pequeno acima do título"
            value={content.catalog.eyebrow}
            onChange={(v) => update('catalog', 'eyebrow', v)}
            maxLength={80}
          />
          <Field
            label="Título"
            value={content.catalog.title}
            onChange={(v) => update('catalog', 'title', v)}
            help={HIGHLIGHT_HELP}
            maxLength={160}
          />
          <Field
            label="Texto do botão do catálogo"
            value={content.catalog.ctaLabel}
            onChange={(v) => update('catalog', 'ctaLabel', v)}
            help="Deixe vazio para esconder o botão."
            maxLength={80}
          />
        </Section>

        <Section title="Como funciona">
          <Field
            label="Texto pequeno acima do título"
            value={content.howItWorks.eyebrow}
            onChange={(v) => update('howItWorks', 'eyebrow', v)}
            maxLength={80}
          />
          <Field
            label="Título"
            value={content.howItWorks.title}
            onChange={(v) => update('howItWorks', 'title', v)}
            help={HIGHLIGHT_HELP}
            maxLength={160}
          />
          <Field
            label="Subtítulo"
            value={content.howItWorks.subtitle}
            onChange={(v) => update('howItWorks', 'subtitle', v)}
            maxLength={600}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {steps.map((step, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                  Passo {index + 1}
                </p>
                <Field
                  label={`Título do passo ${index + 1}`}
                  value={step.title}
                  onChange={(v) =>
                    updateListItem('howItWorks', 'steps', index, 'title', v, STEP_SLOTS)
                  }
                  maxLength={80}
                />
                <div className="mt-2">
                  <Field
                    label={`Texto do passo ${index + 1}`}
                    value={step.text}
                    onChange={(v) =>
                      updateListItem('howItWorks', 'steps', index, 'text', v, STEP_SLOTS)
                    }
                    multiline
                    rows={2}
                    maxLength={600}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Passo sem título e sem texto não aparece.</p>
          <Field
            label="Destaque — título"
            value={content.howItWorks.infoTitle}
            onChange={(v) => update('howItWorks', 'infoTitle', v)}
            maxLength={80}
          />
          <Field
            label="Destaque — texto"
            value={content.howItWorks.infoText}
            onChange={(v) => update('howItWorks', 'infoText', v)}
            maxLength={600}
          />
        </Section>

        <Section title="Prova social e redes">
          <Field
            label="Texto pequeno acima do título"
            value={content.socialProof.eyebrow}
            onChange={(v) => update('socialProof', 'eyebrow', v)}
            maxLength={80}
          />
          <Field
            label="Título"
            value={content.socialProof.title}
            onChange={(v) => update('socialProof', 'title', v)}
            help={HIGHLIGHT_HELP}
            maxLength={160}
          />
          <Field
            label="Subtítulo"
            value={content.socialProof.subtitle}
            onChange={(v) => update('socialProof', 'subtitle', v)}
            maxLength={600}
          />

          <p className="pt-2 text-sm font-medium text-slate-700">Números</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.map((stat, index) => (
              <div key={index} className="grid grid-cols-2 gap-2">
                <Field
                  label={`Número ${index + 1}`}
                  value={stat.value}
                  onChange={(v) =>
                    updateListItem('socialProof', 'stats', index, 'value', v, STAT_SLOTS)
                  }
                  maxLength={20}
                />
                <Field
                  label={`Legenda ${index + 1}`}
                  value={stat.label}
                  onChange={(v) =>
                    updateListItem('socialProof', 'stats', index, 'label', v, STAT_SLOTS)
                  }
                  maxLength={40}
                />
              </div>
            ))}
          </div>

          <p className="pt-2 text-sm font-medium text-slate-700">Depoimentos</p>
          {testimonials.map((item, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field
                  label={`Nome ${index + 1}`}
                  value={item.name}
                  onChange={(v) =>
                    updateListItem(
                      'socialProof',
                      'testimonials',
                      index,
                      'name',
                      v,
                      testimonials.length,
                    )
                  }
                  maxLength={80}
                />
                <Field
                  label={`Cargo/cidade ${index + 1}`}
                  value={item.role}
                  onChange={(v) =>
                    updateListItem(
                      'socialProof',
                      'testimonials',
                      index,
                      'role',
                      v,
                      testimonials.length,
                    )
                  }
                  maxLength={80}
                />
              </div>
              <Field
                label={`Depoimento ${index + 1}`}
                value={item.text}
                onChange={(v) =>
                  updateListItem(
                    'socialProof',
                    'testimonials',
                    index,
                    'text',
                    v,
                    testimonials.length,
                  )
                }
                multiline
                rows={2}
                maxLength={600}
              />
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                onClick={() =>
                  update(
                    'socialProof',
                    'testimonials',
                    testimonials.filter((_, i) => i !== index),
                  )
                }
              >
                Remover depoimento
              </Button>
            </div>
          ))}
          {testimonials.length < MAX_TESTIMONIALS ? (
            <Button
              variant="secondary"
              size="sm"
              icon="plus-lg"
              onClick={() =>
                update('socialProof', 'testimonials', [
                  ...testimonials,
                  { name: '', role: '', text: '' },
                ])
              }
            >
              Adicionar depoimento
            </Button>
          ) : null}

          <p className="pt-2 text-sm font-medium text-slate-700">Redes sociais</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Link do Instagram"
              value={content.socialProof.instagramUrl}
              onChange={(v) => update('socialProof', 'instagramUrl', v)}
              error={errors.instagramUrl}
              help="Vazio esconde o botão."
              maxLength={500}
            />
            <Field
              label="Texto do botão do Instagram"
              value={content.socialProof.instagramLabel}
              onChange={(v) => update('socialProof', 'instagramLabel', v)}
              maxLength={80}
            />
            <Field
              label="Link do TikTok"
              value={content.socialProof.tiktokUrl}
              onChange={(v) => update('socialProof', 'tiktokUrl', v)}
              error={errors.tiktokUrl}
              help="Vazio esconde o botão."
              maxLength={500}
            />
            <Field
              label="Texto do botão do TikTok"
              value={content.socialProof.tiktokLabel}
              onChange={(v) => update('socialProof', 'tiktokLabel', v)}
              maxLength={80}
            />
          </div>
        </Section>

        <Section title="Google (título e descrição da página)">
          <Field
            label="Título na aba e no Google"
            value={content.seo.title}
            onChange={(v) => update('seo', 'title', v)}
            maxLength={160}
          />
          <Field
            label="Descrição no Google"
            value={content.seo.description}
            onChange={(v) => update('seo', 'description', v)}
            multiline
            maxLength={600}
          />
        </Section>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          icon="arrow-counterclockwise"
          onClick={handleRestoreDefaults}
        >
          Restaurar textos padrão
        </Button>
        <div className="flex items-center gap-3">
          {hasErrors ? (
            <span className="text-xs text-rose-600">Corrija os links marcados para salvar.</span>
          ) : null}
          <Button
            icon="check2"
            onClick={handleSave}
            disabled={saving || hasErrors || Boolean(uploading)}
          >
            {saving ? 'Salvando…' : 'Salvar página inicial'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
