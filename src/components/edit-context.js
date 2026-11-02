import { createContext, useContext } from 'react';

// ════════════════════════════════════════════════════════════════════
// EDIÇÃO NA PRÓPRIA PÁGINA — o contexto que a prévia do painel liga.
//
// A HomePage e o Shell são os MESMOS componentes no site e na prévia. Quando a
// prévia está em "Editar na página", este contexto fica ligado: os textos
// viram editáveis (EditableText) e cada parte ganha alças para mover. No site
// publicado o contexto é o padrão abaixo — nada muda e nada custa.
// ════════════════════════════════════════════════════════════════════

export const INACTIVE_EDIT_CONTEXT = Object.freeze({
  editing: false,
  /** @param {string} _path ex.: 'hero.title', 'howItWorks.steps.1.text' */
  onEdit: () => {},
  onMoveBlock: () => {},
  onToggleBlock: () => {},
  onOpenSection: () => {},
});

export const EditContext = createContext(INACTIVE_EDIT_CONTEXT);

export function useEditContext() {
  return useContext(EditContext);
}
