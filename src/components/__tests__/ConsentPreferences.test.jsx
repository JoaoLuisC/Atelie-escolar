import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsentPreferences } from '../ConsentPreferences';
import { CONSENT_POLICY_VERSION, hasMarketingConsent, setConsentState } from '../../utils/consent';
import { trackEvent } from '../../utils/analytics';

// ════════════════════════════════════════════════════════════════════
// REVOGAÇÃO DE CONSENTIMENTO — o efeito, não o botão.
//
// O `ConsentBanner` desaparece assim que existe uma decisão gravada, e
// `setConsentState` só era chamado de lá: depois de aceitar, não havia
// caminho no produto para voltar atrás, enquanto a política prometia
// revogação "a qualquer momento". Este arquivo trava o caminho novo.
//
// A asserção que importa NÃO é "o botão existe" — é que, depois do clique,
// `trackEvent` para de alimentar GA4 e Pixel. Um teste que só olhasse o
// componente passaria com o gate de consentimento quebrado do outro lado,
// que é exatamente o modo de falha que este repositório já pagou uma vez.
// ════════════════════════════════════════════════════════════════════

function limparConsentimento() {
  globalThis.localStorage?.clear();
}

let gtag;
let fbq;
let reload;

beforeEach(() => {
  limparConsentimento();
  gtag = vi.fn();
  fbq = vi.fn();
  globalThis.window.gtag = gtag;
  globalThis.window.fbq = fbq;
  // `location` do jsdom é não-configurável e `reload` não pode ser espionado
  // no lugar. `stubGlobal` troca o objeto inteiro por um duplo que preserva
  // o `href` (o componente não o usa, mas o resto da árvore pode).
  reload = vi.fn();
  vi.stubGlobal('location', { ...globalThis.location, href: globalThis.location.href, reload });
});

afterEach(() => {
  limparConsentimento();
  delete globalThis.window.gtag;
  delete globalThis.window.fbq;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ConsentPreferences', () => {
  it('mostra a situação atual de quem já aceitou', () => {
    setConsentState('granted');
    render(<ConsentPreferences />);

    expect(screen.getByText(/Cookies de marketing ativos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceitar todos/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('revoga: o estado vira denied e a página recarrega', () => {
    setConsentState('granted');
    expect(hasMarketingConsent()).toBe(true);

    render(<ConsentPreferences />);
    fireEvent.click(screen.getByRole('button', { name: /Apenas essenciais/i }));

    expect(hasMarketingConsent()).toBe(false);
    // O reload é o que tira do ar os scripts JÁ injetados nesta aba: parar de
    // medir não desfaz o `<script>` do GA4 que applyMarketingConsent inseriu.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('depois de revogar, trackEvent não alimenta mais GA4 nem Pixel', () => {
    setConsentState('granted');
    render(<ConsentPreferences />);
    fireEvent.click(screen.getByRole('button', { name: /Apenas essenciais/i }));

    gtag.mockClear();
    fbq.mockClear();
    trackEvent('view_item', { item_id: 'p1', value: 10, currency: 'BRL' });

    expect(gtag).not.toHaveBeenCalled();
    expect(fbq).not.toHaveBeenCalled();
  });

  it('conceder de novo não recarrega — os scripts sobem sozinhos', () => {
    setConsentState('denied');
    render(<ConsentPreferences />);
    fireEvent.click(screen.getByRole('button', { name: /Aceitar todos/i }));

    expect(hasMarketingConsent()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('grava a versão vigente da política ao mudar a escolha', () => {
    // Sem isto a revogação não sobreviveria a `getConsentState`, que exige
    // versão igual à vigente para considerar a decisão válida.
    render(<ConsentPreferences />);
    fireEvent.click(screen.getByRole('button', { name: /Apenas essenciais/i }));

    expect(globalThis.localStorage.getItem('lgpd_consent_version')).toBe(CONSENT_POLICY_VERSION);
  });
});
