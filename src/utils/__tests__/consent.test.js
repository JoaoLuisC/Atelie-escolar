import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../analytics');

import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  CONSENT_POLICY_VERSION,
  getConsentMetadata,
  getConsentState,
  hasMarketingConsent,
  setConsentState,
  subscribeConsent,
} from '../consent';

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('consent.getConsentState', () => {
  it('retorna null quando nada está armazenado', () => {
    expect(getConsentState()).toBeNull();
  });

  it('retorna granted após setConsentState(granted)', () => {
    setConsentState(CONSENT_GRANTED);
    expect(getConsentState()).toBe(CONSENT_GRANTED);
  });

  it('retorna denied após setConsentState(denied)', () => {
    setConsentState(CONSENT_DENIED);
    expect(getConsentState()).toBe(CONSENT_DENIED);
  });

  it('ignora valores fora do enum granted/denied', () => {
    setConsentState('maybe');
    expect(getConsentState()).toBeNull();
  });

  it('invalida consent quando a versão da política mudou', () => {
    setConsentState(CONSENT_GRANTED);
    // Simula que o usuário aceitou em uma versão antiga
    globalThis.localStorage.setItem('lgpd_consent_version', 'versão-antiga');
    expect(getConsentState()).toBeNull();
  });
});

describe('consent.hasMarketingConsent', () => {
  it('true só quando granted ativo na versão atual', () => {
    expect(hasMarketingConsent()).toBe(false);
    setConsentState(CONSENT_GRANTED);
    expect(hasMarketingConsent()).toBe(true);
    setConsentState(CONSENT_DENIED);
    expect(hasMarketingConsent()).toBe(false);
  });
});

describe('consent.setConsentState', () => {
  it('persiste estado + versão + timestamp', () => {
    setConsentState(CONSENT_GRANTED);
    const meta = getConsentMetadata();
    expect(meta.state).toBe(CONSENT_GRANTED);
    expect(meta.version).toBe(CONSENT_POLICY_VERSION);
    expect(meta.at).toMatch(/T/);
  });
});

describe('consent.subscribeConsent', () => {
  it('notifica handlers quando o estado muda', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeConsent(handler);

    setConsentState(CONSENT_GRANTED);
    expect(handler).toHaveBeenCalledWith(CONSENT_GRANTED);

    setConsentState(CONSENT_DENIED);
    expect(handler).toHaveBeenCalledWith(CONSENT_DENIED);

    unsubscribe();
    setConsentState(CONSENT_GRANTED);
    // Após unsubscribe, não foi chamado mais
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('retorna noop function quando handler é inválido', () => {
    const unsubscribe = subscribeConsent(null);
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
