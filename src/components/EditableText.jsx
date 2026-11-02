import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useEditContext } from './edit-context';

/**
 * Texto da loja que vira editável na prévia do painel ("Editar na página").
 *
 * Fora da edição renderiza só `children` (o visual de sempre). Na edição, o
 * elemento fica `contentEditable`; o que a pessoa digita vai para o rascunho
 * pelo `onEdit(path, texto)` do contexto. Enquanto está focado, mostra o
 * texto CRU (`value`, com os *asteriscos* de destaque); ao sair do foco volta
 * ao visual com destaque, que é o `children`.
 */
export function EditableText({ path, value, as: Tag = 'span', className = '', children }) {
  const { editing, onEdit } = useEditContext();
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);

  // Sincroniza o texto cru só quando NÃO está digitando: repor o conteúdo
  // enquanto a pessoa digita moveria o cursor para o início.
  useEffect(() => {
    if (!editing || !focused || !ref.current) return;
    if (ref.current.textContent !== String(value || '')) {
      ref.current.textContent = String(value || '');
    }
    // Só na entrada do foco (dependência deliberada em `focused`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, editing]);

  if (!editing) return <Tag className={className}>{children}</Tag>;

  return (
    <Tag
      ref={ref}
      className={`${className} cursor-text rounded outline-dashed outline-1 outline-offset-2 outline-violet-400 hover:bg-violet-50/60 focus:bg-white focus:outline-2 focus:outline-violet-600`}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-edit-path={path}
      role="textbox"
      aria-label={`Editar ${path}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onInput={(event) => onEdit(path, event.currentTarget.textContent || '')}
      onKeyDown={(event) => {
        // Enter confirma (sai do campo); quebra de linha é edição pelos campos.
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    >
      {focused ? String(value || '') : children}
    </Tag>
  );
}

EditableText.propTypes = {
  path: PropTypes.string.isRequired,
  value: PropTypes.string,
  as: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.node,
};
