import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O setupTests.js global mocka `../utils/analytics` para que páginas
// não disparem eventos durante os testes de componente. Para testar o
// módulo real, precisamos desmockar antes de importar.
vi.unmock('../analytics');

import { buildCartPayload, buildItemPayload, trackEvent, trackPurchaseOnce } from '../analytics';
import { CONSENT_POLICY_VERSION } from '../consent';

function grantConsent() {
  // purchase NÃO é essencial — depende de consentimento de marketing.
  // Tests de dedup/disparo precisam simular o usuário tendo aceitado.
  globalThis.localStorage.setItem('lgpd_consent', 'granted');
  globalThis.localStorage.setItem('lgpd_consent_version', CONSENT_POLICY_VERSION);
  globalThis.localStorage.setItem('lgpd_consent_at', new Date().toISOString());
}

beforeEach(() => {
  globalThis.localStorage.clear();
  // Reset fetch entre testes
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 204 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('analytics.buildItemPayload', () => {
  it('mapeia produto para shape esperado pelos trackers', () => {
    const payload = buildItemPayload({
      id: 42,
      name: 'Painel de Alfabetização',
      price: 49.9,
      category: 'Alfabetização',
    });

    expect(payload).toEqual({
      item_id: '42',
      item_name: 'Painel de Alfabetização',
      price: 49.9,
      item_category: 'Alfabetização',
      currency: 'BRL',
    });
  });

  it('lida com produto sem categoria', () => {
    const payload = buildItemPayload({ id: 1, name: 'X', price: 10 });
    expect(payload.item_category).toBeUndefined();
    expect(payload.currency).toBe('BRL');
  });

  it('retorna objeto vazio quando produto é null', () => {
    expect(buildItemPayload(null)).toEqual({});
    expect(buildItemPayload(undefined)).toEqual({});
  });
});

describe('analytics.buildCartPayload', () => {
  it('agrega itens + total no shape GA4', () => {
    const cart = [
      { id: 1, name: 'A', price: 10, quantity: 2 },
      { id: 2, name: 'B', price: 25 },
    ];
    const payload = buildCartPayload(cart, 45);

    expect(payload.currency).toBe('BRL');
    expect(payload.value).toBe(45);
    expect(payload.items).toEqual([
      { item_id: '1', item_name: 'A', price: 10, quantity: 2 },
      { item_id: '2', item_name: 'B', price: 25, quantity: 1 },
    ]);
  });

  it('trata carrinho vazio', () => {
    const payload = buildCartPayload([], 0);
    expect(payload.items).toEqual([]);
    expect(payload.value).toBe(0);
  });
});

describe('analytics.trackPurchaseOnce', () => {
  beforeEach(() => grantConsent());

  it('dispara purchase no primeiro orderId mas dedup no segundo', () => {
    // 3 chamadas com mesmo orderId → só 1 POST efetivo (dedup pelo Set
    // interno trackedPurchases — garantia da regra A2: nunca duplicar).
    trackPurchaseOnce('ORD-123', { value: 49.9 });
    trackPurchaseOnce('ORD-123', { value: 49.9 });
    trackPurchaseOnce('ORD-123', { value: 49.9 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('aceita orderId diferente como nova compra', () => {
    trackPurchaseOnce('ORD-A', { value: 10 });
    trackPurchaseOnce('ORD-B', { value: 20 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('ignora orderId vazio ou nulo', () => {
    trackPurchaseOnce('', { value: 10 });
    trackPurchaseOnce(null, { value: 10 });
    trackPurchaseOnce(undefined, { value: 10 });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('analytics.trackEvent', () => {
  it('ignora eventos fora da whitelist canônica', () => {
    trackEvent('admin_login', { foo: 'bar' });
    trackEvent('hack_attempt', {});

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('dispara fetch para evento essencial mesmo sem consent', () => {
    trackEvent('view_item', { item_id: '1', price: 49 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/track-event');
    expect(options.method).toBe('POST');
  });
});
