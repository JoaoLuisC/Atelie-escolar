import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// ════════════════════════════════════════════════════════════════════
// Rolagem na troca de rota — LOJA-08 e LOJA-09.
//
// O BrowserRouter não mexe na rolagem. Sem este componente:
//   • quem clicava "Produtos", "Privacidade" ou "Termos" no rodapé abria a
//     página nova já no fim (scrollY 2.000+), herdando a rolagem da anterior;
//   • "Como Funciona" (/#como-funciona) era um <a> comum — recarregava o site
//     inteiro e, como a home é carregada sob demanda, a seção ainda não existia
//     quando o navegador procurava a âncora: a página ficava no topo. O mesmo
//     com /privacidade#cookies aberto pela URL.
//
// Regras:
//   • com #âncora → espera o elemento aparecer (a rota é lazy) e rola até ele;
//   • navegação nova (PUSH/REPLACE) sem âncora → topo;
//   • voltar/avançar (POP) sem âncora → não faz nada: o navegador restaura a
//     posição de onde a pessoa estava, que é o comportamento esperado.
// ════════════════════════════════════════════════════════════════════

const HASH_WAIT_INTERVAL_MS = 100;
const HASH_WAIT_ATTEMPTS = 30;

function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

function findHashTarget(hash) {
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    /* âncora malformada: usa como veio */
  }
  return id ? globalThis.document?.getElementById(id) : null;
}

export function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (hash) {
      let attempts = 0;
      const timer = globalThis.setInterval(() => {
        attempts += 1;
        const target = findHashTarget(hash);
        if (target) {
          globalThis.clearInterval(timer);
          target.scrollIntoView?.({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start',
          });
        } else if (attempts >= HASH_WAIT_ATTEMPTS) {
          globalThis.clearInterval(timer);
        }
      }, HASH_WAIT_INTERVAL_MS);
      return () => globalThis.clearInterval(timer);
    }

    if (navigationType === 'POP') return undefined;

    try {
      globalThis.scrollTo?.({ top: 0, left: 0 });
    } catch {
      /* ambiente sem rolagem (teste): nada a fazer */
    }
    return undefined;
  }, [pathname, hash, key, navigationType]);

  return null;
}
