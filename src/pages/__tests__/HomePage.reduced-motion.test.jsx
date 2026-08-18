import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomePage } from '../HomePage';

// ════════════════════════════════════════════════════════════════════
// `prefers-reduced-motion` na HomePage — regra D5, o exemplar do aviso.
//
// A versão anterior fazia `setReduced(mq.matches)` DENTRO de um `useEffect`.
// O aviso `react-hooks/set-state-in-effect` não era estilo: o componente
// pintava com `false`, o efeito rodava e ele repintava com o valor real. Quem
// tem "reduzir movimento" ligado via a animação rodar no primeiro quadro —
// exatamente a pessoa para quem a preferência existe.
//
// `useSyncExternalStore` lê o valor ANTES do primeiro render. Este teste é o
// que impede a volta do padrão: ele afirma sobre o PRIMEIRO render, não sobre
// o estado depois de esperar o efeito.
// ════════════════════════════════════════════════════════════════════

vi.mock('../../services/products', () => ({
  fetchHomeSections: vi.fn(async () => []),
  fetchProducts: vi.fn(async () => []),
}));

vi.mock('../../hooks/useCart', () => ({
  useCart: () => ({ addToCart: () => ({ ok: true, message: '' }) }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ customerSession: null, logoutCustomer: vi.fn() }),
}));

/** Instala um `matchMedia` que responde à consulta de movimento reduzido. */
function instalarMatchMedia(reduzir) {
  const ouvintes = new Set();
  const mq = {
    matches: reduzir,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_evento, handler) => ouvintes.add(handler),
    removeEventListener: (_evento, handler) => ouvintes.delete(handler),
  };

  globalThis.matchMedia = vi.fn(() => mq);
  return {
    mq,
    mudarPara(novoValor) {
      mq.matches = novoValor;
      for (const handler of ouvintes) handler({ matches: novoValor });
    },
    get inscritos() {
      return ouvintes.size;
    },
  };
}

/** Elementos com animação inline — os que a preferência precisa desligar. */
function elementosAnimados(container) {
  return [...container.querySelectorAll('[style]')].filter((el) =>
    String(el.getAttribute('style') || '').includes('animation'),
  );
}

describe('HomePage · prefers-reduced-motion (D5)', () => {
  let matchMediaOriginal;

  beforeEach(() => {
    matchMediaOriginal = globalThis.matchMedia;
  });

  afterEach(() => {
    globalThis.matchMedia = matchMediaOriginal;
    vi.restoreAllMocks();
  });

  it('com a preferência LIGADA, nenhuma animação inline sai no PRIMEIRO render', () => {
    // Sem `await` de propósito: o ponto é que o valor certo já vale antes de
    // qualquer efeito rodar.
    instalarMatchMedia(true);

    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(elementosAnimados(container)).toEqual([]);
  });

  it('com a preferência DESLIGADA, as animações saem', () => {
    instalarMatchMedia(false);

    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(elementosAnimados(container).length).toBeGreaterThan(0);
  });

  it('reage à MUDANÇA da preferência sem remontar', () => {
    const media = instalarMatchMedia(false);

    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(elementosAnimados(container).length).toBeGreaterThan(0);

    // `act` porque a mudança vem de FORA do React (a media query), e é
    // justamente esse caminho que `useSyncExternalStore` existe para tratar.
    act(() => media.mudarPara(true));
    expect(elementosAnimados(container)).toEqual([]);
  });

  it('desinscreve ao desmontar — sem vazar ouvinte de media query', () => {
    const media = instalarMatchMedia(false);

    const { unmount } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(media.inscritos).toBeGreaterThan(0);

    unmount();
    expect(media.inscritos).toBe(0);
  });

  it('sem matchMedia (SSR, navegador antigo) não quebra e assume "não reduza"', () => {
    // "Não sei" tem de significar "não reduza", que é o padrão do CSS —
    // e nunca uma exceção que derruba a home inteira.
    delete globalThis.matchMedia;

    expect(() =>
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      ),
    ).not.toThrow();

    expect(screen.getByRole('main', { hidden: true })).toBeTruthy();
  });
});
