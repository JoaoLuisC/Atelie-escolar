import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollToTop } from '../ScrollToTop';

// ════════════════════════════════════════════════════════════════════
// LOJA-08 (página nova abria com a rolagem da anterior) e LOJA-09 (âncora
// numa rota carregada sob demanda não era encontrada).
// ════════════════════════════════════════════════════════════════════

let scrollTo;

beforeEach(() => {
  vi.useFakeTimers();
  scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function App() {
  return (
    <>
      <ScrollToTop />
      <Link to="/termos">termos</Link>
      <Link to={{ pathname: '/', hash: '#como-funciona' }}>como funciona</Link>
      <Routes>
        <Route path="/" element={<SecaoQueDemora />} />
        <Route path="/termos" element={<p>termos</p>} />
      </Routes>
    </>
  );
}

// Simula a rota lazy: a seção só existe algum tempo depois da navegação.
function SecaoQueDemora() {
  return <div id="placeholder" />;
}

describe('ScrollToTop', () => {
  it('navegação nova vai para o topo', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    scrollTo.mockClear();

    fireEvent.click(screen.getByText('termos', { selector: 'a' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
  });

  it('com #âncora, espera o elemento aparecer e rola até ele', () => {
    render(
      <MemoryRouter initialEntries={['/termos']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('como funciona'));

    const secao = document.createElement('section');
    secao.id = 'como-funciona';
    secao.scrollIntoView = vi.fn();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    document.body.appendChild(secao);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(secao.scrollIntoView).toHaveBeenCalled();
    secao.remove();
  });
});
