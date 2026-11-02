import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { EditContext, INACTIVE_EDIT_CONTEXT } from '../../edit-context';

// ════════════════════════════════════════════════════════════════════
// PRÉVIA da página da loja — e, em "Editar na página", o lugar onde se edita.
//
// Renderiza a própria HomePage (a mesma que o cliente vê, com cabeçalho e
// rodapé) com o RASCUNHO do editor, numa "tela" do tamanho do aparelho
// escolhido, reduzida para caber na coluna. Uma página menor que isso trocaria
// o layout de computador pelo de celular sem querer, porque o Tailwind decide
// pelo tamanho da janela, não da coluna.
//
// Só olhar: `inert`, nada navega. Editando: os textos viram campos
// (EditableText), cada parte ganha alças (BlockFrame) e os cliques em links e
// botões da página são engolidos aqui — a pessoa edita, não navega.
// ════════════════════════════════════════════════════════════════════

const HomePage = lazy(() =>
  import('../../../pages/HomePage').then((m) => ({ default: m.HomePage })),
);

export const PREVIEW_DEVICES = Object.freeze([
  { id: 'desktop', label: 'Computador', width: 1280, icon: 'laptop' },
  { id: 'tablet', label: 'Tablet', width: 834, icon: 'tablet' },
  { id: 'mobile', label: 'Celular', width: 390, icon: 'phone' },
]);

/** Grava `value` em `obj` no caminho `a.b.2.c`, sem mutar o original. */
export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  const clone = (node) => (Array.isArray(node) ? [...node] : { ...(node || {}) });
  const root = clone(obj);
  let cursor = root;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    cursor[key] = clone(cursor[key]);
    cursor = cursor[key];
  });
  return root;
}

export function HomePreview({
  content,
  dirty,
  editing = false,
  onChange = () => {},
  onOpenSection = () => {},
}) {
  const frameRef = useRef(null);
  const pageRef = useRef(null);
  const [device, setDevice] = useState('desktop');
  const [scale, setScale] = useState(0.4);
  const [pageHeight, setPageHeight] = useState(0);
  const width = PREVIEW_DEVICES.find((item) => item.id === device)?.width || 1280;

  useEffect(() => {
    const frame = frameRef.current;
    const page = pageRef.current;
    if (!frame || !page || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      setScale(Math.min(1, frame.clientWidth / width));
      setPageHeight(page.scrollHeight);
    });
    observer.observe(frame);
    observer.observe(page);
    return () => observer.disconnect();
  }, [width]);

  const editContext = useMemo(() => {
    if (!editing) return INACTIVE_EDIT_CONTEXT;
    const moveBlock = (id, delta) => {
      const blocks = [...content.blocks];
      const index = blocks.findIndex((block) => block.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= blocks.length) return;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      onChange({ ...content, blocks });
    };
    return {
      editing: true,
      onEdit: (path, value) => onChange(setPath(content, path, value)),
      onMoveBlock: moveBlock,
      onToggleBlock: (id) =>
        onChange({
          ...content,
          blocks: content.blocks.map((block) =>
            block.id === id ? { ...block, enabled: !block.enabled } : block,
          ),
        }),
      onDropBlock: (fromId, toId) => {
        const blocks = [...content.blocks];
        const from = blocks.findIndex((block) => block.id === fromId);
        const to = blocks.findIndex((block) => block.id === toId);
        if (from < 0 || to < 0) return;
        const [moved] = blocks.splice(from, 1);
        blocks.splice(to, 0, moved);
        onChange({ ...content, blocks });
      },
      onOpenSection,
    };
  }, [editing, content, onChange, onOpenSection]);

  // Editando, a página não navega: link e botão da loja são engolidos aqui;
  // só os controles do editor (data-edit-ui) e os textos editáveis passam.
  function swallowNavigation(event) {
    if (!editing) return;
    const target = event.target.closest('a, button');
    if (target && !target.closest('[data-edit-ui]')) event.preventDefault();
  }

  return (
    <section
      aria-label="Prévia da página"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <i className={`bi ${editing ? 'bi-pencil-square' : 'bi-eye'}`} aria-hidden="true" />{' '}
          {editing ? 'Editando na página' : 'Prévia ao vivo'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Tamanho de tela" className="flex gap-1">
            {PREVIEW_DEVICES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={device === item.id}
                aria-label={item.label}
                title={`${item.label} (${item.width} px)`}
                onClick={() => setDevice(item.id)}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  device === item.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <i className={`bi bi-${item.icon}`} aria-hidden="true" />
              </button>
            ))}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              dirty ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {dirty ? 'Alterações ainda não salvas' : 'Igual ao que está no site'}
          </span>
        </div>
      </header>
      {editing ? (
        <p className="border-b border-slate-100 bg-violet-50 px-4 py-2 text-xs text-violet-900">
          Clique num texto para trocá-lo (Enter confirma). Arraste a etiqueta roxa de cada parte
          para mudar a ordem, ou use as setas. Imagens, cores e links se editam pelos campos.
        </p>
      ) : null}
      <div ref={frameRef} className="max-h-[75vh] overflow-y-auto overflow-x-hidden bg-slate-100">
        <div style={{ height: pageHeight * scale || undefined }}>
          <div
            ref={pageRef}
            inert={editing ? undefined : true}
            onClickCapture={swallowNavigation}
            style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <EditContext.Provider value={editContext}>
              <Suspense
                fallback={<p className="p-8 text-2xl text-slate-500">Carregando a prévia…</p>}
              >
                <HomePage previewContent={content} embedded />
              </Suspense>
            </EditContext.Provider>
          </div>
        </div>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        As faixas de produtos mostram os produtos de verdade da loja; quais aparecem se escolhe na
        sub-aba Vitrine.
      </p>
    </section>
  );
}

HomePreview.propTypes = {
  content: PropTypes.object.isRequired,
  dirty: PropTypes.bool,
  editing: PropTypes.bool,
  onChange: PropTypes.func,
  onOpenSection: PropTypes.func,
};
