import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { CARD_HELP } from '../../../constants/card-help';

const TOOLTIP_WIDTH = 256;
const VIEWPORT_MARGIN = 8;
// Altura folgada do balão: abaixo disso do pé da tela, ele abre para cima.
const TOOLTIP_ROOM = 160;

/**
 * O "?" no canto de um card: explica, em uma ou duas frases, o que o número
 * ou o quadro significa. Abre no clique (toque, no celular) e também no
 * passar do mouse/foco do teclado; fecha ao sair, rolar a página ou com Esc.
 *
 * O balão é desenhado FORA do card (portal no <body>, posição fixa calculada
 * pelo botão): os cards têm `overflow-hidden` por causa do gradiente, e um
 * balão dentro deles saía cortado.
 *
 * Sem `text`, procura pelo título em `CARD_HELP` — assim todo card com
 * título conhecido ganha a explicação sem cada aba repetir o texto.
 */
export function InfoHint({ title, text }) {
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const tooltipId = useId();
  const help = text || CARD_HELP[title] || '';
  const open = position !== null;

  function show() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportWidth = globalThis.innerWidth || TOOLTIP_WIDTH;
    const centered = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(centered, viewportWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN),
    );
    const viewportHeight = globalThis.innerHeight || 0;
    const above = viewportHeight > 0 && rect.bottom + TOOLTIP_ROOM > viewportHeight;
    setPosition(above ? { top: rect.top - 6, left, above } : { top: rect.bottom + 6, left, above });
  }

  function hide() {
    setPosition(null);
  }

  // Posição fixa não acompanha a rolagem: rolou ou redimensionou, fecha.
  useEffect(() => {
    if (!open) return undefined;
    globalThis.addEventListener('scroll', hide, true);
    globalThis.addEventListener('resize', hide);
    return () => {
      globalThis.removeEventListener('scroll', hide, true);
      globalThis.removeEventListener('resize', hide);
    };
  }, [open]);

  if (!help) return null;

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`O que é "${title}"?`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => (open ? hide() : show())}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hide();
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <i className="bi bi-question-circle text-sm" aria-hidden="true" />
      </button>
      {open && globalThis.document
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              style={{
                top: position.top,
                left: position.left,
                width: TOOLTIP_WIDTH,
                transform: position.above ? 'translateY(-100%)' : undefined,
              }}
              className="pointer-events-none fixed z-[70] rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-600 shadow-lg"
            >
              {help}
            </span>,
            globalThis.document.body,
          )
        : null}
    </span>
  );
}

InfoHint.propTypes = {
  title: PropTypes.string,
  text: PropTypes.string,
};
