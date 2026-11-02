import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ImageUploadField } from '../ui/ImageUploadField';
import { useSectionAi } from './SectionAi';
import { useToast } from '../../../hooks/useToast';
import { fetchAdminSetting, saveAdminSetting } from '../../../services/admin-panel';
import {
  HERO_MAX_FLOATING_IMAGES,
  HERO_MAX_GRADIENT_STOPS,
  HOME_BLOCKS,
  IMAGE_SLOTS,
  heroGradientStops,
  mergeHomeContent,
} from '../../../constants/home-content';
import { HomePreview } from './HomePreview';
import { friendlyAdminError } from '../utils/errors';

// ════════════════════════════════════════════════════════════════════
// EDITOR DA PÁGINA DA LOJA (chave `homeContent` de settings).
//
// Dois jeitos de editar o MESMO rascunho:
//   • "Editar na página": a prévia, com os textos editáveis no lugar e as
//     partes arrastáveis (HomePreview + EditableText + BlockFrame);
//   • "Editar pelos campos": as seções abaixo, NA ORDEM DA PÁGINA — barra de
//     navegação, banner, faixa, vitrine, passo a passo, depoimentos, rodapé e
//     Google —, cada uma com o seu botão "Aprimorar seção" (IA, só no clique).
// Nada vai para o site antes de "Salvar página".
// ════════════════════════════════════════════════════════════════════

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

function emailProblem(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ? '' : 'Digite um e-mail válido.';
}

let fieldSeq = 0;
function Field({ label, value, onChange, help, error, multiline = false, maxLength, rows = 3 }) {
  // Id único por campo: o mesmo rótulo aparece em várias seções ("Título").
  const [id] = useState(() => `home-field-${(fieldSeq += 1)}`);
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

function Select({ label, value, onChange, options, help }) {
  const [id] = useState(() => `home-select-${(fieldSeq += 1)}`);
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
      {help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

Select.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.array).isRequired,
  help: PropTypes.string,
};

/** Seção aberta/fechada do formulário, com o botão de IA no cabeçalho. */
function Section({ id, title, description, open, onToggle, ai, children }) {
  return (
    <details
      id={`secao-${id}`}
      className="group rounded-xl border border-slate-200 bg-slate-50/50 open:bg-white"
      open={open}
      onToggle={(event) => onToggle(id, event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-xs font-normal text-slate-500">{description}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {ai}
          <i className="bi bi-chevron-down text-slate-400 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-4 py-4">{children}</div>
    </details>
  );
}

Section.propTypes = {
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  open: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  ai: PropTypes.node,
  children: PropTypes.node,
};

const HIGHLIGHT_HELP = 'Coloque entre *asteriscos* a palavra que deve aparecer colorida.';
const EMPTY_DRAFT = mergeHomeContent({});
const SIZE_OPTIONS = [
  ['small', 'Pequeno'],
  ['medium', 'Médio'],
  ['large', 'Grande'],
];

/** Rótulos dos campos que a IA devolve, por seção (chaves do lib/ai-assist.js). */
const AI_LABELS = {
  titulo: 'Título',
  subtitulo: 'Subtítulo',
  botao: 'Texto do botão',
  etiqueta: 'Etiqueta',
  passos: 'Passos',
  avisoTitulo: 'Quadro de aviso — título',
  avisoTexto: 'Quadro de aviso — texto',
  descricao: 'Descrição',
};

export function HomeContentEditor() {
  const { pushToast } = useToast();
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('page');
  const [openSections, setOpenSections] = useState(() => new Set(['hero']));
  // O que está salvo no site, para a prévia dizer se há alteração pendente.
  const [savedSnapshot, setSavedSnapshot] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchAdminSetting('homeContent')
      .then((data) => {
        if (cancelled) return;
        const loaded = mergeHomeContent(data?.value);
        setContent(loaded);
        setSavedSnapshot(JSON.stringify(loaded));
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(friendlyAdminError(error, 'Erro ao carregar a página da loja.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Os hooks de IA rodam antes de qualquer return: com o conteúdo ainda
  // carregando, trabalham sobre o padrão (nada é mostrado até carregar).
  const draft = content || EMPTY_DRAFT;
  const steps = Array.from(
    { length: STEP_SLOTS },
    (_, i) => draft.howItWorks.steps?.[i] || { title: '', text: '' },
  );
  const stats = Array.from(
    { length: STAT_SLOTS },
    (_, i) => draft.socialProof.stats?.[i] || { value: '', label: '' },
  );
  const testimonials = draft.socialProof.testimonials || [];
  const gradientStops = heroGradientStops(draft.hero);
  const floatingImages = draft.hero.floatingImages || [];
  const banner = draft.hero.banner || {};

  function openOnAi(id) {
    return () => setSectionOpen(id, true);
  }

  function update(section, field, value) {
    setContent((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  }

  function updateMany(section, fields) {
    setContent((prev) => ({ ...prev, [section]: { ...prev[section], ...fields } }));
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

  function setSectionOpen(id, open) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openSectionFromPage(id) {
    setMode('form');
    setSectionOpen(id, true);
    globalThis.requestAnimationFrame?.(() =>
      globalThis.document?.getElementById(`secao-${id}`)?.scrollIntoView({ block: 'start' }),
    );
  }

  // ── IA por seção: o que mandar e como aplicar o que voltar ────────────
  const heroAi = useSectionAi({
    task: 'homeHero',
    current: {
      titulo: draft.hero.title,
      subtitulo: draft.hero.subtitle,
      botao: draft.hero.ctaLabel,
    },
    labels: AI_LABELS,
    onStart: openOnAi('hero'),
    onApply: (s) =>
      updateMany('hero', {
        title: s.titulo || draft.hero.title,
        subtitle: s.subtitulo ?? draft.hero.subtitle,
        ctaLabel: s.botao || draft.hero.ctaLabel,
      }),
  });
  const catalogAi = useSectionAi({
    task: 'homeCatalog',
    current: {
      etiqueta: draft.catalog.eyebrow,
      titulo: draft.catalog.title,
      botao: draft.catalog.ctaLabel,
    },
    labels: AI_LABELS,
    onStart: openOnAi('catalog'),
    onApply: (s) =>
      updateMany('catalog', {
        eyebrow: s.etiqueta || draft.catalog.eyebrow,
        title: s.titulo || draft.catalog.title,
        ctaLabel: s.botao || draft.catalog.ctaLabel,
      }),
  });
  const howAi = useSectionAi({
    task: 'homeHowItWorks',
    current: {
      etiqueta: draft.howItWorks.eyebrow,
      titulo: draft.howItWorks.title,
      subtitulo: draft.howItWorks.subtitle,
      passos: steps.map((step) => `${step.title}: ${step.text}`).join(' | '),
      avisoTitulo: draft.howItWorks.infoTitle,
      avisoTexto: draft.howItWorks.infoText,
    },
    labels: AI_LABELS,
    onStart: openOnAi('howItWorks'),
    onApply: (s) =>
      updateMany('howItWorks', {
        eyebrow: s.etiqueta || draft.howItWorks.eyebrow,
        title: s.titulo || draft.howItWorks.title,
        subtitle: s.subtitulo || draft.howItWorks.subtitle,
        infoTitle: s.avisoTitulo || draft.howItWorks.infoTitle,
        infoText: s.avisoTexto || draft.howItWorks.infoText,
        steps: s.passos?.length
          ? s.passos.map((step) => ({ title: step.titulo, text: step.texto }))
          : draft.howItWorks.steps,
      }),
  });
  const socialAi = useSectionAi({
    task: 'homeSocialProof',
    current: {
      etiqueta: draft.socialProof.eyebrow,
      titulo: draft.socialProof.title,
      subtitulo: draft.socialProof.subtitle,
    },
    labels: AI_LABELS,
    onStart: openOnAi('socialProof'),
    onApply: (s) =>
      updateMany('socialProof', {
        eyebrow: s.etiqueta || draft.socialProof.eyebrow,
        title: s.titulo || draft.socialProof.title,
        subtitle: s.subtitulo || draft.socialProof.subtitle,
      }),
  });
  const footerAi = useSectionAi({
    task: 'homeFooter',
    current: { descricao: draft.footer.description },
    labels: AI_LABELS,
    onStart: openOnAi('footer'),
    onApply: (s) => update('footer', 'description', s.descricao || draft.footer.description),
  });
  const seoAi = useSectionAi({
    task: 'homeSeo',
    current: { titulo: draft.seo.title, descricao: draft.seo.description },
    labels: AI_LABELS,
    onStart: openOnAi('seo'),
    onApply: (s) =>
      updateMany('seo', {
        title: s.titulo || draft.seo.title,
        description: s.descricao || draft.seo.description,
      }),
  });

  if (loadError) {
    return (
      <Card title="Textos e imagens da página">
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </p>
      </Card>
    );
  }

  if (!content) {
    return (
      <Card title="Textos e imagens da página">
        <p className="text-sm text-slate-500">Carregando…</p>
      </Card>
    );
  }

  const errors = {
    ctaLink: linkProblem(content.hero.ctaLink),
    instagramUrl: linkProblem(content.socialProof.instagramUrl, { allowInternal: false }),
    tiktokUrl: linkProblem(content.socialProof.tiktokUrl, { allowInternal: false }),
    footerInstagram: linkProblem(content.footer.instagramUrl, { allowInternal: false }),
    footerFacebook: linkProblem(content.footer.facebookUrl, { allowInternal: false }),
    footerPinterest: linkProblem(content.footer.pinterestUrl, { allowInternal: false }),
    footerWhatsapp: linkProblem(content.footer.whatsappUrl, { allowInternal: false }),
    contactEmail: emailProblem(content.footer.contactEmail),
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function buildPayload() {
    const filled = (item, keys) => keys.some((key) => String(item?.[key] || '').trim());
    return {
      ...content,
      hero: {
        ...content.hero,
        backgroundStops: (content.hero.backgroundStops || []).filter(Boolean),
        floatingImages: floatingImages.filter(Boolean),
      },
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
      setSavedSnapshot(JSON.stringify(content));
      pushToast('Página salva. Ela aparece no site em até 1 minuto.', 'success');
    } catch (error) {
      pushToast(friendlyAdminError(error, 'Erro ao salvar a página da loja.'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleRestoreDefaults() {
    if (
      !globalThis.window.confirm?.(
        'Voltar todos os textos da página ao padrão? Nada é salvo até você clicar em Salvar.',
      )
    ) {
      return;
    }
    setContent(mergeHomeContent({}));
  }

  const blockLabel = (id) => HOME_BLOCKS.find((block) => block.id === id)?.label || id;
  const dirty = JSON.stringify(content) !== savedSnapshot;
  const sectionProps = (id) => ({ id, open: openSections.has(id), onToggle: setSectionOpen });

  const saveBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Modo de edição da página">
        <Button
          variant={mode === 'page' ? 'primary' : 'secondary'}
          icon="pencil-square"
          onClick={() => setMode('page')}
        >
          Editar na página
        </Button>
        <Button
          variant={mode === 'form' ? 'primary' : 'secondary'}
          icon="sliders"
          onClick={() => setMode('form')}
        >
          Editar pelos campos
        </Button>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-center text-sm font-medium text-violet-700 hover:underline"
        >
          Ver a loja <i className="bi bi-box-arrow-up-right" />
        </a>
      </div>
      <div className="flex items-center gap-3">
        {hasErrors ? (
          <span className="text-xs text-rose-600">Corrija os campos marcados para salvar.</span>
        ) : null}
        <Button icon="check2" onClick={handleSave} disabled={saving || hasErrors}>
          {saving ? 'Salvando…' : dirty ? 'Salvar página' : 'Página salva'}
        </Button>
      </div>
    </div>
  );

  if (mode === 'page') {
    return (
      <div className="space-y-4">
        {saveBar}
        <HomePreview
          content={content}
          dirty={dirty}
          editing
          onChange={setContent}
          onOpenSection={openSectionFromPage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {saveBar}
      <Card
        title="Textos e imagens da página"
        subtitle={
          'As seções estão na ordem em que aparecem na página, de cima para baixo. Abra uma para editar; “Aprimorar seção” pede à IA uma versão melhor dos textos daquela parte.'
        }
      >
        <div className="space-y-3">
          <Section
            {...sectionProps('blocks')}
            title="Ordem e visibilidade das partes"
            description="O que aparece e em que ordem. Na edição na página dá para arrastar."
          >
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

          <Section
            {...sectionProps('navigation')}
            title="Barra de navegação"
            description="Logo, nome e altura do cabeçalho, em todas as páginas da loja."
          >
            <ImageUploadField
              label="Logo da loja"
              slot={IMAGE_SLOTS.logo}
              value={content.navigation.logoUrl}
              onChange={(url) => update('navigation', 'logoUrl', url)}
              onNotify={pushToast}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Nome ao lado do logo"
                value={content.navigation.title}
                onChange={(v) => update('navigation', 'title', v)}
                maxLength={80}
              />
              <Select
                label="Altura da barra"
                value={content.navigation.size}
                onChange={(v) => update('navigation', 'size', v)}
                options={SIZE_OPTIONS}
                help="Muda a altura, o tamanho do logo e do nome."
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={content.navigation.showTitle !== false}
                onChange={(event) => update('navigation', 'showTitle', event.target.checked)}
              />
              Mostrar o nome ao lado do logo
            </label>
          </Section>

          <Section
            {...sectionProps('hero')}
            title={blockLabel('hero')}
            description="A primeira coisa que o cliente vê: título grande, frase de apoio, botão, fundo e imagem."
            ai={heroAi.button}
          >
            {heroAi.panel}
            <Field
              label="Título"
              value={content.hero.title}
              onChange={(v) => update('hero', 'title', v)}
              help={HIGHLIGHT_HELP}
              maxLength={160}
            />
            <Field
              label="Frase de apoio (opcional)"
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
                help="Vazio esconde o botão."
                maxLength={80}
              />
              <Field
                label="Para onde o botão leva"
                value={content.hero.ctaLink}
                onChange={(v) => update('hero', 'ctaLink', v)}
                error={errors.ctaLink}
                help="Ex.: /produtos (a lista de produtos) ou um endereço https://"
                maxLength={500}
              />
              <Select
                label="Alinhamento do texto"
                value={content.hero.textAlign}
                onChange={(v) => update('hero', 'textAlign', v)}
                options={[
                  ['left', 'À esquerda'],
                  ['center', 'Centralizado'],
                  ['right', 'À direita'],
                ]}
              />
              <Select
                label="Altura do banner"
                value={content.hero.bannerSize}
                onChange={(v) => update('hero', 'bannerSize', v)}
                options={SIZE_OPTIONS}
                help="Quanto espaço o banner ocupa acima e abaixo do texto."
              />
            </div>

            <p className="pt-2 text-sm font-semibold text-slate-800">Fundo</p>
            <Select
              label="Tipo de fundo"
              value={content.hero.backgroundStyle}
              onChange={(v) => update('hero', 'backgroundStyle', v)}
              options={[
                ['default', 'Padrão da loja (lilás com brilhos)'],
                ['solid', 'Uma cor'],
                ['linear', 'Degradê em linha'],
                ['radial', 'Degradê a partir do centro'],
              ]}
            />
            {content.hero.backgroundStyle === 'solid' ? (
              <label className="block text-sm font-medium text-slate-700">
                Cor do fundo
                <input
                  type="color"
                  className="mt-1 block h-10 w-full"
                  value={gradientStops[0]}
                  onChange={(event) =>
                    update('hero', 'backgroundStops', [
                      event.target.value,
                      ...gradientStops.slice(1),
                    ])
                  }
                />
              </label>
            ) : null}
            {content.hero.backgroundStyle === 'linear' ||
            content.hero.backgroundStyle === 'radial' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  Cores do degradê (de {HERO_MAX_GRADIENT_STOPS > 2 ? '2 a ' : ''}
                  {HERO_MAX_GRADIENT_STOPS})
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {gradientStops.map((stop, index) => (
                    <span key={index} className="flex items-center gap-1">
                      <input
                        type="color"
                        aria-label={`Cor ${index + 1} do degradê`}
                        className="h-10 w-14"
                        value={stop}
                        onChange={(event) => {
                          const next = [...gradientStops];
                          next[index] = event.target.value;
                          update('hero', 'backgroundStops', next);
                        }}
                      />
                      {gradientStops.length > 2 ? (
                        <button
                          type="button"
                          aria-label={`Remover cor ${index + 1}`}
                          onClick={() =>
                            update(
                              'hero',
                              'backgroundStops',
                              gradientStops.filter((_, i) => i !== index),
                            )
                          }
                          className="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <i className="bi bi-x-lg" aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {gradientStops.length < HERO_MAX_GRADIENT_STOPS ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="plus-lg"
                      onClick={() =>
                        update('hero', 'backgroundStops', [
                          ...gradientStops,
                          gradientStops[gradientStops.length - 1],
                        ])
                      }
                    >
                      Adicionar cor
                    </Button>
                  ) : null}
                </div>
                <div
                  aria-hidden="true"
                  className="h-6 rounded-lg ring-1 ring-slate-200"
                  style={{
                    background:
                      content.hero.backgroundStyle === 'radial'
                        ? `radial-gradient(circle, ${gradientStops.join(', ')})`
                        : `linear-gradient(${content.hero.gradientAngle ?? 135}deg, ${gradientStops.join(', ')})`,
                  }}
                />
                {content.hero.backgroundStyle === 'linear' ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Direção do degradê: {content.hero.gradientAngle ?? 135}°
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={5}
                      value={content.hero.gradientAngle ?? 135}
                      onChange={(event) =>
                        update('hero', 'gradientAngle', Number(event.target.value))
                      }
                      className="mt-1 block w-full"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <p className="pt-2 text-sm font-semibold text-slate-800">Enfeites flutuantes</p>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={content.hero.showIcons}
                onChange={(event) => update('hero', 'showIcons', event.target.checked)}
              />
              Mostrar enfeites flutuando no fundo do banner
            </label>
            {content.hero.showIcons ? (
              <div className="space-y-3">
                <Select
                  label="Tamanho dos enfeites"
                  value={content.hero.iconSize}
                  onChange={(v) => update('hero', 'iconSize', v)}
                  options={SIZE_OPTIONS}
                />
                <Field
                  label="Emojis"
                  value={content.hero.icons}
                  onChange={(v) => update('hero', 'icons', v)}
                  help="Separe por vírgula, por exemplo: 📚, ✏️, ⭐. Vazio = os emojis padrão. Com imagens enviadas abaixo, os emojis não aparecem."
                  maxLength={100}
                />
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-medium text-slate-700">
                    Imagens no lugar dos emojis (até {HERO_MAX_FLOATING_IMAGES})
                  </p>
                  <p className="text-xs text-slate-500">{IMAGE_SLOTS.floating.hint}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {floatingImages.map((url, index) => (
                      <ImageUploadField
                        key={`${index}-${url}`}
                        compact
                        label={`Imagem ${index + 1}`}
                        slot={IMAGE_SLOTS.floating}
                        value={url}
                        onNotify={pushToast}
                        onChange={(next) =>
                          update(
                            'hero',
                            'floatingImages',
                            next
                              ? floatingImages.map((item, i) => (i === index ? next : item))
                              : floatingImages.filter((_, i) => i !== index),
                          )
                        }
                      />
                    ))}
                  </div>
                  {floatingImages.length < HERO_MAX_FLOATING_IMAGES ? (
                    <ImageUploadField
                      compact
                      label="Adicionar imagem"
                      slot={IMAGE_SLOTS.floating}
                      value=""
                      onNotify={pushToast}
                      onChange={(next) =>
                        next && update('hero', 'floatingImages', [...floatingImages, next])
                      }
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            <p className="pt-2 text-sm font-semibold text-slate-800">Imagem ao lado do texto</p>
            <ImageUploadField
              label="Imagem ao lado do título (opcional)"
              slot={IMAGE_SLOTS.heroImage}
              value={content.hero.imageUrl}
              onChange={(url) => update('hero', 'imageUrl', url)}
              onNotify={pushToast}
            />
            {content.hero.imageUrl ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  label="Descrição da imagem (acessibilidade)"
                  value={content.hero.imageAlt}
                  onChange={(v) => update('hero', 'imageAlt', v)}
                  maxLength={160}
                />
                <Select
                  label="Lado da imagem"
                  value={content.hero.imagePosition}
                  onChange={(v) => update('hero', 'imagePosition', v)}
                  options={[
                    ['right', 'À direita do texto'],
                    ['left', 'À esquerda do texto'],
                  ]}
                />
                <Select
                  label="Entrada da imagem"
                  value={content.hero.imageAnimation}
                  onChange={(v) => update('hero', 'imageAnimation', v)}
                  options={[
                    ['none', 'Sem animação'],
                    ['fade', 'Aparecer aos poucos'],
                    ['slide', 'Deslizar'],
                  ]}
                />
              </div>
            ) : null}

            <p className="pt-2 text-sm font-semibold text-slate-800">
              Foto ocupando o banner inteiro (opcional)
            </p>
            <p className="text-xs text-slate-500">
              Uma arte retangular (feita no Canva, por exemplo) no lugar do fundo. Envie uma versão
              por tamanho de tela para ela não ficar cortada; as que faltarem usam a maior.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['desktop', 'Computador', IMAGE_SLOTS.bannerDesktop],
                ['tablet', 'Tablet', IMAGE_SLOTS.bannerTablet],
                ['mobile', 'Celular', IMAGE_SLOTS.bannerMobile],
              ].map(([key, label, slot]) => (
                <ImageUploadField
                  key={key}
                  compact
                  label={label}
                  slot={slot}
                  value={banner[key]}
                  onNotify={pushToast}
                  onChange={(url) => update('hero', 'banner', { ...banner, [key]: url })}
                />
              ))}
            </div>
            {banner.desktop ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Descrição da foto (acessibilidade)"
                  value={banner.alt}
                  onChange={(v) => update('hero', 'banner', { ...banner, alt: v })}
                  maxLength={160}
                />
                <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={banner.textOverlay !== false}
                    onChange={(event) =>
                      update('hero', 'banner', { ...banner, textOverlay: event.target.checked })
                    }
                  />
                  Mostrar o título e o botão por cima da foto
                </label>
              </div>
            ) : null}
          </Section>

          <Section
            {...sectionProps('marquee')}
            title={blockLabel('marquee')}
            description="Palavras curtas que passam na faixa colorida logo abaixo do banner."
          >
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
              help="Separe por vírgula. Até 12 palavras. Vazio esconde a faixa."
            />
          </Section>

          <Section
            {...sectionProps('catalog')}
            title={blockLabel('catalog')}
            description="Os textos da área de produtos. Quais faixas aparecem se escolhe na sub-aba Vitrine."
            ai={catalogAi.button}
          >
            {catalogAi.panel}
            <Field
              label="Etiqueta acima do título (texto curtinho)"
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
              help="Vazio esconde o botão."
              maxLength={80}
            />
          </Section>

          <Section
            {...sectionProps('howItWorks')}
            title={blockLabel('howItWorks')}
            description="Explica em poucos passos como comprar e baixar o material."
            ai={howAi.button}
          >
            {howAi.panel}
            <Field
              label="Etiqueta acima do título (texto curtinho)"
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
              label="Quadro de aviso — título"
              value={content.howItWorks.infoTitle}
              onChange={(v) => update('howItWorks', 'infoTitle', v)}
              maxLength={80}
            />
            <Field
              label="Quadro de aviso — texto"
              value={content.howItWorks.infoText}
              onChange={(v) => update('howItWorks', 'infoText', v)}
              maxLength={600}
            />
          </Section>

          <Section
            {...sectionProps('socialProof')}
            title={blockLabel('socialProof')}
            description="O que clientes dizem, números da loja e links do Instagram e TikTok. A IA só mexe nos títulos: depoimento e número são de verdade."
            ai={socialAi.button}
          >
            {socialAi.panel}
            <Field
              label="Etiqueta acima do título (texto curtinho)"
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
                    label={`Número em destaque ${index + 1} (ex.: 500+)`}
                    value={stat.value}
                    onChange={(v) =>
                      updateListItem('socialProof', 'stats', index, 'value', v, STAT_SLOTS)
                    }
                    maxLength={20}
                  />
                  <Field
                    label={`O que o número ${index + 1} significa`}
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
                    label={`Profissão ou cidade de quem deu o depoimento ${index + 1}`}
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

          <Section
            {...sectionProps('footer')}
            title="Rodapé"
            description="Logo, textos, contato e redes do rodapé, em todas as páginas da loja."
            ai={footerAi.button}
          >
            {footerAi.panel}
            <ImageUploadField
              label="Logo do rodapé (vazio = o mesmo da barra)"
              slot={IMAGE_SLOTS.logo}
              value={content.footer.logoUrl}
              onChange={(url) => update('footer', 'logoUrl', url)}
              onNotify={pushToast}
            />
            <Field
              label="Nome no rodapé"
              value={content.footer.title}
              onChange={(v) => update('footer', 'title', v)}
              maxLength={80}
            />
            <Field
              label="Descrição da loja"
              value={content.footer.description}
              onChange={(v) => update('footer', 'description', v)}
              maxLength={600}
              multiline
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Título da coluna de links"
                value={content.footer.navigationTitle}
                onChange={(v) => update('footer', 'navigationTitle', v)}
                maxLength={80}
              />
              <Field
                label="Título da coluna de contato"
                value={content.footer.contactTitle}
                onChange={(v) => update('footer', 'contactTitle', v)}
                maxLength={80}
              />
              <Field
                label="E-mail de contato"
                value={content.footer.contactEmail}
                onChange={(v) => update('footer', 'contactEmail', v)}
                error={errors.contactEmail}
                help="Vazio = o e-mail cadastrado da loja."
                maxLength={254}
              />
              <Field
                label="Linha de direitos autorais"
                value={content.footer.copyright}
                onChange={(v) => update('footer', 'copyright', v)}
                maxLength={160}
              />
            </div>
            {[
              ['Instagram', 'instagramUrl', errors.footerInstagram],
              ['Facebook', 'facebookUrl', errors.footerFacebook],
              ['Pinterest', 'pinterestUrl', errors.footerPinterest],
              ['Link do WhatsApp', 'whatsappUrl', errors.footerWhatsapp],
            ].map(([label, field, error]) => (
              <Field
                key={field}
                label={label}
                value={content.footer[field]}
                onChange={(v) => update('footer', field, v)}
                error={error}
                help="Endereço https:// ou vazio para esconder."
                maxLength={500}
              />
            ))}
            <Field
              label="Texto do WhatsApp"
              value={content.footer.whatsappLabel}
              onChange={(v) => update('footer', 'whatsappLabel', v)}
              maxLength={80}
            />
            <p className="text-xs text-slate-500">
              A identificação da loja (nome, CNPJ e cidade) é obrigatória por lei e não se edita por
              aqui.
            </p>
          </Section>

          <Section
            {...sectionProps('seo')}
            title="Como a loja aparece no Google"
            description="Título da aba do navegador e o texto que aparece na busca."
            ai={seoAi.button}
          >
            {seoAi.panel}
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
          <Button icon="check2" onClick={handleSave} disabled={saving || hasErrors}>
            {saving ? 'Salvando…' : 'Salvar página'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
