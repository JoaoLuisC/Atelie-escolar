const STORAGE_KEY = 'lgpd_consent';
const VERSION_STORAGE_KEY = 'lgpd_consent_version';
const TIMESTAMP_STORAGE_KEY = 'lgpd_consent_at';
const EVENT_NAME = 'lgpd-consent-change';

// Incrementar quando a política de privacidade mudar — força nova decisão do usuário.
export const CONSENT_POLICY_VERSION = '2026-05-24';

export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';

function safeStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function getConsentState() {
  const storage = safeStorage();
  if (!storage) return null;
  const value = storage.getItem(STORAGE_KEY);
  if (value !== CONSENT_GRANTED && value !== CONSENT_DENIED) return null;

  // Se a versão da política mudou desde o último consent, exige nova decisão.
  const storedVersion = storage.getItem(VERSION_STORAGE_KEY);
  if (storedVersion !== CONSENT_POLICY_VERSION) {
    return null;
  }
  return value;
}

export function getConsentMetadata() {
  const storage = safeStorage();
  if (!storage) return null;
  return {
    state: storage.getItem(STORAGE_KEY),
    version: storage.getItem(VERSION_STORAGE_KEY),
    at: storage.getItem(TIMESTAMP_STORAGE_KEY),
  };
}

export function hasMarketingConsent() {
  return getConsentState() === CONSENT_GRANTED;
}

export function setConsentState(state) {
  if (state !== CONSENT_GRANTED && state !== CONSENT_DENIED) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, state);
    storage.setItem(VERSION_STORAGE_KEY, CONSENT_POLICY_VERSION);
    storage.setItem(TIMESTAMP_STORAGE_KEY, new Date().toISOString());
  } catch {
    return;
  }
  try {
    globalThis.dispatchEvent?.(new CustomEvent(EVENT_NAME, { detail: { state } }));
  } catch {
    /* SSR / older browser, ignore */
  }
}

export function subscribeConsent(handler) {
  if (typeof handler !== 'function') return () => {};
  const listener = (event) => handler(event?.detail?.state || getConsentState());
  globalThis.addEventListener?.(EVENT_NAME, listener);
  return () => globalThis.removeEventListener?.(EVENT_NAME, listener);
}
