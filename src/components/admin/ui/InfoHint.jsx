import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { CARD_HELP } from '../../../constants/card-help';

/**
 * O "?" no canto de um card: explica, em uma ou duas frases, o que o número
 * ou o quadro significa. Abre no clique (toque, no celular) e também no
 * passar do mouse/foco do teclado; fecha ao sair ou com Esc.
 *
 * Sem `text`, procura pelo título em `CARD_HELP` — assim todo card com
 * título conhecido ganha a explicação sem cada aba repetir o texto.
 */
export function InfoHint({ title, text }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const help = text || CARD_HELP[title] || '';
  if (!help) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`O que é "${title}"?`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <i className="bi bi-question-circle text-sm" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute right-0 top-7 z-30 w-64 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-600 shadow-lg"
        >
          {help}
        </span>
      ) : null}
    </span>
  );
}

InfoHint.propTypes = {
  title: PropTypes.string,
  text: PropTypes.string,
};
