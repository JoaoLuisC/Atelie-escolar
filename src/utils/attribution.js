const STORAGE_KEY = 'attribution_data';
const SESSION_KEY = 'session_id';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function safeStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* fallthrough */
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId() {
  const storage = safeStorage();
  if (!storage) return '';
  let id = storage.getItem(SESSION_KEY);
  if (!id) {
    id = randomId();
    try {
      storage.setItem(SESSION_KEY, id);
    } catch {
      return id;
    }
  }
  return id;
}

function readSearchParams() {
  try {
    return new URLSearchParams(globalThis.location?.search || '');
  } catch {
    return new URLSearchParams();
  }
}

function parseStoredAttribution(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Number.isFinite(parsed.expires_at) && parsed.expires_at < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function captureAttributionFromUrl() {
  const storage = safeStorage();
  if (!storage) return null;

  const params = readSearchParams();
  const incoming = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) incoming[key] = value.slice(0, 200);
  }

  const referrer = (globalThis.document?.referrer || '').slice(0, 200);

  // First-touch wins: só sobrescreve se não houver dados ainda
  // (Curva ABC + ROAS de aquisição refletem a origem inicial,
  // não a última visita.)
  const existing = parseStoredAttribution(storage.getItem(STORAGE_KEY));
  if (existing && Object.keys(existing).some((k) => UTM_KEYS.includes(k) && existing[k])) {
    return existing;
  }

  if (Object.keys(incoming).length === 0 && !referrer && existing) {
    return existing;
  }

  const next = {
    ...(existing || {}),
    ...incoming,
    referrer: referrer || existing?.referrer || '',
    landing_path: globalThis.location?.pathname || existing?.landing_path || '/',
    captured_at: Date.now(),
    expires_at: Date.now() + TTL_MS,
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded, ignore */
  }

  return next;
}

export function getStoredAttribution() {
  const storage = safeStorage();
  if (!storage) return null;
  return parseStoredAttribution(storage.getItem(STORAGE_KEY));
}

export function buildAttributionPayload() {
  const data = getStoredAttribution() || {};
  const payload = {};
  for (const key of UTM_KEYS) {
    if (data[key]) payload[key] = data[key];
  }
  if (data.referrer) payload.referrer = data.referrer;
  if (data.landing_path) payload.landing_path = data.landing_path;
  if (data.captured_at) payload.first_touch_at = new Date(data.captured_at).toISOString();
  payload.session_id = getSessionId();
  return payload;
}

export function clearAttribution() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
