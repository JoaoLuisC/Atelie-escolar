const STORAGE_KEY = 'lgpd_consent';
const VERSION_STORAGE_KEY = 'lgpd_consent_version';
const TIMESTAMP_STORAGE_KEY = 'lgpd_consent_at';
const EVENT_NAME = 'lgpd-consent-change';

// Incrementar quando a política de privacidade mudar — força nova decisão do usuário.
// 2026-10-01: retenção de analytics corrigida para 180 dias e Vercel incluída
// em "Com quem compartilhamos" (LOJA-12).
export const CONSENT_POLICY_VERSION = '2026-10-26';

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

/**
 * Assina QUALQUER mudança de decisão: nesta aba (evento próprio, disparado por
 * `setConsentState`) e em outras abas (`storage`).
 *
 * LOJA-16: o banner e o bloco de /privacidade#cookies só escutavam `storage`,
 * que o navegador NÃO dispara na aba que gravou. Resultado: aceitar no bloco
 * deixava o banner na tela, e recusar no banner deixava o bloco em "Você ainda
 * não escolheu" — os dois na mesma página, até o F5. O formato
 * (`subscribe(onChange) → unsubscribe`) é o de `useSyncExternalStore`.
 */
export function subscribeConsentChanges(onChange) {
  if (typeof onChange !== 'function') return () => {};
  const onStorage = (event) => {
    if (!event?.key || event.key.startsWith(STORAGE_KEY)) onChange();
  };
  globalThis.addEventListener?.(EVENT_NAME, onChange);
  globalThis.addEventListener?.('storage', onStorage);
  return () => {
    globalThis.removeEventListener?.(EVENT_NAME, onChange);
    globalThis.removeEventListener?.('storage', onStorage);
  };
}
