import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamento de modal do painel: Esc fecha, foco entra no diálogo e fica
 * preso nele, volta ao gatilho ao fechar, e a página não rola por trás.
 *
 * É o mesmo contrato do `ModalWizard` (que já passava na validação), extraído
 * para os modais menores que não tinham nenhum dele — "Como ler" da Análise
 * (ADM-13) e "Revogar acesso?" de Usuários (ADM-43).
 *
 * @param {{ current: HTMLElement | null }} dialogRef  o elemento do diálogo
 * @param {() => void} onClose
 * @param {boolean} [active=true]  monta/desmonta o comportamento sem desmontar o modal
 */
export function useModalBehavior(dialogRef, onClose, active = true) {
  // `onClose` costuma ser uma arrow nova a cada render; pô-la nas dependências
  // reexecutaria o efeito e devolveria o foco ao primeiro botão a cada render
  // do pai. A ref guarda a versão mais recente sem reiniciar o comportamento.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const doc = globalThis.document;
    if (!active || !doc) return undefined;

    const previouslyFocused = doc.activeElement;
    const dialog = dialogRef.current;
    const getFocusable = () => (dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE)) : []);

    const first = getFocusable()[0];
    if (first) first.focus();
    else dialog?.focus();

    const body = doc.body;
    const previousOverflow = body?.style.overflow;
    if (body) body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = doc.activeElement;
      if (event.shiftKey) {
        if (current === firstItem || !dialog?.contains(current)) {
          event.preventDefault();
          lastItem.focus();
        }
      } else if (current === lastItem || !dialog?.contains(current)) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('keydown', onKeyDown);
      if (body) body.style.overflow = previousOverflow || '';
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [dialogRef, active]);
}
