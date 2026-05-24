import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// NOTE: `setupTests.js` mocka globalmente `../utils/analytics` para os
// testes de pages. Aqui testamos `attribution` direto, sem mock.
vi.unmock('../analytics');

import {
  buildAttributionPayload,
  captureAttributionFromUrl,
  clearAttribution,
  getSessionId,
  getStoredAttribution,
} from '../attribution';

function resetStorage() {
  globalThis.localStorage.clear();
}

beforeEach(() => {
  resetStorage();
});

afterEach(() => {
  resetStorage();
  vi.restoreAllMocks();
});

describe('attribution.getSessionId', () => {
  it('gera e persiste session_id na primeira chamada', () => {
    const first = getSessionId();
    expect(first).toMatch(/.+/);
    expect(globalThis.localStorage.getItem('session_id')).toBe(first);
  });

  it('reusa o mesmo session_id em chamadas subsequentes', () => {
    const first = getSessionId();
    const second = getSessionId();
    expect(second).toBe(first);
  });
});

describe('attribution.captureAttributionFromUrl', () => {
  function setLocationSearch(search) {
    // jsdom permite reescrever location.search via location.assign na URL completa
    globalThis.history.replaceState({}, '', `/produtos${search}`);
  }

  it('captura UTMs da URL e persiste no localStorage', () => {
    setLocationSearch('?utm_source=email&utm_medium=newsletter&utm_campaign=volta-as-aulas');
    const result = captureAttributionFromUrl();

    expect(result).toMatchObject({
      utm_source: 'email',
      utm_medium: 'newsletter',
      utm_campaign: 'volta-as-aulas',
    });
    expect(result.captured_at).toBeTypeOf('number');
    expect(result.expires_at).toBeGreaterThan(Date.now());

    const stored = JSON.parse(globalThis.localStorage.getItem('attribution_data'));
    expect(stored.utm_source).toBe('email');
  });

  it('first-touch wins: não sobrescreve UTMs já gravadas', () => {
    setLocationSearch('?utm_source=instagram&utm_campaign=primeiro');
    captureAttributionFromUrl();

    setLocationSearch('?utm_source=facebook&utm_campaign=segundo');
    const result = captureAttributionFromUrl();

    expect(result.utm_source).toBe('instagram');
    expect(result.utm_campaign).toBe('primeiro');
  });

  it('limita tamanho de UTMs a 200 chars (defesa contra abuso de URL)', () => {
    const longValue = 'x'.repeat(500);
    setLocationSearch(`?utm_source=${longValue}`);
    const result = captureAttributionFromUrl();

    expect(result.utm_source.length).toBeLessThanOrEqual(200);
  });

  it('retorna null quando storage não está disponível', () => {
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => { throw new Error('SecurityError'); },
      configurable: true,
    });

    expect(captureAttributionFromUrl()).toBeNull();

    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });
});

describe('attribution.buildAttributionPayload', () => {
  it('inclui session_id sempre, mesmo sem UTMs', () => {
    const payload = buildAttributionPayload();
    expect(payload.session_id).toMatch(/.+/);
    expect(payload.utm_source).toBeUndefined();
  });

  it('inclui apenas chaves não-vazias da atribuição', () => {
    globalThis.history.replaceState({}, '', '/?utm_source=google&utm_medium=cpc');
    captureAttributionFromUrl();

    const payload = buildAttributionPayload();
    expect(payload.utm_source).toBe('google');
    expect(payload.utm_medium).toBe('cpc');
    expect(payload.utm_campaign).toBeUndefined();
    expect(payload.first_touch_at).toMatch(/T/);
  });
});

describe('attribution.clearAttribution', () => {
  it('remove os dados persistidos', () => {
    globalThis.history.replaceState({}, '', '/?utm_source=test');
    captureAttributionFromUrl();
    expect(getStoredAttribution()).not.toBeNull();

    clearAttribution();
    expect(getStoredAttribution()).toBeNull();
  });
});
