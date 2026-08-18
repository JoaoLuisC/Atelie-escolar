import { buildAttributionPayload, getSessionId } from './attribution';
import { CONSENT_GRANTED, getConsentState, hasMarketingConsent, subscribeConsent } from './consent';
import { getApiBaseUrl } from './api';

const CANONICAL_EVENTS = new Set([
  'view_item',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'view_catalog',
  'begin_checkout',
  'purchase',
]);

// Eventos essenciais = todos os canônicos exceto `purchase` (derivado para não
// haver duas listas manuais que possam divergir — ver review Área 8, CON-06).
const ESSENTIAL_EVENTS = new Set([...CANONICAL_EVENTS].filter((event) => event !== 'purchase'));

const META_EVENT_MAP = {
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  view_cart: 'ViewCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
};

let initialized = false;
let ga4Loaded = false;
let pixelLoaded = false;
const trackedPurchases = new Set();

function readEnv(name) {
  try {
    return import.meta.env?.[name] || '';
  } catch {
    return '';
  }
}

const GA4_ID = readEnv('VITE_GA4_ID');
const PIXEL_ID = readEnv('VITE_META_PIXEL_ID');

function ensureGtagStub() {
  if (typeof globalThis.window === 'undefined') return;
  globalThis.window.dataLayer = globalThis.window.dataLayer || [];
  if (!globalThis.window.gtag) {
    globalThis.window.gtag = function gtag() {
      globalThis.window.dataLayer.push(arguments);
    };
  }
}

function loadGA4() {
  if (ga4Loaded || !GA4_ID || typeof globalThis.document === 'undefined') return;
  ensureGtagStub();

  const script = globalThis.document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
  globalThis.document.head.appendChild(script);

  globalThis.window.gtag('js', new Date());
  globalThis.window.gtag('config', GA4_ID, {
    anonymize_ip: true,
    send_page_view: true,
  });

  ga4Loaded = true;
}

function loadMetaPixel() {
  if (pixelLoaded || !PIXEL_ID || typeof globalThis.document === 'undefined') return;

  if (!globalThis.window.fbq) {
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(
      globalThis.window,
      globalThis.document,
      'script',
      'https://connect.facebook.net/en_US/fbevents.js',
    );
  }

  globalThis.window.fbq('init', PIXEL_ID);
  globalThis.window.fbq('track', 'PageView');
  pixelLoaded = true;
}

function applyMarketingConsent() {
  if (!hasMarketingConsent()) return;
  loadGA4();
  loadMetaPixel();
}

function postEventToBackend(eventName, payload) {
  try {
    const body = JSON.stringify({
      event_name: eventName,
      session_id: getSessionId(),
      properties: payload || {},
    });
    const url = `${getApiBaseUrl()}/track-event`;

    if (typeof globalThis.navigator?.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = globalThis.navigator.sendBeacon(url, blob);
      if (ok) return;
    }

    // Mesma exceção nomeada de `src/components/ErrorBoundary.jsx`: `fetch` cru
    // é o FALLBACK do `sendBeacon` acima, e um envio `keepalive` existe
    // justamente para sobreviver ao descarregamento da página — o
    // `AbortController` de 15s do `apiRequest` cancelaria o que se quer que
    // sobreviva. Não há resposta a normalizar; o `.catch` vazio é o contrato.
    // Ver item P5.1 do docs/PADRONIZACAO-CORRECOES.md.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow — tracking não deve quebrar UX */
    });
  } catch {
    /* swallow */
  }
}

export function initAnalytics() {
  if (initialized) return;
  initialized = true;

  // Captura UTM da landing inicial (one-time, antes de qualquer evento)
  try {
    import('./attribution').then(({ captureAttributionFromUrl }) => captureAttributionFromUrl());
  } catch {
    /* ignore */
  }

  if (getConsentState() === CONSENT_GRANTED) {
    applyMarketingConsent();
  }

  subscribeConsent((state) => {
    if (state === CONSENT_GRANTED) applyMarketingConsent();
  });
}

function isEssential(eventName) {
  return ESSENTIAL_EVENTS.has(eventName);
}

function sanitizeProperties(properties) {
  if (!properties || typeof properties !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      // Apenas um nível, sem PII
      out[key] = JSON.parse(JSON.stringify(value));
    } else {
      out[key] = value;
    }
  }
  // Remove possíveis chaves de PII por engano
  delete out.email;
  delete out.customer_email;
  delete out.cpf;
  delete out.phone;
  return out;
}

export function trackEvent(eventName, properties = {}) {
  if (!CANONICAL_EVENTS.has(eventName)) {
    if (import.meta.env?.DEV) {
      console.warn(`[analytics] evento desconhecido ignorado: ${eventName}`);
    }
    return;
  }

  const clean = sanitizeProperties(properties);

  // Backend (analytics_events): essenciais sempre; demais só com consentimento.
  if (isEssential(eventName) || hasMarketingConsent()) {
    postEventToBackend(eventName, clean);
  }

  // GA4 e Pixel: só com consentimento.
  if (!hasMarketingConsent()) return;

  if (GA4_ID && typeof globalThis.window?.gtag === 'function') {
    globalThis.window.gtag('event', eventName, clean);
  }

  if (PIXEL_ID && typeof globalThis.window?.fbq === 'function') {
    const metaEvent = META_EVENT_MAP[eventName];
    if (metaEvent) {
      const metaPayload = {};
      if (Number.isFinite(Number(clean.value))) metaPayload.value = Number(clean.value);
      if (clean.currency) metaPayload.currency = clean.currency;
      if (Array.isArray(clean.items)) {
        metaPayload.content_ids = clean.items
          .map((item) => String(item.item_id || item.id || ''))
          .filter(Boolean);
        metaPayload.content_type = 'product';
        metaPayload.num_items = clean.items.length;
      } else if (clean.item_id) {
        metaPayload.content_ids = [String(clean.item_id)];
        metaPayload.content_type = 'product';
      }
      globalThis.window.fbq('track', metaEvent, metaPayload);
    }
  }
}

export function trackPurchaseOnce(orderId, payload) {
  const key = String(orderId || '');
  if (!key || trackedPurchases.has(key)) return;
  trackedPurchases.add(key);
  trackEvent('purchase', {
    transaction_id: key,
    ...payload,
  });
}

// Payload helpers usados pelas páginas
export function buildItemPayload(product) {
  if (!product) return {};
  return {
    item_id: String(product.id),
    item_name: product.name,
    price: Number(product.price || 0),
    item_category: product.category || undefined,
    currency: 'BRL',
  };
}

export function buildCartPayload(cart, total) {
  const items = (cart || []).map((entry) => ({
    item_id: String(entry.id),
    item_name: entry.name,
    price: Number(entry.price || 0),
    quantity: Number(entry.quantity || 1),
  }));
  return {
    currency: 'BRL',
    value: Number(total || 0),
    items,
  };
}

export function getAttributionPayload() {
  return buildAttributionPayload();
}
