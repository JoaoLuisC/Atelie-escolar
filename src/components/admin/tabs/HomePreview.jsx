import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

// ════════════════════════════════════════════════════════════════════
// PRÉVIA AO VIVO da página da loja, ao lado do editor.
//
// Renderiza a própria HomePage (a mesma que o cliente vê) com o RASCUNHO do
// editor, numa "tela" de 1280 px reduzida para caber na coluna. Uma página
// menor que isso trocaria o layout de computador pelo de celular sem querer,
// porque o Tailwind decide pelo tamanho da janela, não da coluna. `inert`
// deixa a prévia só para olhar: link e botão não navegam para fora do painel.
// ════════════════════════════════════════════════════════════════════

const HomePage = lazy(() =>
  import('../../../pages/HomePage').then((m) => ({ default: m.HomePage })),
);

const DESKTOP_WIDTH = 1280;

export function HomePreview({ content, dirty }) {
  const frameRef = useRef(null);
  const pageRef = useRef(null);
  const [scale, setScale] = useState(0.4);
  const [pageHeight, setPageHeight] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    const page = pageRef.current;
    if (!frame || !page || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      setScale(Math.min(1, frame.clientWidth / DESKTOP_WIDTH));
      setPageHeight(page.scrollHeight);
    });
    observer.observe(frame);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-label="Prévia da página"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <i className="bi bi-eye" aria-hidden="true" /> Prévia ao vivo
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            dirty ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {dirty ? 'Alterações ainda não salvas' : 'Igual ao que está no site'}
        </span>
      </header>
      <div ref={frameRef} className="max-h-[75vh] overflow-y-auto overflow-x-hidden bg-slate-100">
        <div style={{ height: pageHeight * scale || undefined }}>
          <div
            ref={pageRef}
            inert
            style={{
              width: DESKTOP_WIDTH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <Suspense
              fallback={<p className="p-8 text-2xl text-slate-500">Carregando a prévia…</p>}
            >
              <HomePage previewContent={content} embedded />
            </Suspense>
          </div>
        </div>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Assim fica no computador. As faixas de produtos mostram os produtos de verdade da loja.
      </p>
    </section>
  );
}

HomePreview.propTypes = {
  content: PropTypes.object.isRequired,
  dirty: PropTypes.bool,
};
